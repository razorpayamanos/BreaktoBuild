// Framer Code Component — BREAK TO BUILD loader (optimized)
// ------------------------------------------------------------------
// Paste into Framer: Insert > Code > New file > name "Loader.tsx".
//
// What it does
//   • Preloads + decodes all swing frames before starting the flipbook
//     (no first-paint flash, no per-frame jank on mobile).
//   • Drives the flipbook via a single rAF scheduler — no setTimeout
//     drift, no 32 React re-renders.
//   • At IMPACT_FRAME: hides the SVG, blurs BG + figure, plays the
//     baked GLB shatter through a Draco-decoded GLTFLoader.
//   • Hard-cuts on GLB end, fires onComplete, dispatches a global
//     "b2b-loader-complete" event for Code Overrides to react to.
//   • Skips animation on Framer canvas (design time) so designers
//     can position content underneath the idle state.
//
// All knobs are exposed as property controls. See bottom of file.
// ------------------------------------------------------------------

import { addPropertyControls, ControlType, RenderTarget } from "framer"
import * as React from "react"
import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
// Framer's package proxy doesn't resolve the three/addons/* subpath,
// so we pin the loaders to an explicit esm.sh URL on the matching
// three version. If you bump three, bump the version here too.
import { GLTFLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js"
import { DRACOLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/DRACOLoader.js"

// ---------------- Types ----------------

interface LoaderProps {
    swingFrames: string[]
    glbUrl: string
    svgUrl: string
    glyphUrl: string

    triggerMode: "auto" | "click"
    hintText: string

    renderMode: "buffer" | "canvas" | "stack"

    lockScroll: boolean

    logoUrl: string
    logoWidth: number
    logoHeight: number

    cursorImage: string
    cursorSize: number
    cursorOffsetX: number
    cursorOffsetY: number

    impactFrame: number
    glbTimescale: number
    anticipationCount: number
    anticipationFpi: number
    startFramesPerImg: number
    endFramesPerImg: number

    blurMaxPx: number
    bgColor: string
    slabColor: string
    textColor: string

    cornerTopRight: string
    cornerBottomRight: string

    dracoDecoderPath: string

    onComplete?: () => void
}

// ---------------- Constants ----------------

const FRAME_MS_60 = 1000 / 60
const GLB_STEP_S = 1 / 30
const COMPLETE_EVENT = "b2b-loader-complete"
const DEFAULT_CRASH_MS = 445

// ---------------- Component ----------------

/**
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 * @framerIntrinsicWidth 1440
 * @framerIntrinsicHeight 760
 */
export default function Loader(props: LoaderProps) {
    const {
        swingFrames,
        glbUrl,
        svgUrl,
        glyphUrl,
        triggerMode,
        hintText,
        renderMode,
        lockScroll,
        impactFrame,
        glbTimescale,
        anticipationCount,
        anticipationFpi,
        startFramesPerImg,
        endFramesPerImg,
        blurMaxPx,
        bgColor,
        slabColor,
        textColor,
        cornerTopRight,
        cornerBottomRight,
        logoUrl,
        logoWidth,
        logoHeight,
        cursorImage,
        cursorSize,
        cursorOffsetX,
        cursorOffsetY,
        dracoDecoderPath,
        onComplete,
    } = props

    const containerRef = useRef<HTMLDivElement | null>(null)
    const bgRef = useRef<HTMLDivElement | null>(null)
    const figureRef = useRef<HTMLDivElement | null>(null)
    const cursorRef = useRef<HTMLDivElement | null>(null)

    // Mode A (buffer): two stacked imgs, swap opacity
    const imgARef = useRef<HTMLImageElement | null>(null)
    const imgBRef = useRef<HTMLImageElement | null>(null)
    const activeBufferRef = useRef<"A" | "B">("A")

    // Mode B (canvas): rasterize decoded images each tick
    const figureCanvasRef = useRef<HTMLCanvasElement | null>(null)

    // Decoded image cache (shared across modes; populated during preload)
    const decodedRef = useRef<HTMLImageElement[]>([])
    const svgRef = useRef<HTMLImageElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    // Phases:
    //   idle    — assets loading
    //   armed   — assets ready, waiting on click (only used in click mode)
    //   running — swing/shatter playing
    //   done    — unmount
    // Frame swaps go straight to DOM (no per-frame re-render).
    const [phase, setPhase] = useState<"idle" | "armed" | "running" | "done">(
        "idle"
    )

    // Viewport mobile detection — drives logo size, SVG width, and
    // top-row spacing. Initialised lazily for SSR safety.
    const [isMobile, setIsMobile] = useState<boolean>(() => {
        if (typeof window === "undefined") return false
        return window.innerWidth < 768
    })

    // Touch-only device detection — used to skip the custom cursor
    // entirely on phones/tablets, where there's no pointer to follow.
    // `(hover: none)` is true on touch-only devices and false on
    // desktop / iPads with a trackpad.
    const [isTouchOnly, setIsTouchOnly] = useState<boolean>(() => {
        if (typeof window === "undefined") return false
        if (typeof window.matchMedia !== "function") return false
        return window.matchMedia("(hover: none)").matches
    })

    useEffect(() => {
        if (typeof window === "undefined") return
        const onResize = () => setIsMobile(window.innerWidth < 768)
        window.addEventListener("resize", onResize)
        return () => window.removeEventListener("resize", onResize)
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        if (typeof window.matchMedia !== "function") return
        const mq = window.matchMedia("(hover: none)")
        const onChange = (e: MediaQueryListEvent) => setIsTouchOnly(e.matches)
        // addEventListener on MediaQueryList is the modern API; fall
        // back to addListener for older Safari.
        if (mq.addEventListener) {
            mq.addEventListener("change", onChange)
            return () => mq.removeEventListener("change", onChange)
        } else {
            ;(mq as any).addListener(onChange)
            return () => (mq as any).removeListener(onChange)
        }
    }, [])

    const isCanvas =
        typeof RenderTarget !== "undefined" &&
        RenderTarget.current() === RenderTarget.canvas

    // Cross-render ref the click handler writes to flip the gate.
    const clickGateRef = useRef(false)

    // ── Scroll lock effect ───────────────────────────────────────
    // Locks document scroll while the loader is mounted (phases:
    // idle / armed / running). Releases the moment phase flips to
    // 'done' (the component also unmounts at that point, so the
    // cleanup function would fire anyway — but releasing inside the
    // effect makes the intent explicit and handles edge cases like
    // re-render before unmount).
    useEffect(() => {
        if (isCanvas) return
        if (!lockScroll) return
        if (typeof document === "undefined") return
        if (phase === "done") return

        const body = document.body
        const html = document.documentElement

        // Capture original values so we restore exactly what was there.
        const orig = {
            bodyOverflow: body.style.overflow,
            bodyTouchAction: body.style.touchAction,
            bodyOverscroll: (body.style as any).overscrollBehavior,
            htmlOverflow: html.style.overflow,
            htmlOverscroll: (html.style as any).overscrollBehavior,
        }

        body.style.overflow = "hidden"
        body.style.touchAction = "none"
        ;(body.style as any).overscrollBehavior = "none"
        html.style.overflow = "hidden"
        ;(html.style as any).overscrollBehavior = "none"

        // iOS Safari rubber-band defense: it ignores overflow:hidden on
        // body for touch drags, so we kill touchmove at the container.
        // We only block touchmove on the loader itself — interactive
        // form elements aren't reachable anyway while the loader covers
        // the viewport.
        const blockTouchMove = (e: TouchEvent) => {
            // Allow multi-touch gestures (pinch) to be a no-op rather
            // than a crash, but block single-finger drags.
            if (e.touches.length === 1) e.preventDefault()
        }
        const blockWheel = (e: WheelEvent) => {
            e.preventDefault()
        }

        const node = containerRef.current
        if (node) {
            node.addEventListener("touchmove", blockTouchMove, {
                passive: false,
            })
            node.addEventListener("wheel", blockWheel, {
                passive: false,
            })
        }

        return () => {
            body.style.overflow = orig.bodyOverflow
            body.style.touchAction = orig.bodyTouchAction
            ;(body.style as any).overscrollBehavior = orig.bodyOverscroll
            html.style.overflow = orig.htmlOverflow
            ;(html.style as any).overscrollBehavior = orig.htmlOverscroll
            if (node) {
                node.removeEventListener("touchmove", blockTouchMove)
                node.removeEventListener("wheel", blockWheel)
            }
        }
    }, [isCanvas, lockScroll, phase])

    // ── Custom cursor tracking ───────────────────────────────────
    // Direct DOM mutation on pointermove — no React state, no
    // re-renders. The custom cursor overlays the native one (rather
    // than replacing it). Disabled on touch-only devices where
    // there's no pointer to follow.
    useEffect(() => {
        if (isCanvas) return
        if (typeof window === "undefined") return
        if (!cursorImage) return
        if (isTouchOnly) return
        if (phase === "done") return

        const cursor = cursorRef.current
        const node = containerRef.current
        if (!cursor || !node) return

        // Center cursor element on the pointer using offsets
        const halfW = cursorSize / 2
        const halfH = cursorSize / 2

        let lastX = window.innerWidth / 2
        let lastY = window.innerHeight / 2
        let queued = false

        const update = () => {
            queued = false
            if (!cursor) return
            cursor.style.transform = `translate3d(${
                lastX - halfW + cursorOffsetX
            }px, ${lastY - halfH + cursorOffsetY}px, 0)`
        }

        const onMove = (e: PointerEvent | MouseEvent | Touch) => {
            const px = (e as any).clientX
            const py = (e as any).clientY
            if (typeof px !== "number" || typeof py !== "number") return
            lastX = px
            lastY = py
            // Reveal the cursor on the first real move (avoids a
            // ghost image at screen-center before the user moves).
            if (cursor.style.opacity !== "1") cursor.style.opacity = "1"
            if (!queued) {
                queued = true
                requestAnimationFrame(update)
            }
        }

        const onPointerEnter = () => {
            // Only reveal on enter if we already have a real position
            // (i.e. a pointermove already happened on this surface).
            if (cursor && cursor.style.transform) cursor.style.opacity = "1"
        }
        const onPointerLeave = () => {
            if (cursor) cursor.style.opacity = "0"
        }
        const onTouchMove = (e: TouchEvent) => {
            if (e.touches[0]) onMove(e.touches[0])
        }

        node.addEventListener("pointermove", onMove as any)
        node.addEventListener("pointerenter", onPointerEnter)
        node.addEventListener("pointerleave", onPointerLeave)
        node.addEventListener("touchmove", onTouchMove, { passive: true })

        // Cursor stays at opacity:0 until the first real pointermove
        // so it doesn't appear at top-left or screen-center on mount.

        return () => {
            node.removeEventListener("pointermove", onMove as any)
            node.removeEventListener("pointerenter", onPointerEnter)
            node.removeEventListener("pointerleave", onPointerLeave)
            node.removeEventListener("touchmove", onTouchMove)
        }
    }, [
        isCanvas,
        cursorImage,
        cursorSize,
        cursorOffsetX,
        cursorOffsetY,
        phase,
        isTouchOnly,
    ])

    // ── Main effect: setup + run sequence ────────────────────────
    useEffect(() => {
        if (isCanvas) return
        if (typeof window === "undefined") return
        if (!canvasRef.current) return
        if (!swingFrames || swingFrames.length === 0) return

        // Mode-specific element guards
        if (renderMode === "canvas" && !figureCanvasRef.current) return
        if (
            (renderMode === "buffer" || renderMode === "stack") &&
            (!imgARef.current || !imgBRef.current)
        )
            return

        let cancelled = false
        let rafId = 0
        let schedulerId = 0
        const timeouts: number[] = []

        // ─── Timing model ───────────────────────────────────────
        const swingHoldMs = (i: number) => {
            if (i < anticipationCount) return anticipationFpi * FRAME_MS_60
            const swingI = i - anticipationCount
            const swingTotal = impactFrame - 1 - anticipationCount
            const t = swingTotal <= 1 ? 0 : swingI / (swingTotal - 1)
            const fpi =
                startFramesPerImg + (endFramesPerImg - startFramesPerImg) * t
            return fpi * FRAME_MS_60
        }

        // Cumulative frame switch times (absolute, ms from start)
        const totalFrames = swingFrames.length
        const lastSwingIndex = Math.min(impactFrame, totalFrames) - 1
        const switchTimes: number[] = new Array(totalFrames).fill(0)
        for (let k = 1; k <= lastSwingIndex; k++) {
            switchTimes[k] = switchTimes[k - 1] + swingHoldMs(k - 1)
        }
        const fillMs = Math.round(switchTimes[lastSwingIndex] || 0)
        const finalHoldMs = endFramesPerImg * FRAME_MS_60
        for (let k = lastSwingIndex + 1; k < totalFrames; k++) {
            switchTimes[k] = switchTimes[k - 1] + finalHoldMs
        }

        // ─── Three.js setup ─────────────────────────────────────
        const renderer = new THREE.WebGLRenderer({
            canvas: canvasRef.current,
            alpha: true,
            antialias: true,
            powerPreference: "high-performance",
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.setClearColor(0x000000, 0)
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.toneMapping = THREE.NoToneMapping
        ;(renderer as any).outputColorSpace = (THREE as any).SRGBColorSpace
        renderer.setSize(window.innerWidth, window.innerHeight, false)

        const scene = new THREE.Scene()
        let camera: THREE.PerspectiveCamera | null = null

        // Lighting rig — tuned via Loader.html iteration viewer.
        // 4-point setup (key/fill/rim/back) + hemi sky bounce. No
        // ambient: a pure ambient term flattens the shatter chunks
        // and washes out the slab's depth.
        const ambient = new THREE.AmbientLight(0xffffff, 0)
        const hemi = new THREE.HemisphereLight(0xffffff, 0xbbd0ff, 0.55)
        scene.add(ambient, hemi)

        const key = new THREE.DirectionalLight(0xffffff, 2.4)
        key.position.set(2.5, 4, 3.5)
        key.castShadow = true
        key.shadow.mapSize.set(2048, 2048)
        key.shadow.bias = -0.0008
        key.shadow.radius = 4
        key.shadow.camera.near = 0.1
        key.shadow.camera.far = 25
        key.shadow.camera.left = -6
        key.shadow.camera.right = 6
        key.shadow.camera.top = 4
        key.shadow.camera.bottom = -4
        scene.add(key)

        const fill = new THREE.DirectionalLight(0xdbe7ff, 0.9)
        fill.position.set(-3, 1.5, 2.5)
        scene.add(fill)

        const rim = new THREE.DirectionalLight(0xcfd9ff, 1.2)
        rim.position.set(-2, -0.8, 2)
        rim.castShadow = true
        rim.shadow.mapSize.set(2048, 2048)
        rim.shadow.bias = -0.0008
        rim.shadow.radius = 4
        rim.shadow.camera.near = 0.1
        rim.shadow.camera.far = 25
        rim.shadow.camera.left = -6
        rim.shadow.camera.right = 6
        rim.shadow.camera.top = 4
        rim.shadow.camera.bottom = -4
        scene.add(rim)

        const back = new THREE.DirectionalLight(0xa8b8ff, 0.6)
        back.position.set(0.5, 3, -3.5)
        scene.add(back)

        // ─── GLB loader (Draco) ─────────────────────────────────
        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath(
            dracoDecoderPath || "https://www.gstatic.com/draco/v1/decoders/"
        )
        const gltfLoader = new GLTFLoader()
        gltfLoader.setDRACOLoader(dracoLoader)

        let crashModel: THREE.Object3D | null = null
        let mixer: THREE.AnimationMixer | null = null
        let clips: THREE.AnimationClip[] = []
        const clock = new THREE.Clock()
        let glbAccum = 0
        let crashClipMs = DEFAULT_CRASH_MS

        const slabColorHex = parseHex(slabColor, 0x000000)
        const textColorHex = parseHex(textColor, 0xffffff)

        const matText = new THREE.MeshStandardMaterial({
            color: textColorHex,
            metalness: 0,
            roughness: 0.64,
            side: THREE.FrontSide,
        })
        const matSlab = new THREE.MeshStandardMaterial({
            color: slabColorHex,
            metalness: 0,
            roughness: 0.9,
            side: THREE.FrontSide,
        })

        const isSlabMesh = (mesh: THREE.Object3D) => {
            let p: THREE.Object3D | null = mesh
            while (p) {
                const nm = (p.name || "").toLowerCase()
                if (nm.startsWith("cube")) return true
                if (
                    nm.startsWith("curve") ||
                    nm.startsWith("a_cell") ||
                    nm === "a"
                )
                    return false
                p = p.parent
            }
            return false
        }

        // ─── Preload all swing frames (parallel) ────────────────
        const preloadFrame = (src: string): Promise<HTMLImageElement> =>
            new Promise((resolve) => {
                const img = new Image()
                img.decoding = "async"
                img.onload = () => {
                    // decode() ensures pixel data is ready before swap
                    const anyImg = img as any
                    if (typeof anyImg.decode === "function") {
                        anyImg
                            .decode()
                            .then(() => resolve(img))
                            .catch(() => resolve(img))
                    } else {
                        resolve(img)
                    }
                }
                img.onerror = () => resolve(img)
                img.src = src
            })

        // ─── Preload strategy ───────────────────────────────────
        //
        // 1. Frame 1 (idle pose) loads + paints IMMEDIATELY. This
        //    is what the user sees the moment the loader mounts.
        // 2. Frames 2..N + GLB load IN BACKGROUND in parallel. The
        //    host page keeps hydrating during this window.
        // 3. Only after everything is ready do we arm the click
        //    (or auto-start in auto mode).

        // Pre-size the decoded array so canvas mode can look up
        // frame 1 by index before the rest land.
        decodedRef.current = new Array(swingFrames.length)

        // -- Frame 1 (priority) --
        const firstFramePromise: Promise<HTMLImageElement | null> =
            swingFrames[0]
                ? preloadFrame(swingFrames[0]).then((img) => {
                      if (cancelled) return null
                      decodedRef.current[0] = img
                      // Paint immediately so the user sees the idle
                      // pose without waiting on anything else.
                      if (
                          (renderMode === "buffer" || renderMode === "stack") &&
                          imgARef.current
                      ) {
                          imgARef.current.src = img.src
                          imgARef.current.style.opacity = "1"
                          if (imgBRef.current)
                              imgBRef.current.style.opacity = "0"
                      } else if (
                          renderMode === "canvas" &&
                          figureCanvasRef.current
                      ) {
                          // Canvas mode: paint frame 1 onto the
                          // canvas right away.
                          paintFrame(0)
                      }
                      return img
                  })
                : Promise.resolve(null)

        // -- Frames 2..N (background) --
        const restFramesPromise = firstFramePromise.then(() => {
            if (cancelled) return [] as HTMLImageElement[]
            const rest = swingFrames.slice(1)
            return Promise.all(
                rest.map((src, i) =>
                    preloadFrame(src).then((img) => {
                        decodedRef.current[i + 1] = img
                        return img
                    })
                )
            )
        })

        const preloadPromise = restFramesPromise

        // ─── GLB load ───────────────────────────────────────────
        const glbPromise = new Promise<void>((resolve) => {
            gltfLoader.load(
                glbUrl,
                (gltf) => {
                    if (cancelled) return resolve()

                    if (gltf.cameras && gltf.cameras.length > 0) {
                        camera = gltf.cameras[0] as THREE.PerspectiveCamera
                        camera.aspect = window.innerWidth / window.innerHeight
                        camera.updateProjectionMatrix()
                    }

                    const root = gltf.scene

                    const camsToRemove: THREE.Object3D[] = []
                    root.traverse((o) => {
                        if ((o as any).isCamera) camsToRemove.push(o)
                    })
                    camsToRemove.forEach((c) => c.parent?.remove(c))

                    root.traverse((o) => {
                        if ((o as any).isMesh) {
                            const mesh = o as THREE.Mesh
                            mesh.material = isSlabMesh(mesh) ? matSlab : matText
                            mesh.castShadow = true
                            mesh.receiveShadow = true
                        }
                    })

                    root.visible = false
                    scene.add(root)
                    crashModel = root

                    mixer = new THREE.AnimationMixer(root)
                    clips = gltf.animations || []
                    clips.forEach((c) => {
                        const action = mixer!.clipAction(c)
                        action.setLoop(THREE.LoopOnce, 1)
                        action.clampWhenFinished = true
                        action.timeScale = glbTimescale
                    })

                    const maxDur = clips.reduce(
                        (m, c) => Math.max(m, c.duration),
                        0
                    )
                    if (maxDur > 0) {
                        crashClipMs = Math.round((maxDur / glbTimescale) * 1000)
                    }
                    resolve()
                },
                undefined,
                (err) => {
                    // eslint-disable-next-line no-console
                    console.warn("[Loader] GLB load failed:", err)
                    resolve() // fall through; swing still runs
                }
            )
        })

        // ─── Resize ─────────────────────────────────────────────
        const onResize = () => {
            renderer.setSize(window.innerWidth, window.innerHeight, false)
            if (camera) {
                camera.aspect = window.innerWidth / window.innerHeight
                camera.updateProjectionMatrix()
            }
            if (renderMode === "canvas") {
                setupCanvas()
                if (frameIdx >= 0) paintFrame(frameIdx)
            }
        }
        window.addEventListener("resize", onResize)

        // ─── Render loop (rAF) ──────────────────────────────────
        const tick = () => {
            rafId = requestAnimationFrame(tick)
            if (mixer) {
                glbAccum += clock.getDelta()
                while (glbAccum >= GLB_STEP_S) {
                    mixer.update(GLB_STEP_S)
                    glbAccum -= GLB_STEP_S
                }
            }
            if (camera) renderer.render(scene, camera)
        }
        tick()

        // ─── Sequence kickoff (after assets ready) ──────────────
        let startTs = 0
        let frameIdx = -1
        const totalDurationMs =
            (switchTimes[totalFrames - 1] || 0) + finalHoldMs

        // Canvas mode setup — size to viewport, redraw on resize
        let cctx: CanvasRenderingContext2D | null = null
        const setupCanvas = () => {
            if (renderMode !== "canvas") return
            const cnv = figureCanvasRef.current
            if (!cnv) return
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            cnv.width = Math.floor(window.innerWidth * dpr)
            cnv.height = Math.floor(window.innerHeight * dpr)
            cnv.style.width = "100%"
            cnv.style.height = "100%"
            cctx = cnv.getContext("2d", { alpha: true })
            if (cctx) cctx.imageSmoothingQuality = "high"
        }
        setupCanvas()

        // Draw frame N to the figure layer using the active render mode
        const paintFrame = (idx: number) => {
            const imgs = decodedRef.current
            const img = imgs[idx]
            if (!img) return

            if (renderMode === "canvas") {
                if (!cctx || !figureCanvasRef.current) return
                const cw = figureCanvasRef.current.width
                const ch = figureCanvasRef.current.height
                cctx.clearRect(0, 0, cw, ch)
                // object-fit: contain
                const iw = img.naturalWidth || img.width
                const ih = img.naturalHeight || img.height
                if (!iw || !ih) return
                const scale = Math.min(cw / iw, ch / ih)
                const dw = iw * scale
                const dh = ih * scale
                const dx = (cw - dw) / 2
                const dy = (ch - dh) / 2
                cctx.drawImage(img, dx, dy, dw, dh)
            } else if (renderMode === "stack") {
                // Set src on the active buffer; opacity stays at 1.
                // (Single buffer behavior — fast but can flicker on
                // first paint of a frame; included for comparison.)
                if (imgARef.current) imgARef.current.src = img.src
            } else {
                // buffer (default): write to inactive, flip on next rAF
                const next = activeBufferRef.current === "A" ? imgBRef : imgARef
                const cur = activeBufferRef.current === "A" ? imgARef : imgBRef
                if (!next.current || !cur.current) return
                next.current.src = img.src
                // Defer the opacity flip one rAF so the browser has
                // committed the new bitmap to a GPU layer before we
                // reveal it. This is what kills the flicker.
                const swap = () => {
                    if (!next.current || !cur.current) return
                    next.current!.style.opacity = "1"
                    cur.current!.style.opacity = "0"
                    activeBufferRef.current =
                        activeBufferRef.current === "A" ? "B" : "A"
                }
                requestAnimationFrame(swap)
            }
        }

        const runScheduler = (ts: number) => {
            if (cancelled) return
            if (!startTs) startTs = ts
            const elapsed = ts - startTs

            // Advance frame to the latest one whose switch time has passed
            let target = frameIdx
            while (
                target + 1 < totalFrames &&
                elapsed >= switchTimes[target + 1]
            ) {
                target++
            }
            if (target !== frameIdx) {
                frameIdx = target
                paintFrame(target)
            }

            if (elapsed < totalDurationMs) {
                schedulerId = requestAnimationFrame(runScheduler)
            }
        }

        const startSequence = () => {
            if (cancelled) return
            setPhase("running")

            // Show frame 0 immediately (decoded already)
            paintFrame(0)
            frameIdx = 0

            // Drive frame swaps off rAF (no setTimeout drift)
            schedulerId = requestAnimationFrame(runScheduler)

            // Impact event — fixed setTimeout, but only one of them
            timeouts.push(
                window.setTimeout(() => {
                    if (cancelled) return
                    if (containerRef.current) {
                        containerRef.current.style.setProperty(
                            "--blur-duration",
                            `${crashClipMs}ms`
                        )
                    }
                    if (svgRef.current) svgRef.current.style.opacity = "0"
                    if (bgRef.current) {
                        bgRef.current.style.filter = `blur(${blurMaxPx}px)`
                    }
                    if (figureRef.current) {
                        figureRef.current.style.filter = `blur(${blurMaxPx}px)`
                    }
                    if (crashModel) crashModel.visible = true
                    if (mixer && clips.length) {
                        clock.getDelta() // reset delta
                        glbAccum = 0
                        mixer.stopAllAction()
                        clips.forEach((c) =>
                            mixer!.clipAction(c).reset().play()
                        )
                    }
                }, fillMs)
            )

            // Hard cut at GLB end
            timeouts.push(
                window.setTimeout(() => {
                    if (cancelled) return
                    setPhase("done")
                    try {
                        window.dispatchEvent(new CustomEvent(COMPLETE_EVENT))
                    } catch (e) {
                        /* noop */
                    }
                    onComplete && onComplete()
                }, fillMs + crashClipMs)
            )
        }

        // Wait for swing frames + GLB before arming (capped at 4s
        // so a slow GLB doesn't hold the loader hostage)
        const readyTimeout = new Promise<void>((resolve) =>
            window.setTimeout(resolve, 4000)
        )

        const waitForClick = () =>
            new Promise<void>((resolve) => {
                const check = () => {
                    if (cancelled) return resolve()
                    if (clickGateRef.current) return resolve()
                    window.setTimeout(check, 16)
                }
                check()
            })

        Promise.race([
            Promise.all([preloadPromise, glbPromise]).then(() => {}),
            readyTimeout,
        ])
            .then(() => {
                if (cancelled) return
                if (triggerMode === "click") {
                    setPhase("armed")
                    return waitForClick()
                }
            })
            .then(() => {
                if (!cancelled) startSequence()
            })

        // ─── Cleanup ────────────────────────────────────────────
        return () => {
            cancelled = true
            cancelAnimationFrame(rafId)
            cancelAnimationFrame(schedulerId)
            timeouts.forEach((t) => window.clearTimeout(t))
            window.removeEventListener("resize", onResize)

            // Dispose Three.js resources
            scene.traverse((o) => {
                if ((o as any).isMesh) {
                    const mesh = o as THREE.Mesh
                    const m = mesh.material as any
                    if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
                    else if (m) m.dispose()
                    if (mesh.geometry) mesh.geometry.dispose()
                }
            })
            matText.dispose()
            matSlab.dispose()
            renderer.dispose()
            if (dracoLoader.dispose) dracoLoader.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCanvas, glbUrl])

    if (phase === "done") return null

    // First frame src — used as the initial buffer A image so the
    // browser starts downloading it at mount (before any effect
    // fires). This makes the idle pose appear as fast as possible.
    const firstFrameSrc =
        swingFrames && swingFrames.length > 0 ? swingFrames[0] : undefined

    const isClickable = triggerMode === "click" && phase === "armed"

    const handleClick = () => {
        if (!isClickable) return
        clickGateRef.current = true
    }

    return (
        <div
            ref={containerRef}
            onClick={handleClick}
            role={isClickable ? "button" : undefined}
            aria-label={isClickable ? hintText || "Start" : undefined}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                overflow: "hidden",
                // Always capture pointer events while loader is visible —
                // page underneath is scroll-locked anyway, and we need
                // the events for pointer tracking + click-to-break.
                pointerEvents: "auto",
                // Custom cursor (if any) overlays the native one rather
                // than replacing it — so the OS arrow stays visible
                // underneath, which users expect.
                cursor: isClickable ? "pointer" : "default",
                userSelect: "none",
                ["--blur-duration" as any]: "445ms",
            }}
        >
            {/* Blue BG layer */}
            <div
                ref={bgRef}
                style={{
                    position: "absolute",
                    inset: 0,
                    background: bgColor,
                    zIndex: 0,
                    transition: "filter var(--blur-duration) linear",
                    willChange: "filter",
                }}
            />

            {/* Figure layer — render mode determines content */}
            <div
                ref={figureRef}
                style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 2,
                    transition: "filter var(--blur-duration) linear",
                    willChange: "filter",
                }}
            >
                {renderMode === "canvas" ? (
                    <canvas
                        ref={figureCanvasRef}
                        style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                        }}
                    />
                ) : (
                    <>
                        {/* Buffer A — starts with frame 1 src so the
                            browser begins downloading the idle pose
                            the moment the loader mounts, before any
                            effect runs. */}
                        <img
                            ref={imgARef}
                            src={firstFrameSrc}
                            alt=""
                            decoding="async"
                            {...({ fetchpriority: "high" } as any)}
                            style={{
                                position: "absolute",
                                inset: 0,
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                objectPosition: "center center",
                                opacity: 1,
                                willChange: "opacity",
                            }}
                        />
                        {/* Buffer B — only used in 'buffer' mode */}
                        <img
                            ref={imgBRef}
                            alt=""
                            decoding="async"
                            style={{
                                position: "absolute",
                                inset: 0,
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                                objectPosition: "center center",
                                opacity: 0,
                                willChange: "opacity",
                                display:
                                    renderMode === "buffer" ? "block" : "none",
                            }}
                        />
                    </>
                )}
            </div>

            {/* WebGL canvas */}
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 3,
                }}
            />

            {/* Static SVG patch */}
            <img
                ref={svgRef}
                src={svgUrl}
                alt=""
                style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    // Mobile: 64px margin each side → calc(100vw - 128px).
                    // Desktop: 60vw, capped at 1100.
                    width: isMobile ? "calc(100vw - 128px)" : "60vw",
                    maxWidth: isMobile ? "none" : 1100,
                    height: "auto",
                    zIndex: 4,
                    transition: "opacity 0ms",
                }}
            />

            {/* Top row: logo (left) + label (right), vertically centered.
                One flex container so logo and text always sit on the
                same baseline regardless of logo height. */}
            <div
                style={{
                    position: "absolute",
                    top: isMobile ? 16 : 22,
                    left: isMobile ? 16 : 22,
                    right: isMobile ? 16 : 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    zIndex: 6,
                    pointerEvents: "none",
                }}
            >
                {logoUrl ? (
                    <img
                        src={logoUrl}
                        alt=""
                        style={{
                            // Scale logo down on mobile, keep aspect via contain
                            width: isMobile
                                ? Math.min(logoWidth, 110)
                                : logoWidth,
                            height: isMobile
                                ? Math.round(
                                      (Math.min(logoWidth, 110) / logoWidth) *
                                          logoHeight
                                  )
                                : logoHeight,
                            objectFit: "contain",
                            objectPosition: "left center",
                            display: "block",
                        }}
                    />
                ) : (
                    <span />
                )}
                <div style={cornerLabelStyle}>{cornerTopRight}</div>
            </div>

            {/* Bottom row: glyph (left) + label (right), vertically centered */}
            <div
                style={{
                    position: "absolute",
                    bottom: isMobile ? 20 : 22,
                    left: isMobile ? 16 : 22,
                    right: isMobile ? 16 : 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    zIndex: 6,
                    pointerEvents: "none",
                }}
            >
                <img
                    src={glyphUrl}
                    alt=""
                    style={{
                        width: isMobile ? 36 : 42,
                        height: isMobile ? 36 : 42,
                        objectFit: "contain",
                        display: "block",
                    }}
                />
                <div style={cornerLabelStyle}>{cornerBottomRight}</div>
            </div>

            {/* Click-to-break hint — visible only when armed */}
            {isClickable && hintText ? (
                <div
                    style={{
                        position: "absolute",
                        bottom: 56,
                        left: "50%",
                        transform: "translateX(-50%)",
                        color: "#ffffff",
                        fontFamily: "'Space Grotesk', system-ui, sans-serif",
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        lineHeight: 1,
                        padding: "10px 18px",
                        border: "1px solid rgba(255,255,255,0.7)",
                        borderRadius: 999,
                        zIndex: 7,
                        animation: "b2b-pulse 1.6s ease-in-out infinite",
                        pointerEvents: "none",
                        whiteSpace: "nowrap",
                    }}
                >
                    {hintText}
                </div>
            ) : null}

            {/* Custom cursor — follows pointer via direct DOM mutation.
                Overlays the native OS cursor (does not hide it).
                Skipped entirely on touch-only devices. Disappears
                with the loader on phase==='done'. */}
            {cursorImage && !isTouchOnly ? (
                <div
                    ref={cursorRef}
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: cursorSize,
                        height: cursorSize,
                        pointerEvents: "none",
                        zIndex: 99999,
                        opacity: 0,
                        willChange: "transform",
                    }}
                >
                    <img
                        src={cursorImage}
                        alt=""
                        style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            userSelect: "none",
                        }}
                        draggable={false}
                    />
                </div>
            ) : null}

            {/* Pulse keyframes (scoped via unique name) */}
            <style>{`
                @keyframes b2b-pulse {
                    0%, 100% { opacity: 0.6; transform: translateX(-50%) scale(1); }
                    50%      { opacity: 1;   transform: translateX(-50%) scale(1.04); }
                }
            `}</style>
        </div>
    )
}

