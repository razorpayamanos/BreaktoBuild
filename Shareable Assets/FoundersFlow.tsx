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
        crush: "hammer_37.mp4",
        slice: "sword_34.mp4",
        thrash: "flail_38.mp4",
        kick: "kick_48.mp4",
        punch: "punch_70.mp4",
    },
    female: {
        smash: "bat_39.mp4",
        crush: "hammer_72.mp4",
        slice: "sword_36.mp4",
        thrash: "flail_37.mp4",
        kick: "kick_41.mp4",
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

/**
 * Slab text engraving config. All positional values are NORMALIZED to the
 * source video frame (fraction of W/H) so the same config works regardless
 * of base media dimensions — pixel coords are computed at draw time as
 * `norm × canvas.width/height`.
 *
 * Coordinates pulled from Figma node 2518:129 (the "TextBox" layer the
 * designer marked as the safe text area inside the slab). The inner text
 * wrapper that actually holds the glyphs sits at (338, 704) size 197×211
 * inside a 1080×1350 canvas — those are the bounds we wrap against. After
 * the rotation + skew below, the rendered visual fans out into the larger
 * TextBox parallelogram (243×257 at 321.36, 699.9).
 *
 * ── Text-wrapping rules (knobs below) ──────────────────────────────────
 *   RULE 1  font stays at `maxFontSize` UNLESS wrap > `maxLines` lines.
 *           Only then do we scale DOWN, never up.
 *   RULE 2  any word with ≥ `hyphenateMinLength` characters is split at
 *           the midpoint with a trailing "-" and forced onto the next line.
 *   RULE 3  input is hard-truncated to `maxInputChars` characters before
 *           the wrap algorithm sees it.
 *   RULE 4  per-line character cap. During greedy packing, if adding the
 *           next word would push the line past `maxCharsPerLine` characters
 *           (incl. the joining space), break BEFORE that word. Single
 *           tokens longer than the cap (e.g. a hyphenation fragment for a
 *           15+ char word) still get their own line and may overflow.
 *   RULE 5  short-line override. If the max-font wrap exceeds RULE 1's
 *           line cap BUT every line is shorter than `narrowLineThreshold`
 *           characters, KEEP max font anyway. Capped at
 *           `overflowLineThreshold` lines so deep-overflow wraps don't
 *           get stuck at max font.
 *   RULE 6  deep-overflow floor. Fires in TWO independent ways:
 *           (a) post-fallback — after RULE 1's binary search bottoms out
 *               at `minFontSize`, if the wrap STILL exceeds
 *               `overflowLineThreshold` lines.
 *           (b) early — input text length > `overflowInputCharThreshold`
 *               (e.g. 29 or 30 chars). Bypasses RULES 1 + 5.
 *           Either way the chosen font is `overflowMinFontSize`,
 *           independent of `minFontSize` so typical wraps don't shrink.
 *   RULE 7  hard pixel-width guard. Every line must fit
 *           `maxWidth − pixelFitRightPad` at the chosen font. wrapGreedy
 *           enforces the cap only when deciding WHERE to break — a
 *           single token always lands on its own line, so a 7-char
 *           hyphenation fragment ("EXPERI-") or a 7-char word
 *           ("PARENTS", "CROWDED") can visually bleed past the slab
 *           edge at max font.
 *           `pixelFitRightPad` is a small safety pad that accounts for
 *           what `measureText().width` misses: the right-side bearing
 *           of glyphs like S (curved right edge paints 1–3px past
 *           advance width) plus anti-aliasing edge pixels. Without the
 *           pad, the binary search converges on the font where
 *           measureText === maxWidth and the rightmost glyph ends up
 *           flush against the slab edge.
 *   RULE 8  hard vertical-fit guard. The rendered text block must fit
 *           `maxHeight − verticalFitPad` at the chosen font. Without
 *           this check, 4-line wraps at max font geometrically overflow
 *           maxH by ~30 px, getting clipped at the top of the first
 *           line and the bottom of the last (visible on "I DONT HAVE
 *           GUIDANCE" before hyphenateMinLength fix). Block height
 *           formula:
 *               (N − 1) × lh × fontSize
 *             + glyphCapExtentRatio × fontSize  (cap top + baseline below middle)
 *             + glyphShadowExtent              (inner shadow blur margin)
 *           Same gate-pattern as RULE 7 — applied at RULE 1, RULE 5,
 *           and binary-search acceptance. If even minFontSize still
 *           overflows, RULE 6 (post-fallback) drops to
 *           overflowMinFontSize.
 *
 * RULE 4 makes the wrap effectively size-invariant: shrinking the font
 * does NOT reduce line count, so inputs that wrap to > maxLines here will
 * scale all the way down to minFontSize and accept the overflow. If you
 * want bigger text for 4-line wraps, raise maxLines to 4 — not a font tweak.
 *
 * See `wrapAndFit` for the algorithm; see the slabText prep site in
 * processVideoToPoster for the input truncation.
 */
const SLAB_CONFIG = {
    // Centre of the text block, as a fraction of video frame (x, y).
    // ↑x = moves text right, ↓x = left. ↑y = down, ↓y = up.
    // wrapper centre: (338 + 197/2, 704 + 211/2) / (1080, 1350)
    textAnchor: { x: 0.4142, y: 0.6136 },
    textMaxWidth: 0.1824, // 197 / 1080
    textMaxHeight: 0.1563, // 211 / 1350

    // RULE 1 — font sizing bounds + the line-count threshold that
    // triggers scale-down.
    maxFontSize: 70, // upper bound — engraving never grows past this
    minFontSize: 58, // lower bound — won't shrink below this even on overflow
    maxLines: 4, // wrap > maxLines triggers binary-search downward

    // RULE 2 — hyphenate words this long or longer.
    // Set to 9 (not 8) so that 8-char words like GUIDANCE, INVESTOR,
    // REJECTED stay whole — they fit `maxCharsPerLine: 8` exactly on
    // their own line. Hyphenating them needlessly forces a 4-line
    // wrap (e.g. "I DONT / HAVE / GUID- / ANCE") which then overflows
    // the vertical safe area; with 9 they stay 3 lines ("I DONT /
    // HAVE / GUIDANCE") and fit comfortably.
    hyphenateMinLength: 9,

    // RULE 3 — hard cap on user-supplied text length.
    maxInputChars: 30,

    // RULE 4 — per-line character budget (incl. spaces).
    maxCharsPerLine: 8,

    // RULE 5 — short-line override. When the max-font wrap exceeds
    // maxLines BUT every resulting line is < narrowLineThreshold chars,
    // keep max font anyway. Raise to disable the override more often,
    // lower to be more permissive (accept "wider" lines under the override).
    narrowLineThreshold: 7,

    // RULE 6 — deep-overflow floor. Two independent triggers; either
    // one drops the chosen size to `overflowMinFontSize` (smaller than
    // minFontSize) so the taller text block has room inside the slab.
    //   • lines-based  → wrap STILL exceeds `overflowLineThreshold`
    //                    lines even after binary search hits minFontSize.
    //   • length-based → input length > `overflowInputCharThreshold`.
    //                    Early-fires, bypassing RULES 1 + 5.
    overflowLineThreshold: 5,
    overflowMinFontSize: 52,
    overflowInputCharThreshold: 28,

    // RULE 7 — pixel-fit safety pad (canvas px). Subtracted from
    // `maxWidth` ONLY inside the RULE 7 line-width check so the font
    // selector leaves visible breathing room between the rightmost
    // glyph and the slab edge. Without it the binary search lands on
    // the font where measureText === maxWidth and S/D-ending words
    // sit flush against the slab right edge.
    pixelFitRightPad: 8,

    // RULE 8 — vertical-fit constants. Every line block must fit
    // within `maxHeight − verticalFitPad` at the chosen font, where
    // the rendered block height is:
    //   (N − 1) × lh + glyphCapExtentRatio × fontSize + glyphShadowExtent
    //
    // The ratios are EMPIRICALLY measured for the current font
    // (Special Gothic Condensed One uppercase) by rendering on a
    // clean canvas and finding the topmost/bottommost ink pixels:
    //   • Cap extent above textBaseline="middle": ~0.457 × fontSize
    //   • Baseline extent below middle:           ~0.271 × fontSize
    //   → Sum: 0.728. Use 0.8 to account for the +3% Y-growth from
    //     the slab's −2.53° rotation + 8° skewX transforms.
    //
    // `glyphShadowExtent` captures the inner shadow's reach past the
    // glyph in canvas px: blur 9 above + (offset 4 + blur 9) below.
    // Without it the algorithm would underestimate true rendered
    // height by ~22 px and let 4-line wraps clip vertically.
    glyphCapExtentRatio: 0.8,
    glyphShadowExtent: 22,
    verticalFitPad: 0,

    // Type
    fontFamily: "'Special Gothic Condensed One', 'Anton', sans-serif",
    fontWeight: 400,
    // NOTE: Figma uses #707070 with overlay blend. 50%-gray + overlay is
    // mathematically near-zero contrast against a flat fill — the engraving
    // only shows on textured stone. Default below is slightly darker so the
    // text remains visible even on smoother slab textures. Push back toward
    // #707070 if it reads as too dark.
    fontColor: "#3a3a3a",
    lineHeight: 0.8, // figma: leading-[0.8]
    letterSpacing: -0.02, // em — figma: tracking-[-0.4331px] @ 21.654px
    textAlign: "left" as CanvasTextAlign,

    compositeMode: "overlay" as GlobalCompositeOperation, // figma: mix-blend-overlay
    // 0–1 — applied AFTER the overlay blend; lowers engraving strength.
    opacity: 0.8,

    // Noise — sparse speckles applied INSIDE each glyph (clipped via
    // source-atop). Gives the carved fill a stone-grain texture so it
    // doesn't read as a flat fill.
    noise: {
        enabled: true,
        density: 0.55, // 0–1 — fraction of pixels that get a speckle
        intensity: 0.55, // 0–1 — max alpha of each speckle
    },

    // Inner shadow — recessed feel along the top-left interior of each
    // glyph (like CSS `inset` box-shadow with positive offset). Increase
    // blur for a softer recess, increase offsets for more depth.
    innerShadow: {
        enabled: true,
        offsetX: 4,
        offsetY: 4,
        blur: 9,
        color: "rgba(0,0,0,0.95)",
    },

    // Perspective transform — copied straight from the Figma text wrapper
    // inside the TextBox layer (node 2265:429). Together they fan the text
    // out to follow the slab face's actual 3D angle.
    skewX: 8, // figma: skew-x-8
    skewY: 0,
    rotation: -2.53, // figma: rotate(-2.53deg)

    // Hard clip = the TextBox bounding rect (node 2518:129). Anything that
    // would otherwise spill past the slab's safe area is hard-clipped here
    // as a last line of defence (wrapAndFit keeps us in bounds before we
    // ever hit it).
    //                  top-L              top-R              bot-R              bot-L
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
    // Top-left: Razorpay logo. Figma 3865:271 — 29, 22.03, 129.13, 27.55
    // in the 620×775 mock; coords below are × (1080/620) ≈ 1.7419.
    razorpayLogo: {
        x: 50.51,
        y: 38.37,
        w: 224.92,
        h: 47.98,
        src: `${R2_BASE}/Avatars/Razorpay_Logo.png`,
    },
    // Top-right: Break to Build mark. Figma 3865:283 — 461, 14, 144, 38.22
    // in the 620×775 mock.
    campaignLogo: {
        x: 803.05,
        y: 24.39,
        w: 250.84,
        h: 66.58,
        src: `${R2_BASE}/Avatars/BreakToBuild_logo.png`,
    },
    // Diagonal "ODDS BEATEN / FUTURE FOUNDER" strip — pre-rotated SVG.
    tickerImage: { src: `${R2_BASE}/Avatars/Ticker_Blue.svg` },
    // Title stack — Figma frames 4313:10 (2-line name) + 4313:95 (1-line
    // name). Behaves like ONE auto-layout group: total stack height grows
    // when the name wraps from 1 line to 2 lines (or when the subtitle
    // wraps further), and the WHOLE group re-centres on `title.anchorY`
    // so a 1-line name and a 2-line name share the same imaginary middle
    // point. See renderPosterOverlay() for the algorithm.
    title: {
        centerX: 540,
        // Y centre of the WHOLE title group (eyebrow + name + subtitle).
        // ~80 figma units × 2.943 = 235 canvas px. Tuned so the 2-line
        // name case in Figma node 4313:10 matches its original top=27.19
        // figma units; the 1-line case auto-recenters around the same
        // anchor.
        anchorY: 235,
        eyebrow: {
            text: "THANK YOU",
            fontFamily: "Unbounded",
            fontWeight: 400,
            fontSize: 32.729,
            // Figma leading-[21.803px] → 21.803 × 2.943 ≈ 64.16. This
            // is the line-box height for vertical layout; fontSize is
            // the cap height inside it. The glyphs render in the middle
            // of the line box (textBaseline="middle" at start + lineHeight/2).
            lineHeight: 64.16,
            letterSpacing: -1.31,
        },
        // Vertical gap between bottom of eyebrow line-box and top of
        // name. Figma: 3.0 figma units × 2.943 ≈ 8.83 canvas px.
        eyebrowToNameGap: 9,
        name: {
            fontFamily: "Unbounded",
            fontWeight: 900,
            fontSize: 94.706,
            lineHeight: 92.424,
            letterSpacing: -3.79,
            maxWidth: 1020,
        },
        // Vertical gap between bottom of name (last name line) and top
        // of subtitle. Figma: ~7 figma units × 2.943 ≈ 20.6 canvas px;
        // averaged between the two design variants.
        nameToSubtitleGap: 22,
        subtitle: {
            prefix: "FOR BEATING THE ODDS AND BUILDING ",
            fontFamily: "Unbounded",
            fontWeight: 400,
            fontSize: 28.016,
            lineHeight: 38.1,
            letterSpacing: -1.12,
            // Figma 3865:247 — narrower max so the company name always
            // lands on its own line (matches the design's 2-line wrap).
            maxWidth: 639,
        },
    },
    media: { x: 0, y: 0 },

    // Diagonal blue ticker strip — Figma frame 4313:10.
    // IMPORTANT: Ticker_Blue.svg is 1376×302 with the -9.12° rotation BAKED
    // INTO the file's internal <rect transform>. Treat it as a flat image:
    // do NOT apply canvas rotation; preserve the SVG's natural aspect.
    //
    // SIZING: the SVG's internal bar (pre-rotation 1381.34 × 75.4157,
    // aspect 18.32:1) doesn't match the new Figma's bar (pre-rotation
    // 669.618 × 44.641, aspect 15:1) — so naïvely fitting the SVG to the
    // Figma flex container's width gives a bar that's ~21% thinner than
    // designed. Instead, we scale the SVG uniformly by
    //   131.4 (Figma bar thickness in canvas px) / 75.4157 (SVG bar
    //   thickness in SVG units) = 1.7423
    // which sets the rendered bar thickness to the Figma spec. The
    // resulting AABB (2397.4 × 526.2) is larger than the Figma flex
    // container — the extra length spills past the canvas edges, which
    // is fine because we want a continuous "infinite" diagonal ticker.
    //
    // POSITION: x/y are computed so the bar's centre lands at the
    // Figma-spec canvas centre (598.3, 1259.4 — from container centre
    // 203.30, 427.88 figma × 2.943 scale). SVG bar centre sits at SVG
    // (687.93, 146.77), so:
    //   x = 598.3 − 687.93 × 1.7423 = −600.25
    //   y = 1259.4 − 146.77 × 1.7423 = 1003.62
    ticker: {
        x: -600.25,
        y: 1003.62,
        w: 2397.4,
    },
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
    } catch { }
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
    } catch { }
}

