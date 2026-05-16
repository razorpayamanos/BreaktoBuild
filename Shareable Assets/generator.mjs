// generator.mjs
//
// Pure ES module that produces the Break-to-Build shareable video from a
// plain JS input object. No DOM reads, no form lookups, no module-scope
// side effects. Imported both by the local test harness (index_framer.html)
// and by the Framer Code Component (framer/ShareableAsset.tsx).
//
// All rendering logic is lifted verbatim from index.html — kept identical
// so the two outputs stay pixel-equivalent. The only changes vs. the
// original are:
//   1. Asset URLs are resolved against an injected `assetBaseUrl` instead
//      of relative paths.
//   2. A single entry point `generateAsset({ ... })` wraps the pipeline.
//   3. No `?debug=1` plumbing — this module is production-only.

// ============================================================
// SECTION 1 — Config & constants
// ============================================================

export const FINAL_WIDTH = 1080;
export const FINAL_HEIGHT = 1350;

export const AVATAR_ORDER = ['male', 'female'];
export const WEAPON_ORDER = ['punch', 'crush', 'thrash', 'smash', 'kick', 'slice'];

const AVATAR_CONFIG = {
  male:   { label: 'Male' },
  female: { label: 'Female' },
};

const WEAPON_CONFIG = {
  smash:  { label: 'SMASH IT',  finalSlug: 'bat'    },
  crush:  { label: 'CRUSH IT',  finalSlug: 'hammer' },
  slice:  { label: 'SLICE IT',  finalSlug: 'sword'  },
  thrash: { label: 'THRASH IT', finalSlug: 'flail'  },
  kick:   { label: 'KICK IT',   finalSlug: 'kick'   },
  punch:  { label: 'PUNCH IT',  finalSlug: 'punch'  },
};

// Final-video filenames per (avatar, weapon). The cut frame is encoded
// in the filename as `{slug}_{frame}.mp4`.
const FINAL_VIDEO_PATHS = {
  male:   { smash:'bat_35.mp4',   crush:'hammer_76.mp4', slice:'sword_34.mp4',
            thrash:'flail_45.mp4', kick:'kick_42.mp4',    punch:'punch_70.mp4' },
  female: { smash:'bat_39.mp4',   crush:'hammer_72.mp4', slice:'sword_36.mp4',
            thrash:'flail_37.mp4', kick:'kick_35.mp4',    punch:'punch_59.mp4' },
};

function getComboConfig(avatar, weapon, assetBaseUrl) {
  const filename = FINAL_VIDEO_PATHS[avatar][weapon];
  const cutMatch = filename.match(/_(\d+)\.mp4$/);
  return {
    label:        `${AVATAR_CONFIG[avatar].label} · ${WEAPON_CONFIG[weapon].label}`,
    baseVideo:    `${assetBaseUrl}/Avatars/${avatar}/Final/${filename}`,
    textCutFrame: cutMatch ? parseInt(cutMatch[1], 10) : 45,
    videoFps:     24,
  };
}

const SLAB_CONFIG = {
  textAnchor: { x: 0.4242, y: 0.6296 },
  textMaxWidth: 0.1824,
  textMaxHeight: 0.1563,
  minFontSize: 32,
  fontFamily: "'Special Gothic Condensed One', 'Anton', sans-serif",
  fontWeight: 400,
  fontColor: '#3a3a3a',
  lineHeight: 0.8,
  letterSpacing: -0.02,
  textAlign: 'left',
  hyphenateMinLength: 8,
  compositeMode: 'overlay',
  opacity: 0.8,
  embossment: { enabled: false },
  noise: {
    enabled: true,
    density: 0.55,
    intensity: 0.55,
  },
  innerShadow: {
    enabled: true,
    offsetX: 4,
    offsetY: 4,
    blur: 9,
    color: 'rgba(0,0,0,0.95)',
  },
  skewX: 8,
  skewY: 0,
  rotation: -2.53,
  clipPolygon: [[0.2976, 0.5184], [0.5226, 0.5184], [0.5226, 0.7087], [0.2976, 0.7087]],
};

