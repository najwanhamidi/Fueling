// Shared fueling UI: packet inventory editor + schedule renderer + plan save/load.
import { $, $$, esc, fmt, fmtDur, num, modal, toast, promptBox, downloadFile } from '../ui.js';
import { arsenal, plans, uid } from '../store.js';
import { scheduleText } from './scheduler.js';
import { REFS } from './science.js';

export function seedInventory() {
  return arsenal.all().map((a) => ({ ...a, on: (a.qty ?? 0) > 0 }));
}

/** Packets available for this plan (subset/copy of arsenal with per-plan quantities). */
export function inventoryHtml(inv) {
  return `
    <div class="inv">${inv.length ? inv.map((p, i) => `<div class="inv-row ${p.on === false ? 'off' : ''}" data-row="${i}">
        <input type="checkbox" class="inv-on" data-pk="on" ${p.on !== false ? 'checked' : ''} aria-label="Use this packet">
        <input type="text" class="inv-name" data-pk="name" value="${esc(p.name)}" aria-label="Packet name">
        <div class="inv-nums">
          <label><span>Carbs g</span><input type="number" inputmode="decimal" step="any" data-pk="carbs" value="${p.carbs ?? ''}"></label>
          <label><span>Qty</span><input type="number" inputmode="numeric" step="1" data-pk="qty" value="${p.qty === -1 ? '' : p.qty ?? ''}" placeholder="∞" title="Leave blank for unlimited (e.g. aid-station drink)"></label>
          <label><span>Caf mg</span><input type="number" inputmode="numeric" step="any" data-pk="caffeine" value="${p.caffeine || ''}" placeholder="0"></label>
        </div>
        <button class="btn small ghost inv-del" data-pk-del title="Remove" aria-label="Remove packet">✕</button>
      </div>`).join('') : '<div class="empty">No packets. Add some below.</div>'}
    </div>
    <div class="row" style="margin-top:8px">
      <button class="btn small" data-pk-add>+ Custom packet</button>
      <button class="btn small" data-pk-arsenal>+ From arsenal</button>
      <button class="btn small ghost" data-pk-reset>Reset to arsenal</button>
    </div>
    <p class="tiny muted">Untick packets you don't want used. Leave Qty blank for unlimited.</p>`;
}

export function bindInventory(root, inv, onChange) {
  $$('[data-row]', root).forEach((tr) => {
    const p = inv[+tr.dataset.row];
    $$('[data-pk]', tr).forEach((el) => {
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        const k = el.dataset.pk;
        if (k === 'on') p.on = el.checked;
        else if (k === 'name') p.name = el.value;
        else if (k === 'qty') p.qty = el.value === '' ? -1 : Math.max(0, Math.round(num(el.value) || 0));
        else p[k] = num(el.value) ?? 0;
        onChange(false);
      });
    });
    $('[data-pk-del]', tr).onclick = () => { inv.splice(+tr.dataset.row, 1); onChange(true); };
  });
  $('[data-pk-add]', root).onclick = () => { inv.push({ id: uid(), name: 'Gel', carbs: 25, qty: 4, caffeine: 0, sodium: 0, on: true, kind: 'gel' }); onChange(true); };
  $('[data-pk-reset]', root).onclick = () => { inv.splice(0, inv.length, ...seedInventory()); onChange(true); };
  $('[data-pk-arsenal]', root).onclick = async () => {
    const all = arsenal.all();
    const pick = await modal({
      title: 'Add from arsenal',
      render: (b, close) => {
        b.innerHTML = all.length ? `<div class="list">${all.map((a) => `<div class="list-item" data-id="${a.id}"><div class="grow"><div class="t1">${esc(a.name)}</div><div class="t2">${fmt(a.carbs, 'g')} carbs${a.caffeine ? ` · ${a.caffeine} mg caffeine` : ''}${a.sodium ? ` · ${a.sodium} mg Na` : ''}</div></div><span class="muted">+</span></div>`).join('')}</div>` : '<div class="empty">Your arsenal is empty. Add packets in Fueling › Arsenal.</div>';
        b.onclick = (e) => { const it = e.target.closest('[data-id]'); if (it) close(all.find((a) => a.id === it.dataset.id)); };
      },
    });
    if (pick) { inv.push({ ...pick, id: pick.id + '-' + uid().slice(-4), on: true }); onChange(true); }
  };
}

export const activePackets = (inv) => inv.filter((p) => p.on !== false && p.carbs > 0).map((p) => ({ ...p, qty: p.qty === -1 || p.qty == null ? -1 : p.qty }));