// ────────────────────────────────────────────────────────────────────────────
//  SECTION 3 — Render engine
// ────────────────────────────────────────────────────────────────────────────

/**
 * Resolve normalized SLAB_CONFIG into absolute pixel values for the given
 * canvas dimensions.
 */
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

// ─── Slab-text caching ──────────────────────────────────────────────────────
// The styled text layer (main fill + noise + inner shadow) is expensive to
// render. It only depends on text + dimensions + SLAB_CONFIG, none of which
// change inside a single video render — so we render it ONCE and
// drawImage() it onto the source canvas for every video frame that needs
// the engraving.
let _slabLayerCache: { key: string | null; canvas: HTMLCanvasElement | null } =
    { key: null, canvas: null }
let _noisePatternCache: {
    key: string | null
    canvas: HTMLCanvasElement | null
} = { key: null, canvas: null }

/**
 * Build (or return cached) noise pattern canvas. Filled with sparse
 * black/white speckles at random alpha.
 */
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

/**
 * Greedy word-wrap with two cap dimensions:
 *   • Pixel width  — `maxWidth` measured via ctx.measureText
 *   • Char count   — `maxCharsPerLine` (RULE 4, defaults to Infinity)
 *
 * A new token is appended to the current line only if BOTH caps still
 * hold. Single tokens that exceed either cap alone (e.g. a long
 * hyphenation fragment) still get their own line and may overflow —
 * the slab clip polygon contains the visual damage.
 *
 * Hyphenation (RULE 2): any input word ≥ hyphenateAt chars is pre-
 * split at its midpoint into "first-half-" + "second-half", with the
 * first piece marked forceBreakAfter so it always ends a line.
 */
