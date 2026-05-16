// ============================================================================
// Founder's Brick Generator — Framer Code Component
// ============================================================================

import { addPropertyControls, ControlType } from "framer"
import { useEffect, useRef, useState, useCallback } from "react"

// ────────────────────────────────────────────────────────────────────────────
//  SECTION 1 — Configuration
// ────────────────────────────────────────────────────────────────────────────

const R2_BASE = "https://pub-0f7799ae7afd4b0e8e0a1b925ad21000.r2.dev"

const FINAL_WIDTH = 1080
const FINAL_HEIGHT = 1350

type AvatarKey = "male" | "female"
type WeaponKey = "punch" | "crush" | "thrash" | "smash" | "kick" | "slice"

const AVATAR_CONFIG: Record<AvatarKey, { label: string }> = {
    male: { label: "Male" },
    female: { label: "Female" },
}

const WEAPON_CONFIG: Record<WeaponKey, { label: string }> = {
    smash: { label: "SMASH IT" },
    crush: { label: "CRUSH IT" },
    slice: { label: "SLICE IT" },
    thrash: { label: "THRASH IT" },
    kick: { label: "KICK IT" },
    punch: { label: "PUNCH IT" },
}

const FINAL_VIDEO_PATHS: Record<AvatarKey, Record<WeaponKey, string>> = {
    male: {
        smash: "bat_35.mp4",
        crush: "hammer_76.mp4",
        slice: "sword_34.mp4",
        thrash: "flail_45.mp4",
        kick: "kick_42.mp4",
        punch: "punch_70.mp4",
    },
    female: {
        smash: "bat_39.mp4",
        crush: "hammer_72.mp4",
        slice: "sword_36.mp4",
        thrash: "flail_37.mp4",
        kick: "kick_35.mp4",
        punch: "punch_59.mp4",
    },
}

function getComboConfig(avatar: AvatarKey, weapon: WeaponKey) {
    const av = String(avatar).toLowerCase() as AvatarKey
    const wp = String(weapon).toLowerCase() as WeaponKey
    const filename = FINAL_VIDEO_PATHS[av]?.[wp]
    if (!filename) {
        throw new Error(`Unknown combo: avatar="${avatar}" weapon="${weapon}"`)
    }
    const cutMatch = filename.match(/_(\d+)\.mp4$/)
    return {
        label: `${AVATAR_CONFIG[av].label} · ${WEAPON_CONFIG[wp].label}`,
        baseVideo: `${R2_BASE}/Avatars/${av}/Final/${filename}`,
        textCutFrame: cutMatch ? parseInt(cutMatch[1], 10) : 45,
        videoFps: 24,
    }
}

const SLAB_CONFIG = {
    textAnchor: { x: 0.4242, y: 0.6296 },
    textMaxWidth: 0.1824,
    textMaxHeight: 0.1563,
    minFontSize: 32,
    fontFamily: "'Special Gothic Condensed One', 'Anton', sans-serif",
    fontWeight: 400,
    fontColor: "#3a3a3a",
    lineHeight: 0.8,
    letterSpacing: -0.02,
    textAlign: "left" as CanvasTextAlign,
    hyphenateMinLength: 8,
    compositeMode: "overlay" as GlobalCompositeOperation,
    opacity: 0.8,
    noise: { enabled: true, density: 0.55, intensity: 0.55 },
    innerShadow: {
        enabled: true,
        offsetX: 4,
        offsetY: 4,
        blur: 9,
        color: "rgba(0,0,0,0.95)",
    },
    skewX: 8,
    skewY: 0,
    rotation: -2.53,
    clipPolygon: [
        [0.2976, 0.5184],
        [0.5226, 0.5184],
        [0.5226, 0.7087],
        [0.2976, 0.7087],
    ] as Array<[number, number]>,
}

const POSTER_OVERLAY = {
    bg: "#010201",
    textColor: "#c4c4c4",
    accent: "#0039ff",
    razorpayLogo: {
        x: 32.99,
        y: 32.01,
        w: 164.062,
        h: 35,
        src: `${R2_BASE}/Avatars/Razorpay_Logo.png`,
    },
    campaignLogo: {
        x: 852,
        y: 22.99,
        w: 200,
        h: 53.085,
        src: `${R2_BASE}/Avatars/BreakToBuild_logo.png`,
    },
    tickerImage: { src: `${R2_BASE}/Avatars/ticker.png` },
    title: {
        centerX: 540,
        top: 79.55,
        eyebrow: {
            text: "THANK YOU",
            fontFamily: "Unbounded",
            fontWeight: 400,
            fontSize: 32.729,
            letterSpacing: -1.31,
        },
        eyebrowToNameGap: 25,
        name: {
            fontFamily: "Unbounded",
            fontWeight: 900,
            fontSize: 94.706,
            lineHeight: 92.424,
            letterSpacing: -3.79,
            maxWidth: 1020,
        },
        nameToSubtitleGap: 18,
        subtitle: {
            prefix: "FOR BEATING THE ODDS AND BUILDING ",
            fontFamily: "Unbounded",
            fontWeight: 400,
            fontSize: 28.016,
            lineHeight: 38.1,
            letterSpacing: -1.12,
            maxWidth: 820,
        },
    },
    media: { x: 0, y: 0 },
    ticker: { y: 1277.55, h: 72 },
}

