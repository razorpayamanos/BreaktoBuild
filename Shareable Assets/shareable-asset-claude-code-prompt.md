# Claude Code Prompt — "Founders Brick" Shareable Asset Generator

## What we're building

A personalized motion-poster generator for the **Break to Build** campaign (Razorpay × Indian founders). A viewer fills a short form, picks a persona figurine, and the system produces a 1080×1350 vertical motion poster ready to share on LinkedIn / Instagram Stories.

The output shows a glass-encased collectible — a stone slab being smashed by a small metallic figurine — with the viewer's "odds beaten" carved into the slab, their name and company in the header, and "BREAK TO BUILD" ticker branding around it.

## Important — read this before coding

**This is an iteration build, not the final product.** I will run it locally as `index.html` and tweak it until it looks right. Once it's locked, I'll port it into Framer. Therefore:

- Deliver a **single `index.html`** that I can open directly in a browser (no build step, no bundler, no `npm install`). Use ES modules + CDN imports (`https://esm.sh`, `https://unpkg.com`) only.
- Keep the JS modular enough that the form, the image-compositing logic, and the video-pipeline logic can be lifted into a Framer Code Component later with minimal rewrites. Use plain functions and small classes, not framework-specific patterns.
- Use **no React** in this stage. Plain JS + DOM. This keeps the Framer port flexible (Framer wraps it in React; trying to write React-in-vanilla-HTML-via-CDN now will only make the port harder).
- **No backend.** Everything runs client-side. The Kling API call will eventually be a `fetch` from the browser — for now, stub it.

## Project folder structure

You will receive these folders. Read them, don't recreate them:

```
/
├── index.html                      ← you create this
├── BaseImages/                     ← I will add 4 base images here, one per persona
│   └── (currently: 1 placeholder image — use it for all personas in v1)
├── Personas/                       ← I will add 4 persona thumbnail images here
│   └── (used for the persona-picker popup)
└── README.md                       ← you create this with run instructions
```

For now, **only one base image exists in `BaseImages/`**. Use it as the base for all 4 personas until I add the rest. Hardcode the persona → base-image mapping as a small config object at the top of the file so swapping is a one-line change later.

## Before you start coding — ASK ME THIS

I have not yet shared the Figma designs for two of the screens. **Pause and ask me for these two links before writing any UI code:**

1. **Persona-picker popup design** — the screen titled "Pick Your Persona to Build Your Mark" with the 4 figurine options.
2. **Form popup design** — the screen with the 4 input fields (Name, Company Name, LinkedIn Profile, Odds Beaten) and the "Claim Your Mark" CTA.

Do not guess these layouts. Wait for the Figma links, then implement them faithfully — colors, typography, spacing, button styles, all of it. Use the Figma Dev Mode CSS where useful.

I will also share later:
- The Figma design for the **final poster overlay** (the header text "THANK YOU / {NAME} / FOR BEATING THE ODDS AND BUILDING {COMPANY}", the "BREAK TO BUILD" pill in the top-right, the ticker strip at the bottom). Until I share this, use a clean placeholder layout based on the workflow reference image — black background, white display type, blue "BREAK TO BUILD" pill top-right, blue ticker strip at bottom — and structure the compositing code so I can swap in the real design later by editing one render function.
- The **Kling text-to-video prompt** for the shatter animation.
- The **Kling API key** (later — leave a clearly marked `KLING_API_KEY` constant at the top of the file).
- The **exact slab text alignment reference** (skew, position, max width). For now, use sensible defaults and expose them as tunable constants at the top so I can adjust without hunting through code.

## The user flow (what the code must produce)

