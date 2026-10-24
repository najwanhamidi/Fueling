// OCR orchestration: image pre-processing + multi-pass Tesseract + parsing/merging.
import { parseOcr, finalize, scoreResult } from './parser.js';

const BASE = new URL('../../vendor/tesseract/', import.meta.url).href;
let workerPromise = null;
let progressCb = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error('Could not load OCR engine'));
    document.head.appendChild(s);
  });
}

export async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript(BASE + 'tesseract.min.js');
      const w = await window.Tesseract.createWorker('eng', 1, {
        workerPath: BASE + 'worker.min.js',
        corePath: BASE + 'core/',
        langPath: BASE + 'lang/',
        logger: (m) => progressCb?.(m),
        errorHandler: (e) => console.warn('tesseract', e),
      });
      return w;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

/* ---------------- image helpers ---------------- */
export async function fileToCanvas(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    bmp = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  return c;
}

export function rotateCanvas(src, deg) {
  const rad = (deg * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
  const w = Math.round(src.width * cos + src.height * sin);
  const h = Math.round(src.width * sin + src.height * cos);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.translate(w / 2, h / 2);
  g.rotate(rad);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export function cropCanvas(src, r) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(r.w)); c.height = Math.max(1, Math.round(r.h));
  c.getContext('2d').drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return c;
}

function scaleCanvas(src, s) {
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Bring the image into Tesseract's sweet spot (text x-height ≈ 20–40 px). */
function normalizeSize(src) {
  const long = Math.max(src.width, src.height);
  let s = 1;
  if (long < 1400) s = Math.min(3, 1800 / long);
  else if (long > 2800) s = 2800 / long;
  return s === 1 ? src : scaleCanvas(src, s);
}

function grayOf(c) {
  const { width: w, height: h } = c;
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  return { g, w, h };
}

function grayToCanvas({ g, w, h }) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(w, h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) { id.data[i] = id.data[i + 1] = id.data[i + 2] = g[j]; id.data[i + 3] = 255; }
  ctx.putImageData(id, 0, 0);
  return c;
}

function otsu(g) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const total = g.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, max = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > max) { max = between; thr = t; }
  }
  return thr;
}

function stretch({ g, w, h }, invert = false) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const lo = pct(hist, g.length, 0.01), hi = pct(hist, g.length, 0.99);
  const out = new Uint8ClampedArray(g.length);
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < g.length; i++) {
    let v = ((g[i] - lo) * 255) / range;
    if (invert) v = 255 - v;
    out[i] = v;
  }
  return { g: out, w, h };
}
function pct(hist, n, p) {
  let acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * p) return i; }
  return 255;
}

/** Bradley adaptive threshold — robust to shadows, glare gradients and coloured backgrounds. */
function adaptive({ g, w, h }, t = 0.15) {
  const s = Math.max(15, Math.round(Math.max(w, h) / 24));
  const ii = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += g[(y - 1) * w + (x - 1)];
      ii[y * (w + 1) + x] = ii[(y - 1) * (w + 1) + x] + row;
    }
  }
  const out = new Uint8ClampedArray(g.length);
  let dark = 0;
  const half = s >> 1;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
      const cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = ii[(y1 + 1) * (w + 1) + (x1 + 1)] - ii[y0 * (w + 1) + (x1 + 1)] - ii[(y1 + 1) * (w + 1) + x0] + ii[y0 * (w + 1) + x0];
      const v = g[y * w + x] * cnt < sum * (1 - t) ? 0 : 255;
      out[y * w + x] = v;
      if (!v) dark++;
    }
  }
  if (dark > g.length * 0.5) for (let i = 0; i < out.length; i++) out[i] = 255 - out[i];
  return { g: out, w, h };
}

/**
 * Estimate skew angle (deg) via projection-profile variance of text-stroke pixels.
 * Uses the adaptive-binarised image so backgrounds, shadows and table-tops don't count as "ink".
 */