type LogoSet = {
    razorpay: HTMLImageElement | false
    campaign: HTMLImageElement | false
    ticker: HTMLImageElement | false
}

// ────────────────────────────────────────────────────────────────────────────
//  SECTION 2 — Helpers
// ────────────────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
        img.src = src
    })
}

async function loadComboVideo(
    avatar: AvatarKey,
    weapon: WeaponKey
): Promise<HTMLVideoElement> {
    const cfg = getComboConfig(avatar, weapon)
    const video = document.createElement("video")
    video.src = cfg.baseVideo
    video.crossOrigin = "anonymous"
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    await new Promise<void>((resolve, reject) => {
        const onMeta = () => {
            video.removeEventListener("loadedmetadata", onMeta)
            resolve()
        }
        video.addEventListener("loadedmetadata", onMeta)
        video.addEventListener(
            "error",
            () => reject(new Error(`Failed to load video: ${cfg.baseVideo}`)),
            { once: true }
        )
    })
    try {
        await video.play()
        video.pause()
        video.currentTime = 0
    } catch {}
    return video
}

let _razorpayLogoCache: HTMLImageElement | false | null = null
let _campaignLogoCache: HTMLImageElement | false | null = null
let _tickerImageCache: HTMLImageElement | false | null = null

async function getRazorpayLogo() {
    if (_razorpayLogoCache !== null) return _razorpayLogoCache
    try {
        _razorpayLogoCache = await loadImage(POSTER_OVERLAY.razorpayLogo.src)
    } catch {
        _razorpayLogoCache = false
    }
    return _razorpayLogoCache
}
async function getCampaignLogo() {
    if (_campaignLogoCache !== null) return _campaignLogoCache
    try {
        _campaignLogoCache = await loadImage(POSTER_OVERLAY.campaignLogo.src)
    } catch {
        _campaignLogoCache = false
    }
    return _campaignLogoCache
}
async function getTickerImage() {
    if (_tickerImageCache !== null) return _tickerImageCache
    try {
        _tickerImageCache = await loadImage(POSTER_OVERLAY.tickerImage.src)
    } catch {
        _tickerImageCache = false
    }
    return _tickerImageCache
}

const GOOGLE_FONTS_HREF =
    "https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&family=Special+Gothic+Condensed+One&family=Unbounded:wght@400;700;900&display=swap"

async function injectGoogleFontsStylesheet() {
    if (typeof document === "undefined") return
    if (document.querySelector('link[data-brick-fonts="true"]')) return
    const pre1 = document.createElement("link")
    pre1.rel = "preconnect"
    pre1.href = "https://fonts.googleapis.com"
    document.head.appendChild(pre1)
    const pre2 = document.createElement("link")
    pre2.rel = "preconnect"
    pre2.href = "https://fonts.gstatic.com"
    pre2.crossOrigin = "anonymous"
    document.head.appendChild(pre2)
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = GOOGLE_FONTS_HREF
    link.setAttribute("data-brick-fonts", "true")
    document.head.appendChild(link)
    await new Promise<void>((resolve) => {
        link.onload = () => resolve()
        link.onerror = () => resolve()
        setTimeout(resolve, 5000)
    })
}

async function preloadFonts() {
    if (typeof document === "undefined") return
    await injectGoogleFontsStylesheet()
    if (!document.fonts) return
    try {
        await Promise.all([
            document.fonts.load("400 100px Anton"),
            document.fonts.load("400 200px Anton"),
            document.fonts.load('400 100px "Special Gothic Condensed One"'),
            document.fonts.load('400 200px "Special Gothic Condensed One"'),
            document.fonts.load("900 80px Unbounded"),
            document.fonts.load("400 32px Unbounded"),
            document.fonts.load("400 18px Inter"),
        ])
        await document.fonts.ready
    } catch {}
}