function wrapGreedy(
    text: string,
    ctx: CanvasRenderingContext2D,
    maxWidth: number,
    hyphenateAt = Infinity,
    maxCharsPerLine = Infinity
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
        const fitsPixels = ctx.measureText(tryLine).width <= maxWidth
        const fitsChars = tryLine.length <= maxCharsPerLine
        if (fitsPixels && fitsChars) cur = tryLine
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

/**
 * RULE 1 — keep the font at `maxFontSize` as long as the greedy wrap
 * (with hyphenation pre-applied per RULE 2 and char-cap per RULE 4)
 * produces ≤ `maxLines` lines. Only when the wrap requires MORE than
 * `maxLines` lines do we walk the font size DOWN — binary-searching for
 * the largest size that still fits in ≤ `maxLines` lines, with
 * `minFontSize` as the floor.
 *
 * RULE 5 overrides the scale-down when every line is narrower than
 * `narrowLineThreshold` chars (capped at `overflowLineThreshold` lines so
 * deep-overflow wraps don't get stuck at max font).
 *
 * RULE 6 fires either early (input length > overflowInputCharThreshold,
 * bypassing RULES 1+5) or late (wrap still > overflowLineThreshold lines
 * after the binary search bottoms out at minFontSize). In both cases the
 * chosen size drops to `overflowMinFontSize`, independent of minFontSize.
 *
 * Width / height overflow at the chosen size is tolerated — the slab clip
 * polygon catches anything that escapes the safe area. The fit math is
 * LINE-COUNT driven, not pixel-rect driven.
 *
 * NOTE: rotation / skewX / skewY / textAlign are accepted on this options
 * shape for API compatibility (call sites pass them) but are deliberately
 * NOT used to drive the fit math. Reason: the Figma design constrains the
 * UNTRANSFORMED text wrapper (197×211) and lets the rotation + skew fan
 * the visual into the larger surrounding TextBox parallelogram. An earlier
 * version computed a transform-aware AABB against the small wrapper, which
 * made the binary search shrink the font dramatically for any non-trivial
 * transform — the opposite of what Figma renders. Do NOT add transform
 * math here unless you also widen the bounds.
 */
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
        maxLines?: number
        maxCharsPerLine?: number
        narrowLineThreshold?: number
        overflowLineThreshold?: number
        overflowMinFontSize?: number
        overflowInputCharThreshold?: number
        pixelFitRightPad?: number
        glyphCapExtentRatio?: number
        glyphShadowExtent?: number
        verticalFitPad?: number
        // Accepted for API compatibility; not used by the fit math. See
        // the doc-block above for why.
        rotation?: number
        skewX?: number
        skewY?: number
        textAlign?: CanvasTextAlign
    }
) {
    const {
        fontFamily,
        fontWeight,
        maxWidth,
        maxHeight,
        lineHeight = 0.8,
        letterSpacing,
        minFontSize = 30,
        maxFontSize = 70,
        hyphenateMinLength = Infinity,
        maxLines = 3,
        maxCharsPerLine = Infinity,
        narrowLineThreshold = 0,
        overflowLineThreshold = Infinity,
        overflowMinFontSize = 0,
        overflowInputCharThreshold = Infinity,
        pixelFitRightPad = 0,
        glyphCapExtentRatio = 0,
        glyphShadowExtent = 0,
        verticalFitPad = 0,
    } = opts

    const applyFont = (size: number) => {
        ctx.font = `${fontWeight} ${size}px ${fontFamily}`
        if ("letterSpacing" in ctx)
            (ctx as any).letterSpacing = `${letterSpacing * size}px`
    }
    const wrap = () =>
        wrapGreedy(text, ctx, maxWidth, hyphenateMinLength, maxCharsPerLine)
    // RULE 7 — every line must fit the pixel cap at the chosen font.
    // wrapGreedy only consults the pixel cap when DECIDING WHERE to
    // break — a single token (e.g. the 7-char hyphenation fragment
    // "EXPERI-" or a 7-char word like "PARENTS"/"CROWDED") still ends
    // up on its own line even if it overflows maxWidth at the current
    // font. This helper lets the font-size selector reject such
    // results and walk the font DOWN until every line genuinely fits.
    //
    // `pixelFitRightPad` is subtracted from maxWidth ONLY here (not
    // inside wrapGreedy) so we leave visible breathing room between
    // the rightmost painted pixel and the slab edge. `measureText`
    // returns the advance width — the right-side bearing of glyphs
    // like S adds a few px of paint past that, which makes the font
    // selector land flush against the edge if the pad is 0.
    const effectiveMaxWidth = Math.max(0, maxWidth - pixelFitRightPad)
    const allLinesFitPixels = (lines: string[]) =>
        lines.every((l) => ctx.measureText(l).width <= effectiveMaxWidth)
    // RULE 8 — every line block must fit the vertical cap at the
    // chosen font. wrapGreedy / RULE 1 only check line COUNT, not
    // total rendered height — so a 4-line wrap at max font passes
    // line count (4 ≤ maxLines 4) but its geometric ink extends
    // ~30 px past `maxHeight`, clipping at the visible stone edges.
    //
    // Rendered block height ≈
    //   (N − 1) × fontSize × lineHeight       (line-center spacing)
    //   + glyphCapExtentRatio × fontSize       (cap top + baseline below middle)
    //   + glyphShadowExtent                    (inner shadow blur margin)
    //
    // `verticalFitPad` is subtracted from maxHeight as a safety
    // margin against the visible stone area being slightly smaller
    // than the slab clip polygon (the polygon is the AABB; the actual
    // engravable stone surface tapers at the bevels).
    const effectiveMaxHeight = Math.max(0, maxHeight - verticalFitPad)
    const verticalFitEnabled = glyphCapExtentRatio > 0 && maxHeight > 0
    const renderedBlockHeight = (linesArr: string[], fontSize: number) =>
        (linesArr.length - 1) * fontSize * lineHeight +
        glyphCapExtentRatio * fontSize +
        glyphShadowExtent
    const allLinesFitVertical = (linesArr: string[], fontSize: number) =>
        !verticalFitEnabled ||
        renderedBlockHeight(linesArr, fontSize) <= effectiveMaxHeight

    // RULE 6 (early-fire) — long inputs always render at the deep-
    // overflow floor, bypassing RULES 1 + 5. This catches the case
    // where a 29/30-char text wraps to ≤ 5 lines (so RULE 5 might
    // otherwise keep it at max font) but the line block is still
    // tall enough to clip the slab vertically.
    if (
        overflowMinFontSize > 0 &&
        text &&
        text.length > overflowInputCharThreshold
    ) {
        applyFont(overflowMinFontSize)
        return { fontSize: overflowMinFontSize, lines: wrap() }
    }

    // Try the design's intended max size first.
    applyFont(maxFontSize)
    const linesAtMax = wrap()
    // RULE 1 — keep max font only when line count, every line's
    // pixel width (RULE 7), AND total block height (RULE 8) all pass.
    // RULE 7 catches single-token-overflow that wrapGreedy can't
    // avoid; RULE 8 catches N-line wraps whose rendered height
    // exceeds `maxHeight` even when line count is within `maxLines`.
    if (
        linesAtMax.length <= maxLines &&
        allLinesFitPixels(linesAtMax) &&
        allLinesFitVertical(linesAtMax, maxFontSize)
    ) {
        return { fontSize: maxFontSize, lines: linesAtMax }
    }
    // RULE 5 — short-line override (capped at overflowLineThreshold).
    // Same RULE 7 + RULE 8 guards: a "narrow" line wrap can still
    // overflow pixel width or block height, so RULE 5 can't lock in
    // max font in those cases.
    if (
        narrowLineThreshold > 0 &&
        linesAtMax.length <= overflowLineThreshold &&
        linesAtMax.every((l) => l.length < narrowLineThreshold) &&
        allLinesFitPixels(linesAtMax) &&
        allLinesFitVertical(linesAtMax, maxFontSize)
    ) {
        return { fontSize: maxFontSize, lines: linesAtMax }
    }

    // Binary-search downward for the largest size that fits the
    // line-count cap, the pixel-width cap (RULE 7), AND the vertical
    // cap (RULE 8) on every line. NOTE: with RULE 4 in play, the wrap
    // is mostly character-driven, so shrinking the font rarely changes
    // line count — this loop typically converges on minFontSize when
    // it runs at all.
    let lo = minFontSize,
        hi = maxFontSize - 1
    let best: { fontSize: number; lines: string[] } | null = null
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        applyFont(mid)
        const lines = wrap()
        if (
            lines.length <= maxLines &&
            allLinesFitPixels(lines) &&
            allLinesFitVertical(lines, mid)
        ) {
            best = { fontSize: mid, lines }
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }
    if (best) return best

    // Even at minFontSize we exceed maxLines — accept the overflow.
    // The hard clip polygon will visually contain it.
    applyFont(minFontSize)
    const fallbackLines = wrap()

    // RULE 6 (post-fallback) — fires when EITHER:
    //   (a) line count still exceeds `overflowLineThreshold` at minFont, OR
    //   (b) total rendered block height still overflows the vertical
    //       cap (RULE 8) at minFont — happens for 4-line wraps that
    //       are line-count-acceptable but geometrically too tall.
    // Either trigger drops the chosen size to `overflowMinFontSize`
    // (below minFontSize), giving the block enough room to fit.
    const fallbackOverflowsLines =
        fallbackLines.length > overflowLineThreshold
    const fallbackOverflowsVertical = !allLinesFitVertical(
        fallbackLines,
        minFontSize
    )
    if (
        overflowMinFontSize > 0 &&
        overflowMinFontSize < minFontSize &&
        (fallbackOverflowsLines || fallbackOverflowsVertical)
    ) {
        applyFont(overflowMinFontSize)
        return { fontSize: overflowMinFontSize, lines: wrap() }
    }
    return { fontSize: minFontSize, lines: fallbackLines }
}

