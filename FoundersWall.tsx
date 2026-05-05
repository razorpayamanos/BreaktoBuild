import * as React from "react"
import {
    CSSProperties,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react"
import { addPropertyControls, ControlType } from "framer"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

// ============================================================================
// === V2 HOOKS ===
//   1. Google Sheet ingestion: replace the PRESET_CAVITIES constant with a
//      fetch hook (search "// V2: replace with fetched cavities").
//   2. Persist user-broken bricks to a DB instead of session-only state
//      (search "// TODO: persist to DB" inside handleBreakBrick).
//   3. Auth (e.g. LinkedIn OAuth) gates the submit step in BreakBrickModal —
//      look for the form's submit handler.
// ============================================================================

type Cavity = {
    col: number
    row: number
    text: string
    founderName?: string
    company?: string
    linkedin?: string
    isUserBrick?: boolean
}

type SelectedBrick = {
    col: number
    row: number
    screenX: number
    screenY: number
}

type FoundersWallProps = {
    brickImage: string
    campaignImage: string
    wallColumns: number
    wallRows: number
    brickWidth: number
    brickHeight: number
    mortarColor: string
    wallBackgroundColor: string
    enableShatter: boolean
    onCampaignClick?: () => void
    style?: CSSProperties
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const CAVITY_W_BRICKS = 2
const CAVITY_H_BRICKS = 1
// Source brick image is 990x314 (~3.15:1). Default brick size preserves
// that ratio so the brick renders un-squished.
const DEFAULT_BRICK_W = 240
const DEFAULT_BRICK_H = 76

function preset(
    col: number,
    row: number,
    founderName: string,
    company: string,
): Cavity {
    return {
        col,
        row,
        founderName,
        company,
        text: `${founderName} broke this brick to build ${company}.`,
    }
}

// V2: replace with fetched cavities
// Each cavity occupies (col, col+1) × row. Positions are hand-picked to
// feel scattered (no grid pattern, no two cavities aligned exactly) —
// inner cluster visible on landing, mid ring revealed with a short pan,
// far reach earned by exploration. None overlap each other or the
// campaign rectangle (cols 199..201 × rows 99..100).
const PRESET_CAVITIES: Cavity[] = [
    // Inner — visible on first paint
    preset(196, 92, "Deepinder Goyal", "Zomato"),
    preset(202, 94, "Bhavish Aggarwal", "Ola"),
    preset(192, 95, "Falguni Nayar", "Nykaa"),
    preset(203, 97, "Vijay Shekhar Sharma", "Paytm"),
    preset(197, 98, "Sachin Bansal", "Flipkart"),
    preset(193, 101, "Kunal Shah", "CRED"),
    preset(203, 103, "Nithin Kamath", "Zerodha"),
    preset(196, 105, "Aman Gupta", "boAt"),
    // Mid ring — short pan
    preset(178, 88, "Ritesh Agarwal", "OYO"),
    preset(214, 87, "Byju Raveendran", "BYJU'S"),
    preset(173, 102, "Peyush Bansal", "Lenskart"),
    preset(220, 99, "Harsh Jain", "Dream11"),
    preset(186, 112, "Tarun Mehta", "Ather Energy"),
    preset(210, 113, "Sridhar Vembu", "Zoho"),
    // Far reach — discovered by exploring
    preset(150, 96, "Binny Bansal", "Flipkart"),
    preset(238, 90, "Ghazal Alagh", "Mamaearth"),
    preset(167, 76, "Kailash Katkar", "Quick Heal"),
    preset(228, 76, "Vineeta Singh", "SUGAR Cosmetics"),
]

const CAMPAIGN_CAVITY = { col: 199, row: 99, width: 3, height: 2 }

// 14 irregular brick-shard polygons used by the shatter effect
const SHARD_CLIPS: string[] = [
    "polygon(0% 0%, 38% 0%, 52% 28%, 28% 48%, 0% 36%)",
    "polygon(38% 0%, 72% 0%, 66% 30%, 52% 28%)",
    "polygon(72% 0%, 100% 0%, 100% 32%, 82% 36%, 66% 30%)",
    "polygon(0% 36%, 28% 48%, 24% 72%, 0% 66%)",
    "polygon(28% 48%, 52% 28%, 66% 30%, 60% 52%, 44% 66%, 24% 72%)",
    "polygon(82% 36%, 100% 32%, 100% 62%, 76% 60%, 66% 46%)",
    "polygon(76% 60%, 100% 62%, 100% 82%, 80% 76%)",
    "polygon(0% 66%, 24% 72%, 30% 92%, 8% 100%, 0% 100%)",
    "polygon(24% 72%, 44% 66%, 52% 90%, 30% 92%)",
    "polygon(44% 66%, 60% 52%, 76% 60%, 70% 80%, 52% 90%)",
    "polygon(70% 80%, 80% 76%, 100% 82%, 100% 100%, 76% 100%)",
    "polygon(52% 90%, 70% 80%, 76% 100%, 52% 100%)",
    "polygon(30% 92%, 52% 90%, 52% 100%, 30% 100%, 8% 100%)",
    "polygon(60% 52%, 76% 60%, 66% 46%)",
]

// ----------------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------------

function clampN(v: number, lo: number, hi: number) {
    if (lo > hi) return lo
    return Math.max(lo, Math.min(hi, v))
}

function hash2D(col: number, row: number): number {
    let h = (col * 73856093) ^ (row * 19349663)
    h = (h ^ (h >>> 16)) >>> 0
    return h
}

function brickVariation(col: number, row: number) {
    const h = hash2D(col, row)
    const u = (n: number) => ((h >>> n) & 0xfff) / 0xfff
    const hueShift = (u(0) - 0.5) * 6
    const brightness = 1 + (u(7) - 0.5) * 0.18
    const dx = (u(13) - 0.5) * 1.2
    const dy = (u(19) - 0.5) * 1.2
    const rotations = [0, 0.12, -0.12, 0.2]
    const rotation = rotations[h % 4]
    return { hueShift, brightness, dx, dy, rotation }
}

function isTouchEnv(): boolean {
    if (typeof window === "undefined") return false
    return "ontouchstart" in window || (navigator && navigator.maxTouchPoints > 0)
}

function brickScreenOffset(row: number, brickWidth: number) {
    return row % 2 === 1 ? brickWidth / 2 : 0
}

// ----------------------------------------------------------------------------
// Brick (one normal brick)
// ----------------------------------------------------------------------------

const Brick = React.memo(function Brick({
    col,
    row,
    brickWidth,
    brickHeight,
    brickImage,
    mortarColor,
    hovered,
}: {
    col: number
    row: number
    brickWidth: number
    brickHeight: number
    brickImage: string
    mortarColor: string
    hovered?: boolean
}) {
    const v = brickVariation(col, row)
    const x = col * brickWidth + brickScreenOffset(row, brickWidth)
    const y = row * brickHeight
    return (
        <div
            style={{
                position: "absolute",
                left: x,
                top: y,
                width: brickWidth,
                height: brickHeight,
                transform: `translate(${v.dx}px, ${v.dy}px) rotate(${v.rotation}deg)`,
                backgroundImage: `url(${brickImage})`,
                backgroundSize: "100% 100%",
                backgroundRepeat: "no-repeat",
                filter: `hue-rotate(${v.hueShift}deg) brightness(${v.brightness})`,
                boxShadow: `inset 0 -2px 3px rgba(0,0,0,0.45), inset 0 2px 2px rgba(255,255,255,0.04), inset 1px 0 0 ${mortarColor}, inset -1px 0 0 ${mortarColor}`,
                pointerEvents: "none",
            }}
        >
            {hovered && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        paddingLeft: brickWidth * 0.08,
                        paddingRight: brickWidth * 0.08,
                        fontFamily:
                            '"TASA Orbiter", "Inter", system-ui, sans-serif',
                        fontWeight: 400,
                        fontSize: brickHeight * 0.36,
                        letterSpacing: 0.2,
                        color: "rgba(18,12,8,0.62)",
                        mixBlendMode: "multiply",
                        textShadow:
                            "0 1px 0 rgba(255,255,255,0.18), 0 -0.5px 0 rgba(0,0,0,0.22)",
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                    }}
                >
                    Break this brick. <span style={{ marginLeft: 2 }}>↗</span>
                </div>
            )}
        </div>
    )
})