// ────────────────────────────────────────────────────────────────────────────
//  SECTION 3 — Render engine
// ────────────────────────────────────────────────────────────────────────────

function resolveSlab(W: number, H: number) {
    const C = SLAB_CONFIG
    return {
        anchor: { x: C.textAnchor.x * W, y: C.textAnchor.y * H },
        maxW: C.textMaxWidth * W,
        maxH: C.textMaxHeight * H,
        poly: C.clipPolygon.map(
            ([nx, ny]) => [nx * W, ny * H] as [number, number]
        ),
    }
}

let _slabLayerCache: { key: string | null; canvas: HTMLCanvasElement | null } =
    { key: null, canvas: null }
let _noisePatternCache: {
    key: string | null
    canvas: HTMLCanvasElement | null
} = { key: null, canvas: null }

function getNoisePattern(
    W: number,
    H: number,
    density: number,
    intensity: number
) {
    const key = `${W}|${H}|${density.toFixed(3)}|${intensity.toFixed(3)}`
    if (_noisePatternCache.key === key && _noisePatternCache.canvas)
        return _noisePatternCache.canvas
    const c = document.createElement("canvas")
    c.width = W
    c.height = H
    const ctx = c.getContext("2d")!
    const imgData = ctx.createImageData(W, H)
    const data = imgData.data
    const aMax = intensity * 255
    for (let i = 0; i < data.length; i += 4) {
        if (Math.random() < density) {
            const v = Math.random() < 0.5 ? 0 : 255
            data[i] = v
            data[i + 1] = v
            data[i + 2] = v
            data[i + 3] = (Math.random() * aMax) | 0
        }
    }
    ctx.putImageData(imgData, 0, 0)
    _noisePatternCache = { key, canvas: c }
    return c
}

function wrapGreedy(
    text: string,
    ctx: CanvasRenderingContext2D,
    maxWidth: number,
    hyphenateAt = Infinity
): string[] {
    const rawWords = (text || "").split(/\s+/).filter(Boolean)
    if (rawWords.length === 0) return [text || ""]
    const tokens: Array<{ word: string; forceBreakAfter: boolean }> = []
    for (const w of rawWords) {
        if (w.length >= hyphenateAt) {
            const splitAt = Math.ceil(w.length / 2)
            tokens.push({
                word: w.slice(0, splitAt) + "-",
                forceBreakAfter: true,
            })
            tokens.push({ word: w.slice(splitAt), forceBreakAfter: false })
        } else {
            tokens.push({ word: w, forceBreakAfter: false })
        }
    }
    const lines: string[] = []
    let cur = ""
    for (const t of tokens) {
        const tryLine = cur ? cur + " " + t.word : t.word
        if (ctx.measureText(tryLine).width <= maxWidth) cur = tryLine
        else {
            if (cur) lines.push(cur)
            cur = t.word
        }
        if (t.forceBreakAfter) {
            lines.push(cur)
            cur = ""
        }
    }
    if (cur) lines.push(cur)
    return lines.length ? lines : [text]
}

function wrapAndFit(
    text: string,
    ctx: CanvasRenderingContext2D,
    opts: {
        fontFamily: string
        fontWeight: number
        maxWidth: number
        maxHeight: number
        lineHeight: number
        letterSpacing: number
        minFontSize?: number
        maxFontSize?: number
        hyphenateMinLength?: number
    }
) {
    const {
        fontFamily,
        fontWeight,
        maxWidth,
        maxHeight,
        lineHeight,
        letterSpacing,
        minFontSize = 30,
        maxFontSize = 70,
        hyphenateMinLength = Infinity,
    } = opts
    let lo = minFontSize,
        hi = maxFontSize
    let best: { fontSize: number; lines: string[] } | null = null
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        ctx.font = `${fontWeight} ${mid}px ${fontFamily}`
        if ("letterSpacing" in ctx)
            (ctx as any).letterSpacing = `${letterSpacing * mid}px`
        const lines = wrapGreedy(text, ctx, maxWidth, hyphenateMinLength)
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width))
        const totalH = lines.length * lineHeight * mid
        if (widest <= maxWidth && totalH <= maxHeight) {
            best = { fontSize: mid, lines }
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }
    if (best) return best
    ctx.font = `${fontWeight} ${minFontSize}px ${fontFamily}`
    if ("letterSpacing" in ctx)
        (ctx as any).letterSpacing = `${letterSpacing * minFontSize}px`
    return {
        fontSize: minFontSize,
        lines: wrapGreedy(text, ctx, maxWidth, hyphenateMinLength),
    }
}

