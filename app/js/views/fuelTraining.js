// Fueling · Training: daily carbs, per-session fuelling, gut-training ramp.
import { $, esc, fmt, fmtDur, parseDur } from '../ui.js';
import { viewState, settings } from '../store.js';
import { buildSchedule } from '../fuel/scheduler.js';
import { GUT, SESSIONS, DAILY_LOAD, trainingSession, gutPlan, dailyCarbs } from '../fuel/science.js';
import { preferHtml, inventoryHtml, bindInventory, activePackets, seedInventory, preStartHtml, planHtml, bindPlan, savePlan, loadPlan, bindKeys, refsHtml } from '../fuel/components.js';

const vs = viewState('fuelTraining', {
  mass: null, load: 'high', type: 'long', duration: '2:00', gut: 'some', raceRate: 75, rateOverride: null,
  preOn: false, preMin: 10, preType: '', preCount: true, startClock: '', inv: null,
  gpCurrent: 40, gpTarget: 90, gpWeeks: 8, gpPerWeek: 1, planName: '',
});

export function mount(root) {
  const st = vs.get();
  if (!st.inv) st.inv = seedInventory();
  if (st.mass == null) st.mass = settings.get().massKg;

  const draw = () => {
    root.innerHTML = `
    <div class="cols-2">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Session</h2><div class="row"><button class="btn small" data-load>Load</button><button class="btn small" data-save>Save</button></div></div>
          <div class="fields">
            <label class="field"><span class="lbl">Session type</span><select data-k="type">${Object.entries(SESSIONS).map(([k, s]) => `<option value="${k}" ${st.type === k ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
            <label class="field"><span class="lbl">Duration <span class="muted">h:mm</span></span><input type="text" data-k="duration" value="${esc(st.duration)}"></label>
            <label class="field"><span class="lbl">Gut training</span><select data-k="gut">${Object.entries(GUT).map(([k, g]) => `<option value="${k}" ${st.gut === k ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}</select></label>
            <label class="field"><span class="lbl">Race-day target <span class="muted">for rehearsals</span></span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="raceRate" value="${st.raceRate ?? ''}"><span class="u">g/h</span></div></label>
            <label class="field"><span class="lbl">Body mass</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="mass" value="${st.mass ?? ''}"><span class="u">kg</span></div></label>
            <label class="field"><span class="lbl">Training load (daily carbs)</span><select data-k="load">${Object.entries(DAILY_LOAD).map(([k, d]) => `<option value="${k}" ${st.load === k ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label>
          </div>
        </div>
        <div class="card"><div class="card-head"><h2>Packets for this session</h2></div><div data-inv>${inventoryHtml(st.inv)}</div>${preferHtml(st)}</div>
        <div class="card">${preStartHtml(st, st.inv)}</div>
        <div class="card">
          <h2>Gut-training plan</h2>
          <div class="fields">
            <label class="field"><span class="lbl">Comfortable now</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="gpCurrent" value="${st.gpCurrent}"><span class="u">g/h</span></div></label>
            <label class="field"><span class="lbl">Race target</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="gpTarget" value="${st.gpTarget}"><span class="u">g/h</span></div></label>
            <label class="field"><span class="lbl">Weeks to race</span><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="gpWeeks" value="${st.gpWeeks}"></label>
            <label class="field"><span class="lbl">Fuelled runs / week</span><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="gpPerWeek" value="${st.gpPerWeek}"></label>
          </div>
          <div data-gp style="margin-top:12px"></div>
        </div>
      </div>
      <div class="stack" data-out></div>
    </div>`;
    bindKeys(root, st, (redraw) => { vs.save(); if (redraw) draw(); else compute(); });
    bindInventory($('[data-inv]', root), st.inv, (redraw) => { vs.save(); redraw ? draw() : compute(); });
    $('[data-save]', root).onclick = () => savePlan('training', st);
    $('[data-load]', root).onclick = async () => { const s = await loadPlan('training'); if (s) { Object.assign(st, s); vs.save(); draw(); } };
    compute();
  };

  const compute = () => {
    const out = $('[data-out]', root);
    const D = parseDur(st.duration) || SESSIONS[st.type]?.def || 60;
    const m = st.mass || 65;
    const s = trainingSession({ type: st.type, durationMin: D, gut: st.gut, raceRate: st.raceRate || 60, massKg: m });
    const daily = dailyCarbs(st.load, m);
    const rate = st.rateOverride ?? s.target;
    const plan = rate > 0 || st.preOn ? buildSchedule({ prefer: st.prefer || 'frequent', durationMin: D, rate, packets: activePackets(st.inv), preStart: { on: st.preOn, min: st.preMin, typeId: st.preType, count: st.preCount !== false }, startClock: st.startClock, massKg: m }) : null;
    const gp = gutPlan({ current: st.gpCurrent, target: st.gpTarget, weeks: st.gpWeeks, perWeek: st.gpPerWeek });
    const title = `${s.label} · ${fmtDur(D)}`;
    out.innerHTML = `
      <div class="card accent">
        <div class="card-head"><h2>${esc(s.label)}</h2><span class="badge">${fmtDur(D)}</span></div>
        <div class="big-result"><span class="value">${rate}</span><span class="unit">g carbs / hour${s.rate[1] ? ` (range ${s.rate[0]}–${s.rate[1]})` : ''}</span></div>
        ${s.notes.map((n) => `<p class="small">${esc(n)}</p>`).join('')}
        <div class="row"><label class="field" style="max-width:200px"><span class="lbl">Override g/h</span><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-ovr value="${st.rateOverride ?? ''}" placeholder="${s.target}"></label></div>
      </div>
      <div class="card stack">
        <div><b>Before:</b> ${esc(s.pre)}</div>
        <div><b>After:</b> ${esc(s.post)}</div>
        <div><b>Daily carbohydrate</b> for ${esc(daily.label.toLowerCase())}: ${daily.gkg[0]}–${daily.gkg[1]} g/kg → <b>${daily.g[0]}–${daily.g[1]} g/day</b>.</div>
      </div>
      <div class="card"><div class="card-head"><h2>Session schedule</h2></div>${plan ? planHtml(plan, { title, massKg: m }) : '<div class="empty">No carbohydrate needed during this session.</div>'}</div>
      ${refsHtml([...s.refs, ...daily.refs, ...gp.refs])}`;
    out.querySelector('[data-ovr]').addEventListener('change', (e) => { st.rateOverride = e.target.value === '' ? null : +e.target.value; vs.save(); compute(); });
    if (plan) bindPlan(out, plan, title);
    $('[data-gp]', root).innerHTML = `
      ${gp.warn ? `<div class="note warn small">${esc(gp.warn)}</div>` : ''}
      <div class="table-wrap" style="margin-top:8px"><table class="t"><thead><tr><th>Week</th><th class="r">Target in long runs</th><th>Notes</th></tr></thead><tbody>
      ${gp.weeks.map((w) => `<tr><td>${w.week}</td><td class="r"><b>${w.rate} g/h</b> × ${w.sessions}</td><td class="small muted" style="white-space:normal">${esc(w.note)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="tiny muted">Repeated practice at higher intakes reduces GI symptoms and improves glucose availability; two weeks of daily gut challenges already help (Costa 2017). Use your race products and practise at race pace in the final weeks.</p>`;
  };
  draw();
}