// POSTER_OVERLAY logo `src` fields are filled in at runtime from
// assetBaseUrl so the constant itself stays URL-agnostic.
function makePosterOverlay(assetBaseUrl) {
  return {
    bg: '#010201',
    textColor: '#c4c4c4',
    accent: '#0039ff',

    razorpayLogo: { x: 32.99, y: 32.01, w: 164.062, h: 35, src: `${assetBaseUrl}/razorpay-logo.svg` },
    campaignLogo: { x: 852, y: 22.99, w: 200, h: 53.085, src: `${assetBaseUrl}/Logo.png` },

    title: {
      centerX: 540,
      top: 79.55,

      eyebrow: {
        text: 'THANK YOU',
        fontFamily: 'Unbounded',
        fontWeight: 400,
        fontSize: 32.729,
        letterSpacing: -1.31,
      },
      eyebrowToNameGap: 25,

      name: {
        fontFamily: 'Unbounded',
        fontWeight: 900,
        fontSize: 94.706,
        lineHeight: 92.424,
        letterSpacing: -3.79,
        maxWidth: 1020,
      },
      nameToSubtitleGap: 18,

      subtitle: {
        prefix: 'for BEATING THE ODDS AND BUILDING ',
        fontFamily: 'Unbounded',
        fontWeight: 400,
        fontSize: 28.016,
        lineHeight: 38.10,
        letterSpacing: -1.12,
        maxWidth: 820,
      },
    },

    media: { x: 0, y: 0 },

    ticker: {
      y: 1277.55,
      h: 72,
      bg: '#0039ff',
      textColor: '#ffffff',
      tileText: 'BREAK TO BUILD',
      fontFamily: 'Unbounded',
      fontWeight: 400,
      fontSize: 28.557,
      letterSpacing: -1.14,
      starGap: 60,
    },
  };
}

// ============================================================
// SECTION 2 — Asset loading helpers
// ============================================================

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

async function loadComboVideo(avatar, weapon, assetBaseUrl) {
  const cfg = getComboConfig(avatar, weapon, assetBaseUrl);
  const video = document.createElement('video');
  video.src = cfg.baseVideo;
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  await new Promise((resolve, reject) => {
    const onMeta = () => { video.removeEventListener('loadedmetadata', onMeta); resolve(); };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', () => reject(new Error(`Failed to load video: ${cfg.baseVideo}`)), { once: true });
  });
  try { await video.play(); video.pause(); video.currentTime = 0; } catch { }
  return { video, cfg };
}

async function preloadFonts() {
  if (!document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('400 100px Anton'),
      document.fonts.load('400 200px Anton'),
      document.fonts.load('400 100px "Special Gothic Condensed One"'),
      document.fonts.load('400 200px "Special Gothic Condensed One"'),
      document.fonts.load('900 80px Unbounded'),
      document.fonts.load('400 32px Unbounded'),
      document.fonts.load('400 18px Inter'),
    ]);
    await document.fonts.ready;
  } catch { /* fall back to system fonts — caller decides whether to retry */ }
}

// ============================================================
// SECTION 3 — Slab-text engraving
// ============================================================

function resolveSlab(W, H) {
  const C = SLAB_CONFIG;
  return {
    anchor: { x: C.textAnchor.x * W, y: C.textAnchor.y * H },
    maxW: C.textMaxWidth * W,
    maxH: C.textMaxHeight * H,
    poly: C.clipPolygon.map(([nx, ny]) => [nx * W, ny * H]),
  };
}

let _slabLayerCache = { key: null, canvas: null };
let _noisePatternCache = { key: null, canvas: null };

function getNoisePattern(W, H, density, intensity) {
  const key = `${W}|${H}|${density.toFixed(3)}|${intensity.toFixed(3)}`;
  if (_noisePatternCache.key === key && _noisePatternCache.canvas) return _noisePatternCache.canvas;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const imgData = ctx.createImageData(W, H);
  const data = imgData.data;
  const aMax = intensity * 255;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.random() < density) {
      const v = Math.random() < 0.5 ? 0 : 255;
      data[i] = v; data[i + 1] = v; data[i + 2] = v;
      data[i + 3] = (Math.random() * aMax) | 0;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  _noisePatternCache = { key, canvas: c };
  return c;
}