function renderSlabLayerInto(
    ctx: CanvasRenderingContext2D,
    text: string,
    W: number,
    H: number
) {
    const C = SLAB_CONFIG
    const { anchor, maxW, maxH, poly } = resolveSlab(W, H)
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(poly[0][0], poly[0][1])
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1])
    ctx.closePath()
    ctx.clip()
    ctx.translate(anchor.x, anchor.y)
    ctx.rotate((C.rotation * Math.PI) / 180)
    ctx.transform(
        1,
        Math.tan((C.skewY * Math.PI) / 180),
        Math.tan((C.skewX * Math.PI) / 180),
        1,
        0,
        0
    )
    const { lines, fontSize } = wrapAndFit(text, ctx, {
        fontFamily: C.fontFamily,
        fontWeight: C.fontWeight,
        maxWidth: maxW,
        maxHeight: maxH,
        lineHeight: C.lineHeight,
        letterSpacing: C.letterSpacing,
        minFontSize: C.minFontSize ?? 30,
        hyphenateMinLength: C.hyphenateMinLength ?? Infinity,
    })
    ctx.font = `${C.fontWeight} ${fontSize}px ${C.fontFamily}`
    ctx.textAlign = C.textAlign || "center"
    ctx.textBaseline = "middle"
    if ("letterSpacing" in ctx)
        (ctx as any).letterSpacing = `${C.letterSpacing * fontSize}px`
    const lh = fontSize * C.lineHeight
    const startY = (-lh * lines.length) / 2 + lh / 2
    const drawX =
        C.textAlign === "left"
            ? -maxW / 2
            : C.textAlign === "right"
              ? maxW / 2
              : 0
    ctx.fillStyle = C.fontColor
    lines.forEach((line, i) => ctx.fillText(line, drawX, startY + i * lh))
    if (C.noise && C.noise.enabled) {
        ctx.save()
        const m = ctx.getTransform()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalCompositeOperation = "source-atop"
        ctx.drawImage(
            getNoisePattern(W, H, C.noise.density, C.noise.intensity),
            0,
            0
        )
        ctx.setTransform(m)
        ctx.restore()
    }
    if (C.innerShadow && C.innerShadow.enabled) {
        const mask = document.createElement("canvas")
        mask.width = W
        mask.height = H
        const mctx = mask.getContext("2d")!
        mctx.fillStyle = "#000"
        mctx.fillRect(0, 0, W, H)
        mctx.translate(anchor.x, anchor.y)
        mctx.rotate((C.rotation * Math.PI) / 180)
        mctx.transform(
            1,
            Math.tan((C.skewY * Math.PI) / 180),
            Math.tan((C.skewX * Math.PI) / 180),
            1,
            0,
            0
        )
        mctx.font = ctx.font
        mctx.textAlign = ctx.textAlign
        mctx.textBaseline = ctx.textBaseline
        if ("letterSpacing" in mctx)
            (mctx as any).letterSpacing = (ctx as any).letterSpacing
        mctx.globalCompositeOperation = "destination-out"
        lines.forEach((line, i) => mctx.fillText(line, drawX, startY + i * lh))
        ctx.save()
        const m = ctx.getTransform()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.shadowColor = C.innerShadow.color
        ctx.shadowOffsetX = C.innerShadow.offsetX
        ctx.shadowOffsetY = C.innerShadow.offsetY
        ctx.shadowBlur = C.innerShadow.blur
        ctx.globalCompositeOperation = "source-atop"
        ctx.drawImage(mask, 0, 0)
        ctx.setTransform(m)
        ctx.restore()
    }
    ctx.restore()
}

function getSlabTextLayer(text: string, W: number, H: number) {
    const C = SLAB_CONFIG
    const key = JSON.stringify([
        text,
        W,
        H,
        C.fontColor,
        C.fontFamily,
        C.fontWeight,
        C.textAnchor,
        C.textMaxWidth,
        C.textMaxHeight,
        C.minFontSize,
        C.clipPolygon,
        C.skewX,
        C.skewY,
        C.rotation,
        C.lineHeight,
        C.letterSpacing,
        C.textAlign,
        C.hyphenateMinLength,
        C.noise,
        C.innerShadow,
    ])
    if (_slabLayerCache.key === key && _slabLayerCache.canvas)
        return _slabLayerCache.canvas
    const layer = document.createElement("canvas")
    layer.width = W
    layer.height = H
    renderSlabLayerInto(layer.getContext("2d")!, text, W, H)
    _slabLayerCache = { key, canvas: layer }
    return layer
}