// ---------------- Helpers ----------------

const cornerLabelStyle: React.CSSProperties = {
    color: "#ffffff",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    lineHeight: 1,
    whiteSpace: "nowrap",
}

function parseHex(input: string, fallback: number): number {
    if (!input) return fallback
    const m = String(input)
        .trim()
        .match(/^#?([0-9a-fA-F]{6})$/)
    if (!m) return fallback
    return parseInt(m[1], 16)
}

// ---------------- Property Controls ----------------

addPropertyControls(Loader, {
    // ── Assets ───────────────────────────────────────────────
    swingFrames: {
        title: "Swing Frames",
        type: ControlType.Array,
        control: {
            type: ControlType.File,
            allowedFileTypes: ["webp", "png", "jpg", "jpeg"],
        },
        maxCount: 100,
    },
    glbUrl: {
        title: "GLB URL",
        type: ControlType.String,
        defaultValue:
            "https://pub-0f7799ae7afd4b0e8e0a1b925ad21000.r2.dev/Loader/2026-05-13-text-crash.glb",
        placeholder: "https://your-cdn.com/path/file.glb",
    },
    svgUrl: {
        title: "Static SVG",
        type: ControlType.File,
        allowedFileTypes: ["svg"],
    },
    glyphUrl: {
        title: "Glyph",
        type: ControlType.File,
        allowedFileTypes: ["png", "svg"],
    },

    // ── Trigger ──────────────────────────────────────────────
    triggerMode: {
        title: "Trigger",
        type: ControlType.Enum,
        options: ["auto", "click"],
        optionTitles: ["Auto-play", "Click to start"],
        defaultValue: "click",
        displaySegmentedControl: true,
    },
    hintText: {
        title: "Click Hint",
        type: ControlType.String,
        defaultValue: "TAP TO BREAK",
        placeholder: "Shown when waiting for click",
        hidden: (p: any) => p.triggerMode !== "click",
    },
    renderMode: {
        title: "Render Mode",
        type: ControlType.Enum,
        options: ["buffer", "canvas", "stack"],
        optionTitles: [
            "Double-buffer (recommended)",
            "Canvas blit",
            "Single img (legacy)",
        ],
        defaultValue: "buffer",
        description:
            "Buffer = 2 stacked imgs, smoothest. Canvas = pixel-perfect, slightly softer edges on mobile. Stack = legacy, may flicker.",
    },
    lockScroll: {
        title: "Lock Scroll",
        type: ControlType.Boolean,
        defaultValue: true,
        description:
            "Prevents page scroll while loader is visible. Releases on hard-cut.",
    },

    // ── Timing ───────────────────────────────────────────────
    impactFrame: {
        title: "Impact Frame",
        type: ControlType.Number,
        defaultValue: 25,
        min: 1,
        max: 200,
        step: 1,
    },
    glbTimescale: {
        title: "GLB Timescale",
        type: ControlType.Number,
        defaultValue: 1.05,
        min: 0.1,
        max: 5,
        step: 0.05,
    },
    anticipationCount: {
        title: "Anticipation Frames",
        type: ControlType.Number,
        defaultValue: 0,
        min: 0,
        max: 50,
        step: 1,
    },
    anticipationFpi: {
        title: "Anticipation FPI",
        type: ControlType.Number,
        defaultValue: 4,
        min: 1,
        max: 12,
        step: 1,
    },
    startFramesPerImg: {
        title: "Swing Start FPI",
        type: ControlType.Number,
        defaultValue: 8,
        min: 1,
        max: 20,
        step: 1,
    },
    endFramesPerImg: {
        title: "Swing End FPI",
        type: ControlType.Number,
        defaultValue: 2,
        min: 1,
        max: 20,
        step: 1,
    },

    // ── Visuals ──────────────────────────────────────────────
    blurMaxPx: {
        title: "Crash Blur (px)",
        type: ControlType.Number,
        defaultValue: 18,
        min: 0,
        max: 40,
        step: 1,
    },
    bgColor: {
        title: "Background",
        type: ControlType.Color,
        defaultValue: "#194CFF",
    },
    slabColor: {
        title: "Slab Color",
        type: ControlType.Color,
        defaultValue: "#000000",
    },
    textColor: {
        title: "Text Color",
        type: ControlType.Color,
        defaultValue: "#FFFFFF",
    },

    // ── Top Left Logo ────────────────────────────────────────
    logoUrl: {
        title: "Logo",
        type: ControlType.File,
        allowedFileTypes: ["png", "svg", "webp", "jpg", "jpeg"],
    },
    logoWidth: {
        title: "Logo Width",
        type: ControlType.Number,
        defaultValue: 150,
        min: 16,
        max: 400,
        step: 1,
        hidden: (p: any) => !p.logoUrl,
    },
    logoHeight: {
        title: "Logo Height",
        type: ControlType.Number,
        defaultValue: 32,
        min: 8,
        max: 120,
        step: 1,
        hidden: (p: any) => !p.logoUrl,
    },

    // ── Corner Labels ────────────────────────────────────────
    cornerTopRight: {
        title: "Top Right",
        type: ControlType.String,
        defaultValue: "BUILT FOR INDIA",
    },
    cornerBottomRight: {
        title: "Bottom Right",
        type: ControlType.String,
        defaultValue: "A RAZORPAY INITIATIVE",
    },

    // ── Custom Cursor ────────────────────────────────────────
    cursorImage: {
        title: "Cursor Image",
        type: ControlType.File,
        allowedFileTypes: ["png", "svg", "webp"],
        description:
            "Upload an image to follow the pointer while the loader is visible. Restores native cursor on hard-cut.",
    },
    cursorSize: {
        title: "Cursor Size",
        type: ControlType.Number,
        defaultValue: 48,
        min: 16,
        max: 200,
        step: 2,
        hidden: (p: any) => !p.cursorImage,
    },
    cursorOffsetX: {
        title: "Cursor Offset X",
        type: ControlType.Number,
        defaultValue: 0,
        min: -100,
        max: 100,
        step: 1,
        hidden: (p: any) => !p.cursorImage,
    },
    cursorOffsetY: {
        title: "Cursor Offset Y",
        type: ControlType.Number,
        defaultValue: 0,
        min: -100,
        max: 100,
        step: 1,
        hidden: (p: any) => !p.cursorImage,
    },

    // ── Advanced ─────────────────────────────────────────────
    dracoDecoderPath: {
        title: "Draco Decoder",
        type: ControlType.String,
        defaultValue: "https://www.gstatic.com/draco/v1/decoders/",
        placeholder: "https://your-cdn/decoders/",
    },

    onComplete: {
        title: "On Complete",
        type: ControlType.EventHandler,
    },
})