function getSlabTextLayer(text, W, H) {
  const C = SLAB_CONFIG;
  const key = JSON.stringify([
    text, W, H,
    C.fontColor, C.fontFamily, C.fontWeight,
    C.textAnchor, C.textMaxWidth, C.textMaxHeight, C.minFontSize,
    C.clipPolygon, C.skewX, C.skewY, C.rotation,
    C.lineHeight, C.letterSpacing, C.textAlign,
    C.hyphenateMinLength,
    C.noise, C.innerShadow,
  ]);
  if (_slabLayerCache.key === key && _slabLayerCache.canvas) return _slabLayerCache.canvas;

  const layer = document.createElement('canvas');
  layer.width = W; layer.height = H;
  renderSlabLayerInto(layer.getContext('2d'), text, W, H);
  _slabLayerCache = { key, canvas: layer };
  return layer;
}

function renderSlabLayerInto(ctx, text, W, H) {
  const C = SLAB_CONFIG;
  const { anchor, maxW, maxH, poly } = resolveSlab(W, H);

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
  ctx.clip();

  ctx.translate(anchor.x, anchor.y);
  ctx.rotate(C.rotation * Math.PI / 180);
  ctx.transform(1, Math.tan(C.skewY * Math.PI / 180), Math.tan(C.skewX * Math.PI / 180), 1, 0, 0);

  const { lines, fontSize } = wrapAndFit(text, ctx, {
    fontFamily: C.fontFamily,
    fontWeight: C.fontWeight,
    maxWidth: maxW,
    maxHeight: maxH,
    lineHeight: C.lineHeight,
    letterSpacing: C.letterSpacing,
    minFontSize: C.minFontSize ?? 30,
    hyphenateMinLength: C.hyphenateMinLength ?? Infinity,
    rotation: C.rotation,
    skewX: C.skewX,
    skewY: C.skewY,
    textAlign: C.textAlign || 'left',
  });

  ctx.font = `${C.fontWeight} ${fontSize}px ${C.fontFamily}`;
  ctx.textAlign = C.textAlign || 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${C.letterSpacing * fontSize}px`;

  const lh = fontSize * C.lineHeight;
  const startY = -lh * lines.length / 2 + lh / 2;
  const drawX = C.textAlign === 'left' ? -maxW / 2
    : C.textAlign === 'right' ? maxW / 2
      : 0;

  ctx.fillStyle = C.fontColor;
  lines.forEach((line, i) => ctx.fillText(line, drawX, startY + i * lh));

  if (C.noise && C.noise.enabled) {
    ctx.save();
    const m = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(getNoisePattern(W, H, C.noise.density, C.noise.intensity), 0, 0);
    ctx.setTransform(m);
    ctx.restore();
  }

  if (C.innerShadow && C.innerShadow.enabled) {
    const mask = document.createElement('canvas');
    mask.width = W; mask.height = H;
    const mctx = mask.getContext('2d');
    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, W, H);
    mctx.translate(anchor.x, anchor.y);
    mctx.rotate(C.rotation * Math.PI / 180);
    mctx.transform(1, Math.tan(C.skewY * Math.PI / 180), Math.tan(C.skewX * Math.PI / 180), 1, 0, 0);
    mctx.font = ctx.font;
    mctx.textAlign = ctx.textAlign;
    mctx.textBaseline = ctx.textBaseline;
    if ('letterSpacing' in mctx) mctx.letterSpacing = ctx.letterSpacing;
    mctx.globalCompositeOperation = 'destination-out';
    lines.forEach((line, i) => mctx.fillText(line, drawX, startY + i * lh));

    ctx.save();
    const m = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowColor = C.innerShadow.color;
    ctx.shadowOffsetX = C.innerShadow.offsetX;
    ctx.shadowOffsetY = C.innerShadow.offsetY;
    ctx.shadowBlur = C.innerShadow.blur;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(mask, 0, 0);
    ctx.setTransform(m);
    ctx.restore();
  }

  ctx.restore();
}

function drawSlabText(ctx, text, W, H) {
  const layer = getSlabTextLayer(text, W, H);
  ctx.save();
  ctx.globalCompositeOperation = SLAB_CONFIG.compositeMode || 'source-over';
  ctx.globalAlpha = SLAB_CONFIG.opacity ?? 1;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

function wrapGreedy(text, ctx, maxWidth, hyphenateAt = Infinity) {
  const rawWords = (text || '').split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [text || ''];

  const tokens = [];
  for (const w of rawWords) {
    if (w.length >= hyphenateAt) {
      const splitAt = Math.ceil(w.length / 2);
      tokens.push({ word: w.slice(0, splitAt) + '-', forceBreakAfter: true });
      tokens.push({ word: w.slice(splitAt),          forceBreakAfter: false });
    } else {
      tokens.push({ word: w, forceBreakAfter: false });
    }
  }

  const lines = [];
  let cur = '';
  for (const t of tokens) {
    const tryLine = cur ? cur + ' ' + t.word : t.word;
    if (ctx.measureText(tryLine).width <= maxWidth) cur = tryLine;
    else { if (cur) lines.push(cur); cur = t.word; }
    if (t.forceBreakAfter) { lines.push(cur); cur = ''; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

function wrapAndFit(text, ctx, opts) {
  const {
    fontFamily, fontWeight, maxWidth, maxHeight,
    lineHeight, letterSpacing,
    minFontSize = 30,
    maxFontSize = 70,
    hyphenateMinLength = Infinity,
  } = opts;

  let lo = minFontSize, hi = maxFontSize;
  let best = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    ctx.font = `${fontWeight} ${mid}px ${fontFamily}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacing * mid}px`;
    const lines = wrapGreedy(text, ctx, maxWidth, hyphenateMinLength);
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    const totalH = lines.length * lineHeight * mid;
    if (widest <= maxWidth && totalH <= maxHeight) {
      best = { fontSize: mid, lines };
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best) return best;
  ctx.font = `${fontWeight} ${minFontSize}px ${fontFamily}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacing * minFontSize}px`;
  return { fontSize: minFontSize, lines: wrapGreedy(text, ctx, maxWidth, hyphenateMinLength) };
}

// ============================================================
// SECTION 4 — Poster composition
// ============================================================

function drawPosterFrame(ctx, mediaEl, userData, logos, overlay) {
  const P = overlay;

  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, FINAL_WIDTH, FINAL_HEIGHT);

  if (mediaEl) {
    const mw = mediaEl.naturalWidth || mediaEl.videoWidth || mediaEl.width || 0;
    const mh = mediaEl.naturalHeight || mediaEl.videoHeight || mediaEl.height || 0;
    if (mw && mh) ctx.drawImage(mediaEl, P.media.x, P.media.y);
  }

  renderPosterOverlay(ctx, userData, logos, overlay);
}

function renderPosterOverlay(ctx, { name, company }, logos, overlay) {
  const P = overlay;
  const T = P.title;

  const RL = P.razorpayLogo;
  if (logos.razorpay) {
    ctx.drawImage(logos.razorpay, RL.x, RL.y, RL.w, RL.h);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = `700 26px 'Inter', sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('Razorpay', RL.x, RL.y + RL.h / 2);
  }

  const CL = P.campaignLogo;
  if (logos.campaign) {
    ctx.drawImage(logos.campaign, CL.x, CL.y, CL.w, CL.h);
  } else {
    ctx.fillStyle = P.accent;
    ctx.fillRect(CL.x, CL.y, CL.w, CL.h);
    ctx.fillStyle = '#fff';
    ctx.font = `700 22px 'Unbounded', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('BREAK TO BUILD', CL.x + CL.w / 2, CL.y + CL.h / 2);
  }

  ctx.fillStyle = P.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const E = T.eyebrow;
  ctx.font = `${E.fontWeight} ${E.fontSize}px '${E.fontFamily}', sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${E.letterSpacing}px`;
  const eyebrowTop = T.top;
  ctx.fillText(E.text, T.centerX, eyebrowTop);
  const eyebrowBottom = eyebrowTop + E.fontSize;

  const N = T.name;
  ctx.font = `${N.fontWeight} ${N.fontSize}px '${N.fontFamily}', sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${N.letterSpacing}px`;
  const nameLines = wrapPosterName((name || 'YOUR NAME').toUpperCase(), ctx, N.maxWidth);
  const nameTop = eyebrowBottom + T.eyebrowToNameGap;
  nameLines.forEach((line, i) => ctx.fillText(line, T.centerX, nameTop + i * N.lineHeight));
  const nameBottom = nameTop + nameLines.length * N.lineHeight;

  const S = T.subtitle;
  ctx.font = `${S.fontWeight} ${S.fontSize}px '${S.fontFamily}', sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${S.letterSpacing}px`;
  const subText = `${S.prefix}${(company || 'YOUR COMPANY').toUpperCase()}`;
  const subLines = wrapPosterSubtitle(subText, ctx, S.maxWidth);
  const subtitleTop = nameBottom + T.nameToSubtitleGap;
  subLines.forEach((line, i) => ctx.fillText(line, T.centerX, subtitleTop + i * S.lineHeight));

  const TK = P.ticker;
  ctx.fillStyle = TK.bg;
  ctx.fillRect(0, TK.y, FINAL_WIDTH, TK.h);
  ctx.fillStyle = TK.textColor;
  ctx.font = `${TK.fontWeight} ${TK.fontSize}px '${TK.fontFamily}', sans-serif`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${TK.letterSpacing}px`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const tickerY = TK.y + TK.h / 2;
  const word = TK.tileText;
  const wordW = ctx.measureText(word).width;
  const tileW = wordW + TK.starGap * 2 + 22;
  let x = -tileW / 4;
  while (x < FINAL_WIDTH + tileW) {
    ctx.fillText(word, x, tickerY);
    ctx.fillText('★', x + wordW + TK.starGap, tickerY);
    x += tileW;
  }
}

