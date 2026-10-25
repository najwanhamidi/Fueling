// Tab 2: multi-ingredient mixer with carb targets, per-ingredient ratios, or a glucose : fructose target.
import { $, $$, esc, fmt, num, seg, bindSeg, toast, promptBox, modal, confirmBox } from '../ui.js';
import { viewState, recipes, foods, arsenal } from '../store.js';
import { per100, renderLabel, normalizeFood } from '../nutrients.js';
import { sourceButtons, bindSource, foodSummaryHtml } from '../ui/scan.js';
import { openFoodEditor } from '../ui/foodEditor.js';
import { CARB_TYPES, RATIO_TEMPLATES, GF_TEMPLATES, GENERIC, TARGET_KEYS, TARGET_TEMPLATES, newTarget, targetDef, newIng, computeMix, guessCType } from '../mix.js';

export { computeMix, RATIO_TEMPLATES, GENERIC };

const NUM = 'type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"';

const vs = viewState('mixer', {
  name: '', count: 2, ings: [newIng(), newIng()], ratioOn: false, ratioKind: 'ingredient', ratioBasis: 'carbs', ratioTarget: 'first',
  ratioValue: 60, templateId: '', gfG: 1, gfF: 0.8, targets: [], targetTpl: '', water: null, split: 'none', splitValue: null,
});

const typeShort = (id) => CARB_TYPES.find((t) => t.id === id)?.short || 'Unknown';
const pct = (x) => `${Math.round(x * 100)}`;