function drawSlabText(
    ctx: CanvasRenderingContext2D,
    text: string,
    W: number,
    H: number
) {
    const layer = getSlabTextLayer(text, W, H)
    ctx.save()
    ctx.globalCompositeOperation = SLAB_CONFIG.compositeMode || "source-over"
    ctx.globalAlpha = SLAB_CONFIG.opacity ?? 1
    ctx.drawImage(layer, 0, 0)
    ctx.restore()
}

function wrapPosterName(
    name: string,
    ctx: CanvasRenderingContext2D,
    maxW: number
) {
    if (ctx.measureText(name).width <= maxW && !name.includes(" "))
        return [name]
    if (!name.includes(" ")) return [name]
    const mid = Math.floor(name.length / 2)
    let splitIdx = -1,
        bestDist = Infinity
    for (let i = 0; i < name.length; i++) {
        if (name[i] === " " && Math.abs(i - mid) < bestDist) {
            splitIdx = i
            bestDist = Math.abs(i - mid)
        }
    }
    if (splitIdx === -1) return [name]
    return [name.slice(0, splitIdx), name.slice(splitIdx + 1)]
}

function wrapPosterSubtitle(
    text: string,
    ctx: CanvasRenderingContext2D,
    maxW: number
) {
    const words = text.split(" ")
    const lines: string[] = []
    let cur = ""
    for (const w of words) {
        const tryLine = cur ? `${cur} ${w}` : w
        if (ctx.measureText(tryLine).width <= maxW) cur = tryLine
        else {
            if (cur) lines.push(cur)
            cur = w
        }
    }
    if (cur) lines.push(cur)
    return lines
}

function renderPosterOverlay(
    ctx: CanvasRenderingContext2D,
    userData: { name: string; company: string },
    logos: LogoSet
) {
    const P = POSTER_OVERLAY
    const T = P.title
    const { name, company } = userData

    // Razorpay logo (top-left)
    const RL = P.razorpayLogo
    if (logos.razorpay) {
        ctx.drawImage(logos.razorpay, RL.x, RL.y, RL.w, RL.h)
    }

    // Campaign logo (top-right)
    const CL = P.campaignLogo
    if (logos.campaign) {
        ctx.drawImage(logos.campaign, CL.x, CL.y, CL.w, CL.h)
    }

    // Title stack
    ctx.fillStyle = P.textColor
    ctx.textAlign = "center"
    ctx.textBaseline = "top"

    const E = T.eyebrow
    ctx.font = `${E.fontWeight} ${E.fontSize}px '${E.fontFamily}', sans-serif`
    if ("letterSpacing" in ctx)
        (ctx as any).letterSpacing = `${E.letterSpacing}px`
    const eyebrowTop = T.top
    ctx.fillText(E.text, T.centerX, eyebrowTop)
    const eyebrowBottom = eyebrowTop + E.fontSize

    const N = T.name
    ctx.font = `${N.fontWeight} ${N.fontSize}px '${N.fontFamily}', sans-serif`
    if ("letterSpacing" in ctx)
        (ctx as any).letterSpacing = `${N.letterSpacing}px`
    const nameLines = wrapPosterName(
        (name || "YOUR NAME").toUpperCase(),
        ctx,
        N.maxWidth
    )
    const nameTop = eyebrowBottom + T.eyebrowToNameGap
    nameLines.forEach((line, i) =>
        ctx.fillText(line, T.centerX, nameTop + i * N.lineHeight)
    )
    const nameBottom = nameTop + nameLines.length * N.lineHeight

    const S = T.subtitle
    ctx.font = `${S.fontWeight} ${S.fontSize}px '${S.fontFamily}', sans-serif`
    if ("letterSpacing" in ctx)
        (ctx as any).letterSpacing = `${S.letterSpacing}px`
    const prefixLines = wrapPosterSubtitle(S.prefix.trim(), ctx, S.maxWidth)
    const companyLines = wrapPosterSubtitle(
        (company || "YOUR COMPANY").toUpperCase(),
        ctx,
        S.maxWidth
    )
    const allSubLines = [...prefixLines, ...companyLines]
    const subtitleTop = nameBottom + T.nameToSubtitleGap
    allSubLines.forEach((line, i) =>
        ctx.fillText(line, T.centerX, subtitleTop + i * S.lineHeight)
    )

    // Bottom strip — just draw the ticker image at the configured spot.
    const TK = P.ticker
    if (logos.ticker) {
        ctx.drawImage(logos.ticker, 0, TK.y, FINAL_WIDTH, TK.h)
    }
}