function wrapPosterName(name, ctx, maxW) {
  if (ctx.measureText(name).width <= maxW && !name.includes(' ')) return [name];
  if (!name.includes(' ')) return [name];
  const mid = Math.floor(name.length / 2);
  let splitIdx = -1, bestDist = Infinity;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === ' ' && Math.abs(i - mid) < bestDist) { splitIdx = i; bestDist = Math.abs(i - mid); }
  }
  if (splitIdx === -1) return [name];
  return [name.slice(0, splitIdx), name.slice(splitIdx + 1)];
}

function wrapPosterSubtitle(text, ctx, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const tryLine = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(tryLine).width <= maxW) cur = tryLine;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ============================================================
// SECTION 5 — Per-frame compositor + record loop
// ============================================================

function composeOneFrame(srcCtx, finalCtx, video, frameIndex, oddsText, W, H, userData, logos, cutFrame, overlay) {
  srcCtx.globalCompositeOperation = 'source-over';
  srcCtx.globalAlpha = 1;
  srcCtx.drawImage(video, 0, 0, W, H);

  if (frameIndex < cutFrame && oddsText) {
    drawSlabText(srcCtx, oddsText, W, H);
  }

  drawPosterFrame(finalCtx, srcCtx.canvas, userData, logos, overlay);
}

