// Tab 2: multi-ingredient mixer with carb targets or ratio auto-calculation.
import { $, $$, esc, fmt, num, seg, bindSeg, toast, promptBox, modal, confirmBox } from '../ui.js';
import { viewState, recipes, foods, arsenal } from '../store.js';
import { amountForCarbs, combine, per100, renderLabel, normalizeFood, scaleFood } from '../nutrients.js';
import { sourceButtons, bindSource, foodSummaryHtml } from '../ui/scan.js';
import { openFoodEditor } from '../ui/foodEditor.js';

export const RATIO_TEMPLATES = [
  { id: '1:0.8', n: 2, r: [1, 0.8], label: '1 : 0.8', hint: 'Glucose/maltodextrin : fructose, the current "high-carb" blend (≈ 90–120 g/h)' },
  { id: '2:1', n: 2, r: [1, 0.5], label: '2 : 1', hint: 'Glucose/maltodextrin : fructose, the classic dual-source blend (≥ 60–90 g/h)' },
  { id: '1:1', n: 2, r: [1, 1], label: '1 : 1', hint: 'Equal parts (e.g. glucose : fructose, or what sucrose gives on its own)' },
  { id: '0.8:1', n: 2, r: [0.8, 1], label: '0.8 : 1', hint: 'Slightly fructose-dominant' },
  { id: '1:0.6', n: 2, r: [1, 0.6], label: '1 : 0.6', hint: 'Low end of the 0.6–1.0 fructose:glucose range' },
  { id: '3:1', n: 2, r: [1, 1 / 3], label: '3 : 1', hint: 'Glucose-dominant' },
  { id: 'mdf-0.8', n: 3, r: [1, 1, 1.6], label: '1 : 1 : 1.6', hint: 'Maltodextrin : dextrose : fructose, which gives glucose : fructose 1 : 0.8' },
  { id: 'mdf-2:1', n: 3, r: [1, 1, 1], label: '1 : 1 : 1', hint: 'Maltodextrin : dextrose : fructose, which gives glucose : fructose 2 : 1' },
  { id: 'msf', n: 3, r: [1, 0.5, 0.5], label: '1 : 0.5 : 0.5', hint: 'Maltodextrin : sucrose : fructose, which gives glucose : fructose ≈ 1 : 0.6' },
  { id: 'mdfs', n: 4, r: [1, 0.5, 0.9, 0.5], label: '1 : 0.5 : 0.9 : 0.5', hint: 'Malto : dextrose : fructose : sucrose, which gives glucose : fructose ≈ 1 : 0.65' },
];

// Generic DIY ingredients (approximate, typical label values per 100 g; check your own product).
export const GENERIC = [
  { name: 'Maltodextrin (generic)', n: { carbs: 95, sugars: 5, energyKcal: 380, protein: 0, fat: 0, sodium: 50 }, ctype: 'glucose' },
  { name: 'Dextrose / glucose (generic)', n: { carbs: 91, sugars: 91, energyKcal: 364, protein: 0, fat: 0, sodium: 0 }, ctype: 'glucose' },
  { name: 'Fructose (generic)', n: { carbs: 100, sugars: 100, energyKcal: 400, protein: 0, fat: 0, sodium: 0 }, ctype: 'fructose' },
  { name: 'Table sugar / sucrose', n: { carbs: 100, sugars: 100, energyKcal: 400, protein: 0, fat: 0, sodium: 0 }, ctype: 'sucrose' },
  { name: 'Honey (generic)', n: { carbs: 82, sugars: 82, energyKcal: 304, protein: 0.3, fat: 0, sodium: 4 }, ctype: 'honey' },
  { name: 'Table salt', n: { sodium: 39300, carbs: 0, energyKcal: 0, protein: 0, fat: 0 }, ctype: 'none' },
  { name: 'Water', n: { carbs: 0, energyKcal: 0, protein: 0, fat: 0, sodium: 0, sugars: 0 }, ctype: 'none' },
];

