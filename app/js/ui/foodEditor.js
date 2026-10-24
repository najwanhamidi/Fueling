// Food (nutrition facts) editor modal — used for manual entry, OCR review and library edits.
import { modal, esc, num, fmt, $, $$, toast } from '../ui.js';
import { NUTRIENTS, normalizeFood, emptyFood, KJ_PER_KCAL, SODIUM_MG_PER_SALT_G, atwater } from '../nutrients.js';
import { foods } from '../store.js';
import { columnToFood } from '../ocr/parser.js';

const CORE = ['carbs', 'sugars', 'protein', 'fat', 'sodium'];
const EXTRA = ['fiber', 'satFat', 'transFat', 'addedSugars', 'cholesterol', 'potassium', 'caffeine'];

/**
 * @param {object} food initial food (or null)
 * @param {{title?:string, ocr?:object, imageUrl?:string, save?:boolean, saveLabel?:string}} opts
 * @returns {Promise<object|null>}
 */
export function openFoodEditor(food, opts = {}) {
  let f = normalizeFood(food || emptyFood());
  const isEdit = !!f.id && !opts.ocr;
  let energyUnit = 'kcal';
  let sodiumMode = 'mg';
  let conf = {};
  let derived = {};
  let colIdx = 0;

  if (opts.ocr && opts.ocr.columns?.length) {
    const fromOcr = columnToFood(opts.ocr, 0);
    if (fromOcr) {
      f = normalizeFood({ ...f, ...fromOcr, name: f.name || opts.ocr.productName || '' });
      conf = fromOcr._conf || {};
      derived = fromOcr._derived || {};
    }
  }

  return modal({
    title: opts.title || (isEdit ? 'Edit nutrition facts' : 'Nutrition facts'),
    wide: true,
    render: (body, close) => {
      const draw = () => {
        const ocr = opts.ocr;
        const colSeg = ocr && ocr.columns.length > 1
          ? `<div class="stack"><div class="small muted">Label column to use</div><div class="seg" data-cols>${ocr.columns.map((c, i) => `<button type="button" data-ci="${i}" class="${i === colIdx ? 'active' : ''}">${esc(colName(c, ocr))}</button>`).join('')}</div></div>`
          : '';
        const lowCount = Object.entries(conf).filter(([, c]) => c < 0.5).length;
        body.innerHTML = `
        <div class="stack">
          ${ocr ? `<div class="note ${ocr.score >= 8 ? 'good' : 'warn'}">
              ${ocr.source === 'ai' ? 'Read with AI vision.' : `Read with on-device OCR (${ocr.passes || 1} pass${(ocr.passes || 1) > 1 ? 'es' : ''}${ocr.rotated ? `, rotated ${ocr.rotated}°` : ''}).`}
              Green outline = detected; <b>amber = low confidence</b>, please check against the photo${lowCount ? ` (${lowCount} to check)` : ''}. Empty = not found, so type it if you know it.
              ${ocr.inferredServing ? '<br>Serving size was inferred from the column ratio.' : ''}
              ${f._needsServing || (ocr.columns[colIdx]?.type === 'serving' && !ocr.servingSize) ? '<br><b>These values are per serving, but the serving size was not found. Enter it below.</b>' : ''}
            </div>` : ''}
          <div class="cols-2">
            <div class="stack">
              ${opts.imageUrl ? `<img src="${opts.imageUrl}" alt="Label photo" style="width:100%;max-height:340px;object-fit:contain;border-radius:10px;background:#000">` : ''}
              ${colSeg}
              <div class="fields">
                <label class="field"><span class="lbl">Name</span><input type="text" data-f="name" value="${esc(f.name)}" placeholder="e.g. Maltodextrin"></label>
                <label class="field"><span class="lbl">Brand (optional)</span><input type="text" data-f="brand" value="${esc(f.brand)}"></label>
              </div>
              <div class="fields">
                <label class="field"><span class="lbl">Values are per</span><div class="row nowrap"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" step="any" data-f="basis" value="${f.basis}"><select data-f="basisUnit" style="width:84px"><option value="g" ${f.basisUnit === 'g' ? 'selected' : ''}>g</option><option value="ml" ${f.basisUnit === 'ml' ? 'selected' : ''}>ml</option></select></div></label>
                <label class="field"><span class="lbl">Serving size <span class="muted">optional</span></span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" step="any" data-f="servingSize" value="${f.servingSize ?? ''}" placeholder="e.g. 40"><span class="u">${esc(f.basisUnit)}</span></div></label>
                <label class="field"><span class="lbl">Serving name</span><input type="text" data-f="servingName" value="${esc(f.servingName || '')}" placeholder="gel, scoop, sachet…"></label>
              </div>
              ${ocr ? `<details class="more"><summary>Recognised text</summary><div class="inner"><textarea readonly rows="8">${esc(ocr.rawText || ocr.text || '')}</textarea></div></details>` : ''}
            </div>
            <div class="stack">
              <div class="row"><b>Energy</b><span class="spacer"></span><div class="seg" data-eu><button type="button" data-v="kcal" class="${energyUnit === 'kcal' ? 'active' : ''}">kcal</button><button type="button" data-v="kj" class="${energyUnit === 'kj' ? 'active' : ''}">kJ</button></div></div>
              <div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" step="any" data-n="energyKcal" class="${cls('energyKcal')}" value="${energyVal()}" placeholder="unknown"><span class="u">${energyUnit === 'kcal' ? 'kcal' : 'kJ'}</span></div>
              <div data-atw></div>
              <div class="fields tight">
                ${CORE.map((k) => field(k)).join('')}
              </div>
              <div class="row small"><span class="muted">Sodium entry:</span><div class="seg" data-sm><button type="button" data-v="mg" class="${sodiumMode === 'mg' ? 'active' : ''}">Sodium mg</button><button type="button" data-v="salt" class="${sodiumMode === 'salt' ? 'active' : ''}">Salt g</button></div></div>
              <details class="more" ${EXTRA.some((k) => f.n[k] != null) ? 'open' : ''}><summary>More nutrients</summary><div class="inner"><div class="fields tight">${EXTRA.map((k) => field(k)).join('')}</div></div></details>
              <p class="tiny muted">Leave any field blank if it's not on the label. Partial facts are fine; totals will show "—" or "≥".</p>
            </div>
          </div>
        </div>`;
        bind();
        updateAtwater();
      };

      const cls = (k) => (conf[k] == null ? '' : conf[k] < 0.5 || derived[k] ? 'lowconf' : 'detected');
      const energyVal = () => (f.n.energyKcal == null ? '' : energyUnit === 'kcal' ? +f.n.energyKcal.toFixed(1) : +(f.n.energyKcal * KJ_PER_KCAL).toFixed(0));
      const field = (k) => {
        const d = NUTRIENTS.find((n) => n.k === k);
        let v = f.n[k];
        let unit = d.unit;
        let label = d.label;
        if (k === 'sodium' && sodiumMode === 'salt') { unit = 'g'; label = 'Salt'; v = v == null ? null : +(v / SODIUM_MG_PER_SALT_G).toFixed(3); }
        return `<label class="field"><span class="lbl">${esc(label)}</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" step="any" data-n="${k}" class="${cls(k)}" value="${v ?? ''}" placeholder="—"><span class="u">${unit}</span></div></label>`;
      };

      const updateAtwater = () => {
        const el = $('[data-atw]', body);
        if (!el) return;
        const est = atwater(f.n);
        if (est == null || (f.n.carbs == null || f.n.protein == null || f.n.fat == null)) { el.innerHTML = ''; return; }
        if (f.n.energyKcal == null) {
          el.innerHTML = `<div class="note small">Estimated from macros: <b>${fmt(est, 'kcal', { d: 0 })}</b> <button class="btn small" data-use-est>Use</button></div>`;
          $('[data-use-est]', el).onclick = () => { f.n.energyKcal = Math.round(est); draw(); };
        } else {
          const err = Math.abs(f.n.energyKcal - est) / Math.max(f.n.energyKcal, est, 20);
          el.innerHTML = err > 0.2
            ? `<div class="note warn small">Energy doesn't match the macros (${fmt(est, 'kcal', { d: 0 })} from 4·carbs + 4·protein + 9·fat). Please double-check (fibre and sugar alcohols can explain small gaps).</div>`
            : `<div class="tiny muted">✓ Energy matches the macros (${fmt(est, 'kcal', { d: 0 })}).</div>`;
        }
      };

      const bind = () => {
        $$('[data-f]', body).forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
          const k = el.dataset.f;
          f[k] = ['basis', 'servingSize'].includes(k) ? num(el.value) : el.value;
          if (k === 'basisUnit') draw();
        }));
        $$('[data-n]', body).forEach((el) => el.addEventListener('input', () => {
          const k = el.dataset.n;
          let v = num(el.value);
          if (k === 'energyKcal' && v != null && energyUnit === 'kj') v = v / KJ_PER_KCAL;
          if (k === 'sodium' && v != null && sodiumMode === 'salt') v = v * SODIUM_MG_PER_SALT_G;
          f.n[k] = v;
          el.classList.remove('detected', 'lowconf');
          delete conf[k];
          updateAtwater();
        }));
        $('[data-eu]', body).onclick = (e) => { const b = e.target.closest('button'); if (b) { energyUnit = b.dataset.v; draw(); } };
        $('[data-sm]', body).onclick = (e) => { const b = e.target.closest('button'); if (b) { sodiumMode = b.dataset.v; draw(); } };
        const cs = $('[data-cols]', body);
        if (cs) cs.onclick = (e) => {
          const b = e.target.closest('button[data-ci]');
          if (!b) return;
          colIdx = +b.dataset.ci;
          const fo = columnToFood(opts.ocr, colIdx);
          f = normalizeFood({ ...f, ...fo, name: f.name, brand: f.brand });
          f._needsServing = fo._needsServing;
          conf = fo._conf || {}; derived = fo._derived || {};
          draw();
        };
      };
      draw();
    },
    actions: [
      { label: 'Cancel', value: null },
      ...(isEdit ? [] : [{
        label: 'Use only', onClick: (close) => close(finish(false)),
      }]),
      {
        label: isEdit ? 'Save changes' : (opts.saveLabel || 'Save to library & use'), kind: 'primary',
        onClick: (close) => {
          const out = finish(true);
          if (out) close(out);
        },
      },
    ],
  });

  function finish(save) {
    const out = normalizeFood(f);
    delete out._conf; delete out._derived; delete out._needsServing;
    if (!out.name) out.name = out.brand || (out.n.carbs != null ? `Food (${fmt(out.n.carbs, 'g')} carbs / ${out.basis}${out.basisUnit})` : 'Unnamed food');
    if (!(out.basis > 0)) { toast('Enter what amount the values are per', 'bad'); return null; }
    if (save) {
      const rec = foods.upsert(out);
      out.id = rec.id;
      toast(isEdit ? 'Saved' : 'Saved to library', 'good');
    }
    return out;
  }
}

function colName(c, ocr) {
  if (c.type === 'per100') return `Per 100 ${c.unit || 'g'}`;
  if (c.type === 'serving') return `Per serving${ocr.servingSize ? ` (${ocr.servingSize} ${ocr.servingUnit || 'g'})` : ''}`;
  return c.label || c.type;
}
