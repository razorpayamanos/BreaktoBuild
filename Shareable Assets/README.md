# Break to Build — Founder's Brick Generator (v1)

A single-file, no-build, vanilla-JS shareable-asset generator for the **Break to Build** campaign (Razorpay × Indian founders). Users pick a persona, fill four fields, and the page composites a personalized "founder's brick" poster.

This is the **iteration build**. Open it in a browser, tweak constants, repeat. When the visuals are locked, lift the pipeline functions into a Framer Code Component.

---

## Run it

Easiest:

```bash
open index.html
```

If you hit CORS errors when loading images (Chrome can be picky with `file://`), serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

That's the whole install step. No `npm`, no bundler, no build.

### URL flags

- `?debug=1` — overlays the slab clip polygon (red dashed) and text anchor (cyan cross) on the Step-A canvas, logs each pipeline stage + timing to console.

---

## Folder layout

```
Shareable Assets/
├── index.html                    ← the whole app
├── README.md                     ← you are here
├── Base Images/                  ← drop persona base images here
│   └── placeholder.png           ← (currently empty — see "Base images" below)
└── Personas/                     ← persona-picker thumbnails (already populated)
    ├── male1.png  female1.png
    └── male2.png  female2.png
```

> Note: the folder is **`Base Images/`** (with a space). The `PLACEHOLDER_BASE_IMAGE` constant at the top of `index.html` controls the path — rename the folder and that constant together if you want.

### Base images

The `Base Images/` folder is currently **empty**. The pipeline gracefully degrades: if the base image is missing it draws a placeholder panel (gradient + slab silhouette + figurine blob) so you can still see the full flow. Drop a real image into `Base Images/placeholder.png` and refresh — that's it.

Per-persona base images (later): replace the `baseImage` value for each entry in `PERSONA_CONFIG`. One line per persona, no other code changes:

```js
const PERSONA_CONFIG = {
  male1:   { label: 'The Strategist', thumb: 'Personas/male1.png',   baseImage: 'Base Images/male1.png' },
  female1: { label: 'The Visionary',  thumb: 'Personas/female1.png', baseImage: 'Base Images/female1.png' },
  ...
};
```

---

## What to tweak — everything lives in SECTION 1

All visual / behavioral tunables live at the top of the script inside `index.html`. You should never need to scroll past Section 1 to adjust a knob.

| Constant | Purpose |
|---|---|
| `FINAL_WIDTH` / `FINAL_HEIGHT` | Final poster dimensions (1080×1350). |
| `PERSONA_CONFIG` | Maps each persona to its thumbnail + base image + label. |
| `SLAB_CONFIG.textAnchor` | Center of the slab text block, as **fractions (0–1)** of the base image. |
| `SLAB_CONFIG.textMaxWidth` / `textMaxHeight` | Bounding box for auto-fit, as fractions of the base image. |
| `SLAB_CONFIG.skewX` / `skewY` / `rotation` | Slab perspective fake (degrees). |
| `SLAB_CONFIG.fontColor` / `compositeMode` | Carved-stone color + blend mode (`'overlay'` matches the Figma). |
| `SLAB_CONFIG.clipPolygon` | Polygon clipping the text to the slab's front face, as **`[xFrac, yFrac]` points (0–1)**. |
| `POSTER_OVERLAY` | Colors + copy for the placeholder 1080×1350 overlay. |
| `KLING_API_KEY` / `KLING_ENDPOINT` / `KLING_MODEL` / `KLING_PROMPT` | Kling i2v config (stubbed). |
| `LOADING_STAGES` | Copy for the loading screen. |

### Iterating the slab text alignment

All position values in `SLAB_CONFIG` are **fractions of the base image (0–1)**, not absolute pixels. That means the same config works for any base-image size (1024, 1080, 1500, …). To map a fraction to a pixel: multiply by `canvas.width` (or `.height`).

1. Open with `?debug=1`.
2. Trigger the flow with sample input.
3. On the result, you'll see overlaid:
   - **Red dashed quadrilateral** — the slab clip polygon. Text outside this is cut off.
   - **Yellow rectangle** — the text bounding box (auto-fit target), with the actual skew + rotation applied.
   - **Cyan crosshair + dot** — the text anchor (center of the text block).
   - **Black readout (top-left)** — canvas dimensions and the anchor in both fractions and pixels.
4. Open your base image in any image editor that shows pixel coords. Find:
   - The 4 corners of the slab's visible front face → convert each to a `[xPixel / imageWidth, yPixel / imageHeight]` fraction → put into `clipPolygon`.
   - The pixel where you want the text center → convert similarly → put into `textAnchor`.
5. Reload. Repeat until the polygon hugs the slab.

The text auto-shrinks to fit `textMaxWidth × textMaxHeight` (binary search on font size), so you don't need to retune for short vs. long strings.

### If the carved text is invisible