function estimateSkew(bin) {
  const scale = Math.min(1, 900 / bin.w);
  const h = Math.round(bin.h * scale);
  const pts = [];
  const step = Math.max(1, Math.round(1 / scale));
  for (let y = 0; y < bin.h; y += step) {
    for (let x = 0; x < bin.w; x += step) {
      if (bin.g[y * bin.w + x] === 0) pts.push(x * scale, y * scale);
    }
  }
  if (pts.length < 200) return 0;
  const maxPts = 60000;
  const stride = Math.max(1, Math.floor(pts.length / 2 / maxPts)) * 2;
  const profile = (a) => {
    const r = (a * Math.PI) / 180, sn = Math.sin(r), cs = Math.cos(r);
    const bins = new Float64Array(h * 2 + 10);
    for (let i = 0; i < pts.length; i += stride) {
      const yy = Math.round(pts[i + 1] * cs - pts[i] * sn + h * 0.5);
      if (yy >= 0 && yy < bins.length) bins[yy]++;
    }
    let s2 = 0, s = 0;
    for (const b of bins) { s += b; s2 += b * b; }
    return s2 / bins.length - (s / bins.length) ** 2;
  };
  let best = 0, bestVar = -1;
  for (let a = -15; a <= 15.001; a += 0.5) { const v = profile(a); if (v > bestVar) { bestVar = v; best = a; } }
  for (let a = best - 0.4; a <= best + 0.401; a += 0.1) { const v = profile(a); if (v > bestVar) { bestVar = v; best = a; } }
  return Math.round(best * 10) / 10;
}

/**
 * Find ruled table lines (long thin horizontal / vertical ink runs) in a binary image.
 * Letters are short relative to their own height, rules are not, so thresholds scale with text size.
 */
function lineMask(bin) {
  const { g, w, h } = bin;
  // estimate text height: 90th percentile of vertical ink-run lengths
  const hist = new Uint32Array(h + 1);
  for (let x = 0; x < w; x += 2) {
    let run = 0;
    for (let y = 0; y <= h; y++) {
      const ink = y < h && g[y * w + x] === 0;
      if (ink) run++; else if (run) { hist[run]++; run = 0; }
    }
  }
  let total = 0; for (let i = 1; i <= h; i++) total += hist[i] * i;
  let acc = 0, p90 = 20;
  for (let i = 1; i <= h; i++) { acc += hist[i] * i; if (acc >= total * 0.9) { p90 = i; break; } }
  const vMin = Math.max(30, Math.round(p90 * 2.2));
  const hMin = Math.max(Math.round(w * 0.12), p90 * 5, 60);
  const mask = new Uint8Array(w * h);
  // horizontal runs
  for (let y = 0; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const ink = x < w && g[y * w + x] === 0;
      if (ink && start < 0) start = x;
      else if (!ink && start >= 0) { if (x - start >= hMin) for (let k = start; k < x; k++) mask[y * w + k] = 1; start = -1; }
    }
  }
  // vertical runs
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const ink = y < h && g[y * w + x] === 0;
      if (ink && start < 0) start = y;
      else if (!ink && start >= 0) { if (y - start >= vMin) for (let k = start; k < y; k++) mask[k * w + x] = 1; start = -1; }
    }
  }
  // grow by 1 px to remove anti-aliased edges
  const out = new Uint8Array(w * h);
  let count = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (mask[i] || mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w]) { out[i] = 1; count++; }
  }
  return { mask: out, count };
}
function applyMask({ g, w, h }, mask) {
  const out = new Uint8ClampedArray(g);
  for (let i = 0; i < out.length; i++) if (mask[i]) out[i] = 255;
  return { g: out, w, h };
}

const meanOf = (g) => { let s = 0; for (let i = 0; i < g.length; i += 7) s += g[i]; return s / Math.ceil(g.length / 7); };

const toBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));

function flattenLines(data) {
  const lines = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    lines.push({
      text: l.text,
      bbox: l.bbox,
      words: (l.words || []).map((w) => ({ text: w.text, bbox: w.bbox, confidence: w.confidence })),
    });
  }
  return lines;
}

/**
 * Run the full pipeline on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {{mode?:'fast'|'thorough'|'max', onProgress?:(p:{pct:number,msg:string})=>void}} opts
 */