export function mount(root) {
  const st = vs.get();
  while (st.ings.length < 8) st.ings.push(newIng());
  const kind = () => st.ratioKind || 'ingredient';
  if (!Array.isArray(st.targets)) st.targets = [];
  const tOpts = (sel) => TARGET_KEYS.map((t) => `<option value="${t.k}" ${sel === t.k ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
  const targetRows = () => st.targets.map((t, i) => (t.type === 'ratio'
    ? `<div class="trow" data-t="${i}">
        <div class="trow-main"><select data-tk="k">${tOpts(t.k)}</select><span class="trow-sep">:</span><select data-tk="k2">${tOpts(t.k2)}</select></div>
        <div class="trow-val"><input ${NUM} data-tk="a" value="${t.a ?? ''}" aria-label="Ratio part 1"><span class="trow-sep">:</span><input ${NUM} data-tk="b" value="${t.b ?? ''}" aria-label="Ratio part 2"></div>
        <button class="btn small ghost danger" data-tdel="${i}" aria-label="Remove target">✕</button></div>`
    : `<div class="trow" data-t="${i}">
        <div class="trow-main"><select data-tk="k">${tOpts(t.k)}</select>
          <select data-tk="op" aria-label="Target type"><option value="=" ${t.op === '=' || !t.op ? 'selected' : ''}>exactly</option><option value=">=" ${t.op === '>=' ? 'selected' : ''}>at least</option><option value="<=" ${t.op === '<=' ? 'selected' : ''}>at most</option></select></div>
        <div class="trow-val"><div class="input-unit"><input ${NUM} data-tk="v" value="${t.v ?? ''}" placeholder="0"><span class="u">${esc(targetDef(t.k).unit)}</span></div></div>
        <button class="btn small ghost danger" data-tdel="${i}" aria-label="Remove target">✕</button></div>`)).join('');

  const draw = () => {
    const templates = RATIO_TEMPLATES.filter((t) => t.n === st.count);
    const gfTpl = GF_TEMPLATES.find((t) => Math.abs(t.g - (+st.gfG || 0)) < 1e-6 && Math.abs(t.f - (+st.gfF || 0)) < 1e-6);
    root.innerHTML = `
    <div class="cols-2">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Mix setup</h2>
            <div class="row"><button class="btn small" data-load>Load</button><button class="btn small" data-save>Save</button><button class="btn small ghost" data-new>New</button></div></div>
          <div class="fields">
            <label class="field"><span class="lbl">Recipe name</span><input type="text" data-k="name" value="${esc(st.name || '')}" placeholder="e.g. 1:0.8 gel batch"></label>
            <label class="field"><span class="lbl">Number of ingredients</span>
              <div class="row nowrap"><button class="btn" data-cnt="-1">−</button><input ${NUM} value="${st.count}" data-count style="text-align:center"><button class="btn" data-cnt="1">+</button></div></label>
          </div>
          <div style="margin-top:14px" class="stack">
            <label class="switch"><input type="checkbox" data-ratio ${st.ratioOn ? 'checked' : ''}> Auto-calculate amounts (from a ratio or several targets)</label>
            ${st.ratioOn ? `
              <div class="card sub stack">
                <div class="stack"><span class="small muted">Calculate by</span>${seg('rkind', [['ingredient', 'Per-ingredient ratio'], ['gf', 'Glucose : Fructose'], ['targets', 'Nutrient targets']], kind())}</div>
                ${kind() === 'targets' ? `
                <div><div class="small muted" style="margin-bottom:6px">Target templates</div>
                  <div class="chips">${TARGET_TEMPLATES.map((t) => `<button class="chip ${st.targetTpl === t.id ? 'active' : ''}" data-ttpl="${t.id}" title="${esc(t.hint)}">${esc(t.label)}</button>`).join('')}</div>
                  ${st.targetTpl && TARGET_TEMPLATES.find((t) => t.id === st.targetTpl) ? `<div class="tiny muted" style="margin-top:6px">${esc(TARGET_TEMPLATES.find((t) => t.id === st.targetTpl).hint)}</div>` : ''}
                </div>
                <div class="stack" data-trows>${targetRows() || '<div class="tiny muted">No targets yet. Pick a template or add one.</div>'}</div>
                <div class="row"><button class="btn small" data-tadd="amount">+ Add target</button><button class="btn small" data-tadd="ratio">+ Add ratio</button></div>
                <div class="tiny muted">The whole mix is solved at once: every target is met together, in the amounts shown for ingredients set to <b>Auto (solve)</b>. A target can be an amount (carbs, protein, sodium, caffeine, energy, glucose, fructose or total weight; <i>exactly</i>, <i>at least</i> or <i>at most</i>) or a ratio between two nutrients (e.g. carbs : protein = 4 : 1). With more ingredients than targets several answers fit; the app spreads the amounts evenly, and an ingredient's <b>Preference</b> pushes it up or down. Ingredients set to fixed grams or carbs are counted first. Add water or salt as Auto ingredients to hit a total weight or sodium target.</div>`
                : kind() === 'gf' ? `
                <div><div class="small muted" style="margin-bottom:6px">Target glucose : fructose for the whole mix</div>
                  <div class="chips">${GF_TEMPLATES.map((t) => `<button class="chip ${gfTpl === t ? 'active' : ''}" data-gft="${t.id}" title="${esc(t.hint)}">${esc(t.id.replace(':', ' : '))}</button>`).join('')}</div>
                  ${gfTpl ? `<div class="tiny muted" style="margin-top:6px">${esc(gfTpl.hint)}</div>` : ''}
                </div>
                <div class="fields tight">
                  <label class="field"><span class="lbl">Glucose part</span><input ${NUM} data-k="gfG" value="${st.gfG ?? 1}"></label>
                  <label class="field"><span class="lbl">Fructose part</span><input ${NUM} data-k="gfF" value="${st.gfF ?? 0.8}"></label>
                  <label class="field"><span class="lbl">Total carbs of the mix</span><div class="input-unit"><input ${NUM} data-k="ratioValue" value="${st.ratioValue ?? ''}"><span class="u">g</span></div></label>
                </div>
                <div class="tiny muted">Works with any number of ingredients. Each ingredient's <b>carb type</b> sets how much glucose and fructose it gives (sucrose, honey and maple count as both). Ingredients on "Auto (G : F)" are split into a glucose side and a fructose side, and the app solves how much of each side hits your ratio. <b>Share</b> divides a side between its ingredients (e.g. malto 1 + dextrose 1 = half each). Ingredients set to fixed carbs or grams are counted first.</div>`
                : `
                <div><div class="small muted" style="margin-bottom:6px">Ratio templates (energy gels / drink mixes)</div>
                  <div class="chips">${templates.map((t) => `<button class="chip ${st.templateId === t.id ? 'active' : ''}" data-tpl="${t.id}" title="${esc(t.hint)}">${esc(t.label)}</button>`).join('')}<button class="chip ${st.templateId === 'equal' ? 'active' : ''}" data-tpl="equal">Equal parts</button></div>
                  ${st.templateId && RATIO_TEMPLATES.find((t) => t.id === st.templateId) ? `<div class="tiny muted" style="margin-top:6px">${esc(RATIO_TEMPLATES.find((t) => t.id === st.templateId).hint)}</div>` : ''}
                </div>
                <div class="row"><span class="small muted">Ratio by</span>${seg('rbasis', [['carbs', 'Carbohydrate'], ['weight', 'Weight']], st.ratioBasis)}</div>
                <div class="fields">
                  <label class="field"><span class="lbl">Target</span><select data-k="ratioTarget">
                    <option value="first" ${st.ratioTarget !== 'total' ? 'selected' : ''}>Carbs from ingredient 1</option>
                    <option value="total" ${st.ratioTarget === 'total' ? 'selected' : ''}>Total carbs of the mix</option></select></label>
                  <label class="field"><span class="lbl">Carbs</span><div class="input-unit"><input ${NUM} data-k="ratioValue" value="${st.ratioValue ?? ''}"><span class="u">g</span></div></label>
                </div>
                <div class="tiny muted">Set each ingredient's ratio value below (ingredient 1 is the reference). Zero-carb items (water, salt) use fixed grams.</div>`}
              </div>` : ''}
          </div>
        </div>
        <div class="stack" data-ings></div>
        <div class="card">
          <h3>Extras</h3>
          <div class="fields">
            <label class="field"><span class="lbl">Add water <span class="muted">optional</span></span><div class="input-unit"><input ${NUM} data-k="water" value="${st.water ?? ''}" placeholder="0"><span class="u">g/ml</span></div></label>
            <label class="field"><span class="lbl">Split into servings</span><select data-k="split">
              <option value="none" ${st.split === 'none' ? 'selected' : ''}>No</option>
              <option value="count" ${st.split === 'count' ? 'selected' : ''}>Number of servings</option>
              <option value="carbs" ${st.split === 'carbs' ? 'selected' : ''}>Carbs per serving</option></select></label>
            ${st.split !== 'none' ? `<label class="field"><span class="lbl">${st.split === 'count' ? 'Servings' : 'Carbs / serving'}</span><div class="input-unit"><input ${NUM} data-k="splitValue" value="${st.splitValue ?? ''}"><span class="u">${st.split === 'count' ? '×' : 'g'}</span></div></label>` : ''}
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
        st[k] = 'num' in el.dataset ? num(el.value) : el.value;
        vs.save();
        if (k === 'split' || k === 'ratioTarget') draw();
        else if (k === 'gfG' || k === 'gfF') { refreshIngGrams(); result(); refreshGfChips(); }
        else { refreshIngGrams(); result(); }
      });
    });
    const setCount = (n) => { st.count = Math.max(2, Math.min(8, n || 2)); st.templateId = ''; vs.save(); draw(); };
    $$('[data-cnt]', root).forEach((b) => (b.onclick = () => setCount(st.count + +b.dataset.cnt)));
    $('[data-count]', root).onchange = (e) => setCount(num(e.target.value));
    $('[data-ratio]', root).onchange = (e) => { st.ratioOn = e.target.checked; vs.save(); draw(); };
    bindSeg(root, 'rkind', (v) => {
      st.ratioKind = v;
      if (v === 'targets' && !st.targets.length) { st.targets = JSON.parse(JSON.stringify(TARGET_TEMPLATES[0].targets)); st.targetTpl = TARGET_TEMPLATES[0].id; }
      vs.save(); draw();
    });
    bindSeg(root, 'rbasis', (v) => { st.ratioBasis = v; vs.save(); refreshIngGrams(); result(); });
    $$('[data-tpl]', root).forEach((b) => (b.onclick = () => {
      const id = b.dataset.tpl;
      st.templateId = id;
      const t = RATIO_TEMPLATES.find((x) => x.id === id);
      for (let i = 0; i < st.count; i++) st.ings[i].ratio = t ? t.r[i] ?? 1 : 1;
      st.ratioBasis = 'carbs';
      vs.save(); draw();
    }));
    $$('[data-ttpl]', root).forEach((b) => (b.onclick = () => {
      const t = TARGET_TEMPLATES.find((x) => x.id === b.dataset.ttpl);
      st.targets = JSON.parse(JSON.stringify(t.targets)); st.targetTpl = t.id;
      vs.save(); draw();
    }));
    $$('[data-tadd]', root).forEach((b) => (b.onclick = () => { st.targets.push(newTarget(b.dataset.tadd)); st.targetTpl = ''; vs.save(); draw(); }));
    $$('[data-tdel]', root).forEach((b) => (b.onclick = () => { st.targets.splice(+b.dataset.tdel, 1); st.targetTpl = ''; vs.save(); draw(); }));
    $$('[data-t] [data-tk]', root).forEach((el) => {
      const t = st.targets[+el.closest('[data-t]').dataset.t];
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        const k = el.dataset.tk;
        t[k] = el.tagName === 'SELECT' ? el.value : num(el.value);
        st.targetTpl = '';
        vs.save();
        if (el.tagName === 'SELECT') { draw(); return; }
        refreshIngGrams(); result();
      });
    });
    $$('[data-gft]', root).forEach((b) => (b.onclick = () => {
      const t = GF_TEMPLATES.find((x) => x.id === b.dataset.gft);
      st.gfG = t.g; st.gfF = t.f; vs.save(); draw();
    }));
    $('[data-save]', root).onclick = saveRecipe;
    $('[data-load]', root).onclick = loadRecipe;
    $('[data-new]', root).onclick = async () => {
      if (!(await confirmBox('Start a new empty mix?'))) return;
      vs.reset(); Object.assign(st, vs.get()); while (st.ings.length < 8) st.ings.push(newIng()); draw();
    };
  };

  const refreshGfChips = () => {
    $$('[data-gft]', root).forEach((b) => {
      const t = GF_TEMPLATES.find((x) => x.id === b.dataset.gft);
      b.classList.toggle('active', Math.abs(t.g - (+st.gfG || 0)) < 1e-6 && Math.abs(t.f - (+st.gfF || 0)) < 1e-6);
    });
  };

  const modeOptions = (i) => {
    if (!st.ratioOn) return [['carbs', 'Carbs (g)'], ['grams', 'Fixed grams']];
    if (kind() === 'gf') return [['carbs', 'Auto (G : F)'], ['fixcarbs', 'Fixed carbs'], ['grams', 'Fixed grams']];
    if (kind() === 'targets') return [['carbs', 'Auto (solve)'], ['fixcarbs', 'Fixed carbs'], ['grams', 'Fixed grams']];
    return i === 0 ? null : [['carbs', 'By ratio'], ['fixcarbs', 'Fixed carbs'], ['grams', 'Fixed grams']];
  };

  const infoLine = (o) => {
    const bits = [];
    if (o.c != null) bits.push(`→ ${fmt(o.c, 'g')} carbs`);
    if (o.c > 0 && o.type?.g != null) bits.push(`glucose ${fmt(o.c * o.type.g, 'g')} · fructose ${fmt(o.c * o.type.f, 'g')}`);
    if (o.side) bits.push(`<span class="badge ${o.side === 'glucose' ? '' : 'accent'}">${o.side} side</span>`);
    return `${bits.join(' · ')}${o.err ? ` <span class="badge warn">${esc(o.err)}</span>` : ''}`;
  };

  const drawIngs = () => {
    const box = $('[data-ings]', root);
    const { out } = computeMix(st);
    box.innerHTML = out.map((o, i) => {
      const ing = st.ings[i];
      const mode = ing.mode || 'carbs';
      const noCarb = o.food && !(o.food.n.carbs > 0);
      const opts = modeOptions(i);
      const showRatio = st.ratioOn && kind() === 'ingredient' && (i === 0 || mode === 'carbs') && !noCarb;
      const tmode = st.ratioOn && kind() === 'targets';
      const showShare = st.ratioOn && ((kind() === 'gf' && !noCarb) || tmode) && mode === 'carbs';
      const showCarbInput = !noCarb && ((!st.ratioOn && mode !== 'grams') || (st.ratioOn && mode === 'fixcarbs'));
      const showGramInput = mode === 'grams' || (noCarb && !tmode);
      const ctype = ing.ctype || 'auto';
      const guessed = o.food ? typeShort(guessCType(o.food.name)) : '';
      return `<div class="ing" data-i="${i}">
        <div class="ing-head"><span class="ing-idx">${i + 1}</span><b>${o.food ? esc(o.food.name) : `Ingredient ${i + 1}`}</b>
          <div class="ing-grams"><div class="v" data-g>${o.g != null ? fmt(o.g, '', { d: o.g >= 100 ? 0 : 1 }) : '—'}</div><div class="k">${o.food?.basisUnit || 'g'} needed</div></div></div>
        ${o.food ? foodSummaryHtml(o.food) : `${sourceButtons('ing' + i)}
          <select data-generic="${i}" style="margin-top:6px"><option value="">…or a common ingredient template (approx. values)</option>${GENERIC.map((g, gi) => `<option value="${gi}">${esc(g.name)}</option>`).join('')}</select>`}
        ${o.food ? `<div class="fields tight">
          ${showRatio ? `<label class="field"><span class="lbl">${i === 0 ? 'Ratio (reference)' : 'Ratio to #1'}</span><input ${NUM} data-ing="ratio" value="${ing.ratio ?? 1}"></label>` : ''}
          ${opts && (!noCarb || tmode) ? `<label class="field"><span class="lbl">Input as</span><select data-ing="mode">${opts.map(([v, l]) => `<option value="${v}" ${mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
          ${showShare ? `<label class="field"><span class="lbl">${tmode ? 'Preference' : 'Share'} <span class="muted">${tmode ? 'higher = use more' : 'within its side'}</span></span><input ${NUM} data-ing="share" value="${ing.share ?? 1}"></label>` : ''}
          ${showCarbInput ? `<label class="field"><span class="lbl">${st.ratioOn ? 'Fixed carbs' : 'Carbs required'}</span><div class="input-unit"><input ${NUM} data-ing="carbs" value="${ing.carbs ?? ''}"><span class="u">g</span></div></label>` : ''}
          ${showGramInput ? `<label class="field"><span class="lbl">Amount</span><div class="input-unit"><input ${NUM} data-ing="grams" value="${ing.grams ?? ''}"><span class="u">${o.food.basisUnit}</span></div></label>` : ''}
          <label class="field span-all"><span class="lbl">Carb type <span class="muted">optional</span></span><select data-ing="ctype">${CARB_TYPES.map((t) => `<option value="${t.id}" ${ctype === t.id ? 'selected' : ''}>${esc(t.id === 'auto' ? `Auto (from name: ${guessed})` : t.label)}</option>`).join('')}</select></label>
          ${ctype === 'custom' ? `<label class="field"><span class="lbl">Glucose share of carbs</span><div class="input-unit"><input ${NUM} data-ing="gPct" value="${ing.gPct ?? 50}"><span class="u">%</span></div></label><div class="field"><span class="lbl">Fructose share</span><div class="tiny muted" style="padding-top:12px" data-fpct>${100 - Math.max(0, Math.min(100, +ing.gPct || 0))} %</div></div>` : ''}
        </div>
        <div class="small muted" data-c>${infoLine(o)}</div>` : ''}
      </div>`;
    }).join('');
    out.forEach((o, i) => {
      const card = box.querySelector(`[data-i="${i}"]`);
      const ing = st.ings[i];
      const setFood = (f) => { ing.food = f; ing.ctype = null; vs.save(); drawIngs(); result(); };
      bindSource(card, 'ing' + i, setFood);
      card.querySelector('[data-generic]')?.addEventListener('change', (e) => {
        const g = GENERIC[+e.target.value];
        if (!g) return;
        ing.ctype = g.ctype;
        if (g.ctype === 'none' && !(st.ratioOn && kind() === 'targets')) ing.mode = 'grams';
        ing.food = normalizeFood({ name: g.name, basis: 100, basisUnit: 'g', n: g.n, notes: 'Generic approximate values, check your product label' });
        vs.save(); drawIngs(); result();
      });
      card.querySelector('[data-food-act="edit"]')?.addEventListener('click', async () => {
        const f = await openFoodEditor(ing.food, { title: `Ingredient ${i + 1}` });
        if (f) { ing.food = f; vs.save(); drawIngs(); result(); }
      });
      card.querySelector('[data-food-act="clear"]')?.addEventListener('click', () => setFood(null));
      $$('[data-ing]', card).forEach((el) => {
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
          const k = el.dataset.ing;
          ing[k] = el.tagName === 'SELECT' ? el.value : num(el.value);
          if (k === 'ctype' && el.value === 'custom' && ing.gPct == null) ing.gPct = 50;
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
      if (c) c.innerHTML = infoLine(o);
      const fp = card.querySelector('[data-fpct]');
      if (fp) fp.textContent = `${100 - Math.max(0, Math.min(100, +st.ings[i].gPct || 0))} %`;
    });
  };

  const OPSYM = { '=': '', '>=': '≥ ', '<=': '≤ ' };
  const targetCard = (targets) => {
    if (!targets || !targets.length) return '';
    const rows = targets.map((t) => {
      if (t.type === 'ratio') {
        const got = t.gotRatio != null && Number.isFinite(t.gotRatio) ? `${fmt(t.gotRatio * t.b, '', { d: 2 })} : ${fmt(t.b, '', { d: 2 })}` : '—';
        return `<tr><td>${esc(targetDef(t.k).label)} : ${esc(targetDef(t.k2).label)}</td><td class="r">${fmt(t.a, '', { d: 2 })} : ${fmt(t.b, '', { d: 2 })}</td><td class="r"><b>${got}</b></td><td class="r"><span class="badge ${t.ok ? 'good' : 'warn'}">${t.ok ? 'met' : 'off'}</span></td></tr>`;
      }
      const u = targetDef(t.k).unit;
      return `<tr><td>${esc(targetDef(t.k).label)}</td><td class="r">${OPSYM[t.op] || ''}${fmt(t.v, u)}</td><td class="r"><b>${fmt(t.got, u)}</b></td><td class="r"><span class="badge ${t.ok ? 'good' : 'warn'}">${t.ok ? 'met' : 'off'}</span></td></tr>`;
    }).join('');
    const okAll = targets.every((t) => t.ok);
    return `<div class="card"><div class="card-head"><h2>Targets</h2><span class="badge ${okAll ? 'good' : 'warn'}">${okAll ? 'all met' : 'closest fit'}</span></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Target</th><th class="r">Wanted</th><th class="r">Got</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  };

  const colors = ['#ff6b35', '#ffb238', '#53b1fd', '#32d583', '#c084fc', '#f97066', '#2dd4bf', '#a3a3a3'];
  const result = () => {
    const el = $('[data-result]', root);
    const { out, comb, gf, warnings, targets } = computeMix(st);
    const used = out.filter((o) => o.food && o.g > 0);
    const warnHtml = warnings.map((w) => `<div class="note warn small">${esc(w)}</div>`).join('');
    if (!used.length) { el.innerHTML = `${warnHtml}<div class="card"><div class="empty">Add ingredients and targets to see the combined nutrition facts.</div></div>`; return; }
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
    const targetTxt = st.ratioOn && kind() === 'gf' ? `target 1 : ${fmt((+st.gfF || 0) / (+st.gfG || 1), '', { d: 2 })}` : '';
    el.innerHTML = `
      ${warnHtml}
      <div class="card accent">
        <div class="card-head"><h2>Weigh out</h2><span class="badge">${used.length} ingredient${used.length > 1 ? 's' : ''}</span></div>
        <div class="table-wrap"><table class="t">
          <thead><tr><th>Ingredient</th><th class="r">Amount</th><th class="r">Carbs</th><th class="r">Share</th></tr></thead>
          <tbody>${used.map((o) => `<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${colors[out.indexOf(o) % 8]};margin-right:6px"></span>${esc(o.food.name)}</td><td class="r"><b>${fmt(o.g, o.food.basisUnit, { d: 1 })}</b></td><td class="r">${fmt(o.c, 'g')}</td><td class="r">${totalC > 0 && o.c != null ? fmt((o.c / totalC) * 100, '%', { d: 0 }) : '—'}</td></tr>`).join('')}
          ${st.water > 0 ? `<tr><td>Water</td><td class="r"><b>${fmt(st.water, 'g')}</b></td><td class="r">0 g</td><td class="r">–</td></tr>` : ''}
          <tr class="total"><td>Total</td><td class="r">${fmt(W, 'g', { d: 1 })}</td><td class="r">${fmt(totalC, 'g')}</td><td class="r"></td></tr></tbody></table></div>
        <div class="ratio-bar" style="margin-top:10px">${used.map((o) => `<span style="width:${totalC > 0 ? ((o.c || 0) / totalC) * 100 : 0}%;background:${colors[out.indexOf(o) % 8]}"></span>`).join('')}</div>
        <div class="stat-row" style="margin-top:12px">
          <div class="stat hl"><div class="k">Total carbs</div><div class="v">${fmt(totalC, '')}<small> g</small></div></div>
          ${ratioTxt ? `<div class="stat"><div class="k">Glucose : fructose</div><div class="v" style="font-size:1.1rem">${ratioTxt}</div><div class="tiny muted">${fmt(gf.G, 'g')} glucose · ${fmt(gf.F, 'g')} fructose${targetTxt ? ` · ${targetTxt}` : ''}</div></div>` : ''}
          <div class="stat"><div class="k">Energy</div><div class="v">${comb.partial.has('energyKcal') ? '≥' : ''}${fmt(comb.totals.energyKcal, '', { d: 0 })}<small> kcal</small></div></div>
          <div class="stat"><div class="k">Sodium</div><div class="v">${comb.partial.has('sodium') ? '≥' : ''}${fmt(comb.totals.sodium, '', { d: 0 })}<small> mg</small></div></div>
          <div class="stat"><div class="k">Carb conc.</div><div class="v">${fmt(conc, '', { d: 1 })}<small> %</small></div></div>
          ${servings ? `<div class="stat"><div class="k">Servings</div><div class="v">${fmt(servings, '', { d: 1 })}<small> × ${fmt(W / servings, 'g')}</small></div></div>` : ''}
        </div>
        ${gf && gf.unknownCarb > 0.5 ? `<p class="tiny muted">Glucose : fructose leaves out ${fmt(gf.unknownCarb, 'g')} carbs of unknown type (set "Carb type" on those ingredients).</p>` : ''}
        ${conc != null && st.water > 0 ? `<p class="tiny muted">${conc <= 8 ? 'About 6–8% carbohydrate is a typical sports-drink concentration.' : conc <= 12 ? 'Above ~8%, a drink empties from the stomach more slowly. Take it with extra water if you get GI trouble.' : 'Gel-like concentration. Take it with water.'}</p>` : ''}
        <div class="row" style="margin-top:12px">
          <button class="btn small" data-save2>Save recipe</button>
          <button class="btn small" data-as-food>Save mix as food</button>
          <button class="btn small" data-as-packet>Add to fuel arsenal</button>
        </div>
      </div>
      ${targetCard(targets)}
      <div class="card">${renderLabel({ title: 'Nutrition Facts', subtitle: st.name || 'Combined mix', columns: cols })}</div>`;
    $('[data-save2]', el).onclick = saveRecipe;
    $('[data-as-food]', el).onclick = async () => {
      const name = await promptBox('Save mix as a food', 'Name', st.name || 'My mix');
      if (!name) return;
      foods.upsert({ name, brand: 'Homemade', basis: 100, basisUnit: 'g', servingSize: servings ? +(W / servings).toFixed(1) : null, servingName: servings ? 'serving' : '', n: per100(comb.totals, W), notes: `Mix of ${used.map((o) => `${fmt(o.g, 'g')} ${o.food.name}`).join(', ')}${st.water > 0 ? `, ${st.water} g water` : ''}${gf ? ` · glucose : fructose ${ratioTxt}` : ''}` });
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
        b.innerHTML = list.length ? `<div class="list">${list.map((r) => `<div class="list-item" data-id="${r.id}"><div class="grow"><div class="t1">${esc(r.name)}</div><div class="t2">${r.state.count} ingredients${r.state.ratioOn ? (r.state.ratioKind === 'gf' ? ` · glucose : fructose 1 : ${fmt((+r.state.gfF || 0) / (+r.state.gfG || 1), '', { d: 2 })}` : r.state.ratioKind === 'targets' ? ` · ${(r.state.targets || []).length} nutrient targets` : ' · ratio mode') : ''} · ${new Date(r.updated).toLocaleDateString()}</div></div><button class="btn small ghost danger" data-del="${r.id}">Delete</button></div>`).join('')}</div>` : '<div class="empty">No saved recipes yet.</div>';
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
