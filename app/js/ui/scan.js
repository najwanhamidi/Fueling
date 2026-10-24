// Image acquisition (camera / gallery / webcam / paste / drop), crop & rotate, OCR run, review.
import { modal, esc, $, $$, toast, fmt } from '../ui.js';
import { fileToCanvas, rotateCanvas, cropCanvas, recognizeLabel } from '../ocr/ocr.js';
import { aiExtract, AI_PROVIDERS } from '../ocr/ai.js';
import { settings, foods } from '../store.js';
import { openFoodEditor } from './foodEditor.js';
import { foodShortFacts, normalizeFood } from '../nutrients.js';

export function pickFile(source) {
  const input = document.getElementById(source === 'camera' ? 'file-camera' : 'file-gallery');
  return new Promise((resolve) => {
    const done = (f) => { input.onchange = null; input.oncancel = null; resolve(f); };
    input.value = '';
    input.onchange = () => done(input.files && input.files[0] ? input.files[0] : null);
    input.oncancel = () => done(null);
    input.click();
  });
}

export async function webcamCapture() {
  if (!navigator.mediaDevices?.getUserMedia) { toast('Camera not available in this browser', 'bad'); return null; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false });
  } catch (e) { toast('Camera permission denied', 'bad'); return null; }
  let video;
  const res = await modal({
    title: 'Point the camera at the nutrition label',
    render: (b) => {
      b.innerHTML = `<video class="webcam" autoplay playsinline muted></video><p class="tiny muted">Fill the frame with the table, keep it flat and avoid glare.</p>`;
      video = $('video', b);
      video.srcObject = stream;
    },
    actions: [
      { label: 'Cancel', value: null },
      {
        label: 'Capture', kind: 'primary', onClick: (close) => {
          const c = document.createElement('canvas');
          c.width = video.videoWidth; c.height = video.videoHeight;
          c.getContext('2d').drawImage(video, 0, 0);
          close(c);
        },
      },
    ],
  });
  stream.getTracks().forEach((t) => t.stop());
  return res || null;
}

