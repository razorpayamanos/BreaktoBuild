# Claude Code Prompt — "The Founder's Wall" (v1)

## Project
Build an interactive, pannable brick wall as a **Framer Code Component** (single-file React + TypeScript). This is v1 — static data, no auth, no backend. Future versions will pull founder texts from a Google Sheet and persist user-broken bricks to a database, so structure the code to make those swaps trivial.

## The big picture (read this before writing a line of code)
We're building a metaphor. Aspiring Indian founders are held back by a wall of "obstacles" — no funding, too young, wrong gender, wrong city, no network. Each **brick** is one of those obstacles. Each **cavity** in the wall is a brick someone already broke through to build something. The wall is the resistance; the cavities are the proof it can be done.

The user lands on the wall, can pan around it like a Figma canvas, sees a large central cavity that opens into the **Campaign Site** (out of scope for this build — just leave a placeholder slot), and discovers smaller cavities scattered across the wall containing **founder texts** like *"Deepinder Goyal broke this brick to build Zomato."* Hovering any unbroken brick shows "Break your brick." Clicking dims the wall and opens the break-brick flow.

Tone: gritty, tactile, a little defiant. Not corporate. Think construction site meets typographic poster.

## Tech constraints (non-negotiable)
- **Framer Code Component**: single default-exported React component, TypeScript, works when pasted into Framer's code editor.
- **No external CSS files, no CSS modules** — use inline styles, styled JSX inside the component, or a `<style>` tag injected once.
- **Dependencies allowed**: `react`, `framer-motion` (Framer ships with it), `framer` (for `addPropertyControls`, `ControlType`). Nothing else. No Three.js, no GSAP, no Zustand. Keep the bundle small.
- **The brick asset** lives at `Brick_alpha.png` in the project folder. Reference it via a prop (`brickImage: string`) with a Framer Image control so the user can swap it from the canvas. Default the prop to `Brick_alpha.png`.
- Must work on modern Chrome, Safari, Firefox. Touch + trackpad + mouse all supported.

## What to build in v1

### 1. The wall — virtualized, pannable grid
- A logical grid of bricks. Brick dimensions: **120px wide × 50px tall** (configurable via props). Standard running-bond offset: every other row shifts by half a brick.
- Wall bounds: **400 columns × 200 rows** (≈80,000 bricks logical). Configurable via props.
- **Only render bricks within the viewport + a small overscan buffer** (e.g., 5 bricks of margin on each side). This is critical — never render all 80k bricks. Use `Math.floor` math against pan offset and viewport size to compute visible range, then `.map` just that slice.
- **Panning**: trackpad two-finger pan, mouse drag, touch drag. Use a single `transform: translate3d(x, y, 0)` on an inner container holding the visible bricks. Track pan state in a `useRef` for the live drag and a `useState` for committed position so we don't re-render every pixel of movement. Clamp panning to the wall bounds.
- **Performance target**: smooth 60fps panning on a mid-range laptop with 60–120 bricks visible at once.
- No zoom in v1. Just pan. (Leave a TODO comment where zoom would slot in.)

### 2. The bricks themselves
Each brick is one of three states:

**(a) Normal brick** — renders `Brick_alpha.png` with a subtle per-brick variation so the wall doesn't look tiled and dead. Achieve variation via:
- A small deterministic hash of `(col, row)` driving: hue-rotate ±5deg, brightness ±8%, a 1–2px x/y nudge, and one of ~4 rotation values (0, 0.3, -0.3, 0.6 deg). Deterministic so the wall looks the same on every load.
- A faint inner shadow to suggest mortar gaps between bricks.