function drawPosterFrame(
    ctx: CanvasRenderingContext2D,
    mediaEl: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | null,
    userData: { name: string; company: string },
    logos: LogoSet
) {
    const P = POSTER_OVERLAY
    ctx.fillStyle = P.bg
    ctx.fillRect(0, 0, FINAL_WIDTH, FINAL_HEIGHT)
    if (mediaEl) {
        const mw =
            (mediaEl as HTMLImageElement).naturalWidth ||
            (mediaEl as HTMLVideoElement).videoWidth ||
            (mediaEl as HTMLCanvasElement).width ||
            0
        const mh =
            (mediaEl as HTMLImageElement).naturalHeight ||
            (mediaEl as HTMLVideoElement).videoHeight ||
            (mediaEl as HTMLCanvasElement).height ||
            0
        if (mw && mh) ctx.drawImage(mediaEl, P.media.x, P.media.y)
    }
    renderPosterOverlay(ctx, userData, logos)
}

function composeOneFrame(
    srcCtx: CanvasRenderingContext2D,
    finalCtx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    frameIndex: number,
    oddsText: string,
    W: number,
    H: number,
    userData: { name: string; company: string },
    logos: LogoSet,
    cutFrame: number
) {
    srcCtx.globalCompositeOperation = "source-over"
    srcCtx.globalAlpha = 1
    srcCtx.drawImage(video, 0, 0, W, H)
    if (frameIndex < cutFrame && oddsText) {
        drawSlabText(srcCtx, oddsText, W, H)
    }
    drawPosterFrame(finalCtx, srcCtx.canvas, userData, logos)
}

async function processVideoToPoster(args: {
    video: HTMLVideoElement
    persona: ReturnType<typeof getComboConfig>
    userData: { name: string; company: string; oddsText: string }
    logos: LogoSet
    onProgress?: (p: number) => void
}): Promise<{
    type: "video"
    blob: Blob
    mimeType: string
    frameCount: number
    textCutFrame: number
}> {
    const { video, persona, userData, logos, onProgress } = args
    const W = video.videoWidth,
        H = video.videoHeight
    const cutFrame = persona.textCutFrame ?? 45
    const fps = persona.videoFps ?? 24
    const oddsText = (userData.oddsText || "").toUpperCase()

    const srcCanvas = document.createElement("canvas")
    srcCanvas.width = W
    srcCanvas.height = H
    const srcCtx = srcCanvas.getContext("2d")!

    const finalCanvas = document.createElement("canvas")
    finalCanvas.width = FINAL_WIDTH
    finalCanvas.height = FINAL_HEIGHT
    const finalCtx = finalCanvas.getContext("2d")!

    const stream = finalCanvas.captureStream(fps)
    const mimeType = MediaRecorder.isTypeSupported(
        "video/mp4;codecs=avc1.42E01E"
    )
        ? "video/mp4;codecs=avc1.42E01E"
        : MediaRecorder.isTypeSupported("video/mp4")
          ? "video/mp4"
          : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
            ? "video/webm;codecs=vp9"
            : "video/webm"
    const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8_000_000,
    })
    const chunks: BlobPart[] = []
    recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
    }
    const recorderStopped = new Promise<void>((r) => {
        recorder.onstop = () => r()
    })

    composeOneFrame(
        srcCtx,
        finalCtx,
        video,
        0,
        oddsText,
        W,
        H,
        userData,
        logos,
        cutFrame
    )

    let frameIndex = 0
    let lastSeenMediaTime = -1
    // @ts-ignore
    const useRVFC = typeof video.requestVideoFrameCallback === "function"

    recorder.start()
    try {
        video.currentTime = 0
    } catch {}
    await video.play()

    await new Promise<void>((resolve, reject) => {
        const finish = () => {
            try {
                recorder.stop()
            } catch {}
            resolve()
        }
        function step(_now?: number, meta?: any) {
            const t = meta ? meta.mediaTime : video.currentTime
            if (t === lastSeenMediaTime) {
                // @ts-ignore
                if (useRVFC) video.requestVideoFrameCallback(step)
                return
            }
            lastSeenMediaTime = t
            frameIndex = Math.round(t * fps)
            composeOneFrame(
                srcCtx,
                finalCtx,
                video,
                frameIndex,
                oddsText,
                W,
                H,
                userData,
                logos,
                cutFrame
            )
            if (onProgress) onProgress(Math.min(1, t / (video.duration || 1)))
            if (!video.ended && !video.paused) {
                // @ts-ignore
                if (useRVFC) video.requestVideoFrameCallback(step)
                else requestAnimationFrame(() => step())
            }
        }
        video.addEventListener("ended", finish, { once: true })
        video.addEventListener(
            "error",
            () => reject(new Error("video error during capture")),
            { once: true }
        )
        // @ts-ignore
        if (useRVFC) video.requestVideoFrameCallback(step)
        else requestAnimationFrame(() => step())
    })

    await recorderStopped
    const blob = new Blob(chunks, { type: mimeType })
    return {
        type: "video",
        blob,
        mimeType,
        frameCount: frameIndex + 1,
        textCutFrame: cutFrame,
    }
}