export async function recognizeLabel(canvas, opts = {}) {
  const mode = opts.mode || 'thorough';
  const report = (pct, msg) => opts.onProgress?.({ pct, msg });
  report(2, 'Loading OCR engine…');
  const worker = await getWorker();

  report(8, 'Cleaning up image…');
  let base = normalizeSize(canvas);
  let gray = grayOf(base);
  let bin = adaptive(gray);
  const angle = estimateSkew(bin);
  if (Math.abs(angle) >= 0.4) {
    base = rotateCanvas(base, -angle);
    gray = grayOf(base);
    bin = adaptive(gray);
  }
  const dark = meanOf(gray.g) < 105;
  const { mask, count: lineCount } = lineMask(bin);
  const hasLines = lineCount > 0;
  const vStretch = grayToCanvas(hasLines ? applyMask(stretch(gray, dark), mask) : stretch(gray, dark));
  const vAdaptive = grayToCanvas(hasLines ? applyMask(bin, mask) : bin);

  const passes = [{ img: vStretch, psm: '6', w: 1, name: 'contrast · block' }];
  if (mode !== 'fast') passes.push({ img: vAdaptive, psm: '6', w: 1, name: 'adaptive · block' }, { img: vStretch, psm: '4', w: 0.9, name: 'contrast · columns' });
  if (mode === 'max') {
    passes.push({ img: vAdaptive, psm: '11', w: 0.8, name: 'adaptive · sparse' });
    passes.push({ img: grayToCanvas(stretch(gray, !dark)), psm: '6', w: 0.6, name: 'inverted · block' });
  }

  let debugPasses = null;
  const parses = [];
  const weights = [];
  const rawTexts = [];
  const totalSteps = passes.length + 1;
  let step = 0;
  const run = async (p) => {
    const startPct = 10 + (step / totalSteps) * 85;
    progressCb = (m) => { if (m.status === 'recognizing text') report(startPct + (m.progress * 85) / totalSteps, `Reading label (${p.name})…`); };
    await worker.setParameters({ tessedit_pageseg_mode: p.psm, preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const { data } = await worker.recognize(await toBlob(p.img), {}, { blocks: true, text: true });
    step++;
    const lines = flattenLines(data);
    const parsed = parseOcr({ lines, width: p.img.width, height: p.img.height });
    if (opts.debug) (debugPasses ||= []).push({ name: p.name, lines, width: p.img.width, height: p.img.height, img: opts.debug === 'img' ? p.img.toDataURL('image/png') : undefined });
    return { parsed, text: data.text, conf: data.confidence };
  };

  for (const p of passes) {
    const r = await run(p);
    parses.push(r.parsed); weights.push(p.w * (0.6 + (r.conf || 60) / 250)); rawTexts.push(r.text);
    // early exit in thorough mode if the first two passes agree and look complete
    if (mode === 'thorough' && parses.length === 2) {
      const f = finalize(parses, weights);
      if (f.score >= 10 && f.columns[0] && Object.values(f.columns[0].conf).every((c) => c > 0.55)) break;
    }
  }
  let result = finalize(parses, weights);

  // Orientation fallback: photo may be sideways / upside down.
  if (result.score < 5) {
    for (const rot of [90, 270, 180]) {
      report(92, `Trying rotated ${rot}°…`);
      const rc = rotateCanvas(vStretch, rot);
      const r = await run({ img: rc, psm: '6', w: 1, name: `rotated ${rot}°` });
      const f = finalize([r.parsed]);
      if (f.score > result.score + 2) {
        result = f; rawTexts.push(r.text);
        if (mode !== 'fast') {
          const r2 = await run({ img: rotateCanvas(vAdaptive, rot), psm: '6', w: 1, name: `rotated ${rot}° adaptive` });
          result = finalize([r.parsed, r2.parsed]);
        }
        result.rotated = rot;
        break;
      }
    }
  }
  progressCb = null;
  report(100, 'Done');
  result.skew = angle;
  result.passes = parses.length;
  result.rawText = rawTexts.join('\n\n— pass —\n\n');
  if (debugPasses) result.debugPasses = debugPasses;
  return result;
}

export { scoreResult };