**(b) Pre-placed cavity (founder text)** — for v1, hardcode an array of ~12 cavities at varied coordinates across the wall. Each entry: `{ col, row, text, founderName, company }`. Use this single placeholder for all 12 in v1 (we'll swap to real data later):
> *"Deepinder Goyal broke this brick to build Zomato."*
A cavity renders as a recessed dark rectangle (inner shadow, slight gradient suggesting depth) with the text embossed inside. Text styling: a serif or condensed display font, mix-blend-mode `overlay` or `multiply`, with a `text-shadow` that creates an inset/carved-stone look (one light shadow offset down-right, one dark shadow offset up-left, both with low blur). Text wraps if needed. Add a tiny attribution line below the main quote in smaller type.

**(c) Campaign Site cavity (the big one)** — a single large cavity occupying roughly **6 columns × 4 rows** of bricks, positioned at the center of the wall (so the user lands on it). Render it as a deeper, darker recess containing a placeholder `<div>` with the text "CAMPAIGN SITE" and a "Click to enter" affordance. **Do not build the campaign site itself** — just expose an `onCampaignClick` prop that fires when this cavity is clicked. Future work will route into the campaign experience from here. The initial pan position should center this cavity in the viewport on mount.

### 3. Hover affordance
On hover over any **normal** (unbroken, non-cavity) brick: show a small floating label "Break your brick" near the cursor with a subtle fade-in. Use Framer Motion for the fade. The label should follow the cursor with a tiny lag (5–10ms feel). Don't show on cavities or on the campaign cavity. Disable on touch devices (no hover state — instead, a tap on a normal brick goes straight to the break-brick flow).

### 4. The break-brick flow
On clicking a normal brick:
1. The wall dims (overlay at ~70% opacity, dark) and pan is disabled.
2. The selected brick scales up and animates to the center of the viewport, becoming the "focal brick."
3. A form panel slides in beside (or below, on mobile) the focal brick with these fields:
   - **Name** (text)
   - **LinkedIn URL** (text)
   - **Company name** (text)
   - **Odds beaten** (textarea, max ~80 chars, placeholder: "I didn't have funding")
4. As the user types in **Odds beaten**, the text appears live on the focal brick — embossed, using `mix-blend-mode: overlay` and a layered `text-shadow` for the carved look. Text auto-fits (shrinks if too long).
5. Below the form: a primary button **"Break the brick."**
6. On click of "Break the brick":
   - Trigger the **shatter animation** (see below).
   - After shatter, the focal brick is replaced with a cavity in the wall at its original `(col, row)`, containing the user's "Odds beaten" text styled as a founder text cavity.
   - Wall un-dims, pan re-enables.
   - In v1 store the new cavity in component state (an array). It will persist for the session only. Add a `// TODO: persist to DB` comment at the write site.
7. Cancel/close button in the corner of the form returns to the wall with no changes.

### 5. The shatter animation (this is the moment — make it good)
**Approach**: pure 2D, runtime canvas-based fragmentation. No video, no 3D.

- When "Break the brick" is clicked, draw the focal brick image to an offscreen `<canvas>`, then create **12–18 fragment elements** by clipping different polygonal regions of the brick image. (Easiest implementation: use a fixed set of ~15 pre-defined polygon clip-paths shaped like irregular brick shards, applied as `clip-path: polygon(...)` to absolutely-positioned `<div>`s each showing the full brick image. This avoids canvas entirely and keeps it CSS-only.)
- Animate each fragment with Framer Motion: random outward velocity, gravity (y accelerates down), rotation, and fade-out over ~700–900ms. Slight stagger between fragments (10–30ms).
- Add a **dust burst**: ~25 small grey/brown circular `<div>`s that puff outward and fade, slower than the fragments.
- Add a **screen shake**: ~6px amplitude, 250ms, easing out. Apply to the wall container.
- After the animation completes (~1s total), reveal the new cavity beneath.
- Keep an `enableShatter` prop (default true) so it can be disabled for users with `prefers-reduced-motion`. Honor `prefers-reduced-motion` automatically: if set, fade the brick out and fade the cavity in over 400ms instead of shattering.

### 6. Framer property controls
Expose via `addPropertyControls`:
- `brickImage` (Image, default `Brick_alpha.png`)
- `wallColumns` (Number, default 400)
- `wallRows` (Number, default 200)
- `brickWidth` (Number, default 120)
- `brickHeight` (Number, default 50)
- `mortarColor` (Color, default a dark warm grey)
- `wallBackgroundColor` (Color, default near-black)
- `enableShatter` (Boolean, default true)

## Code structure (suggested, not strict)
- One default-exported component `FoundersWall`.
- Internal helper components: `Brick`, `Cavity`, `CampaignCavity`, `BreakBrickModal`, `ShatterEffect`, `HoverLabel`.
- One `useViewport` hook for pan state + visible-range calculation.
- One module-level array `PRESET_CAVITIES` with the 12 placeholder entries.
- A clearly marked section at the top of the file: `// === V2 HOOKS ===` listing where the Google Sheet fetch and DB persistence will plug in.

## Out of scope for v1 (do not build, but leave clean seams)
- LinkedIn OAuth / any auth.
- Persistence of broken bricks across sessions.
- Pulling founder texts from Google Sheets.
- The campaign site contents (just the entry cavity + onClick prop).
- Zoom controls.
- Moderation queue / submission review.
- Sharing to LinkedIn.
- Mobile pinch-zoom.

## Acceptance checklist
- [ ] Pastes cleanly into a Framer code component with no missing imports.
- [ ] Wall renders with `Brick_alpha.png`, bricks have subtle natural variation, mortar visible.
- [ ] User lands centered on the campaign cavity.
- [ ] Trackpad/mouse/touch pan works smoothly. Only visible bricks render.
- [ ] 12 pre-placed cavities are visible at distinct coordinates with the Deepinder Goyal placeholder text, properly embossed.
- [ ] Hovering any normal brick shows "Break your brick" near the cursor.
- [ ] Clicking the campaign cavity fires `onCampaignClick`.
- [ ] Clicking a normal brick opens the break-brick modal; live-typed odds-beaten text renders embossed on the focal brick.
- [ ] "Break the brick" plays a 2D shatter (or reduced-motion fade) and replaces the brick with a new cavity containing the user's text.
- [ ] All Framer property controls work and are typed.
- [ ] Code compiles with no TypeScript errors. No `any` except where genuinely unavoidable.
- [ ] Comments mark every place v2 will need to plug in (Google Sheet, DB writes, auth).

## Final note
Prioritize the **feel** of the wall and the **drama of the break moment** over feature completeness. If you have to choose between adding a property control and making the shatter feel weighty, make the shatter feel weighty.