The Figma reference uses `#707070` (50% gray) with `mix-blend-mode: overlay`. That blend math produces **zero contrast** against a flat fill — the engraving only emerges on textured stone. If your base image's slab is smooth, push `fontColor` darker (e.g. `#3a3a3a`, the current default) or lighter to bring the engraving back. You can also swap `compositeMode` to `'multiply'` for a more aggressive darken-only effect.

---

## Wiring Kling (when you have the key)

1. Paste your key into `KLING_API_KEY` in Section 1.
2. Paste the shatter prompt into `KLING_PROMPT` (currently marked `// TODO: KLING_PROMPT`).
3. Verify `KLING_ENDPOINT` and `KLING_MODEL` against the official Kling docs — the request shape and polling pattern are documented inline above `generateVideoFromFrame()`. If we're going through fal.ai instead of Kuaishou directly, swap `KLING_ENDPOINT` (and adjust the request body / auth header to match fal's contract).
4. Reload. The pipeline now runs live: Step A → Kling i2v (~30–90s) → Step C compositing → result.

Until the key is present, the function detects that and returns the Step-A still as a fake "video" so the rest of the pipeline runs end-to-end.

---

## Swapping the placeholder overlay for the final Figma design

The final 1080×1350 overlay (THANK YOU / NAME / FOR BEATING THE ODDS AND BUILDING COMPANY + BREAK TO BUILD pill + ticker strip) is currently a placeholder rendered by `renderPosterOverlay(ctx, userData)` in **Section 7**.

When the Figma overlay is delivered:

1. Get the design via the Figma MCP (`get_design_context`).
2. Translate it to canvas draw calls (or pre-render the static parts as a PNG and just `drawImage` it on top).
3. Replace the body of `renderPosterOverlay`. The function signature stays the same — `composeFinalPoster` and `drawPosterFrame` don't need to change.

---

## Known v1 limitations

- **Video output is WebM**, not MP4 (Chrome/Firefox `MediaRecorder` limitation). Safari can produce MP4. For LinkedIn / Instagram reliability, the production build should transcode via **ffmpeg.wasm** — there's a `// TODO: swap to ffmpeg.wasm` marker in Section 7.
- **No LinkedIn verification** — format check only (`linkedin.com/in/...`). No live profile lookup.
- **No moderation, no database, no analytics.** This is the asset generator, nothing else.
- **Base Images/ is empty.** Drop in a real image to replace the generated fallback panel.
- **Fonts:** the Figma calls for GC VANK (display) and TASA Orbiter Display (UI). Both are commercial. v1 substitutes **Anton** (Google Fonts) for the condensed display face and **Inter** for body — they're the closest free equivalents. **Unbounded** (preview brick text) is on Google Fonts and matches the Figma directly.

---

## Migration notes — porting to Framer

The code is structured so the heavy lifting can be lifted into a Framer Code Component (React) with minimal rewrite:

| Lift directly as-is | Becomes React state / hooks | Rebuild in JSX |
|---|---|---|
| `composeFirstFrame` (Section 5) | Form field values + selected persona | Modal scaffolding & stages |
| `drawSlabText`, `fitFontSize`, `wrapTextByChars` (Section 5) | Stage machine (`persona`/`form`/`loading`/`result`) | Persona grid markup |
| `generateVideoFromFrame` (Section 6) | Validation state | Form markup |
| `composeFinalPoster`, `drawPosterFrame`, `renderPosterOverlay` (Section 7) | Result blob + object URL | Preview pane |
| All constants in Section 1 | — | Result actions |

Concretely:

1. Create a Framer Code Component shell with `useState` for `selectedPersona`, `formData`, `stage`, `result`.
2. Copy Sections 1, 5, 6, 7 verbatim into the component file (they're plain async functions).
3. Re-author the JSX for the modal, persona grid, form, loading, and result panes — most of the styling can be copied from `<style>` into a CSS-in-JS or `style={{}}` block.
4. Wire the form submit to call the same pipeline functions.
5. Replace the live preview pane with the same HTML structure but as JSX.

The three pipeline functions (`composeFirstFrame`, `generateVideoFromFrame`, `composeFinalPoster`) have JSDoc on their public contracts; treat those as the import surface for the Framer port.

---

## File checklist before going live

- [ ] `Base Images/{male1,male2,female1,female2}.png` populated and `PERSONA_CONFIG` updated.
- [ ] `KLING_API_KEY` filled in.
- [ ] `KLING_PROMPT` filled in.
- [ ] `KLING_ENDPOINT` confirmed (Kuaishou vs. fal.ai).
- [ ] `SLAB_CONFIG.clipPolygon` / `textAnchor` calibrated for the real base images.
- [ ] `renderPosterOverlay` swapped for the final Figma design.
- [ ] ffmpeg.wasm wired in for MP4 output.
- [ ] Framer port done.