async function processVideoToPoster({ video, persona, userData, logos, overlay, onProgress }) {
  const W = video.videoWidth, H = video.videoHeight;
  const cutFrame = persona.textCutFrame ?? 45;
  const fps = persona.videoFps ?? 24;
  const oddsText = (userData.oddsText || '').toUpperCase();

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = W; srcCanvas.height = H;
  const srcCtx = srcCanvas.getContext('2d');

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = FINAL_WIDTH; finalCanvas.height = FINAL_HEIGHT;
  const finalCtx = finalCanvas.getContext('2d');

  const stream = finalCanvas.captureStream(fps);
  const mimeType =
    MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E') ? 'video/mp4;codecs=avc1.42E01E' :
      MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' :
        MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' :
          'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const recorderStopped = new Promise(r => recorder.onstop = r);

  composeOneFrame(srcCtx, finalCtx, video, 0, oddsText, W, H, userData, logos, cutFrame, overlay);

  let frameIndex = 0;
  let lastSeenMediaTime = -1;
  const useRVFC = typeof video.requestVideoFrameCallback === 'function';

  recorder.start();
  try { video.currentTime = 0; } catch { }
  await video.play();

  await new Promise((resolve, reject) => {
    const finish = () => { try { recorder.stop(); } catch { } resolve(); };

    function step(_now, meta) {
      const t = meta ? meta.mediaTime : video.currentTime;
      if (t === lastSeenMediaTime) {
        if (useRVFC) video.requestVideoFrameCallback(step);
        return;
      }
      lastSeenMediaTime = t;
      frameIndex = Math.round(t * fps);

      composeOneFrame(srcCtx, finalCtx, video, frameIndex, oddsText, W, H, userData, logos, cutFrame, overlay);
      if (onProgress) onProgress(Math.min(1, t / (video.duration || 1)));

      if (!video.ended && !video.paused) {
        if (useRVFC) video.requestVideoFrameCallback(step);
        else requestAnimationFrame(() => step());
      }
    }

    video.addEventListener('ended', finish, { once: true });
    video.addEventListener('error', () => reject(new Error('video error during capture')), { once: true });
    if (useRVFC) video.requestVideoFrameCallback(step);
    else requestAnimationFrame(() => step());
  });

  await recorderStopped;
  const blob = new Blob(chunks, { type: mimeType });
  return { type: 'video', blob, mimeType, frameCount: frameIndex + 1, textCutFrame: cutFrame };
}