1. **Trigger.** User clicks a "Claim Your Mark" button on the page. (For testing purposes, put this button front-and-center on a near-black page — we'll wire it to the real campaign site later.)

2. **Persona picker.** A modal opens titled *"Pick Your Persona to Build Your Mark"* showing the 4 persona thumbnails from `/Personas/` (2 male, 2 female). User clicks one.

3. **Form.** The modal transitions to the form with these 4 fields:
   - **Name** (text, required, max ~30 chars) — appears on final asset
   - **Company Name** (text, required, max ~40 chars) — appears on final asset
   - **LinkedIn Profile** (URL, required, validate `linkedin.com/in/...` format) — does **not** appear on final asset, for verification only (no actual verification in v1, just format check)
   - **Odds Beaten** (text, required, max ~30 chars, ALL CAPS recommended) — appears carved on the slab
   
   Primary CTA: **"Claim Your Mark."**

4. **Generation.** On submit, show a loading state ("Forging your brick…" or similar — keep it on-brand and a bit playful, but not corny). Then run the pipeline below.

5. **Result.** Show the generated MP4 (or, in v1 stub mode, the composited still image) with two CTAs: **Download** and **Share** (Web Share API where available, fallback to copy link).

## The generation pipeline (this is the core deliverable)

```
[Persona selected]
        │
        ▼
[Pick base image from BaseImages/{persona}.png]
        │
        ▼
[Step A — Compose the "first frame"]
  Draw base image to canvas, overlay "ODDS BEATEN" text
  onto the slab surface with the correct skew/transform,
  export as PNG/data URL.
        │
        ▼
[Step B — Send to Kling i2v API]              ← STUBBED FOR NOW
  POST first-frame PNG + prompt → poll → MP4
        │
        ▼
[Step C — Composite final poster]
  Take Kling MP4, overlay design template
  (THANK YOU / NAME / COMPANY / BREAK TO BUILD pill / ticker),
  export final MP4 at 1080×1350.
        │
        ▼
[Show in result modal]
```

### Step A — First-frame compositing (build this fully now)

This is the part I'll be iterating on most, so make it **clean, configurable, and visually accurate**.

- Use HTML5 Canvas (2D context). Load the base image, draw it at 1080×1350. (If the base image is square, decide a canvas strategy: either letterbox the base image inside 1080×1350, or composite the base image first and add the poster overlay later in Step C. **Recommendation:** keep Step A at the base image's native aspect ratio for now, and handle the 1080×1350 framing in Step C. This separates concerns cleanly. State whatever you decide in code comments.)
- Overlay the **Odds Beaten** text on the slab surface. The slab is on the **left side** of the composition, the figurine is on the right swinging a hammer toward it. The text must:
  - Sit on the front face of the slab.
  - Follow the slab's perspective — it's tilted slightly toward the viewer at the top and recedes at the bottom. Approximate this with a CSS-style 2D skew + a vertical scale, OR with a canvas affine transform. Don't try to do real perspective; a good 2D skew is convincing enough.
  - Be clipped/masked so it **cannot bleed past the slab edges**. Use a polygon clip path matching the slab's visible front face. Define the clip-path polygon as a constant at the top of the file: `SLAB_CLIP_POLYGON = [[x1,y1], [x2,y2], ...]` in canvas coordinates. I'll tweak these numbers by eye.
  - Use a chiseled / carved-stone aesthetic: layered text-shadow (one bright shadow offset down-right, one dark offset up-left, low blur) OR a canvas equivalent (draw the text twice with offset and slightly different colors). Subtle, not aggressive.
  - Auto-fit: if the text is short, render it large; if long, scale down to fit the clip region. Implement as a simple binary-search-on-font-size or while-loop-shrinking-until-it-fits.
  - Font: use a bold condensed display face. Load via Google Fonts (Anton, Oswald, or Bebas Neue are safe defaults — pick one and document the choice). All caps.

**Expose these tunables at the top of the file as named constants so I can adjust by editing one block, no code-hunting:**

```js
const SLAB_CONFIG = {
  textAnchor: { x: 285, y: 720 },     // center of the text block in canvas coords
  textMaxWidth: 380,                   // px, before scaling
  textMaxHeight: 480,                  // px
  skewX: -2,                           // degrees, horizontal skew
  skewY: 8,                            // degrees, vertical skew (slab leans back)
  rotation: -4,                        // degrees, slight overall tilt
  fontFamily: "'Anton', sans-serif",
  fontWeight: 700,
  fontColor: '#5a5a5a',                // engraved-stone gray
  shadowLight: { offsetX: 1, offsetY: 1, color: 'rgba(255,255,255,0.15)' },
  shadowDark: { offsetX: -1, offsetY: -1, color: 'rgba(0,0,0,0.6)' },
  clipPolygon: [[150, 480], [620, 460], [640, 1080], [180, 1100]] // I'll refine these
};
```

(Values are illustrative; you'll need to pick a sensible starting set based on the base image you receive. Add a `?debug=1` URL parameter that draws the clip polygon as a red outline on top so I can see whether the text is actually staying inside the slab.)

### Step B — Kling video generation (scaffold only, do NOT call the API yet)

Build the function signature and the full request/response handling, then **stub it**:

```js
const KLING_API_KEY = ''; // I'll fill this in later

async function generateVideoFromFrame(firstFrameDataUrl, prompt) {
  if (!KLING_API_KEY) {
    // STUB MODE: skip video gen, return the still image as a fake "video".
    console.warn('[Kling stub] No API key — returning still image as result.');
    return { type: 'image', dataUrl: firstFrameDataUrl };
  }
  // Real path (write this fully — I just won't run it until I add the key):
  // 1. POST to Kling image-to-video endpoint with firstFrame + prompt + duration:5 + resolution:1080p
  // 2. Receive task_id
  // 3. Poll task status every 5s until "succeed" or "failed" (timeout ~3 min)
  // 4. Fetch the resulting MP4 URL, return it
  return { type: 'video', url: '...' };
}
```

Use the **Kling AI v3 (or latest v3.x) image-to-video endpoint**. The Kling API is from Kuaishou; we'll be hitting it via their official endpoint or via fal.ai depending on a flag — make the endpoint URL a top-of-file constant so I can swap providers. Document the exact request format you're targeting in comments above the function (request body shape, polling pattern, expected response shape) so I can verify against the official docs when I add the key.

Leave a clearly marked `// TODO: KLING_PROMPT` constant — I'll paste the shatter prompt in later.

### Step C — Final poster compositing

Two cases:

**Stub mode (no API key):** take the first-frame still image, lay it inside a 1080×1350 canvas, draw the poster overlay design (header text, BREAK TO BUILD pill, ticker strip), export as PNG, surface it as the downloadable result.

**Live mode (API key present):** same idea, but with the Kling-returned MP4 as the underlying media. For video compositing in vanilla JS, the practical free path is:

1. Load the Kling MP4 into a hidden `<video>` element.
2. Use a `<canvas>` and `requestAnimationFrame` to draw each video frame + redraw the overlay design on top each frame.
3. Capture the canvas stream via `canvas.captureStream(30)` and pipe into a `MediaRecorder` to produce a fresh MP4 (well, WebM in most browsers — see note below).
4. Save the recorded blob, hand it to the user as a download.

**Important note on the "what to use for compositing" question I asked you about:**

Browser-native `MediaRecorder` + canvas works for v1 but produces **WebM**, not MP4, in Chrome and Firefox (Safari can produce MP4). For LinkedIn/Instagram shares, WebM is unreliable. So:

- **For this v1 HTML build:** use canvas + MediaRecorder. Accept WebM as output. It's free, works in-browser, no backend needed, and is good enough for testing the visual.
- **For the eventual Framer/production build:** the right free path is **ffmpeg.wasm** (https://github.com/ffmpegwasm/ffmpeg.wasm — runs ffmpeg compiled to WebAssembly entirely in the browser, MIT licensed, free forever). It can transcode the canvas-recorded WebM → MP4 in the browser, or do the full overlay-on-video compositing if we hand it the Kling MP4 and an overlay PNG. It adds ~25MB on first load but caches after. We can wire ffmpeg.wasm in once the Figma overlay design is final. **For now, build the canvas+MediaRecorder path and leave a `// TODO: swap to ffmpeg.wasm for MP4 output` comment.**

I considered Remotion (which we'd been discussing as the eventual cloud renderer) but Remotion needs Node/Lambda — it can't run client-side. ffmpeg.wasm is the right client-side free alternative. Don't use Remotion in this build.

## UI/UX requirements

- **Mobile-first.** The form modal must work cleanly on a 375×800 viewport. Persona thumbnails should be a 2×2 grid on mobile, 1×4 on desktop.
- **Keyboard accessible.** Tab order is correct, Escape closes modals, Enter submits the form, focus traps inside the modal while it's open.
- **Validation.** Inline errors under each field. Don't submit until all four fields are valid. LinkedIn URL must contain `linkedin.com/in/`.
- **No layout shift** when the modal opens — lock body scroll.
- **Match the Figma designs** for the persona picker and form once you have them. Until then, build with placeholder styling that matches the campaign aesthetic: near-black background (`#0a0a0a`), white text, bright accent blue (`#2950ff` ish — final value from Figma), Anton/Oswald/Bebas display type for headings, a clean sans (Inter or system-ui) for body and form labels.

## Code-quality requirements

- Single `index.html` file is fine, but split logic into clearly delimited sections with comment banners:
  ```js
  // ============================================================
  // SECTION 1 — Config & constants (tweak these to iterate)
  // SECTION 2 — DOM & modal management
  // SECTION 3 — Persona picker
  // SECTION 4 — Form & validation
  // SECTION 5 — Step A: First-frame canvas compositing
  // SECTION 6 — Step B: Kling video generation (stubbed)
  // SECTION 7 — Step C: Final poster compositing
  // SECTION 8 — Result modal & download/share
  // ============================================================
  ```
- All tunable values (canvas sizes, slab clip polygon, font choices, colors, animation durations, API endpoints, persona-to-base-image map) live in **SECTION 1**. The rest of the code reads from those constants. I should never need to scroll past Section 1 to tweak a visual parameter.
- Use plain `async/await`, no callback hell, no Promise chains where async/await would be clearer.
- Inline JSDoc on the three pipeline functions (`composeFirstFrame`, `generateVideoFromFrame`, `composeFinalPoster`) explaining inputs, outputs, side effects.
- Add a debug toggle: `?debug=1` in the URL → show the slab clip polygon outline, show canvas bounding boxes, log each pipeline stage to console with timing.

## Deliverables

1. **`index.html`** — single file, runs by opening in a browser, no install step.
2. **`README.md`** — one page covering:
   - How to run (just open the file, or `python3 -m http.server` if needed for CORS on the base images).
   - Where to put new persona base images and how to update the `PERSONA_CONFIG` map.
   - Where to paste the Kling API key when ready.
   - Where to swap the placeholder overlay design for the final Figma design.
   - Known limitations of v1 (WebM output, no real verification, etc.).
   - Migration notes for the Framer port — which functions to lift, what stays the same, what becomes a React component.

## What NOT to do in this build

- Don't call the Kling API. Stub it. I'll enable it later.
- Don't build the LinkedIn verification flow. Format check only.
- Don't build the database / backend / moderation queue. Out of scope.
- Don't build the rest of the campaign site (entry wall, founder's wall). This is just the shareable-asset generator.
- Don't use React, Vue, or any framework. Plain JS.
- Don't use Remotion. We're staying client-side.
- Don't invent designs for the persona picker or form modal — wait for the Figma links.
- Don't add analytics, A/B testing, error tracking, or any "production" infrastructure. That's a later concern.

## First action

**Before writing any code, ask me for:**

1. The Figma link for the **persona-picker popup screen**.
2. The Figma link for the **form input popup screen**.

Then confirm you've understood the slab text alignment problem (clip polygon + skew approach) and that you're going to stub Kling rather than call it. Once I confirm, start building.