// ----------------------------------------------------------------------------
// CavityView — recessed text panel
// ----------------------------------------------------------------------------

function CavityView({
    cavity,
    brickWidth,
    brickHeight,
}: {
    cavity: Cavity
    brickWidth: number
    brickHeight: number
}) {
    const x = cavity.col * brickWidth + brickScreenOffset(cavity.row, brickWidth)
    const y = cavity.row * brickHeight
    const w = CAVITY_W_BRICKS * brickWidth
    const h = CAVITY_H_BRICKS * brickHeight

    return (
        <div
            style={{
                position: "absolute",
                left: x,
                top: y,
                width: w,
                height: h,
                background: "#050302",
                boxShadow: `
                    inset 0 4px 10px rgba(0,0,0,0.95),
                    inset 0 -2px 5px rgba(0,0,0,0.7),
                    inset 3px 0 5px rgba(0,0,0,0.75),
                    inset -3px 0 5px rgba(0,0,0,0.75)
                `,
                borderRadius: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "8px 14px",
                boxSizing: "border-box",
                overflow: "hidden",
                pointerEvents: "none",
            }}
        >
            <div
                style={{
                    fontFamily:
                        '"TASA Orbiter", "Inter", system-ui, sans-serif',
                    fontWeight: 400,
                    fontSize: Math.max(11, Math.min(16, brickHeight * 0.22)),
                    lineHeight: 1.22,
                    color: "#a89884",
                    letterSpacing: 0.1,
                }}
            >
                {cavity.text}
            </div>
            {cavity.founderName && (
                <div
                    style={{
                        fontFamily:
                            '"TASA Orbiter", "Inter", system-ui, sans-serif',
                        fontSize: Math.max(8, Math.min(10, brickHeight * 0.13)),
                        color: "#5a4a3a",
                        marginTop: 5,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                    }}
                >
                    — {cavity.founderName}
                    {cavity.company ? `, ${cavity.company}` : ""}
                </div>
            )}
        </div>
    )
}

// ----------------------------------------------------------------------------
// CampaignCavityView — the big central recess
// ----------------------------------------------------------------------------