const CTYPES = { glucose: [1, 0], fructose: [0, 1], sucrose: [0.5, 0.5], honey: [0.45, 0.55], other: null, none: null };
function guessCType(name = '') {
  const s = name.toLowerCase();
  if (/fruct/.test(s)) return 'fructose';
  if (/malto|dextrose|glucose|dextrin|cluster|isomalto|vitargo|rice syrup|glukos/.test(s)) return 'glucose';
  if (/sucrose|table sugar|cane|gula pasir|\bsugar\b/.test(s)) return 'sucrose';
  if (/honey|madu/.test(s)) return 'honey';
  if (/salt|garam|water|air\b/.test(s)) return 'none';
  return 'other';
}

const newIng = () => ({ food: null, mode: 'carbs', carbs: 30, grams: null, ratio: 1, ctype: null });
const vs = viewState('mixer', {
  name: '', count: 2, ings: [newIng(), newIng()], ratioOn: false, ratioBasis: 'carbs', ratioTarget: 'first', ratioValue: 60,
  templateId: '', water: null, split: 'none', splitValue: null,
});

/** Compute grams per ingredient. Exported for tests. */
export function computeMix(st) {
  const ings = st.ings.slice(0, st.count);
  const out = ings.map((ing) => ({ ...ing, food: ing.food ? normalizeFood(ing.food) : null, g: null, c: null, err: null }));
  const carbDensity = (f) => (f && f.n.carbs != null ? f.n.carbs / f.basis : null);
  if (!st.ratioOn) {
    for (const o of out) {
      if (!o.food) continue;
      if (o.mode === 'grams') o.g = o.grams;
      else {
        if (!(o.food.n.carbs > 0)) { o.err = 'No carbs in this food: enter grams instead'; continue; }
        o.g = amountForCarbs(o.food, o.carbs);
      }
    }
  } else {
    const r1 = +out[0]?.ratio || 1;
    const T = st.ratioValue;
    // Ingredients without carbs (water, salt) are not part of the carb ratio → fixed grams.
    const inRatio = out.map((o) => o.food && (st.ratioBasis === 'weight' || carbDensity(o.food) > 0) && o.mode !== 'grams');
    for (let i = 0; i < out.length; i++) if (out[i].food && !inRatio[i]) out[i].g = out[i].grams;
    if (out[0].food && inRatio[0] && T > 0) {
      if (st.ratioBasis === 'carbs') {
        const sumR = out.reduce((a, o, i) => a + (inRatio[i] ? +o.ratio || 0 : 0), 0);
        out.forEach((o, i) => {
          if (!inRatio[i]) return;
          const c = st.ratioTarget === 'first' ? (T * (+o.ratio || 0)) / r1 : (T * (+o.ratio || 0)) / sumR;
          o.c = c;
          o.g = amountForCarbs(o.food, c);
        });
      } else {
        // weight ratio: g_i = (r_i/r1) * G1
        const d1 = carbDensity(out[0].food);
        let G1 = null;
        if (st.ratioTarget === 'first') G1 = d1 > 0 ? T / d1 : null;
        else {
          const k = out.reduce((a, o, i) => a + (inRatio[i] ? ((+o.ratio || 0) / r1) * (carbDensity(o.food) || 0) : 0), 0);
          G1 = k > 0 ? T / k : null;
        }
        if (G1 == null) out[0].err = 'First ingredient needs a carb value for this target';
        else out.forEach((o, i) => { if (inRatio[i]) o.g = ((+o.ratio || 0) / r1) * G1; });
      }
    } else if (out[0].food && !inRatio[0]) out[0].err = 'First ingredient must contain carbs to anchor the ratio';
  }
  for (const o of out) if (o.food && o.g != null && o.c == null) o.c = o.food.n.carbs != null ? (o.food.n.carbs * o.g) / o.food.basis : null;
  const items = out.filter((o) => o.food && o.g > 0).map((o) => ({ food: o.food, amount: o.g }));
  if (st.water > 0) items.push({ food: { basis: 100, n: {} }, amount: st.water, zero: true });
  const comb = combine(items);
  // glucose:fructose
  let G = 0, F = 0, unknownCarb = 0;
  for (const o of out) {
    if (!o.food || !(o.c > 0)) continue;
    const t = CTYPES[o.ctype || guessCType(o.food.name)];
    if (!t) { unknownCarb += o.c; continue; }
    G += o.c * t[0]; F += o.c * t[1];
  }
  return { out, comb, gf: G + F > 0 ? { G, F, unknownCarb } : null };
}