// ────────────────────────────────────────────────────────────────────────────
//  SECTION 4 — React wrapper component
// ────────────────────────────────────────────────────────────────────────────

type Status = "idle" | "loading" | "result" | "error"

interface ComponentProps {
    name: string
    company: string
    odds: string
    avatar: AvatarKey
    weapon: WeaponKey
    start: boolean
    autoReset: boolean
    accentColor: string
    backgroundColor: string
}

export default function FoundersBrickGenerator(props: Partial<ComponentProps>) {
    const {
        name = "Priyank Hegde",
        company = "Razorpay",
        odds = "YOU DON'T HAVE A DEGREE",
        avatar = "male" as AvatarKey,
        weapon = "punch" as WeaponKey,
        start = false,
        autoReset = true,
        accentColor = "#0039ff",
        backgroundColor = "#0a0a0a",
    } = props

    const [status, setStatus] = useState<Status>("idle")
    const [progress, setProgress] = useState(0)
    const [resultUrl, setResultUrl] = useState<string | null>(null)
    const [resultBlob, setResultBlob] = useState<Blob | null>(null)
    const [resultMime, setResultMime] = useState<string>("video/mp4")
    const [error, setError] = useState<string | null>(null)
    const prevStartRef = useRef<boolean>(false)
    const isMountedRef = useRef<boolean>(true)

    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
        }
    }, [])

    useEffect(() => {
        return () => {
            if (resultUrl) URL.revokeObjectURL(resultUrl)
        }
    }, [resultUrl])

    const runPipeline = useCallback(async () => {
        setStatus("loading")
        setProgress(0)
        setError(null)
        try {
            await preloadFonts()
            const [video, razorpayLogo, campaignLogo, tickerImg] =
                await Promise.all([
                    loadComboVideo(avatar, weapon),
                    getRazorpayLogo(),
                    getCampaignLogo(),
                    getTickerImage(),
                ])
            const logos: LogoSet = {
                razorpay: razorpayLogo,
                campaign: campaignLogo,
                ticker: tickerImg,
            }
            const persona = getComboConfig(avatar, weapon)
            const bridge =
                typeof window !== "undefined"
                    ? (window as any).__brickForm
                    : null
            const userData = {
                name: bridge?.name || name,
                company: bridge?.company || company,
                oddsText: bridge?.odds || odds,
            }
            const result = await processVideoToPoster({
                video,
                persona,
                userData,
                logos,
                onProgress: (p) => {
                    if (isMountedRef.current) setProgress(p)
                },
            })
            if (!isMountedRef.current) return
            const url = URL.createObjectURL(result.blob)
            setResultBlob(result.blob)
            setResultMime(result.mimeType)
            setResultUrl(url)
            setStatus("result")
        } catch (err: any) {
            console.error("[Founder's Brick] render failed:", err)
            if (isMountedRef.current) {
                setError(err.message || "Unknown error")
                setStatus("error")
            }
        }
    }, [name, company, odds, avatar, weapon])

    useEffect(() => {
        if (!prevStartRef.current && start && status === "idle") {
            runPipeline()
        }
        if (
            prevStartRef.current &&
            !start &&
            autoReset &&
            status !== "loading"
        ) {
            if (resultUrl) URL.revokeObjectURL(resultUrl)
            setResultUrl(null)
            setResultBlob(null)
            setStatus("idle")
            setProgress(0)
            setError(null)
        }
        prevStartRef.current = start
    }, [start, status, autoReset, runPipeline, resultUrl])

    const ext = resultMime.includes("mp4") ? "mp4" : "webm"
    const filename = `founders-brick-${(name || "founder")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")}.${ext}`

    const onDownload = () => {
        if (!resultBlob || !resultUrl) return
        const a = document.createElement("a")
        a.href = resultUrl
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
    }

    const onShare = async () => {
        if (!resultBlob) return
        const file = new File([resultBlob], filename, { type: resultMime })
        if (
            (navigator as any).canShare &&
            (navigator as any).canShare({ files: [file] })
        ) {
            try {
                await (navigator as any).share({
                    files: [file],
                    title: "My Founder's Brick",
                    text: "I broke the odds to build something. Break to Build × Razorpay.",
                })
            } catch {}
        } else {
            onDownload()
        }
    }

    const container: React.CSSProperties = {
        width: "100%",
        height: "100%",
        background: backgroundColor,
        color: "#fff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 16,
        boxSizing: "border-box",
        overflow: "hidden",
    }

    const subtle: React.CSSProperties = {
        color: "#888",
        fontSize: 13,
        letterSpacing: 0.05,
    }

    const button: React.CSSProperties = {
        background: accentColor,
        color: "#fff",
        border: 0,
        padding: "12px 22px",
        fontFamily: "inherit",
        fontSize: 16,
        fontWeight: 600,
        cursor: "pointer",
        borderRadius: 4,
        letterSpacing: 0.02,
    }

    const secondaryBtn: React.CSSProperties = {
        ...button,
        background: "transparent",
        border: "1px solid rgba(255,255,255,0.4)",
    }

    if (status === "idle") {
        return (
            <div style={container}>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                    Founder's Brick Generator
                </div>
                <div style={subtle}>Waiting for the Generate signal…</div>
                <div
                    style={{
                        ...subtle,
                        fontSize: 11,
                        opacity: 0.6,
                        textAlign: "center",
                    }}
                >
                    name: {name || "—"} · company: {company || "—"}
                    <br />
                    avatar: {avatar} · weapon: {weapon}
                    <br />
                    odds: {odds || "—"}
                </div>
            </div>
        )
    }

    if (status === "loading") {
        const pct = Math.round(progress * 100)
        return (
            <div style={container}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                    Forging your brick…
                </div>
                <div
                    style={{
                        width: "min(360px, 80%)",
                        height: 4,
                        background: "rgba(255,255,255,0.08)",
                        borderRadius: 2,
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: accentColor,
                            transition: "width 0.2s ease",
                        }}
                    />
                </div>
                <div style={subtle}>{pct}%</div>
            </div>
        )
    }

    if (status === "error") {
        return (
            <div style={container}>
                <div
                    style={{ color: "#ff6b6b", fontSize: 18, fontWeight: 700 }}
                >
                    Something broke while forging your brick.
                </div>
                <div style={subtle}>{error}</div>
                <button
                    style={button}
                    onClick={() => {
                        setStatus("idle")
                        setError(null)
                    }}
                >
                    Try again
                </button>
            </div>
        )
    }

    return (
        <div style={container}>
            {resultUrl && (
                <video
                    src={resultUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{
                        maxWidth: "100%",
                        maxHeight: "calc(100% - 60px)",
                        objectFit: "contain",
                        background: "#000",
                    }}
                />
            )}
            <div style={{ display: "flex", gap: 12 }}>
                <button style={button} onClick={onShare}>
                    Share
                </button>
                <button style={secondaryBtn} onClick={onDownload}>
                    Download
                </button>
            </div>
        </div>
    )
}