function CampaignCavityView({
    brickWidth,
    brickHeight,
    campaignImage,
}: {
    brickWidth: number
    brickHeight: number
    campaignImage: string
}) {
    const x = CAMPAIGN_CAVITY.col * brickWidth
    const y = CAMPAIGN_CAVITY.row * brickHeight
    const w = CAMPAIGN_CAVITY.width * brickWidth
    const h = CAMPAIGN_CAVITY.height * brickHeight
    return (
        <div
            style={{
                position: "absolute",
                left: x,
                top: y,
                width: w,
                height: h,
                background: "#050302",
                backgroundImage: `url(${campaignImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                boxShadow: `
                    inset 0 3px 8px rgba(0,0,0,0.7),
                    inset 0 -2px 5px rgba(0,0,0,0.55),
                    inset 3px 0 5px rgba(0,0,0,0.6),
                    inset -3px 0 5px rgba(0,0,0,0.6)
                `,
                borderRadius: 1,
                overflow: "hidden",
                pointerEvents: "none",
            }}
        />
    )
}

// ----------------------------------------------------------------------------
// Form field — small helper for the modal
// ----------------------------------------------------------------------------

function Field({
    label,
    value,
    onChange,
    multiline,
    maxLength,
    placeholder,
}: {
    label: string
    value: string
    onChange: (v: string) => void
    multiline?: boolean
    maxLength?: number
    placeholder?: string
}) {
    const baseStyle: CSSProperties = {
        width: "100%",
        padding: "9px 11px",
        background: "#0c0805",
        border: "1px solid #3a2818",
        borderRadius: 3,
        color: "#e8d4ba",
        fontFamily: "inherit",
        fontSize: 14,
        boxSizing: "border-box",
        outline: "none",
    }
    return (
        <label style={{ display: "block", marginBottom: 12 }}>
            <span
                style={{
                    display: "block",
                    fontSize: 10,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    color: "#a07050",
                    marginBottom: 5,
                    fontFamily:
                        '"TASA Orbiter", "Inter", system-ui, sans-serif',
                }}
            >
                {label}
            </span>
            {multiline ? (
                <textarea
                    value={value}
                    maxLength={maxLength}
                    placeholder={placeholder}
                    onChange={(e) => onChange(e.target.value)}
                    rows={2}
                    style={{ ...baseStyle, resize: "none" }}
                />
            ) : (
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    style={baseStyle}
                />
            )}
        </label>
    )
}

// ----------------------------------------------------------------------------
// BreakBrickModal — focal brick + form
// ----------------------------------------------------------------------------

function BreakBrickModal({
    selected,
    brickWidth,
    brickHeight,
    brickImage,
    viewportW,
    viewportH,
    onCancel,
    onBreak,
}: {
    selected: SelectedBrick
    brickWidth: number
    brickHeight: number
    brickImage: string
    viewportW: number
    viewportH: number
    onCancel: () => void
    onBreak: (odds: string, name: string, linkedin: string, company: string) => void
}) {
    const [name, setName] = useState("")
    const [linkedin, setLinkedin] = useState("")
    const [company, setCompany] = useState("")
    const [odds, setOdds] = useState("")

    const isMobile = viewportW < 768
    const focalScale = isMobile ? 2 : 2.6
    const focalW = brickWidth * focalScale
    const focalH = brickHeight * focalScale
    const focalCenterX = isMobile ? viewportW / 2 : viewportW / 2 - 200
    const focalCenterY = isMobile ? viewportH * 0.32 : viewportH / 2
    const focalX = focalCenterX - focalW / 2
    const focalY = focalCenterY - focalH / 2
    const v = brickVariation(selected.col, selected.row)

    // Auto-fit text: shrink linearly with character count
    const oddsFontSize = Math.max(
        14,
        Math.min(focalH * 0.32, focalH * 0.32 - odds.length * 0.5)
    )

    const canSubmit = odds.trim().length > 0

    return (
        <>
            {/* Focal brick */}
            <motion.div
                data-modal="focal"
                initial={{
                    left: selected.screenX,
                    top: selected.screenY,
                    width: brickWidth,
                    height: brickHeight,
                }}
                animate={{
                    left: focalX,
                    top: focalY,
                    width: focalW,
                    height: focalH,
                }}
                transition={{ type: "spring", damping: 22, stiffness: 180, mass: 0.85 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                style={{
                    position: "absolute",
                    backgroundImage: `url(${brickImage})`,
                    backgroundSize: "100% 100%",
                    backgroundRepeat: "no-repeat",
                    filter: `hue-rotate(${v.hueShift}deg) brightness(${v.brightness})`,
                    boxShadow:
                        "inset 0 -4px 6px rgba(0,0,0,0.5), inset 0 4px 4px rgba(255,255,255,0.05), 0 30px 80px rgba(0,0,0,0.75)",
                    zIndex: 60,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24,
                    boxSizing: "border-box",
                }}
            >
                <div
                    style={{
                        fontFamily:
                            '"TASA Orbiter", "Inter", system-ui, sans-serif',
                        fontWeight: 400,
                        fontSize: oddsFontSize,
                        lineHeight: 1.1,
                        textAlign: "center",
                        color: "rgba(18,12,8,0.65)",
                        mixBlendMode: "multiply",
                        textShadow:
                            "0 1px 0 rgba(255,255,255,0.18), 0 -0.5px 0 rgba(0,0,0,0.22)",
                        wordBreak: "break-word",
                        maxWidth: "100%",
                        letterSpacing: 0.2,
                    }}
                >
                    {odds || (
                        <span style={{ opacity: 0.4 }}>your odds…</span>
                    )}
                </div>
            </motion.div>

            {/* Form panel */}
            <motion.div
                data-modal="panel"
                initial={{
                    x: isMobile ? 0 : 80,
                    y: isMobile ? 80 : 0,
                    opacity: 0,
                }}
                animate={{ x: 0, y: 0, opacity: 1 }}
                exit={{
                    x: isMobile ? 0 : 80,
                    y: isMobile ? 80 : 0,
                    opacity: 0,
                }}
                transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
                style={{
                    position: "absolute",
                    right: isMobile ? 16 : 40,
                    left: isMobile ? 16 : "auto",
                    top: isMobile ? "auto" : "50%",
                    bottom: isMobile ? 16 : "auto",
                    transform: isMobile ? undefined : "translateY(-50%)",
                    width: isMobile ? "auto" : 360,
                    background: "#150e0a",
                    border: "1px solid #3a2818",
                    borderRadius: 6,
                    padding: 24,
                    zIndex: 70,
                    boxShadow: "0 30px 80px rgba(0,0,0,0.75)",
                    fontFamily:
                        '"TASA Orbiter", "Inter", system-ui, sans-serif',
                    color: "#e8d4ba",
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onCancel}
                    aria-label="Cancel"
                    style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "transparent",
                        border: "none",
                        color: "#a07050",
                        fontSize: 22,
                        cursor: "pointer",
                        width: 32,
                        height: 32,
                        lineHeight: 1,
                    }}
                >
                    ×
                </button>
                <h3
                    style={{
                        margin: "0 0 18px 0",
                        fontFamily:
                            '"TASA Orbiter", "Inter", system-ui, sans-serif',
                        fontSize: 22,
                        letterSpacing: 0.4,
                        color: "#d4a574",
                        fontWeight: 400,
                    }}
                >
                    Break your brick.
                </h3>
                <Field label="Name" value={name} onChange={setName} />
                <Field
                    label="LinkedIn URL"
                    value={linkedin}
                    onChange={setLinkedin}
                    placeholder="linkedin.com/in/…"
                />
                <Field
                    label="Company name"
                    value={company}
                    onChange={setCompany}
                />
                <Field
                    label="Odds beaten"
                    value={odds}
                    onChange={setOdds}
                    multiline
                    maxLength={80}
                    placeholder="I didn't have funding"
                />
                <div
                    style={{
                        fontSize: 10,
                        color: "#6a4a2e",
                        textAlign: "right",
                        marginTop: -8,
                        marginBottom: 8,
                        letterSpacing: 0.5,
                    }}
                >
                    {odds.length} / 80
                </div>
                <button
                    onClick={() => {
                        if (!canSubmit) return
                        // V2: gate on auth (LinkedIn OAuth) before calling onBreak.
                        onBreak(odds.trim(), name.trim(), linkedin.trim(), company.trim())
                    }}
                    disabled={!canSubmit}
                    style={{
                        marginTop: 8,
                        width: "100%",
                        padding: "14px 0",
                        background: canSubmit ? "#c8703a" : "#3a2818",
                        color: canSubmit ? "#fff" : "#7a5436",
                        border: "none",
                        borderRadius: 4,
                        fontFamily:
                            '"TASA Orbiter", "Inter", system-ui, sans-serif',
                        fontSize: 15,
                        letterSpacing: 0.4,
                        cursor: canSubmit ? "pointer" : "not-allowed",
                        transition: "background 0.2s",
                        fontWeight: 500,
                    }}
                >
                    Break the brick.
                </button>
            </motion.div>
        </>
    )
}

// ----------------------------------------------------------------------------
// ShatterEffect — 14 shards + 25 dust particles, all CSS clip-path
// ----------------------------------------------------------------------------

function ShatterEffect({
    x,
    y,
    width,
    height,
    brickImage,
}: {
    x: number
    y: number
    width: number
    height: number
    brickImage: string
}) {
    const shards = useMemo(() => {
        return SHARD_CLIPS.map((clip, i) => {
            const angle = (i / SHARD_CLIPS.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.6
            const speed = 220 + Math.random() * 320
            const vx = Math.cos(angle) * speed
            const vy = Math.sin(angle) * speed - 120
            const rot = (Math.random() - 0.5) * 720
            const delay = (i % 5) * 0.018
            return { clip, vx, vy, rot, delay }
        })
    }, [])

    const dust = useMemo(() => {
        return Array.from({ length: 25 }).map(() => {
            const angle = Math.random() * Math.PI * 2
            const speed = 80 + Math.random() * 220
            const size = 4 + Math.random() * 11
            const colors = ["#5a3a22", "#7a5a3a", "#3a2818", "#8a6a4a"]
            return {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 40,
                size,
                delay: Math.random() * 0.12,
                color: colors[Math.floor(Math.random() * colors.length)],
            }
        })
    }, [])

    return (
        <div
            style={{
                position: "absolute",
                left: x - width / 2,
                top: y - height / 2,
                width,
                height,
                pointerEvents: "none",
                zIndex: 75,
            }}
        >
            {shards.map((s, i) => (
                <motion.div
                    key={`s${i}`}
                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                    animate={{
                        x: s.vx,
                        y: s.vy + 700, // gravity-ish drop after the burst
                        rotate: s.rot,
                        opacity: 0,
                    }}
                    transition={{
                        duration: 0.85,
                        delay: s.delay,
                        ease: [0.18, 0.55, 0.4, 1],
                    }}
                    style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: `url(${brickImage})`,
                        backgroundSize: "100% 100%",
                        backgroundRepeat: "no-repeat",
                        clipPath: s.clip,
                        WebkitClipPath: s.clip,
                        filter: "drop-shadow(0 4px 5px rgba(0,0,0,0.55))",
                    }}
                />
            ))}
            {dust.map((d, i) => (
                <motion.div
                    key={`d${i}`}
                    initial={{ x: 0, y: 0, opacity: 0.85, scale: 1 }}
                    animate={{
                        x: d.vx,
                        y: d.vy + 220,
                        opacity: 0,
                        scale: 1.7,
                    }}
                    transition={{
                        duration: 1.0,
                        delay: d.delay,
                        ease: "easeOut",
                    }}
                    style={{
                        position: "absolute",
                        left: width / 2 - d.size / 2,
                        top: height / 2 - d.size / 2,
                        width: d.size,
                        height: d.size,
                        background: d.color,
                        borderRadius: "50%",
                        filter: "blur(1px)",
                    }}
                />
            ))}
        </div>
    )
}

// ----------------------------------------------------------------------------
// FoundersWall — main component
// ----------------------------------------------------------------------------

export default function FoundersWall({
    brickImage = "Brick_alpha.png",
    campaignImage = "CampaignSite.png",
    wallColumns = 400,
    wallRows = 200,
    brickWidth = DEFAULT_BRICK_W,
    brickHeight = DEFAULT_BRICK_H,
    mortarColor = "#1a120c",
    wallBackgroundColor = "#0a0604",
    enableShatter = true,
    onCampaignClick,
    style,
}: Partial<FoundersWallProps>) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const innerRef = useRef<HTMLDivElement | null>(null)
    const dragRef = useRef<{
        active: boolean
        startX: number
        startY: number
        panX: number
        panY: number
        moved: boolean
        pointerId: number
    } | null>(null)
    const panRef = useRef({ x: 0, y: 0 })
    const initializedRef = useRef(false)

    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [viewport, setViewport] = useState({ w: 0, h: 0 })
    const [hovered, setHovered] = useState<{ col: number; row: number } | null>(
        null
    )
    const [userCavities, setUserCavities] = useState<Cavity[]>([])
    const [selectedBrick, setSelectedBrick] = useState<SelectedBrick | null>(null)
    const [shatter, setShatter] = useState<{ x: number; y: number } | null>(null)
    const [shaking, setShaking] = useState(false)

    const isTouch = useMemo(() => isTouchEnv(), [])
    const prefersReducedMotion = useReducedMotion()
    const wallPxWidth = wallColumns * brickWidth
    const wallPxHeight = wallRows * brickHeight
    // Framer's Image control passes "" when unset; fall back explicitly.
    const brickImageSrc =
        brickImage && brickImage.length > 0 ? brickImage : "Brick_alpha.png"
    const campaignImageSrc =
        campaignImage && campaignImage.length > 0
            ? campaignImage
            : "CampaignSite.png"

    // Inject Inter (fallback) once and a @font-face for TASA Orbiter.
    // The @font-face tries to find the font in this order:
    //   1. A local file dropped next to this component
    //      (TASAOrbiter-Regular.woff2, TASAOrbiterDisplay-Regular.woff2,
    //       or the same names under ./fonts/).
    //   2. The font installed system-wide via local("TASA Orbiter").
    //   3. Falls through to Inter via the font-family fallback chain.
    useEffect(() => {
        const id = "founders-wall-fonts"
        if (typeof document === "undefined") return
        if (document.getElementById(id)) return
        const link = document.createElement("link")
        link.id = id
        link.rel = "stylesheet"
        link.href =
            "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap"
        document.head.appendChild(link)

        const styleId = "founders-wall-orbiter"
        if (document.getElementById(styleId)) return
        const style = document.createElement("style")
        style.id = styleId
        style.textContent = `
            @font-face {
                font-family: "TASA Orbiter";
                src: local("TASA Orbiter"),
                     local("TASAOrbiter-Regular"),
                     local("TASA Orbiter Display"),
                     url("./TASAOrbiter-Regular.woff2") format("woff2"),
                     url("./TASAOrbiterDisplay-Regular.woff2") format("woff2"),
                     url("./fonts/TASAOrbiter-Regular.woff2") format("woff2"),
                     url("./fonts/TASAOrbiterDisplay-Regular.woff2") format("woff2");
                font-weight: 400;
                font-style: normal;
                font-display: swap;
            }
        `
        document.head.appendChild(style)
    }, [])

    // Measure viewport
    useLayoutEffect(() => {
        const el = containerRef.current
        if (!el) return
        const update = () => {
            const r = el.getBoundingClientRect()
            setViewport({ w: r.width, h: r.height })
        }
        update()
        const ro = new ResizeObserver(update)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    // Initial pan: center the campaign cavity in the viewport
    useEffect(() => {
        if (initializedRef.current) return
        if (viewport.w === 0 || viewport.h === 0) return
        const cx = (CAMPAIGN_CAVITY.col + CAMPAIGN_CAVITY.width / 2) * brickWidth
        const cy = (CAMPAIGN_CAVITY.row + CAMPAIGN_CAVITY.height / 2) * brickHeight
        const rawX = viewport.w / 2 - cx
        const rawY = viewport.h / 2 - cy
        const minX = Math.min(0, viewport.w - wallPxWidth)
        const minY = Math.min(0, viewport.h - wallPxHeight)
        const x = clampN(rawX, minX, 0)
        const y = clampN(rawY, minY, 0)
        panRef.current = { x, y }
        setPan({ x, y })
        initializedRef.current = true
    }, [viewport.w, viewport.h, brickWidth, brickHeight, wallPxWidth, wallPxHeight])

    // Set of bricks that should NOT render normally (occupied by cavities)
    const occupied = useMemo(() => {
        const s = new Set<string>()
        const add = (c: number, r: number) => s.add(`${c}_${r}`)
        for (const cv of PRESET_CAVITIES) {
            for (let dc = 0; dc < CAVITY_W_BRICKS; dc++)
                for (let dr = 0; dr < CAVITY_H_BRICKS; dr++)
                    add(cv.col + dc, cv.row + dr)
        }
        for (const cv of userCavities) {
            for (let dc = 0; dc < CAVITY_W_BRICKS; dc++)
                for (let dr = 0; dr < CAVITY_H_BRICKS; dr++)
                    add(cv.col + dc, cv.row + dr)
        }
        for (let dc = 0; dc < CAMPAIGN_CAVITY.width; dc++)
            for (let dr = 0; dr < CAMPAIGN_CAVITY.height; dr++)
                add(CAMPAIGN_CAVITY.col + dc, CAMPAIGN_CAVITY.row + dr)
        return s
    }, [userCavities])

    // Visible range with overscan
    const overscan = 5
    const visStartCol = Math.max(0, Math.floor(-pan.x / brickWidth) - overscan)
    const visEndCol = Math.min(
        wallColumns - 1,
        Math.ceil((-pan.x + viewport.w) / brickWidth) + overscan
    )
    const visStartRow = Math.max(0, Math.floor(-pan.y / brickHeight) - overscan)
    const visEndRow = Math.min(
        wallRows - 1,
        Math.ceil((-pan.y + viewport.h) / brickHeight) + overscan
    )

    const visibleBricks: { col: number; row: number }[] = []
    for (let r = visStartRow; r <= visEndRow; r++) {
        for (let c = visStartCol; c <= visEndCol; c++) {
            if (occupied.has(`${c}_${r}`)) continue
            visibleBricks.push({ col: c, row: r })
        }
    }

    const allCavities = useMemo(
        () => [...PRESET_CAVITIES, ...userCavities],
        [userCavities]
    )

    const visibleCavities = allCavities.filter(
        (cv) =>
            cv.col + CAVITY_W_BRICKS - 1 >= visStartCol &&
            cv.col <= visEndCol &&
            cv.row + CAVITY_H_BRICKS - 1 >= visStartRow &&
            cv.row <= visEndRow
    )

    const campaignVisible =
        CAMPAIGN_CAVITY.col + CAMPAIGN_CAVITY.width - 1 >= visStartCol &&
        CAMPAIGN_CAVITY.col <= visEndCol &&
        CAMPAIGN_CAVITY.row + CAMPAIGN_CAVITY.height - 1 >= visStartRow &&
        CAMPAIGN_CAVITY.row <= visEndRow

    // Determine which logical (col,row) is at a screen position
    const brickAtScreen = useCallback(
        (clientX: number, clientY: number) => {
            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect) return null
            const px = clientX - rect.left - panRef.current.x
            const py = clientY - rect.top - panRef.current.y
            const r = Math.floor(py / brickHeight)
            const offsetX = brickScreenOffset(r, brickWidth)
            const c = Math.floor((px - offsetX) / brickWidth)
            if (c < 0 || c >= wallColumns || r < 0 || r >= wallRows) return null
            return { col: c, row: r }
        },
        [brickWidth, brickHeight, wallColumns, wallRows]
    )

    // Apply pan imperatively for smoothness; commit to state only when the
    // visible brick range actually changes, to avoid re-rendering every pixel.
    const applyPan = useCallback(
        (newX: number, newY: number) => {
            const minX = Math.min(0, viewport.w - wallPxWidth)
            const minY = Math.min(0, viewport.h - wallPxHeight)
            const x = clampN(newX, minX, 0)
            const y = clampN(newY, minY, 0)
            panRef.current = { x, y }
            if (innerRef.current) {
                innerRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
            }
            const oldStartCol = Math.floor(-pan.x / brickWidth)
            const oldStartRow = Math.floor(-pan.y / brickHeight)
            const newStartCol = Math.floor(-x / brickWidth)
            const newStartRow = Math.floor(-y / brickHeight)
            if (oldStartCol !== newStartCol || oldStartRow !== newStartRow) {
                setPan({ x, y })
            }
        },
        [viewport.w, viewport.h, wallPxWidth, wallPxHeight, brickWidth, brickHeight, pan.x, pan.y]
    )

    // Pointer handlers (drag pan + click-to-break)
    const onPointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (selectedBrick) return
            const target = e.target as HTMLElement
            if (target.closest("[data-modal]")) return
            dragRef.current = {
                active: true,
                startX: e.clientX,
                startY: e.clientY,
                panX: panRef.current.x,
                panY: panRef.current.y,
                moved: false,
                pointerId: e.pointerId,
            }
            try {
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            } catch {}
        },
        [selectedBrick]
    )

    const onPointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (selectedBrick) return
            const d = dragRef.current
            if (d && d.active) {
                const dx = e.clientX - d.startX
                const dy = e.clientY - d.startY
                if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
                applyPan(d.panX + dx, d.panY + dy)
                if (hovered) setHovered(null)
                return
            }
            if (isTouch) return
            const hit = brickAtScreen(e.clientX, e.clientY)
            if (!hit) {
                if (hovered) setHovered(null)
                return
            }
            // Don't show hover on cavities
            if (occupied.has(`${hit.col}_${hit.row}`)) {
                if (hovered) setHovered(null)
                return
            }
            // Skip the state update if it's the same brick we're already on
            if (hovered && hovered.col === hit.col && hovered.row === hit.row)
                return
            setHovered({ col: hit.col, row: hit.row })
        },
        [selectedBrick, applyPan, hovered, isTouch, brickAtScreen, occupied]
    )

    const finishPointer = useCallback(
        (e: React.PointerEvent) => {
            const d = dragRef.current
            if (!d) return
            dragRef.current = null
            try {
                ;(e.currentTarget as HTMLElement).releasePointerCapture(d.pointerId)
            } catch {}
            if (d.moved) {
                setPan({ ...panRef.current })
                return
            }
            // Treated as a click
            const hit = brickAtScreen(e.clientX, e.clientY)
            if (!hit) return
            // Campaign cavity?
            if (
                hit.col >= CAMPAIGN_CAVITY.col &&
                hit.col < CAMPAIGN_CAVITY.col + CAMPAIGN_CAVITY.width &&
                hit.row >= CAMPAIGN_CAVITY.row &&
                hit.row < CAMPAIGN_CAVITY.row + CAMPAIGN_CAVITY.height
            ) {
                onCampaignClick?.()
                return
            }
            // Inside a preset / user cavity?
            const inCavity = allCavities.some(
                (cv) =>
                    hit.col >= cv.col &&
                    hit.col < cv.col + CAVITY_W_BRICKS &&
                    hit.row >= cv.row &&
                    hit.row < cv.row + CAVITY_H_BRICKS
            )
            if (inCavity) return
            // Open break-brick flow on this brick
            const screenX =
                panRef.current.x +
                hit.col * brickWidth +
                brickScreenOffset(hit.row, brickWidth)
            const screenY = panRef.current.y + hit.row * brickHeight
            setSelectedBrick({ col: hit.col, row: hit.row, screenX, screenY })
            setHovered(null)
        },
        [brickAtScreen, allCavities, onCampaignClick, brickWidth]
    )

    // Trackpad / wheel pan (deltaX, deltaY). No zoom in v1.
    // TODO: zoom support would be added here, gated on e.ctrlKey || e.metaKey.
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const onWheel = (e: WheelEvent) => {
            if (selectedBrick) return
            e.preventDefault()
            applyPan(panRef.current.x - e.deltaX, panRef.current.y - e.deltaY)
        }
        el.addEventListener("wheel", onWheel, { passive: false })
        return () => el.removeEventListener("wheel", onWheel)
    }, [selectedBrick, applyPan])

    // "Break the brick" submission
    const handleBreakBrick = useCallback(
        (odds: string, name: string, linkedin: string, company: string) => {
            if (!selectedBrick) return
            const newCavity: Cavity = {
                col: selectedBrick.col,
                row: selectedBrick.row,
                text: odds,
                founderName: name || undefined,
                company: company || undefined,
                linkedin: linkedin || undefined,
                isUserBrick: true,
            }
            if (enableShatter && !prefersReducedMotion) {
                const focalCenterX =
                    viewport.w < 768 ? viewport.w / 2 : viewport.w / 2 - 200
                const focalCenterY =
                    viewport.w < 768 ? viewport.h * 0.32 : viewport.h / 2
                setShatter({ x: focalCenterX, y: focalCenterY })
                setShaking(true)
                window.setTimeout(() => setShaking(false), 280)
                window.setTimeout(() => {
                    // TODO: persist to DB
                    setUserCavities((prev) => [...prev, newCavity])
                    setShatter(null)
                    setSelectedBrick(null)
                }, 1000)
            } else {
                // prefers-reduced-motion: fade-out / fade-in over 400ms
                window.setTimeout(() => {
                    // TODO: persist to DB
                    setUserCavities((prev) => [...prev, newCavity])
                    setSelectedBrick(null)
                }, 400)
            }
        },
        [selectedBrick, enableShatter, prefersReducedMotion, viewport.w, viewport.h]
    )

    const cursor = selectedBrick
        ? "default"
        : dragRef.current?.active
        ? "grabbing"
        : "grab"

    return (
        <div
            ref={containerRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
            onPointerLeave={() => {
                if (!dragRef.current?.active) setHovered(null)
            }}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                background: wallBackgroundColor,
                cursor,
                touchAction: "none",
                userSelect: "none",
                ...style,
            }}
        >
            {/* Atmospheric mortar background behind the wall */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background: `radial-gradient(ellipse at 50% 50%, ${mortarColor} 0%, ${wallBackgroundColor} 90%)`,
                    pointerEvents: "none",
                }}
            />

            {/* Screen-shake wrapper around the pan layer */}
            <motion.div
                animate={
                    shaking
                        ? {
                              x: [0, -6, 6, -4, 4, -2, 0],
                              y: [0, 3, -3, 2, -2, 1, 0],
                          }
                        : { x: 0, y: 0 }
                }
                transition={
                    shaking
                        ? { duration: 0.26, ease: "easeOut" }
                        : { duration: 0 }
                }
                style={{ position: "absolute", inset: 0 }}
            >
                {/* Pannable inner layer */}
                <div
                    ref={innerRef}
                    style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: wallPxWidth,
                        height: wallPxHeight,
                        transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`,
                        willChange: "transform",
                    }}
                >
                    {visibleBricks.map(({ col, row }) => {
                        if (
                            selectedBrick &&
                            selectedBrick.col === col &&
                            selectedBrick.row === row
                        )
                            return null
                        const isHovered =
                            !!hovered &&
                            !isTouch &&
                            !selectedBrick &&
                            hovered.col === col &&
                            hovered.row === row
                        return (
                            <Brick
                                key={`${col}_${row}`}
                                col={col}
                                row={row}
                                brickWidth={brickWidth}
                                brickHeight={brickHeight}
                                brickImage={brickImageSrc}
                                mortarColor={mortarColor}
                                hovered={isHovered}
                            />
                        )
                    })}

                    {visibleCavities.map((cv) => (
                        <CavityView
                            key={`cav_${cv.col}_${cv.row}_${
                                cv.isUserBrick ? "u" : "p"
                            }`}
                            cavity={cv}
                            brickWidth={brickWidth}
                            brickHeight={brickHeight}
                        />
                    ))}

                    {campaignVisible && (
                        <CampaignCavityView
                            brickWidth={brickWidth}
                            brickHeight={brickHeight}
                            campaignImage={campaignImageSrc}
                        />
                    )}
                </div>
            </motion.div>

            {/* Dim overlay (covers wall while modal/shatter is active) */}
            <AnimatePresence>
                {(selectedBrick || shatter) && (
                    <motion.div
                        key="dim"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.7 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        style={{
                            position: "absolute",
                            inset: 0,
                            background: "#000",
                            zIndex: 50,
                            pointerEvents: "auto",
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Break-brick modal */}
            <AnimatePresence>
                {selectedBrick && !shatter && (
                    <BreakBrickModal
                        key="modal"
                        selected={selectedBrick}
                        brickWidth={brickWidth}
                        brickHeight={brickHeight}
                        brickImage={brickImageSrc}
                        viewportW={viewport.w}
                        viewportH={viewport.h}
                        onCancel={() => setSelectedBrick(null)}
                        onBreak={handleBreakBrick}
                    />
                )}
            </AnimatePresence>

            {/* Shatter */}
            <AnimatePresence>
                {shatter && (
                    <ShatterEffect
                        key="shatter"
                        x={shatter.x}
                        y={shatter.y}
                        width={brickWidth * (viewport.w < 768 ? 2 : 2.6)}
                        height={brickHeight * (viewport.w < 768 ? 2 : 2.6)}
                        brickImage={brickImageSrc}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}

// ----------------------------------------------------------------------------
// Framer property controls
// ----------------------------------------------------------------------------

addPropertyControls(FoundersWall, {
    brickImage: {
        type: ControlType.Image,
        title: "Brick image",
    },
    campaignImage: {
        type: ControlType.Image,
        title: "Campaign image",
    },
    wallColumns: {
        type: ControlType.Number,
        title: "Columns",
        defaultValue: 400,
        min: 10,
        max: 2000,
        step: 1,
    },
    wallRows: {
        type: ControlType.Number,
        title: "Rows",
        defaultValue: 200,
        min: 10,
        max: 2000,
        step: 1,
    },
    brickWidth: {
        type: ControlType.Number,
        title: "Brick width",
        defaultValue: DEFAULT_BRICK_W,
        min: 60,
        max: 600,
        step: 1,
        unit: "px",
    },
    brickHeight: {
        type: ControlType.Number,
        title: "Brick height",
        defaultValue: DEFAULT_BRICK_H,
        min: 20,
        max: 300,
        step: 1,
        unit: "px",
    },
    mortarColor: {
        type: ControlType.Color,
        title: "Mortar",
        defaultValue: "#1a120c",
    },
    wallBackgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#0a0604",
    },
    enableShatter: {
        type: ControlType.Boolean,
        title: "Shatter",
        defaultValue: true,
        enabledTitle: "On",
        disabledTitle: "Off",
    },
})