export function preStartHtml(st, inv) {
  const opts = inv.filter((p) => p.on !== false && p.carbs > 0);
  return `
    <label class="switch"><input type="checkbox" data-k="preOn" ${st.preOn ? 'checked' : ''}> Take the first fuel <b>before</b> the start</label>
    ${st.preOn ? `<div class="fields" style="margin-top:10px">
      <label class="field"><span class="lbl">Minutes before start</span><div class="input-unit"><input type="number" inputmode="numeric" data-k="preMin" value="${st.preMin ?? 10}"><span class="u">min</span></div></label>
      <label class="field"><span class="lbl">Which packet</span><select data-k="preType"><option value="">Auto (smallest, non-caffeinated)</option>${opts.map((p) => `<option value="${esc(p.id)}" ${st.preType === p.id ? 'selected' : ''}>${esc(p.name)} (${fmt(p.carbs, 'g')})</option>`).join('')}</select></label>
      <label class="check" style="align-self:end"><input type="checkbox" data-k="preCount" ${st.preCount !== false ? 'checked' : ''}> Counts toward the hourly target</label>
    </div>` : ''}`;
}

/** Render a schedule result. */
export function planHtml(plan, { title = 'Fuel plan', massKg = null, showKm = false } = {}) {
  if (!plan) return '';
  const D = plan.durationMin;
  const start = Math.min(0, ...plan.rows.map((r) => r.t));
  const span = Math.max(1, D - start);
  const pos = (t) => ((t - start) / span) * 100;
  const tickStep = D > 480 ? 120 : D > 240 ? 60 : D > 90 ? 30 : 15;
  const ticks = [];
  for (let t = 0; t <= D; t += tickStep) ticks.push(t);
  const kmCol = showKm && plan.rows.some((r) => r.km != null);
  const clockCol = plan.rows.some((r) => r.clock);
  return `
    <div class="stat-row">
      <div class="stat hl"><div class="k">Planned carbs</div><div class="v">${fmt(plan.total, '', { d: 0 })}<small> / ${fmt(plan.target, '', { d: 0 })} g</small></div></div>
      <div class="stat"><div class="k">Average</div><div class="v">${fmt(plan.rateActual, '', { d: 0 })}<small> g/h</small></div></div>
      <div class="stat"><div class="k">Intakes</div><div class="v">${plan.rows.length}${plan.avgInterval ? `<small> · every ~${Math.round(plan.avgInterval)} min</small>` : ''}</div></div>
      ${plan.caffeine ? `<div class="stat"><div class="k">Caffeine</div><div class="v">${fmt(plan.caffeine, '', { d: 0 })}<small> mg${massKg ? ` · ${fmt(plan.caffeine / massKg, '', { d: 1 })} mg/kg` : ''}</small></div></div>` : ''}
      ${plan.sodium ? `<div class="stat"><div class="k">Sodium from packets</div><div class="v">${fmt(plan.sodium, '', { d: 0 })}<small> mg</small></div></div>` : ''}
    </div>
    ${plan.warnings.map((w) => `<div class="note warn" style="margin-top:8px">${esc(w)}</div>`).join('')}
    ${plan.rows.length ? `
    <div class="timeline" aria-hidden="true">
      <div class="track"></div>
      <div class="run" style="left:${pos(0)}%;width:${100 - pos(0)}%"></div>
      ${plan.rows.map((r) => `<div class="mk ${r.pre ? 'pre' : ''} ${r.caffeine ? 'caf' : ''}" style="left:${pos(r.t)}%" title="${esc(r.name)} @ ${fmtDur(r.t)}"><span>${r.carbs}g</span><i></i></div>`).join('')}
      ${ticks.map((t) => `<div class="tick" style="left:${pos(t)}%">${fmtDur(t)}</div>`).join('')}
    </div>
    <div class="table-wrap" style="margin-top:22px"><table class="t">
      <thead><tr><th>#</th><th class="r">Time</th>${clockCol ? '<th class="r">Clock</th>' : ''}${kmCol ? '<th class="r">≈ km</th>' : ''}<th>Take</th><th class="r">Carbs</th><th class="r">Σ carbs</th><th class="r">Σ target</th></tr></thead>
      <tbody>${plan.rows.map((r, i) => `<tr class="${r.pre ? 'pre' : ''}">
        <td>${r.pre ? 'PRE' : i + (plan.rows[0].pre ? 0 : 1)}</td>
        <td class="r num">${r.pre ? `${fmtDur(r.t)}` : fmtDur(r.t)}</td>
        ${clockCol ? `<td class="r num">${r.clock || ''}</td>` : ''}
        ${kmCol ? `<td class="r num">${r.pre ? '' : fmt(r.km, '', { d: 1 })}${r.aid ? ` <span class="badge">aid ${r.aid}</span>` : ''}</td>` : ''}
        <td>${esc(r.name)}${r.caffeine ? ` <span class="badge accent">${r.caffeine} mg caf</span>` : ''}</td>
        <td class="r">${fmt(r.carbs, 'g')}</td>
        <td class="r">${fmt(r.cum, 'g', { d: 0 })}</td>
        <td class="r muted">${fmt(r.targetCum, 'g', { d: 0 })}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="row no-print" style="margin-top:10px">
      <button class="btn small" data-plan-copy>Copy</button>
      ${navigator.share ? '<button class="btn small" data-plan-share>Share</button>' : ''}
      <button class="btn small" data-plan-print>Print</button>
      <button class="btn small" data-plan-ics>Export .txt</button>
    </div>
    ${plan.leftovers?.some((l) => l.left !== Infinity && l.left > 0) ? `<p class="tiny muted">Spare after plan: ${plan.leftovers.filter((l) => l.left !== Infinity && l.left > 0).map((l) => `${l.left}× ${esc(l.name)}`).join(', ')}.</p>` : ''}`
    : '<div class="empty" style="margin-top:10px">No intakes needed for this plan.</div>'}`;
}

export function bindPlan(root, plan, title) {
  if (!plan) return;
  const txt = () => scheduleText(plan, { title });
  $('[data-plan-copy]', root)?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(txt()); toast('Plan copied', 'good'); } catch { toast('Copy failed', 'bad'); }
  });
  $('[data-plan-share]', root)?.addEventListener('click', () => navigator.share({ title, text: txt() }).catch(() => {}));
  $('[data-plan-print]', root)?.addEventListener('click', () => window.print());
  $('[data-plan-ics]', root)?.addEventListener('click', () => downloadFile(`${title.replace(/[^\w-]+/g, '_')}.txt`, txt(), 'text/plain'));
}

export function refsHtml(ids) {
  const uniq = [...new Set(ids)].filter((i) => REFS[i]);
  if (!uniq.length) return '';
  return `<details class="more"><summary>Scientific sources (${uniq.length})</summary><div class="inner"><ol class="refs" style="padding-left:18px;margin:0">${uniq.map((i) => `<li style="margin-bottom:6px">${esc(REFS[i].t)} <a href="${REFS[i].u}" target="_blank" rel="noopener">link</a></li>`).join('')}</ol></div></details>`;
}

/** Save / load plan inputs for a fueling tab. */
export async function savePlan(kind, st) {
  const name = await promptBox('Save plan', 'Plan name', st.planName || '');
  if (!name) return;
  st.planName = name;
  const existing = plans.all().find((p) => p.kind === kind && p.name === name);
  plans.upsert({ id: existing?.id, kind, name, state: JSON.parse(JSON.stringify(st)) });
  toast('Plan saved', 'good');
}
export async function loadPlan(kind) {
  const list = plans.all().filter((p) => p.kind === kind);
  return modal({
    title: 'Load plan',
    render: (b, close) => {
      b.innerHTML = list.length ? `<div class="list">${list.map((p) => `<div class="list-item" data-id="${p.id}"><div class="grow"><div class="t1">${esc(p.name)}</div><div class="t2">${new Date(p.updated).toLocaleString()}</div></div><button class="btn small ghost danger" data-del="${p.id}">Delete</button></div>`).join('')}</div>` : '<div class="empty">No saved plans for this calculator yet.</div>';
      b.onclick = (e) => {
        const d = e.target.closest('[data-del]');
        if (d) { e.stopPropagation(); plans.remove(d.dataset.del); d.closest('.list-item').remove(); return; }
        const it = e.target.closest('[data-id]');
        if (it) close(plans.get(it.dataset.id)?.state);
      };
    },
  });
}

/** Generic binder for [data-k] inputs in fueling tabs. */
export function bindKeys(root, st, onChange, redrawKeys = []) {
  $$('[data-k]', root).forEach((el) => {
    const k = el.dataset.k;
    const ev = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'number') v = num(el.value);
      else v = el.value;
      st[k] = v;
      onChange(redrawKeys.includes(k) || el.type === 'checkbox' || el.tagName === 'SELECT');
    });
  });
}

/** Packet-selection preference (shared by all fueling tabs). */
export function preferHtml(st) {
  const v = st.prefer || 'frequent';
  return `<label class="field" style="margin-top:10px"><span class="lbl">When mixing packet sizes, prefer</span><select data-k="prefer">
    <option value="frequent" ${v === 'frequent' ? 'selected' : ''}>More frequent, smaller intakes (gentler on the gut)</option>
    <option value="fewer" ${v === 'fewer' ? 'selected' : ''}>Fewest intakes (bigger packets)</option></select></label>`;
}