// ────────────────────────────────────────────────────────────────────────────
//  SECTION 5 — Framer Property Controls
// ────────────────────────────────────────────────────────────────────────────

addPropertyControls(FoundersBrickGenerator, {
    name: {
        type: ControlType.String,
        title: "Name",
        defaultValue: "Priyank Hegde",
        placeholder: "Their name",
    },
    company: {
        type: ControlType.String,
        title: "Company",
        defaultValue: "Razorpay",
        placeholder: "Their company",
    },
    odds: {
        type: ControlType.String,
        title: "Odds Beaten",
        defaultValue: "YOU DON'T HAVE A DEGREE",
        placeholder: "Engraved on the rock",
    },
    avatar: {
        type: ControlType.Enum,
        title: "Avatar",
        options: ["male", "female"] as AvatarKey[],
        optionTitles: ["Male", "Female"],
        defaultValue: "male",
    },
    weapon: {
        type: ControlType.Enum,
        title: "Weapon",
        options: [
            "punch",
            "crush",
            "thrash",
            "smash",
            "kick",
            "slice",
        ] as WeaponKey[],
        optionTitles: ["Punch", "Crush", "Thrash", "Smash", "Kick", "Slice"],
        defaultValue: "punch",
    },
    start: {
        type: ControlType.Boolean,
        title: "Start",
        defaultValue: false,
        description: "Flip true to begin render.",
    },
    autoReset: {
        type: ControlType.Boolean,
        title: "Auto reset",
        defaultValue: true,
        description: "Return to idle when start flips back to false.",
    },
    accentColor: {
        type: ControlType.Color,
        title: "Accent",
        defaultValue: "#0039ff",
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#0a0a0a",
    },
})