/**
 * Render the styled slab text onto an offscreen canvas context. Three
 * passes:
 *   1. Main carved fill (solid color, sharp edges).
 *   2. Noise speckles inside each glyph (source-atop clips to text).
 *   3. Inner shadow inside each glyph (inverse-text mask + canvas shadow
 *      API + source-atop). Produces a recessed top-left edge.
 */
function renderSlabLayerInto(
    ctx: CanvasRenderingContext2D,
    text: string,
    W: number,
    H: number
) {
    const C = SLAB_CONFIG
    const { anchor, maxW, maxH, poly } = resolveSlab(W, H)

    ctx.save()

    // Clip to slab polygon (canvas-space) — last line of defence against
    // any overflow past the slab safe area.
    ctx.beginPath()
    ctx.moveTo(poly[0][0], poly[0][1])
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1])
    ctx.closePath()
    ctx.clip()

    // Translate to anchor, rotate, then skew. After this transform, x=0
    // is the centre of the (untransformed) text wrapper.
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

    // Word-wrap + auto-fit: binary-search the largest font size at which
    // a greedy word wrap fits maxW × maxH. Hyphenates long words so they
    // can't push past the slab safe area.
    const { lines, fontSize } = wrapAndFit(text, ctx, {
        fontFamily: C.fontFamily,
        fontWeight: C.fontWeight,
        maxWidth: maxW,
        maxHeight: maxH,
        lineHeight: C.lineHeight,
        letterSpacing: C.letterSpacing,
        minFontSize: C.minFontSize ?? 30,
        maxFontSize: C.maxFontSize ?? 70,
        hyphenateMinLength: C.hyphenateMinLength ?? Infinity,
        maxLines: C.maxLines ?? 3,
        maxCharsPerLine: C.maxCharsPerLine ?? Infinity,
        narrowLineThreshold: C.narrowLineThreshold ?? 0,
        overflowLineThreshold: C.overflowLineThreshold ?? Infinity,
        overflowMinFontSize: C.overflowMinFontSize ?? 0,
        overflowInputCharThreshold: C.overflowInputCharThreshold ?? Infinity,
        pixelFitRightPad: C.pixelFitRightPad ?? 0,
        glyphCapExtentRatio: C.glyphCapExtentRatio ?? 0,
        glyphShadowExtent: C.glyphShadowExtent ?? 0,
        verticalFitPad: C.verticalFitPad ?? 0,
        rotation: C.rotation,
        skewX: C.skewX,
        skewY: C.skewY,
        textAlign: C.textAlign || "left",
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

    // 1 — Main carved fill (sharp, solid color).
    ctx.fillStyle = C.fontColor
    lines.forEach((line, i) => ctx.fillText(line, drawX, startY + i * lh))

    // 2 — Noise inside the glyphs (source-atop clips to the text).
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

    // 3 — Inner shadow at the top-left interior of each glyph.
    //   Trick: build an "inverse text" mask (solid outside text, transparent
    //   inside), then drawImage it back onto the layer with the canvas-API
    //   shadow + source-atop. The shadow extends FROM the solid edges INTO
    //   the transparent region (i.e. into the glyph), and source-atop keeps
    //   only the parts that fall on existing pixels — which is precisely
    //   the carved fill.
    if (C.innerShadow && C.innerShadow.enabled) {
        const mask = document.createElement("canvas")
        mask.width = W
        mask.height = H
        const mctx = mask.getContext("2d")!
        // Fill solid (any color — only alpha matters for the shadow).
        mctx.fillStyle = "#000"
        mctx.fillRect(0, 0, W, H)
        // Apply the same transform used for the main text, then erase the
        // glyph shapes out of the solid fill.
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

        // Draw the mask onto the layer in canvas coords, with the canvas-
        // shadow API supplying the inner-shadow geometry.
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

/**
 * Render (or return cached) the styled slab-text layer. The layer is a
 * W×H canvas with the engraved text on a transparent background, ready to
 * be drawn onto the source canvas with the configured composite blend.
 */
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

/**
 * Composite the cached styled-text layer onto the source canvas with the
 * configured blend mode (default: overlay). Per-frame cost is a single
 * drawImage rather than a full re-render.
 */
function drawSlabText(
    ctx: CanvasRenderingContext2D,
    text: string,
    W: number,
    H: number
) {
    const layer = getSlabTextLayer(text, W, H)
    ctx.save()
    ctx.globalCompositeOperation = SLAB_CONFIG.compositeMode || "source-over"
    // Opacity is applied at composite time (after the overlay blend) —
    // change `SLAB_CONFIG.opacity` to scale engraving strength up/down
    // without re-rendering the cached layer.
    ctx.globalAlpha = SLAB_CONFIG.opacity ?? 1
    ctx.drawImage(layer, 0, 0)
    ctx.restore()
}

/**
 * Trim 3-word names to first + last (drop the middle word).
 * "Aman Oasis Singh" → "Aman Singh". Names with 1, 2, or 4+ words are
 * returned unchanged.
 *
 * Rationale: long middle names blow past `name.maxWidth` and force a
 * 2-line wrap even when first + last alone would have fit on one line —
 * the banner reads cleaner with two-word names. Applied only to the
 * exact 3-word case to keep behaviour predictable for hyphenated
 * surnames and longer pen-names.
 */
function trimNameForDisplay(name: string): string {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean)
    if (parts.length === 3) return `${parts[0]} ${parts[2]}`
    return name
}

/**
 * Name wrap: prefer ONE line. Only split into two lines when the full
 * name overflows `maxW` at the configured font. When we do split, pick
 * the space closest to the middle for a balanced 2-line stack (matches
 * the Figma reference for long names like "MATT CHITHRANJAN"). Short
 * names with spaces ("AMAN O S") stay on one line — same as Figma node
 * 4313:95.
 */
function wrapPosterName(
    name: string,
    ctx: CanvasRenderingContext2D,
    maxW: number
) {
    // Fits on one line — never split, regardless of spaces.
    if (ctx.measureText(name).width <= maxW) return [name]
    // No space to break on — accept the overflow rather than splitting
    // mid-word; the renderer doesn't auto-fit the name (yet).
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

/**
 * Centre-anchored title-stack renderer.
 *
 * The eyebrow + name + subtitle behave like a SINGLE auto-layout group:
 * total stack height grows when the name wraps to 2 lines or the
 * subtitle wraps further, and the WHOLE group re-centres on
 * `title.anchorY` so a 1-line name and a 2-line name share the same
 * imaginary middle point (visible in Figma nodes 4313:10 vs 4313:95).
 *
 * Algorithm:
 *   1. Pre-measure each block's height with its real line count.
 *   2. Sum: H = eyebrow.lineHeight + g1 + nLines×n.lh + g2 + sLines×s.lh
 *   3. startY = anchorY − H/2  (top of eyebrow's line-box)
 *   4. Render top-down from startY with the per-block heights as the
 *      step. Each block uses textBaseline appropriate to its layout:
 *        • eyebrow: "middle" inside the eyebrow line-box
 *        • name / subtitle: "top" at the block start (line-height is
 *          the step, not a centred line-box)
 */
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

    // ── Pre-measure the stack ────────────────────────────────────────
    // Block 1 — eyebrow (always single-line "THANK YOU"): height = its
    // configured line-box height (lineHeight), not fontSize. Glyphs are
    // vertically centred inside that box.
    const eyebrowH = T.eyebrow.lineHeight || T.eyebrow.fontSize

    // Block 2 — name. Apply the 3-word → first+last trim before wrapping,
    // then wrap against `name.maxWidth`. nameLines decides the block's
    // height (lines × lineHeight).
    ctx.fillStyle = P.textColor
    ctx.textAlign = "center"
    const N = T.name
    ctx.font = `${N.fontWeight} ${N.fontSize}px '${N.fontFamily}', sans-serif`
    if ("letterSpacing" in ctx)
        (ctx as any).letterSpacing = `${N.letterSpacing}px`
    const displayName = trimNameForDisplay(name || "YOUR NAME").toUpperCase()
    const nameLines = wrapPosterName(displayName, ctx, N.maxWidth)
    const nameH = nameLines.length * N.lineHeight

    // Block 3 — subtitle. Wrap the prefix + company against the
    // narrower `subtitle.maxWidth`.
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
    const subLines = [...prefixLines, ...companyLines]
    const subH = subLines.length * S.lineHeight

    const stackH =
        eyebrowH + T.eyebrowToNameGap + nameH + T.nameToSubtitleGap + subH
    const startY = T.anchorY - stackH / 2

    // ── Render top-down ──────────────────────────────────────────────
    // Eyebrow — centred in its line-box.
    const E = T.eyebrow
    ctx.font = `${E.fontWeight} ${E.fontSize}px '${E.fontFamily}', sans-serif`
    ctx.textBaseline = "middle"
    if ("letterSpacing" in ctx)
        (ctx as any).letterSpacing = `${E.letterSpacing}px`
    ctx.fillText(E.text, T.centerX, startY + eyebrowH / 2)

    // Name — top-aligned per line; step = N.lineHeight. Restore the
    // canvas font + letterSpacing before drawing (the pre-measure pass
    // left them at the subtitle's values).
    ctx.font = `${N.fontWeight} ${N.fontSize}px '${N.fontFamily}', sans-serif`
    ctx.textBaseline = "top"
    if ("letterSpacing" in ctx)
        (ctx as any).letterSpacing = `${N.letterSpacing}px`
    const nameTop = startY + eyebrowH + T.eyebrowToNameGap
    nameLines.forEach((line, i) =>
        ctx.fillText(line, T.centerX, nameTop + i * N.lineHeight)
    )

    // Subtitle — top-aligned per line; step = S.lineHeight.
    ctx.font = `${S.fontWeight} ${S.fontSize}px '${S.fontFamily}', sans-serif`
    ctx.textBaseline = "top"
    if ("letterSpacing" in ctx)
        (ctx as any).letterSpacing = `${S.letterSpacing}px`
    const subTop = nameTop + nameH + T.nameToSubtitleGap
    subLines.forEach((line, i) =>
        ctx.fillText(line, T.centerX, subTop + i * S.lineHeight)
    )

    // Diagonal blue ticker strip. The SVG ships pre-rotated (rotation is
    // baked into its internal <rect transform>), so we draw it as a flat
    // image at the Figma container's top-left, preserving the file's
    // natural aspect ratio so the text isn't vertically compressed.
    const TK = P.ticker
    if (logos.ticker) {
        const nw =
            (logos.ticker as HTMLImageElement).naturalWidth ||
            (logos.ticker as any).width
        const nh =
            (logos.ticker as HTMLImageElement).naturalHeight ||
            (logos.ticker as any).height
        const drawH = nw && nh ? TK.w * (nh / nw) : TK.w * 0.2195
        ctx.drawImage(logos.ticker, TK.x, TK.y, TK.w, drawH)
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
        if (mw && mh) {
            // Scale to fill the final canvas, preserving aspect ratio.
            // Mobile browsers may decode source videos at lower resolution,
            // so we always scale rather than drawing at native size.
            const scale = Math.max(FINAL_WIDTH / mw, FINAL_HEIGHT / mh)
            const drawW = mw * scale
            const drawH = mh * scale
            const drawX = (FINAL_WIDTH - drawW) / 2
            const drawY = (FINAL_HEIGHT - drawH) / 2
            ctx.drawImage(mediaEl, drawX, drawY, drawW, drawH)
        }
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
    // RULE 3 — hard truncate user input to SLAB_CONFIG.maxInputChars
    // before it ever reaches the wrap algorithm. The cache key in
    // getSlabTextLayer already includes the post-trunc text, so caching
    // remains correct.
    const oddsText = (userData.oddsText || "")
        .toUpperCase()
        .slice(0, SLAB_CONFIG.maxInputChars ?? 30)

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
    } catch { }
    await video.play()

    await new Promise<void>((resolve, reject) => {
        const finish = () => {
            try {
                recorder.stop()
            } catch { }
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

// ─── Share config + platform helpers (desktop fallback) ─────────────────────
// On desktop, the Web Share API can't attach video files, so the Share
// button is replaced by 3 platform buttons. Each one opens the platform's
// composer in a new tab with prefilled text/URL and auto-downloads the
// rendered video for manual attachment (none of X / LinkedIn / WhatsApp
// accept media via URL params — that's a platform limitation, not a code
// one).
const SHARE_CONFIG = {
    text: "I'm taking the pledge to beat the odds and build for India. #BreakToBuild × @Razorpay",
    url: "https://relieved-series-107200.framer.app/",
}

function buildPlatformShareUrl(
    platform: "x" | "linkedin" | "whatsapp"
): string {
    const t = encodeURIComponent(SHARE_CONFIG.text)
    const u = encodeURIComponent(SHARE_CONFIG.url)
    switch (platform) {
        case "x":
            return `https://twitter.com/intent/tweet?text=${t}&url=${u}`
        case "linkedin":
            return `https://www.linkedin.com/sharing/share-offsite/?url=${u}&summary=${t}`
        case "whatsapp":
            return `https://api.whatsapp.com/send?text=${t}%20${u}`
    }
}

// Inline platform glyphs. Pure SVG, no external font/icon deps so they
// render identically in Framer preview and on the published site.
function IconX() {
    return (
        <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
        </svg>
    )
}
function IconLinkedIn() {
    return (
        <svg
            viewBox="0 0 24 24"
            width="26"
            height="26"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 11.001-4.121A2.06 2.06 0 015.34 7.43zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
        </svg>
    )
}
function IconWhatsApp() {
    return (
        <svg
            viewBox="0 0 24 24"
            width="26"
            height="26"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zM20.463 3.488A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
    )
}

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
    // Mobile detection — drives which share UI we render. We treat the
    // device as mobile when the UA matches a known mobile string OR the
    // viewport is narrow (≤ 768 px). Either trigger is enough because
    // desktop browsers occasionally hand out mobile UAs in dev tools and
    // we want the experience to switch as the user resizes.
    const [isMobile, setIsMobile] = useState(false)
    const prevStartRef = useRef<boolean>(false)
    const isMountedRef = useRef<boolean>(true)

    useEffect(() => {
        isMountedRef.current = true
        return () => {
            isMountedRef.current = false
        }
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        const check = () => {
            const ua = navigator.userAgent || ""
            const isMobileUA =
                /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobi/i.test(
                    ua
                )
            setIsMobile(isMobileUA || window.innerWidth <= 768)
        }
        check()
        window.addEventListener("resize", check)
        return () => window.removeEventListener("resize", check)
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
            } catch { }
        } else {
            onDownload()
        }
    }

    // Desktop share — opens the platform composer in a new tab and
    // auto-downloads the rendered video so the user can attach it. The
    // window.open call must run synchronously inside the click handler
    // or popup blockers eat the new tab.
    const onShareTo = (platform: "x" | "linkedin" | "whatsapp") => {
        if (!resultBlob) return
        window.open(
            buildPlatformShareUrl(platform),
            "_blank",
            "noopener,noreferrer"
        )
        onDownload()
    }

    const container: React.CSSProperties = {
        width: "100%",
        height: "100%",
        background: status === "result" ? "white" : backgroundColor,
        color: "#fff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
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
        padding: "14px 20px 8px 20px",
        fontFamily: "GC VANK",
        fontSize: 22,
        fontWeight: 600,
        cursor: "pointer",
        textTransform: "uppercase",
        letterSpacing: 1,
    }

    const secondaryBtn: React.CSSProperties = {
        ...button,
        background:
            "linear-gradient(90deg, rgba(79, 79, 79, 1) 0%, rgba(181, 181, 181, 1) 100%)",
    }

    // Square icon button for the desktop share row. Same accent + cursor
    // as `button`, but no text padding. Sized to roughly match the visual
    // height of the Download button (font 22 + padding 14+8 ≈ 58 px).
    const ICON_BTN_SIZE = 58
    const iconBtn: React.CSSProperties = {
        background: accentColor,
        color: "#fff",
        border: 0,
        padding: 0,
        width: ICON_BTN_SIZE,
        height: ICON_BTN_SIZE,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
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
                    Forging your mark…
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
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {isMobile ? (
                    <>
                        <button style={button} onClick={onShare}>
                            Share
                        </button>
                        <button style={secondaryBtn} onClick={onDownload}>
                            Download
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            style={iconBtn}
                            onClick={() => onShareTo("linkedin")}
                            aria-label="Share on LinkedIn"
                        >
                            <IconLinkedIn />
                        </button>
                        <button
                            style={iconBtn}
                            onClick={() => onShareTo("x")}
                            aria-label="Share on X"
                        >
                            <IconX />
                        </button>
                        <button
                            style={iconBtn}
                            onClick={() => onShareTo("whatsapp")}
                            aria-label="Share on WhatsApp"
                        >
                            <IconWhatsApp />
                        </button>
                        <button style={secondaryBtn} onClick={onDownload}>
                            Download
                        </button>
                    </>
                )}
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