/** Crop / rotate modal. Resolves {canvas, useAi} or null. */
export function cropModal(src) {
  let rot = 0, tilt = 0;
  let work = src;
  let rect = { x: 0.02, y: 0.02, w: 0.96, h: 0.96 };
  const st = settings.get();
  const aiReady = st.aiProvider !== 'none' && st.aiKey;
  return modal({
    title: 'Crop to the nutrition table',
    wide: true,
    render: (body) => {
      body.innerHTML = `
        <div class="stack">
          <div class="crop-wrap"><canvas></canvas><div class="crop-rect"><i class="h tl" data-h="tl"></i><i class="h tr" data-h="tr"></i><i class="h bl" data-h="bl"></i><i class="h br" data-h="br"></i></div></div>
          <div class="row">
            <button class="btn small" data-rot="-90">⟲ 90°</button>
            <button class="btn small" data-rot="90">⟳ 90°</button>
            <button class="btn small" data-full>Full image</button>
            <label class="row small grow" style="min-width:200px"><span class="muted">Straighten</span><input type="range" min="-15" max="15" step="0.5" value="0" data-tilt class="grow"><span data-tv class="num">0°</span></label>
          </div>
          <p class="tiny muted">Tip: crop tightly around the table, including its header row ("per 100 g / per serving"). Small tilts are corrected automatically.</p>
        </div>`;
      const wrap = $('.crop-wrap', body);
      const cv = $('canvas', wrap);
      const box = $('.crop-rect', wrap);
      const redraw = () => {
        work = rot || tilt ? rotateCanvas(src, rot + tilt) : src;
        const s = Math.min(1, 1100 / Math.max(work.width, work.height));
        cv.width = Math.round(work.width * s); cv.height = Math.round(work.height * s);
        cv.getContext('2d').drawImage(work, 0, 0, cv.width, cv.height);
        place();
      };
      const place = () => {
        box.style.left = rect.x * 100 + '%'; box.style.top = rect.y * 100 + '%';
        box.style.width = rect.w * 100 + '%'; box.style.height = rect.h * 100 + '%';
      };
      redraw();
      $$('[data-rot]', body).forEach((b) => (b.onclick = () => { rot = (rot + +b.dataset.rot + 360) % 360; rect = { x: 0.02, y: 0.02, w: 0.96, h: 0.96 }; redraw(); }));
      $('[data-full]', body).onclick = () => { rect = { x: 0, y: 0, w: 1, h: 1 }; place(); };
      const tiltEl = $('[data-tilt]', body);
      tiltEl.oninput = () => { tilt = +tiltEl.value; $('[data-tv]', body).textContent = `${tilt}°`; redraw(); };

      let drag = null;
      const onDown = (e) => {
        const h = e.target.dataset.h || 'move';
        drag = { h, sx: e.clientX, sy: e.clientY, r: { ...rect }, W: wrap.clientWidth, H: wrap.clientHeight };
        box.setPointerCapture?.(e.pointerId);
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!drag) return;
        const dx = (e.clientX - drag.sx) / drag.W, dy = (e.clientY - drag.sy) / drag.H;
        const r = { ...drag.r };
        const min = 0.05;
        if (drag.h === 'move') { r.x = clamp(r.x + dx, 0, 1 - r.w); r.y = clamp(r.y + dy, 0, 1 - r.h); }
        if (drag.h.includes('l')) { const nx = clamp(r.x + dx, 0, r.x + r.w - min); r.w += r.x - nx; r.x = nx; }
        if (drag.h.includes('r')) r.w = clamp(r.w + dx, min, 1 - r.x);
        if (drag.h.includes('t')) { const ny = clamp(r.y + dy, 0, r.y + r.h - min); r.h += r.y - ny; r.y = ny; }
        if (drag.h.includes('b')) r.h = clamp(r.h + dy, min, 1 - r.y);
        rect = r; place();
      };
      box.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', () => (drag = null));
    },
    actions: [
      { label: 'Cancel', value: null },
      ...(aiReady ? [{ label: `Read with AI`, onClick: (close) => close({ canvas: doCrop(), useAi: true }) }] : []),
      { label: 'Read label', kind: 'primary', onClick: (close) => close({ canvas: doCrop(), useAi: aiReady && st.aiAlways }) },
    ],
  });
  function doCrop() {
    return cropCanvas(work, { x: rect.x * work.width, y: rect.y * work.height, w: rect.w * work.width, h: rect.h * work.height });
  }
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Run OCR (or AI) with a progress dialog. */
async function runRecognition(canvas, useAi) {
  const st = settings.get();
  let closeFn;
  let bar, msg;
  modal({
    title: 'Reading label…', dismissable: false,
    render: (b, close) => {
      closeFn = close;
      b.innerHTML = `<div class="stack"><div class="progress"><i></i></div><div class="small muted" data-msg>Starting…</div>
      <p class="tiny muted">Runs on your device, so nothing is uploaded${useAi ? ', except the image sent to your AI provider' : ''}. The first run downloads the OCR model (~3 MB), then works offline.</p></div>`;
      bar = $('.progress > i', b); msg = $('[data-msg]', b);
    },
  });
  const onProgress = ({ pct, msg: m }) => { if (bar) bar.style.width = `${Math.round(pct)}%`; if (msg) msg.textContent = m; };
  try {
    if (useAi) {
      try {
        onProgress({ pct: 30, msg: `Asking ${AI_PROVIDERS[st.aiProvider]?.label || 'AI'}…` });
        const r = await aiExtract(canvas, { provider: st.aiProvider, key: st.aiKey, model: st.aiModel });
        if (r.columns.length) return r;
        toast('AI returned no values, falling back to on-device OCR');
      } catch (e) {
        toast(`AI failed: ${e.message}. Using on-device OCR`, 'bad');
      }
    }
    return await recognizeLabel(canvas, { mode: st.ocrMode, onProgress });
  } finally {
    closeFn?.();
  }
}

/**
 * Full scan flow → resolves to a food object (or null).
 * @param {'camera'|'gallery'|'webcam'} source
 * @param {File} [file] optional file (drag & drop / paste)
 */
export async function scanLabel(source, file) {
  try {
    let canvas;
    if (file) canvas = await fileToCanvas(file);
    else if (source === 'webcam') canvas = await webcamCapture();
    else {
      const f = await pickFile(source);
      if (!f) return null;
      canvas = await fileToCanvas(f);
    }
    if (!canvas) return null;
    const crop = await cropModal(canvas);
    if (!crop) return null;
    const result = await runRecognition(crop.canvas, crop.useAi);
    const thumb = thumbUrl(crop.canvas);
    if (!result.columns.length) toast('No nutrition values recognised. Try a tighter crop, better light, or type them in', 'bad');
    return await openFoodEditor(null, { ocr: result, imageUrl: thumb, title: 'Check the detected values' });
  } catch (e) {
    console.error(e);
    toast(`Scan failed: ${e.message || e}`, 'bad');
    return null;
  }
}