// ============================================================
// SECTION 6 — Public entry point
// ============================================================

/**
 * Generate the final shareable video.
 *
 * @param {Object} input
 * @param {string} input.name        Recipient name (displayed on the poster)
 * @param {string} input.company     Recipient company
 * @param {string} input.oddsText    The "odds beaten" line engraved on the slab
 * @param {'male'|'female'} input.avatar
 * @param {'punch'|'crush'|'thrash'|'smash'|'kick'|'slice'} input.weapon
 * @param {string} input.assetBaseUrl  Origin where /Avatars, /Weapons, /Logo.png, /razorpay-logo.svg live
 * @param {(p:number)=>void} [input.onProgress]  Receives 0–1 progress during render
 * @returns {Promise<{ type:'video', blob:Blob, mimeType:string, frameCount:number, textCutFrame:number }>}
 */
export async function generateAsset({
  name, company, oddsText,
  avatar, weapon,
  assetBaseUrl,
  onProgress,
}) {
  if (!AVATAR_ORDER.includes(avatar)) throw new Error(`Unknown avatar: ${avatar}`);
  if (!WEAPON_ORDER.includes(weapon)) throw new Error(`Unknown weapon: ${weapon}`);
  if (!assetBaseUrl) throw new Error('assetBaseUrl is required');

  const cleanBase = assetBaseUrl.replace(/\/+$/, '');
  const overlay = makePosterOverlay(cleanBase);

  await preloadFonts();

  const { video, cfg: persona } = await loadComboVideo(avatar, weapon, cleanBase);
  const [razorpayLogo, campaignLogo] = await Promise.all([
    loadImage(overlay.razorpayLogo.src).catch(() => null),
    loadImage(overlay.campaignLogo.src).catch(() => null),
  ]);
  const logos = { razorpay: razorpayLogo, campaign: campaignLogo };

  const userData = { name, company, oddsText };

  return processVideoToPoster({
    video, persona, userData, logos, overlay, onProgress,
  });
}
