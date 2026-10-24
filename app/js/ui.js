// Small DOM / UI helpers shared by all views.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function num(v) {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function round(v, d = 1) {
  if (v == null || !Number.isFinite(v)) return v;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/** Smart number formatting: fewer decimals for bigger values. */
export function fmt(v, unit = '', opts = {}) {
  if (v == null || !Number.isFinite(v)) return opts.dash ?? '—';
  let d = opts.d;
  if (d == null) {
    const a = Math.abs(v);
    d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 1 : a === 0 ? 0 : 2;
    if (unit === 'mg' || unit === 'kcal') d = a >= 10 ? 0 : d;
  }
  let s = round(v, d).toFixed(d);
  if (d > 0 && opts.trim !== false) s = s.replace(/\.?0+$/, '');
  return unit ? `${s} ${unit}` : s;
}

export function fmtDur(min, { sign = false } = {}) {
  if (min == null || !Number.isFinite(min)) return '—';
  const neg = min < 0;
  const m = Math.round(Math.abs(min));
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const s = h ? `${h}:${mm}` : `0:${mm}`;
  return (neg ? '−' : sign ? '+' : '') + s;
}

export function parseDur(str) {
  // accepts "2:45", "2:45:30", "165" (minutes), "2h45", "2.5h"
  if (str == null) return null;
  const s = String(str).trim().toLowerCase();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/))) return +m[1] * 60 + +m[2] + +m[3] / 60;
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) return +m[1] * 60 + +m[2];
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*m?)?$/))) return +m[1] * 60 + (m[2] ? +m[2] : 0);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*m?(in)?$/))) return +m[1];
  return null;
}

export function fmtPace(secPerKm) {
  if (!secPerKm || !Number.isFinite(secPerKm)) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}
export function parsePace(str) {
  const m = String(str || '').trim().match(/^(\d+):(\d{1,2})$/);
  if (m) return +m[1] * 60 + +m[2];
  const n = num(str);
  return n ? n * 60 : null;
}

export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/**
 * Open a modal. `render(body, close)` fills it. Returns a promise resolved with close(value).
 * actions: [{label, kind, value, onClick(close) }]
 */
export function modal({ title, render, actions = [], wide = false, dismissable = true }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2>${dismissable ? '<button class="icon-btn" data-x aria-label="Close">✕</button>' : ''}</div>
      <div class="modal-body"></div>
      <div class="modal-foot"></div></div>`;
    root.appendChild(back);
    const body = back.querySelector('.modal-body');
    const foot = back.querySelector('.modal-foot');
    let done = false;
    const close = (val) => {
      if (done) return; done = true;
      back.remove();
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(undefined); };
    document.addEventListener('keydown', onKey);
    if (dismissable) {
      back.querySelector('[data-x]').onclick = () => close(undefined);
      back.addEventListener('mousedown', (e) => { if (e.target === back) close(undefined); });
    }
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = `btn ${a.kind || ''}`;
      b.textContent = a.label;
      b.onclick = () => (a.onClick ? a.onClick(close, body) : close(a.value));
      foot.appendChild(b);
    }
    if (!actions.length) foot.remove();
    render?.(body, close, foot);
  });
}

export function confirmBox(message, { ok = 'OK', danger = false } = {}) {
  return modal({
    title: 'Confirm',
    render: (b) => { b.innerHTML = `<p>${esc(message)}</p>`; },
    actions: [{ label: 'Cancel', value: false }, { label: ok, kind: danger ? 'primary danger' : 'primary', value: true }],
  });
}

export function promptBox(title, label, value = '') {
  return modal({
    title,
    render: (b) => {
      b.innerHTML = `<label class="field"><span class="lbl">${esc(label)}</span><input type="text" value="${esc(value)}" data-in></label>`;
      setTimeout(() => b.querySelector('[data-in]').focus(), 30);
    },
    actions: [
      { label: 'Cancel', value: null },
      { label: 'OK', kind: 'primary', onClick: (close, body) => close(body.querySelector('[data-in]').value.trim()) },
    ],
  });
}

export function downloadFile(name, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** Bind inputs with [data-k] inside root to object st; calls onChange after each edit. */
export function bindInputs(root, st, onChange) {
  for (const el of $$('[data-k]', root)) {
    const k = el.dataset.k;
    const val = getPath(st, k);
    if (el.type === 'checkbox') el.checked = !!val;
    else if (val != null) el.value = val;
    const ev = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.dataset.type === 'num' || el.type === 'number') v = num(el.value);
      else v = el.value;
      setPath(st, k, v);
      onChange?.(k, v, el);
    });
  }
}
export function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
export function setPath(o, path, v) {
  const ks = path.split('.');
  let cur = o;
  for (let i = 0; i < ks.length - 1; i++) { cur[ks[i]] ??= {}; cur = cur[ks[i]]; }
  cur[ks[ks.length - 1]] = v;
}

export function seg(name, options, active) {
  return `<div class="seg" data-seg="${esc(name)}">${options
    .map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${String(v) === String(active) ? 'active' : ''}">${esc(l)}</button>`)
    .join('')}</div>`;
}
export function bindSeg(root, name, onPick) {
  const el = root.querySelector(`[data-seg="${name}"]`);
  if (!el) return;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    el.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    onPick(b.dataset.v);
  });
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
