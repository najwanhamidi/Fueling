// Tab 1: single-food carb calculator.
import { $, esc, fmt, num, seg, bindSeg, toast, promptBox } from '../ui.js';
import { viewState, arsenal, foods } from '../store.js';
import { scaleFood, amountForCarbs, renderLabel, foodSubtitle, normalizeFood, per100 } from '../nutrients.js';
import { sourceButtons, bindSource, foodSummaryHtml } from '../ui/scan.js';
import { openFoodEditor } from '../ui/foodEditor.js';

const vs = viewState('single', { food: null, mode: 'carbs', targetCarbs: 30, amount: 50 });

export function mount(root) {
  const st = vs.get();
  const draw = () => {
    const food = st.food ? normalizeFood(st.food) : null;
    root.innerHTML = `
    <div class="cols-2">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>1 · Nutrition facts</h2>${food ? '<button class="btn small ghost" data-change>Change</button>' : ''}</div>
          ${food ? foodSummaryHtml(food) : `<p class="muted small">Scan or upload a label (any layout: per 100 g, per serving, per sachet), enter it by hand (partial is fine), or load one from your library.</p>${sourceButtons('single')}`}
          <div data-src-again class="hidden" style="margin-top:10px">${sourceButtons('single2')}</div>
        </div>
        <div class="card">
          <div class="card-head"><h2>2 · What do you need?</h2>${seg('mode', [['carbs', 'Target carbs'], ['amount', 'Fixed amount']], st.mode)}</div>
          ${st.mode === 'carbs' ? `
            <label class="field"><span class="lbl">Carbohydrate required</span>
              <div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" step="any" data-in="targetCarbs" value="${st.targetCarbs ?? ''}"><span class="u">g</span></div></label>
            <div class="chips" style="margin-top:10px">${[15, 20, 22, 25, 30, 40, 45, 60, 75, 90, 120].map((c) => `<button class="chip ${+st.targetCarbs === c ? 'active' : ''}" data-chip="${c}">${c} g</button>`).join('')}</div>`
          : `<label class="field"><span class="lbl">Amount</span>
              <div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" step="any" data-in="amount" value="${st.amount ?? ''}"><span class="u">${food?.basisUnit || 'g'}</span></div></label>`}
        </div>
      </div>
      <div class="stack" data-result></div>
    </div>`;
    bindSeg(root, 'mode', (v) => { st.mode = v; vs.save(); draw(); });
    root.querySelectorAll('[data-in]').forEach((el) => el.addEventListener('input', () => { st[el.dataset.in] = num(el.value); vs.save(); result(); }));
    root.querySelectorAll('[data-chip]').forEach((b) => b.addEventListener('click', () => { st.targetCarbs = +b.dataset.chip; vs.save(); draw(); }));
    const setFood = (f) => { st.food = f; vs.save(); draw(); };
    bindSource(root, 'single', setFood);
    bindSource(root, 'single2', setFood);
    root.querySelector('[data-change]')?.addEventListener('click', () => root.querySelector('[data-src-again]').classList.toggle('hidden'));
    root.querySelector('[data-food-act="edit"]')?.addEventListener('click', async () => {
      const f = await openFoodEditor(st.food, { title: 'Edit nutrition facts' });
      if (f) setFood(f);
    });
    root.querySelector('[data-food-act="clear"]')?.addEventListener('click', () => setFood(null));
    result();
  };

  const result = () => {
    const el = root.querySelector('[data-result]');
    const food = st.food ? normalizeFood(st.food) : null;
    if (!food) { el.innerHTML = `<div class="card"><div class="empty">Add nutrition facts to see the result.</div></div>`; return; }
    let amount = null, carbs = null;
    if (st.mode === 'carbs') {
      if (food.n.carbs == null || food.n.carbs <= 0) {
        el.innerHTML = `<div class="card"><div class="note warn">This food has no carbohydrate value, so a carb target can't be calculated. Edit the facts or use "Fixed amount".</div></div>`;
        return;
      }
      carbs = st.targetCarbs;
      amount = amountForCarbs(food, carbs);
    } else {
      amount = st.amount;
    }
    if (!(amount > 0)) { el.innerHTML = `<div class="card"><div class="empty">Enter a value.</div></div>`; return; }
    const portion = scaleFood(food, amount);
    const u = food.basisUnit;
    const servings = food.servingSize ? amount / food.servingSize : null;
    const cols = [{ head: `Portion ${fmt(amount, u)}`, values: portion }];
    if (food.basis !== 100) cols.push({ head: `Per 100 ${u}`, values: per100(scaleFood(food, food.basis), food.basis) });
    else cols.push({ head: `Per 100 ${u}`, values: food.n });
    if (food.servingSize && food.servingSize !== 100) cols.push({ head: `Per serving ${fmt(food.servingSize, u)}`, values: scaleFood(food, food.servingSize) });
    el.innerHTML = `
      <div class="card accent">
        <div class="small muted">${st.mode === 'carbs' ? `To get ${fmt(carbs, 'g')} carbohydrate, weigh out` : 'Nutrition for'}</div>
        <div class="big-result"><span class="value">${fmt(amount, '', { d: amount >= 100 ? 0 : 1 })}</span><span class="unit">${u} of ${esc(food.name)}</span></div>
        <div class="stat-row" style="margin-top:12px">
          <div class="stat hl"><div class="k">Carbs</div><div class="v">${fmt(portion.carbs, '', { dash: '—' })}<small> g</small></div></div>
          <div class="stat"><div class="k">Energy</div><div class="v">${fmt(portion.energyKcal, '', { d: 0 })}<small> kcal</small></div></div>
          <div class="stat"><div class="k">Sodium</div><div class="v">${fmt(portion.sodium, '', { d: 0 })}<small> mg</small></div></div>
          ${servings ? `<div class="stat"><div class="k">Servings</div><div class="v">${fmt(servings, '', { d: 2 })}<small> × ${fmt(food.servingSize, u)}</small></div></div>` : ''}
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn small" data-save-portion>Save portion as food</button>
          <button class="btn small" data-to-arsenal>Add to fuel arsenal</button>
        </div>
      </div>
      <div class="card">
        ${renderLabel({ title: 'Nutrition Facts', subtitle: `${food.name}: ${foodSubtitle(food)}`, columns: cols })}
      </div>`;
    el.querySelector('[data-save-portion]').onclick = async () => {
      const name = await promptBox('Save portion', 'Name', `${food.name} – ${fmt(amount, u)}`);
      if (!name) return;
      foods.upsert({ ...food, id: null, name, servingSize: amount, servingName: 'portion' });
      toast('Saved to library', 'good');
    };
    el.querySelector('[data-to-arsenal]').onclick = async () => {
      const name = await promptBox('Add to fuel arsenal', 'Packet name', `${food.name} ${fmt(amount, u)}`);
      if (!name) return;
      arsenal.upsert({ name, kind: 'food', carbs: +(portion.carbs || 0).toFixed(1), sodium: Math.round(portion.sodium || 0), caffeine: Math.round(portion.caffeine || 0), fluid: 0, qty: 4, foodId: food.id || null, amount: +amount.toFixed(1) });
      toast('Added to arsenal', 'good');
    };
  };
  draw();
}