function thumbUrl(c) {
  const s = Math.min(1, 900 / Math.max(c.width, c.height));
  const t = document.createElement('canvas');
  t.width = Math.round(c.width * s); t.height = Math.round(c.height * s);
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.75);
}

/** Library picker. */
export function pickFood({ title = 'Choose from library' } = {}) {
  return modal({
    title,
    render: (body, close) => {
      body.innerHTML = `<div class="stack"><input type="search" placeholder="Search saved foods…" data-q><div class="list" data-list></div></div>`;
      const q = $('[data-q]', body), list = $('[data-list]', body);
      const draw = () => {
        const term = q.value.trim().toLowerCase();
        const items = foods.all().filter((f) => !term || `${f.name} ${f.brand}`.toLowerCase().includes(term));
        list.innerHTML = items.length ? items.map((f) => `<div class="list-item" data-id="${f.id}"><div class="grow"><div class="t1">${esc(f.name)} ${f.brand ? `<span class="muted small">· ${esc(f.brand)}</span>` : ''}</div><div class="t2">${esc(foodShortFacts(f))}</div></div><span class="muted">›</span></div>`).join('')
          : `<div class="empty">No saved foods yet. Scan a label or enter one manually and save it to your library.</div>`;
      };
      q.oninput = draw;
      list.onclick = (e) => { const it = e.target.closest('[data-id]'); if (it) close(normalizeFood(foods.get(it.dataset.id))); };
      draw();
      setTimeout(() => q.focus(), 50);
    },
  });
}

/* ---------------- food source buttons ---------------- */
let activeTarget = null;
export function setImageTarget(fn) { activeTarget = fn; }
export function getImageTarget() { return activeTarget; }

const canWebcam = () => !!navigator.mediaDevices?.getUserMedia && matchMedia('(pointer: fine)').matches;

export function sourceButtons(id = '') {
  return `<div class="btn-grid" data-src="${esc(id)}">
    <button class="btn source-btn" data-act="camera"><span class="ico">📷</span>Camera</button>
    <button class="btn source-btn" data-act="gallery"><span class="ico">🖼️</span>Gallery / file</button>
    ${canWebcam() ? '<button class="btn source-btn" data-act="webcam"><span class="ico">🎥</span>Webcam</button>' : ''}
    <button class="btn source-btn" data-act="manual"><span class="ico">✍️</span>Manual</button>
    <button class="btn source-btn" data-act="library"><span class="ico">📚</span>Library</button>
  </div>
  ${matchMedia('(pointer: fine)').matches ? `<div class="drop-hint" data-drop="${esc(id)}">…or drop / paste (Ctrl+V) a label image here</div>` : ''}`;
}

/** Wire up a sourceButtons() block. onFood(food) receives the result. */
export function bindSource(root, id, onFood, { initial } = {}) {
  const grid = root.querySelector(`[data-src="${CSS.escape(id)}"]`);
  if (!grid) return;
  const handleFile = async (file) => { const f = await scanLabel('gallery', file); if (f) onFood(f); };
  const target = () => setImageTarget(handleFile);
  grid.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    target();
    const act = b.dataset.act;
    let food = null;
    if (act === 'camera' || act === 'gallery' || act === 'webcam') food = await scanLabel(act);
    else if (act === 'manual') food = await openFoodEditor(initial?.() || null, { title: 'Enter nutrition facts' });
    else if (act === 'library') food = await pickFood();
    if (food) onFood(food);
  });
  grid.addEventListener('pointerenter', target);
  const drop = root.querySelector(`[data-drop="${CSS.escape(id)}"]`);
  if (drop) {
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('over');
      const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
      if (file) { target(); handleFile(file); }
    });
    drop.addEventListener('pointerenter', target);
  }
  if (!activeTarget) target();
}

export function foodSummaryHtml(food, { actions = true } = {}) {
  if (!food) return '';
  return `<div class="food-summary">
    <div class="grow"><div class="name">${esc(food.name || 'Unnamed')}${food.id ? ' <span class="badge good">saved</span>' : ''}</div>
    <div class="meta">${esc(foodShortFacts(food))}${food.servingSize ? ` · serving ${fmt(food.servingSize, food.basisUnit)}` : ''}</div></div>
    ${actions ? `<div class="actions"><button class="btn small" data-food-act="edit">Edit</button><button class="btn small ghost" data-food-act="clear" title="Remove">✕</button></div>` : ''}
  </div>`;
}
