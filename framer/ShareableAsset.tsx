import { addPropertyControls, ControlType } from "framer"
import { useEffect, useRef, useState } from "react"

// ─────────────────────────────────────────────────────────────────────────────
// Break-to-Build · Framer Code Component
//
// Drops onto the Result page in Framer. Receives user input via props (which
// should be bound to Framer Variables set during the picker + form steps),
// dynamically imports the generator module from Cloudflare Pages, runs the
// canvas render in the browser, and shows the resulting <video>.
//
// SETUP:
//   1. Replace ASSET_BASE with your Cloudflare Pages URL (e.g.
//      "https://break-to-build.pages.dev"). The trailing slash does not matter.
//   2. In Framer, place this component on the Result page and bind each prop
//      to the matching Framer Variable (fName → name, fCompany → company, etc.).
//
// No backend required. All rendering happens in the user's browser.
// ─────────────────────────────────────────────────────────────────────────────

const ASSET_BASE = "https://break-to-build.o-aman.workers.dev"

// Canvas rendering does not see fonts unless they're registered on
// document.fonts. Framer's runtime doesn't load Google Fonts by default,
// so we inject the same stylesheet the standalone demo uses. Injecting
// once per page, idempotent.
const FONTS_HREF =
    "https://fonts.googleapis.com/css2" +
    "?family=Anton" +
    "&family=Inter:wght@400;700" +
    "&family=Special+Gothic+Condensed+One" +
    "&family=Unbounded:wght@400;900" +
    "&display=swap"

function ensureFontsLoaded() {
    if (typeof document === "undefined") return
    if (document.getElementById("btb-fonts-link")) return
    const link = document.createElement("link")
    link.id = "btb-fonts-link"
    link.rel = "stylesheet"
    link.href = FONTS_HREF
    document.head.appendChild(link)
}

type Avatar = "male" | "female"
type Weapon = "punch" | "crush" | "thrash" | "smash" | "kick" | "slice"

type Status = "idle" | "generating" | "ready" | "error"

interface GenerateResult {
    blob: Blob
    mimeType: string
    frameCount: number
    textCutFrame: number
}

interface GeneratorModule {
    generateAsset(input: {
        name: string
        company: string
        oddsText: string
        avatar: Avatar
        weapon: Weapon
        assetBaseUrl: string
        onProgress?: (p: number) => void
    }): Promise<GenerateResult>
}

export interface ShareableAssetProps {
    name: string
    company: string
    oddsText: string
    avatar: Avatar
    weapon: Weapon
    /** Override Cloudflare URL at design time. Falls back to ASSET_BASE. */
    assetBaseUrl?: string
}

export default function ShareableAsset(props: ShareableAssetProps) {
    const { name, company, oddsText, avatar, weapon, assetBaseUrl } = props

    const [status, setStatus] = useState<Status>("idle")
    const [videoUrl, setVideoUrl] = useState<string | null>(null)
    const [progress, setProgress] = useState(0)
    const [errorMsg, setErrorMsg] = useState<string>("")

    // Keep the same blob URL alive across status transitions so we can revoke
    // it on unmount or when a fresh render replaces it.
    const blobUrlRef = useRef<string | null>(null)

    useEffect(() => {
        let cancelled = false

        async function run() {
            setStatus("generating")
            setProgress(0)
            setErrorMsg("")

            ensureFontsLoaded()

            const base = (assetBaseUrl || ASSET_BASE).replace(/\/+$/, "")

            try {
                const mod = (await import(
                    /* @vite-ignore */ `${base}/generator.mjs`
                )) as GeneratorModule

                const result = await mod.generateAsset({
                    name,
                    company,
                    oddsText,
                    avatar,
                    weapon,
                    assetBaseUrl: base,
                    onProgress: (p) => {
                        if (!cancelled) setProgress(p)
                    },
                })

                if (cancelled) return

                if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
                blobUrlRef.current = URL.createObjectURL(result.blob)
                setVideoUrl(blobUrlRef.current)
                setStatus("ready")
            } catch (err) {
                if (cancelled) return
                console.error("[ShareableAsset]", err)
                setErrorMsg(err instanceof Error ? err.message : String(err))
                setStatus("error")
            }
        }

        run()

        return () => {
            cancelled = true
        }
    }, [name, company, oddsText, avatar, weapon, assetBaseUrl])

    // One-time cleanup on unmount.
    useEffect(() => {
        return () => {
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
        }
    }, [])

    if (status === "generating") {
        return (
            <Frame>
                <Centered>
                    <div style={styles.statusText}>
                        Generating your video… {Math.round(progress * 100)}%
                    </div>
                    <ProgressBar value={progress} />
                </Centered>
            </Frame>
        )
    }

    if (status === "error") {
        return (
            <Frame>
                <Centered>
                    <div style={{ ...styles.statusText, color: "#ff6b6b" }}>
                        Couldn't generate the video.
                    </div>
                    <div style={styles.errorDetail}>{errorMsg}</div>
                </Centered>
            </Frame>
        )
    }

    if (status === "ready" && videoUrl) {
        return (
            <Frame>
                <video
                    src={videoUrl}
                    controls
                    autoPlay
                    loop
                    playsInline
                    style={styles.video}
                />
            </Frame>
        )
    }

    return <Frame />
}

// ─── Small presentational helpers — kept in this file so the component
//     ships as a single drop-in artifact. ────────────────────────────────────

function Frame({ children }: { children?: React.ReactNode }) {
    return <div style={styles.frame}>{children}</div>
}

function Centered({ children }: { children: React.ReactNode }) {
    return <div style={styles.centered}>{children}</div>
}

function ProgressBar({ value }: { value: number }) {
    return (
        <div style={styles.progressTrack}>
            <div
                style={{
                    ...styles.progressFill,
                    width: `${Math.max(2, Math.min(100, value * 100))}%`,
                }}
            />
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    frame: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
    },
    centered: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: 24,
        textAlign: "center",
    },
    statusText: {
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 14,
        color: "#c4c4c4",
    },
    errorDetail: {
        fontFamily: "ui-monospace, SF Mono, monospace",
        fontSize: 12,
        color: "#8a8a8a",
        maxWidth: 320,
    },
    progressTrack: {
        width: 220,
        height: 4,
        background: "rgba(255, 255, 255, 0.12)",
        borderRadius: 999,
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        background: "#0039ff",
        borderRadius: 999,
        transition: "width 0.15s ease",
    },
    video: {
        width: "100%",
        height: "100%",
        objectFit: "contain",
        background: "#000",
    },
}

// ─── Framer canvas property controls — lets designers preview the
//     component on the canvas without wiring up Variables first. ─────────────

addPropertyControls(ShareableAsset, {
    name: {
        type: ControlType.String,
        title: "Name",
        defaultValue: "AMAN",
    },
    company: {
        type: ControlType.String,
        title: "Company",
        defaultValue: "Razorpay",
    },
    oddsText: {
        type: ControlType.String,
        title: "Odds beaten",
        defaultValue: "THE ODDS BEATEN",
    },
    avatar: {
        type: ControlType.Enum,
        title: "Avatar",
        options: ["male", "female"],
        defaultValue: "female",
    },
    weapon: {
        type: ControlType.Enum,
        title: "Weapon",
        options: ["punch", "crush", "thrash", "smash", "kick", "slice"],
        defaultValue: "smash",
    },
    assetBaseUrl: {
        type: ControlType.String,
        title: "Asset base URL",
        defaultValue: ASSET_BASE,
        description: "Cloudflare Pages URL hosting generator.mjs and /Avatars",
    },
})
