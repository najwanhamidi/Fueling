// Fueling · Basic: target g/h + packets + duration → when to take what.
import { $, esc, fmt, fmtDur, parseDur, parsePace } from '../ui.js';
import { viewState, settings } from '../store.js';
import { buildSchedule } from '../fuel/scheduler.js';
import { preferHtml, inventoryHtml, bindInventory, activePackets, seedInventory, preStartHtml, planHtml, bindPlan, savePlan, loadPlan, bindKeys } from '../fuel/components.js';

const vs = viewState('fuelBasic', {
  rate: 60, duration: '2:00', inv: null, preOn: false, preMin: 10, preType: '', preCount: true,
  firstAt: null, endBuffer: 0, startClock: '', pace: '', roundTo5: false, planName: '',
});

export function mount(root) {
  const st = vs.get();
  if (!st.inv) st.inv = seedInventory();

  const draw = () => {
    root.innerHTML = `
    <div class="cols-2">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Your plan</h2><div class="row"><button class="btn small" data-load>Load</button><button class="btn small" data-save>Save</button></div></div>
          <div class="fields">
            <label class="field"><span class="lbl">Carbs per hour</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="rate" value="${st.rate ?? ''}"><span class="u">g/h</span></div></label>
            <label class="field"><span class="lbl">Duration <span class="muted">h:mm</span></span><input type="text" data-k="duration" value="${esc(st.duration)}" placeholder="2:30"></label>
          </div>
          <div class="chips" style="margin-top:10px">${[30, 45, 60, 75, 90, 100, 120].map((r) => `<button class="chip ${+st.rate === r ? 'active' : ''}" data-rate="${r}">${r} g/h</button>`).join('')}</div>
          <details class="more" style="margin-top:12px"><summary>Timing options</summary><div class="inner">
            <div class="fields">
              <label class="field"><span class="lbl">First intake at <span class="muted">min</span></span><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="firstAt" value="${st.firstAt ?? ''}" placeholder="auto"></label>
              <label class="field"><span class="lbl">Stop fuelling before end</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="endBuffer" value="${st.endBuffer ?? 0}"><span class="u">min</span></div></label>
              <label class="field"><span class="lbl">Start clock <span class="muted">optional</span></span><input type="time" data-k="startClock" value="${esc(st.startClock || '')}"></label>
              <label class="field"><span class="lbl">Pace <span class="muted">min:ss /km, for km marks</span></span><input type="text" data-k="pace" value="${esc(st.pace || '')}" placeholder="5:30"></label>
            </div>
            <label class="check" style="margin-top:8px"><input type="checkbox" data-k="roundTo5" ${st.roundTo5 ? 'checked' : ''}> Round times to 5 min</label>
          </div></details>
        </div>
        <div class="card">
          <div class="card-head"><h2>Packets you have</h2></div>
          <div data-inv>${inventoryHtml(st.inv)}</div>${preferHtml(st)}
        </div>
        <div class="card" data-pre>${preStartHtml(st, st.inv)}</div>
      </div>
      <div class="stack"><div class="card accent" data-out></div></div>
    </div>`;
    bindKeys(root, st, (redraw) => { vs.save(); redraw ? draw() : compute(); });
    root.querySelectorAll('[data-rate]').forEach((b) => (b.onclick = () => { st.rate = +b.dataset.rate; vs.save(); draw(); }));
    bindInventory($('[data-inv]', root), st.inv, (redraw) => { vs.save(); redraw ? draw() : compute(); });
    $('[data-save]', root).onclick = () => savePlan('basic', st);
    $('[data-load]', root).onclick = async () => { const s = await loadPlan('basic'); if (s) { Object.assign(st, s); vs.save(); draw(); } };
    compute();
  };

  const compute = () => {
    const out = $('[data-out]', root);
    const D = parseDur(st.duration);
    if (!(D > 0)) { out.innerHTML = '<div class="empty">Enter the duration (e.g. 1:45).</div>'; return; }
    const plan = buildSchedule({ prefer: st.prefer || 'frequent',
      durationMin: D, rate: st.rate || 0, packets: activePackets(st.inv),
      preStart: { on: st.preOn, min: st.preMin, typeId: st.preType, count: st.preCount !== false },
      firstAt: st.firstAt, endBuffer: st.endBuffer, startClock: st.startClock, paceSecKm: parsePace(st.pace), roundTo5: st.roundTo5,
      massKg: settings.get().massKg,
    });
    const title = `Fuel plan · ${fmtDur(D)} @ ${st.rate} g/h`;
    out.innerHTML = `<div class="card-head"><h2>When to fuel</h2><span class="badge">${fmtDur(D)} · ${fmt(st.rate, 'g/h')}</span></div>${planHtml(plan, { title, massKg: settings.get().massKg, showKm: !!parsePace(st.pace) })}`;
    bindPlan(out, plan, title);
  };
  draw();
}
