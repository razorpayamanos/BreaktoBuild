# Break to Build — `index.html` Knowledge Transfer

## What this file is

A single-file web app for Razorpay's **"Break to Build"** campaign. It lets a founder claim a personalized "Founder's Brick" — they pick a character + a weapon, fill out a short form (name, company, LinkedIn, the odds they beat), and the app generates a custom **vertical 1080×1350 shareable video** with their text engraved onto a stone slab plus a poster-style overlay (Razorpay logo, name, "for BEATING THE ODDS AND BUILDING [COMPANY]", ticker strip). Everything — HTML, CSS, JS — lives in this one file. No build tool, no framework, ES modules only.

## High-level user flow

1. **Landing page** — A Figma-exported background image (`landing-bg.png`) with two invisible buttons overlaid on top of the CTAs in the artwork. Clicking either opens the modal.
2. **Stage 1 — Persona picker** ("CLAIM YOUR MARK"): two-step picker inside the modal.
   - **Step 01:** pick avatar (male / female).
   - **Step 02:** pick weapon (PUNCH, CRUSH, THRASH, SMASH, KICK, SLICE). Locked until an avatar is chosen.
   - Right side shows a live preview image of the chosen avatar holding (or not yet holding) the chosen weapon, with a glitchy bottom-to-top reveal animation on every change.
   - "NEXT" button enables once both are picked.
3. **Stage 2 — Form**: name / company / LinkedIn / "Odds Beaten" (e.g. "1 IN 10,000"). The right preview pane shows a live thumbnail of the first frame of the chosen combo's video. Validation exists but is **currently commented out** (around line 1950) — submitting jumps straight to rendering.
4. **Stage 3 — Loading**: animated bar with playful copy ("Forging your brick…").
5. **Stage 4 — Result**: final video plays on the right; left side has "A Piece of the Odds. Broken." heading + Share / Download buttons.

## File structure (top to bottom)

### 1. HTML body (lines ~1176–1340)
- `.landing` block with absolutely-positioned transparent buttons over the Figma background image.
- `#modal-root` containing the four stages stacked as siblings (`stage-avatar`, `stage-form`, `stage-loading`, `stage-result`) — only the one with `.is-active` is displayed. CSS rule: `.stage { display: none } .stage.is-active { display: flex }`.
- Right column is a shared `.preview-pane` with three swappable views: `.preview-avatar` (persona stage), `.preview-inner` (form/loading stage, live brick preview), `.preview-result` (final video).
- Which view shows is driven by `data-stage` on `.modal` — set in JS by `setStage(name)`.

### 2. CSS (lines ~14–1173)
- **Design tokens** in `:root` — accent blue `#0039ff`, fonts (Anton, Inter, Unbounded, Special Gothic Condensed One from Google Fonts).
- **Persona stage uses a special pixel-scale system**: every dimension in the picker is `calc(Npx * var(--pscale))`. JS computes `--pscale = modal.offsetWidth / 840` on resize because CSS `calc()` can't divide length-by-length. 840 is the Figma reference modal width.
- Vertical "CLAIM YOUR MARK" / "BREAK TO BUILD" labels on the modal's left/right edges are rotated 90deg and only shown when `data-stage="persona"`.
- Glitch reveal animation `@keyframes glitch-reveal` — bottom-to-top clip-path wipe with hue-rotate + horizontal jitter, fires on every avatar/weapon change.
- Mobile breakpoint at 880px collapses everything to a single column and hides the preview pane.

### 3. JavaScript (lines ~1342–2885)

The JS is organized into numbered sections in comments — here's what each does:

**SECTION 1 — Config & constants**
- `FINAL_WIDTH = 1080`, `FINAL_HEIGHT = 1350` — output dimensions.
- `AVATAR_CONFIG` / `WEAPON_CONFIG` — asset paths and labels.
- `FINAL_VIDEO_PATHS` — the source MP4 for each (avatar, weapon) combo. **Important quirk**: the filename encodes the "text cut frame" — e.g. `bat_35.mp4` means the engraved text disappears at frame 35 (when the weapon hits the slab and "breaks" it). `getComboConfig()` parses that number out of the filename via regex `/_(\d+)\.mp4$/`.
- `SLAB_CONFIG` — all the parameters for rendering the engraved text onto the stone slab: normalized (0–1) coordinates so it works at any canvas size, font, color (#3a3a3a), noise grain, inner shadow, perspective skew (skewX: 8°, rotation: -2.53°) copied straight from Figma, and a clip polygon that's the absolute "safe area" inside the slab.
- `POSTER_OVERLAY` — layout of the final 1080×1350 frame in native pixels. Has an **auto-layout title stack**: eyebrow ("THANK YOU") → name → subtitle ("for BEATING THE ODDS AND BUILDING [COMPANY]") with configurable gaps so spacing stays consistent whether the name wraps to 1 or 2 lines.
- `?debug=1` URL param enables debug logs + a red dashed polygon showing the slab clip area on the rendered canvas (for tuning text placement).

**SECTION 2 — DOM & modal management**
- `openModal()` / `closeModal()` with focus management (saves & restores `lastFocused`).
- `setStage(name)` — toggles `.is-active` on stages, sets `modal.dataset.stage`, calls `syncPickerScale()`, moves focus to the new stage.
- Esc closes, Tab traps inside modal, click on backdrop closes.

**SECTION 3 — Persona picker (two-step)**
- Renders avatar/weapon grids dynamically from the config arrays.
- Full keyboard navigation: arrow keys move, Space/Enter selects, behaves like a radiogroup.
- Weapon grid stays `.is-locked` (40% opacity, pointer-events disabled) until an avatar is picked. Once unlocked, it stays unlocked — switching avatars preserves weapon choice.
- `runAvatarPreviewTransition()` uses a **token guard** so rapid clicks don't show a stale preview if an older image loads slower than a newer one.
- `preloadAvatarPreviews()` preloads every combo's static + both idles so transitions are instant.
- Clicking NEXT → `setStage('form')` + starts extracting frame 0 in the background so the form's preview thumbnail is ready by the time the user finishes typing.

**SECTION 4 — Form & validation**
- Validation lives in `validateForm()` (name, company, LinkedIn URL regex, odds non-empty) — **currently bypassed** (line 1950).
- Live preview text updates as user types: `previewName` shows the typed name, `previewSuffix` shows "the odds you broke to build [COMPANY]".
- `updatePreviewBase()` loads the source MP4 just long enough to grab frame 0, draws it to a canvas, and uses it as the live preview thumbnail. Cached per combo in `_firstFrameCache`.

**SECTION 5 — Slab text rendering** (the meat of it)
This is the most complex part — turning the user's "odds" text into an engraving on the stone slab inside each video frame:

1. `wrapAndFit()` binary-searches the largest font size at which the greedy word-wrap fits in the safe area (197×211 px box from Figma). Bounded at `minFontSize: 32` — if even the minimum overflows, accept the overflow (the clip polygon catches it).
2. `wrapGreedy()` packs words onto each line; if a single word ≥ `hyphenateMinLength` (8 chars) it splits it in half with a trailing hyphen.
3. `renderSlabLayerInto()` does **three passes** onto an offscreen canvas:
   - Main carved fill (solid #3a3a3a, sharp edges).
   - Noise speckles inside each glyph (clipped via `source-atop`) for stone-grain texture.
   - Inner shadow at the top-left interior — built using an inverse-text mask + canvas's `shadowColor/shadowBlur` API + `source-atop`. Creates the recessed "carved into stone" look.
4. The result is **cached** in `_slabLayerCache` keyed by all config inputs — so re-rendering the same text on multiple frames is just one `drawImage` call instead of re-running all three passes.
5. The cached layer is composited onto each video frame with `globalCompositeOperation = 'overlay'` so the engraving reacts to the actual stone texture below it (Figma's mix-blend-mode equivalent).

**SECTION 7 — Video-to-poster compositing**
- `loadComboVideo()` loads the MP4, decodes the first frame, returns the `<video>` element.
- `processVideoToPoster()` is the main render loop:
  - Sets up TWO canvases: a "source" canvas at the video's native size (where slab text gets engraved), and a "final" canvas at 1080×1350 (where everything composites).
  - Captures the final canvas via `MediaRecorder` at 8 Mbps. Tries `video/mp4` first (Safari), falls back to `video/webm` (Chrome/Firefox).
  - Uses **`requestVideoFrameCallback`** (rVFC) where available to fire deterministically on every decoded video frame — more reliable than rAF for counting frames. Falls back to `requestAnimationFrame` if rVFC isn't supported.
  - For each frame: draw video frame → if `frameIndex < cutFrame` engrave the slab text → composite onto final canvas with `drawPosterFrame()`.
  - `drawPosterFrame()` paints: black background → video frame → Razorpay logo (top-left) → BREAK TO BUILD logo (top-right) → "THANK YOU" eyebrow → big name → subtitle → repeating "BREAK TO BUILD ★" ticker strip at the bottom.

**SECTION 8 — Result modal & download/share**
- `runPipeline()` is the orchestrator: stage → 'loading' → preload fonts (CRITICAL — see below) → load video + logos in parallel → call `processVideoToPoster` → show result.
- `preloadFonts()` blocks on `document.fonts.load(...)` for every weight/family used in the canvas. Without this, canvas falls back to system sans-serif AND `measureText()` returns wrong widths, which throws off the auto-fit.
- Result stage uses `navigator.share` if available (mobile mostly), otherwise falls back to downloading the file. File is named `founders-brick-{slug-of-name}.{mp4|webm}`.

## The asset layout

```
Avatars/
  male/
    thumb.png                          ← Step 01 thumb
    Previews/Statics/
      idle.png                         ← shown before weapon picked
      punch.png, crush.png, ...        ← shown per combo in preview
    Final/
      bat_35.mp4, hammer_76.mp4, ...   ← source video, frame in filename = text cut frame
  female/
    (mirror of male)
Weapons/
  punch.png, crush.png, ...            ← Step 02 thumb icons
landing-bg.png, Logo.png, razorpay-logo.svg
```

The **weapon UI uses verb-slugs** (punch, crush, smash, slice…) but **final video filenames use noun-slugs** (punch, hammer, bat, sword…). The `finalSlug` field in `WEAPON_CONFIG` bridges the two — `crush → hammer`, `smash → bat`, `slice → sword`, `thrash → flail`.

## Gotchas worth flagging

1. **Validation is commented out** at line 1950 — anyone testing locally can submit empty forms.
2. **The pscale system is fragile** — if you forget to wrap a persona-stage dimension in `calc(Npx * var(--pscale))`, it won't scale with the modal.
3. **Fonts MUST be preloaded before any canvas drawing** or text breaks silently — `preloadFonts()` is the safety net.
4. **The "cut frame"** is when the engraved text disappears from the slab (because the weapon visually shatters it in the video). It's encoded in the filename. Renaming a video file without updating both the filename AND the config breaks the timing.
5. **Output is WebM on Chrome/Firefox, MP4 on Safari** — there's a TODO to swap in ffmpeg.wasm for guaranteed MP4.
6. **Coordinates in `SLAB_CONFIG` are normalized (0–1)** so it works at any base image size; coordinates in `POSTER_OVERLAY` are native 1080×1350 pixels.
7. **The whole thing is one HTML file** — no build, no bundler. Easy to ship, easy to deploy, but tooling like Prettier/ESLint won't catch much.

---

That's the full picture — flow, structure, config, and the non-obvious traps. If you want to extend it (new weapon, new avatar, change the engraving style), look at `SLAB_CONFIG` and `FINAL_VIDEO_PATHS` first; almost everything tweakable lives in those two constants.
