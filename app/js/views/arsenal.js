// Fuel arsenal: the packets (gels, drinks, chews, food) you own.
import { $, $$, esc, fmt, num, modal, toast, confirmBox } from '../ui.js';
import { arsenal, foods, DEFAULT_ARSENAL } from '../store.js';
import { pickFood } from '../ui/scan.js';
import { scaleFood, normalizeFood } from '../nutrients.js';

const KINDS = [['gel', 'Gel'], ['drink', 'Drink mix'], ['chew', 'Chews / blocks'], ['bar', 'Bar'], ['food', 'Real food'], ['other', 'Other']];

function editPacket(p) {
  const it = { kind: 'gel', carbs: 25, sodium: 0, caffeine: 0, fluid: 0, qty: 4, ...(p || {}) };
  return modal({
    title: p?.id ? 'Edit packet' : 'New packet',
    render: (b) => {
      b.innerHTML = `<div class="fields">
        <label class="field"><span class="lbl">Name</span><input type="text" data-p="name" value="${esc(it.name || '')}" placeholder="e.g. Maurten 100"></label>
        <label class="field"><span class="lbl">Type</span><select data-p="kind">${KINDS.map(([v, l]) => `<option value="${v}" ${it.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span class="lbl">Carbs per packet</span><div class="input-unit"><input type="number" inputmode="decimal" step="any" data-p="carbs" value="${it.carbs ?? ''}"><span class="u">g</span></div></label>
        <label class="field"><span class="lbl">Sodium</span><div class="input-unit"><input type="number" inputmode="decimal" step="any" data-p="sodium" value="${it.sodium ?? ''}"><span class="u">mg</span></div></label>
        <label class="field"><span class="lbl">Caffeine</span><div class="input-unit"><input type="number" inputmode="decimal" step="any" data-p="caffeine" value="${it.caffeine ?? ''}"><span class="u">mg</span></div></label>
        <label class="field"><span class="lbl">Fluid <span class="muted">drinks</span></span><div class="input-unit"><input type="number" inputmode="decimal" step="any" data-p="fluid" value="${it.fluid ?? ''}"><span class="u">ml</span></div></label>
        <label class="field"><span class="lbl">Quantity owned</span><input type="number" inputmode="numeric" data-p="qty" value="${it.qty ?? ''}"></label>
      </div>`;
      $$('[data-p]', b).forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        const k = el.dataset.p;
        it[k] = ['name', 'kind'].includes(k) ? el.value : num(el.value) ?? 0;
      }));
    },
    actions: [{ label: 'Cancel', value: null }, {
      label: 'Save', kind: 'primary', onClick: (close) => {
        if (!it.name) { toast('Give it a name', 'bad'); return; }
        if (!(it.carbs >= 0)) { toast('Enter carbs per packet', 'bad'); return; }
        close(arsenal.upsert(it));
      },
    }],
  });
}

export function mount(root) {
  const draw = () => {
    const list = arsenal.all();
    root.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>Fuel arsenal</h2>
          <div class="row"><button class="btn small primary" data-add>+ Packet</button><button class="btn small" data-from-food>+ From library food</button></div></div>
        <p class="small muted">These packets are offered in every fuelling calculator. Quantities here are the defaults; each plan can adjust them.</p>
        ${list.length ? `<div class="list">${list.map((p) => `<div class="list-item" data-id="${p.id}">
          <div style="font-size:1.4rem">${{ gel: '🟠', drink: '🥤', chew: '🟦', bar: '🍫', food: '🍌', other: '⚪' }[p.kind] || '⚪'}</div>
          <div class="grow"><div class="t1">${esc(p.name)}</div><div class="t2">${fmt(p.carbs, 'g')} carbs${p.sodium ? ` · ${p.sodium} mg Na` : ''}${p.caffeine ? ` · ${p.caffeine} mg caffeine` : ''}${p.fluid ? ` · ${p.fluid} ml` : ''}</div></div>
          <span class="badge">× ${p.qty ?? 0}</span>
          <button class="btn small ghost danger" data-del="${p.id}" title="Delete">✕</button></div>`).join('')}</div>` : '<div class="empty">No packets yet.</div>'}
        <div class="row" style="margin-top:12px"><button class="btn small ghost" data-defaults>Add example packets</button></div>
      </div>
      <div class="note small" style="margin-top:14px">Tip: build a homemade gel in the <a href="#/mixer">Mixer</a> and use <i>Add to fuel arsenal</i>, or scan a gel's label in the <a href="#/single">Calculator</a>.</div>`;
    $('[data-add]', root).onclick = async () => { if (await editPacket()) draw(); };
    $$('[data-id]', root).forEach((el) => el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-del]')) return;
      if (await editPacket(arsenal.get(el.dataset.id))) draw();
    }));
    $$('[data-del]', root).forEach((b) => (b.onclick = async (e) => {
      e.stopPropagation();
      if (await confirmBox('Delete this packet?', { ok: 'Delete', danger: true })) { arsenal.remove(b.dataset.del); draw(); }
    }));
    $('[data-defaults]', root).onclick = () => { for (const d of DEFAULT_ARSENAL) if (!arsenal.get(d.id)) arsenal.upsert(d); draw(); };
    $('[data-from-food]', root).onclick = async () => {
      const f = await pickFood({ title: 'Make a packet from a food' });
      if (!f) return;
      const food = normalizeFood(f);
      const amt = food.servingSize || food.basis;
      const n = scaleFood(food, amt);
      if (await editPacket({ name: `${food.name}${food.servingSize ? '' : ` ${amt}${food.basisUnit}`}`, kind: 'gel', carbs: +(n.carbs || 0).toFixed(1), sodium: Math.round(n.sodium || 0), caffeine: Math.round(n.caffeine || 0), qty: 4, foodId: food.id })) draw();
    };
  };
  draw();
}