export function mount(root) {
  const st = vs.get();
  while (st.ings.length < 8) st.ings.push(newIng());

  const draw = () => {
    const templates = RATIO_TEMPLATES.filter((t) => t.n === st.count);
    root.innerHTML = `
    <div class="cols-2">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Mix setup</h2>
            <div class="row"><button class="btn small" data-load>Load</button><button class="btn small" data-save>Save</button><button class="btn small ghost" data-new>New</button></div></div>
          <div class="fields">
            <label class="field"><span class="lbl">Recipe name</span><input type="text" data-k="name" value="${esc(st.name || '')}" placeholder="e.g. 1:0.8 gel batch"></label>
            <label class="field"><span class="lbl">Number of ingredients</span>
              <div class="row nowrap"><button class="btn" data-cnt="-1">−</button><input type="number" min="2" max="8" value="${st.count}" data-count style="text-align:center"><button class="btn" data-cnt="1">+</button></div></label>
          </div>
          <div style="margin-top:14px" class="stack">
            <label class="switch"><input type="checkbox" data-ratio ${st.ratioOn ? 'checked' : ''}> Auto-calculate ingredients 2…${st.count} from a ratio to ingredient 1</label>
            ${st.ratioOn ? `
              <div class="card sub stack">
                <div><div class="small muted" style="margin-bottom:6px">Ratio templates (energy gels / drink mixes)</div>
                  <div class="chips">${templates.map((t) => `<button class="chip ${st.templateId === t.id ? 'active' : ''}" data-tpl="${t.id}" title="${esc(t.hint)}">${esc(t.label)}</button>`).join('')}<button class="chip ${st.templateId === 'equal' ? 'active' : ''}" data-tpl="equal">Equal parts</button></div>
                  ${st.templateId && RATIO_TEMPLATES.find((t) => t.id === st.templateId) ? `<div class="tiny muted" style="margin-top:6px">${esc(RATIO_TEMPLATES.find((t) => t.id === st.templateId).hint)}</div>` : ''}
                </div>
                <div class="row"><span class="small muted">Ratio by</span>${seg('rbasis', [['carbs', 'Carbohydrate'], ['weight', 'Weight']], st.ratioBasis)}</div>
                <div class="fields">
                  <label class="field"><span class="lbl">Target</span><select data-k="ratioTarget">
                    <option value="first" ${st.ratioTarget === 'first' ? 'selected' : ''}>Carbs from ingredient 1</option>
                    <option value="total" ${st.ratioTarget === 'total' ? 'selected' : ''}>Total carbs of the mix</option></select></label>
                  <label class="field"><span class="lbl">Carbs</span><div class="input-unit"><input type="number" inputmode="decimal" step="any" data-k="ratioValue" value="${st.ratioValue ?? ''}"><span class="u">g</span></div></label>
                </div>
                <div class="tiny muted">Set each ingredient's ratio value below (ingredient 1 is the reference). Zero-carb items (water, salt) use fixed grams.</div>
              </div>` : ''}
          </div>
        </div>
        <div class="stack" data-ings></div>
        <div class="card">
          <h3>Extras</h3>
          <div class="fields">
            <label class="field"><span class="lbl">Add water <span class="muted">optional</span></span><div class="input-unit"><input type="number" inputmode="decimal" step="any" data-k="water" value="${st.water ?? ''}" placeholder="0"><span class="u">g/ml</span></div></label>
            <label class="field"><span class="lbl">Split into servings</span><select data-k="split">
              <option value="none" ${st.split === 'none' ? 'selected' : ''}>No</option>
              <option value="count" ${st.split === 'count' ? 'selected' : ''}>Number of servings</option>
              <option value="carbs" ${st.split === 'carbs' ? 'selected' : ''}>Carbs per serving</option></select></label>
            ${st.split !== 'none' ? `<label class="field"><span class="lbl">${st.split === 'count' ? 'Servings' : 'Carbs / serving'}</span><div class="input-unit"><input type="number" inputmode="decimal" step="any" data-k="splitValue" value="${st.splitValue ?? ''}"><span class="u">${st.split === 'count' ? '×' : 'g'}</span></div></label>` : ''}
          </div>
        </div>
      </div>
      <div class="stack" data-result></div>
    </div>`;
    bindTop();
    drawIngs();
    result();
  };

  const bindTop = () => {
    $$('[data-k]', root).forEach((el) => {
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        const k = el.dataset.k;
        st[k] = el.type === 'number' ? num(el.value) : el.value;
        vs.save();
        if (k === 'split' || k === 'ratioTarget') draw(); else { refreshIngGrams(); result(); }
      });
    });
    const setCount = (n) => { st.count = Math.max(2, Math.min(8, n || 2)); st.templateId = ''; vs.save(); draw(); };
    $$('[data-cnt]', root).forEach((b) => (b.onclick = () => setCount(st.count + +b.dataset.cnt)));
    $('[data-count]', root).onchange = (e) => setCount(+e.target.value);
    $('[data-ratio]', root).onchange = (e) => { st.ratioOn = e.target.checked; vs.save(); draw(); };
    bindSeg(root, 'rbasis', (v) => { st.ratioBasis = v; vs.save(); refreshIngGrams(); result(); });
    $$('[data-tpl]', root).forEach((b) => (b.onclick = () => {
      const id = b.dataset.tpl;
      st.templateId = id;
      const t = RATIO_TEMPLATES.find((x) => x.id === id);
      for (let i = 0; i < st.count; i++) st.ings[i].ratio = t ? t.r[i] ?? 1 : 1;
      st.ratioBasis = 'carbs';
      vs.save(); draw();
    }));
    $('[data-save]', root).onclick = saveRecipe;
    $('[data-load]', root).onclick = loadRecipe;
    $('[data-new]', root).onclick = async () => {
      if (!(await confirmBox('Start a new empty mix?'))) return;
      vs.reset(); Object.assign(st, vs.get()); while (st.ings.length < 8) st.ings.push(newIng()); draw();
    };
  };

  const drawIngs = () => {
    const box = $('[data-ings]', root);
    const { out } = computeMix(st);
    box.innerHTML = out.map((o, i) => {
      const ing = st.ings[i];
      const ratioField = st.ratioOn && i > 0 && ing.mode !== 'grams';
      const showCarbInput = !st.ratioOn && ing.mode === 'carbs';
      const showGramInput = ing.mode === 'grams' || (st.ratioOn && o.food && st.ratioBasis === 'carbs' && !(o.food.n.carbs > 0));
      return `<div class="ing" data-i="${i}">
        <div class="ing-head"><span class="ing-idx">${i + 1}</span><b>${o.food ? esc(o.food.name) : `Ingredient ${i + 1}`}</b>
          <div class="ing-grams"><div class="v" data-g>${o.g != null ? fmt(o.g, '', { d: o.g >= 100 ? 0 : 1 }) : '—'}</div><div class="k">${o.food?.basisUnit || 'g'} needed</div></div></div>
        ${o.food ? foodSummaryHtml(o.food) : `${sourceButtons('ing' + i)}
          <select data-generic="${i}" style="margin-top:6px"><option value="">…or a generic ingredient (approx. values)</option>${GENERIC.map((g, gi) => `<option value="${gi}">${esc(g.name)}</option>`).join('')}</select>`}
        ${o.food ? `<div class="fields tight">
          ${st.ratioOn ? (i === 0 ? `<div class="field"><span class="lbl">Ratio</span><input type="number" step="any" data-ing="ratio" value="${ing.ratio ?? 1}"></div>` : (ratioField ? `<label class="field"><span class="lbl">Ratio to #1</span><input type="number" inputmode="decimal" step="any" data-ing="ratio" value="${ing.ratio ?? 1}"></label>` : '')) : ''}
          ${!st.ratioOn || i > 0 ? `<label class="field"><span class="lbl">Input as</span><select data-ing="mode"><option value="carbs" ${ing.mode !== 'grams' ? 'selected' : ''}>${st.ratioOn ? 'By ratio' : 'Carbs (g)'}</option><option value="grams" ${ing.mode === 'grams' ? 'selected' : ''}>Fixed grams</option></select></label>` : ''}
          ${showCarbInput ? `<label class="field"><span class="lbl">Carbs required</span><div class="input-unit"><input type="number" inputmode="decimal" step="any" data-ing="carbs" value="${ing.carbs ?? ''}"><span class="u">g</span></div></label>` : ''}
          ${showGramInput ? `<label class="field"><span class="lbl">Amount</span><div class="input-unit"><input type="number" inputmode="decimal" step="any" data-ing="grams" value="${ing.grams ?? ''}"><span class="u">${o.food.basisUnit}</span></div></label>` : ''}
          <label class="field"><span class="lbl">Carb type</span><select data-ing="ctype">${Object.keys(CTYPES).map((k) => `<option value="${k}" ${(ing.ctype || guessCType(o.food.name)) === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        </div>
        <div class="small muted" data-c>${o.c != null ? `→ ${fmt(o.c, 'g')} carbs` : ''}${o.err ? ` <span class="badge warn">${esc(o.err)}</span>` : ''}</div>` : ''}
      </div>`;
    }).join('');
    out.forEach((o, i) => {
      const card = box.querySelector(`[data-i="${i}"]`);
      const ing = st.ings[i];
      const setFood = (f) => { ing.food = f; ing.ctype = null; vs.save(); drawIngs(); result(); };
      bindSource(card, 'ing' + i, setFood);
      card.querySelector(`[data-generic]`)?.addEventListener('change', (e) => {
        const g = GENERIC[+e.target.value];
        if (!g) return;
        ing.ctype = g.ctype;
        if (g.ctype === 'none') ing.mode = 'grams';
        ing.food = normalizeFood({ name: g.name, basis: 100, basisUnit: 'g', n: g.n, notes: 'Generic approximate values' });
        vs.save(); drawIngs(); result();
      });
      card.querySelector('[data-food-act="edit"]')?.addEventListener('click', async () => {
        const f = await openFoodEditor(ing.food, { title: `Ingredient ${i + 1}` });
        if (f) setFood(f);
      });
      card.querySelector('[data-food-act="clear"]')?.addEventListener('click', () => setFood(null));
      $$('[data-ing]', card).forEach((el) => {
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
          const k = el.dataset.ing;
          ing[k] = el.tagName === 'SELECT' ? el.value : num(el.value);
          if (k === 'ratio') st.templateId = '';
          vs.save();
          if (el.tagName === 'SELECT') drawIngs(); else refreshIngGrams();
          result();
        });
      });
    });
  };

  const refreshIngGrams = () => {
    const { out } = computeMix(st);
    out.forEach((o, i) => {
      const card = root.querySelector(`[data-ings] [data-i="${i}"]`);
      if (!card) return;
      const g = card.querySelector('[data-g]');
      if (g) g.textContent = o.g != null ? fmt(o.g, '', { d: o.g >= 100 ? 0 : 1 }) : '—';
      const c = card.querySelector('[data-c]');
      if (c) c.innerHTML = `${o.c != null ? `→ ${fmt(o.c, 'g')} carbs` : ''}${o.err ? ` <span class="badge warn">${esc(o.err)}</span>` : ''}`;
    });
  };

  const colors = ['#ff6b35', '#ffb238', '#53b1fd', '#32d583', '#c084fc', '#f97066', '#2dd4bf', '#a3a3a3'];
  const result = () => {
    const el = $('[data-result]', root);
    const { out, comb, gf } = computeMix(st);
    const used = out.filter((o) => o.food && o.g > 0);
    if (!used.length) { el.innerHTML = `<div class="card"><div class="empty">Add ingredients and targets to see the combined nutrition facts.</div></div>`; return; }
    const W = comb.weight;
    const totalC = comb.totals.carbs || 0;
    let servings = null;
    if (st.split === 'count' && st.splitValue > 0) servings = st.splitValue;
    if (st.split === 'carbs' && st.splitValue > 0 && totalC > 0) servings = totalC / st.splitValue;
    const cols = [{ head: `Whole mix ${fmt(W, 'g')}`, values: comb.totals, partial: comb.partial }, { head: 'Per 100 g', values: per100(comb.totals, W), partial: comb.partial }];
    let perServ = null;
    if (servings) {
      perServ = Object.fromEntries(Object.entries(comb.totals).map(([k, v]) => [k, v == null ? null : v / servings]));
      cols.push({ head: `Per serving ${fmt(W / servings, 'g')}`, values: perServ, partial: comb.partial });
    }
    const conc = W > 0 ? (totalC / W) * 100 : null;
    const ratioTxt = gf ? (gf.F > 0 && gf.G > 0 ? `1 : ${fmt(gf.F / gf.G, '', { d: 2 })}` : gf.F > 0 ? 'fructose only' : 'glucose only') : null;
    el.innerHTML = `
      <div class="card accent">
        <div class="card-head"><h2>Weigh out</h2><span class="badge">${used.length} ingredient${used.length > 1 ? 's' : ''}</span></div>
        <div class="table-wrap"><table class="t">
          <thead><tr><th>Ingredient</th><th class="r">Amount</th><th class="r">Carbs</th><th class="r">Share</th></tr></thead>
          <tbody>${used.map((o, i) => `<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${colors[out.indexOf(o) % 8]};margin-right:6px"></span>${esc(o.food.name)}</td><td class="r"><b>${fmt(o.g, o.food.basisUnit, { d: 1 })}</b></td><td class="r">${fmt(o.c, 'g')}</td><td class="r">${totalC > 0 && o.c != null ? fmt((o.c / totalC) * 100, '%', { d: 0 }) : '—'}</td></tr>`).join('')}
          ${st.water > 0 ? `<tr><td>Water</td><td class="r"><b>${fmt(st.water, 'g')}</b></td><td class="r">0 g</td><td class="r">–</td></tr>` : ''}
          <tr class="total"><td>Total</td><td class="r">${fmt(W, 'g', { d: 1 })}</td><td class="r">${fmt(totalC, 'g')}</td><td class="r"></td></tr></tbody></table></div>
        <div class="ratio-bar" style="margin-top:10px">${used.map((o) => `<span style="width:${totalC > 0 ? ((o.c || 0) / totalC) * 100 : 0}%;background:${colors[out.indexOf(o) % 8]}"></span>`).join('')}</div>
        <div class="stat-row" style="margin-top:12px">
          <div class="stat hl"><div class="k">Total carbs</div><div class="v">${fmt(totalC, '')}<small> g</small></div></div>
          <div class="stat"><div class="k">Energy</div><div class="v">${comb.partial.has('energyKcal') ? '≥' : ''}${fmt(comb.totals.energyKcal, '', { d: 0 })}<small> kcal</small></div></div>
          <div class="stat"><div class="k">Sodium</div><div class="v">${comb.partial.has('sodium') ? '≥' : ''}${fmt(comb.totals.sodium, '', { d: 0 })}<small> mg</small></div></div>
          <div class="stat"><div class="k">Carb conc.</div><div class="v">${fmt(conc, '', { d: 1 })}<small> %</small></div></div>
          ${ratioTxt ? `<div class="stat"><div class="k">Glucose : fructose</div><div class="v" style="font-size:1.1rem">${ratioTxt}</div></div>` : ''}
          ${servings ? `<div class="stat"><div class="k">Servings</div><div class="v">${fmt(servings, '', { d: 1 })}<small> × ${fmt(W / servings, 'g')}</small></div></div>` : ''}
        </div>
        ${gf && gf.unknownCarb > 0.5 ? `<p class="tiny muted">G:F excludes ${fmt(gf.unknownCarb, 'g')} carbs of unknown type (set "Carb type" on each ingredient).</p>` : ''}
        ${conc != null && st.water > 0 ? `<p class="tiny muted">${conc <= 8 ? 'About 6–8% carbohydrate is a typical sports-drink concentration.' : conc <= 12 ? 'Above ~8%, a drink empties from the stomach more slowly. Take it with extra water if you get GI trouble.' : 'Gel-like concentration. Take it with water.'}</p>` : ''}
        <div class="row" style="margin-top:12px">
          <button class="btn small" data-save2>Save recipe</button>
          <button class="btn small" data-as-food>Save mix as food</button>
          <button class="btn small" data-as-packet>Add to fuel arsenal</button>
        </div>
      </div>
      <div class="card">${renderLabel({ title: 'Nutrition Facts', subtitle: st.name || 'Combined mix', columns: cols })}</div>`;
    $('[data-save2]', el).onclick = saveRecipe;
    $('[data-as-food]', el).onclick = async () => {
      const name = await promptBox('Save mix as a food', 'Name', st.name || 'My mix');
      if (!name) return;
      foods.upsert({ name, brand: 'Homemade', basis: 100, basisUnit: 'g', servingSize: servings ? +(W / servings).toFixed(1) : null, servingName: servings ? 'serving' : '', n: per100(comb.totals, W), notes: `Mix of ${used.map((o) => `${fmt(o.g, 'g')} ${o.food.name}`).join(', ')}${st.water > 0 ? `, ${st.water} g water` : ''}` });
      toast('Saved to library', 'good');
    };
    $('[data-as-packet]', el).onclick = async () => {
      const per = perServ || comb.totals;
      const name = await promptBox('Add to fuel arsenal', 'Packet name', `${st.name || 'Homemade mix'}${servings ? ' (1 serving)' : ''}`);
      if (!name) return;
      arsenal.upsert({ name, kind: 'gel', carbs: +(per.carbs || 0).toFixed(1), sodium: Math.round(per.sodium || 0), caffeine: Math.round(per.caffeine || 0), fluid: 0, qty: servings ? Math.floor(servings) : 1 });
      toast('Added to arsenal', 'good');
    };
  };

  async function saveRecipe() {
    const name = await promptBox('Save recipe', 'Recipe name', st.name || '');
    if (!name) return;
    st.name = name; vs.save();
    const existing = recipes.all().find((r) => r.name === name);
    recipes.upsert({ id: existing?.id, name, state: JSON.parse(JSON.stringify({ ...st, ings: st.ings.slice(0, st.count) })) });
    toast('Recipe saved', 'good');
    draw();
  }
  async function loadRecipe() {
    const list = recipes.all();
    const pick = await modal({
      title: 'Load recipe',
      render: (b, close) => {
        b.innerHTML = list.length ? `<div class="list">${list.map((r) => `<div class="list-item" data-id="${r.id}"><div class="grow"><div class="t1">${esc(r.name)}</div><div class="t2">${r.state.count} ingredients${r.state.ratioOn ? ' · ratio mode' : ''} · ${new Date(r.updated).toLocaleDateString()}</div></div><button class="btn small ghost danger" data-del="${r.id}">Delete</button></div>`).join('')}</div>` : '<div class="empty">No saved recipes yet.</div>';
        b.onclick = async (e) => {
          const del = e.target.closest('[data-del]');
          if (del) { e.stopPropagation(); recipes.remove(del.dataset.del); del.closest('.list-item').remove(); return; }
          const it = e.target.closest('[data-id]');
          if (it) close(recipes.get(it.dataset.id));
        };
      },
    });
    if (!pick) return;
    Object.assign(st, JSON.parse(JSON.stringify(pick.state)));
    while (st.ings.length < 8) st.ings.push(newIng());
    vs.save(); draw();
    toast(`Loaded "${pick.name}"`);
  }

  draw();
}
