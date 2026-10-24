// Fueling · Guidelines (race): evidence-based sliding scale by duration, intensity and gut training.
import { $, esc, fmt, fmtDur, parseDur, fmtPace } from '../ui.js';
import { viewState, settings } from '../store.js';
import { buildSchedule } from '../fuel/scheduler.js';
import { DISTANCES, GUT, guidelineRate, preRace, hydration, caffeinePlan, recovery, riegel } from '../fuel/science.js';
import { preferHtml, inventoryHtml, bindInventory, activePackets, seedInventory, preStartHtml, planHtml, bindPlan, savePlan, loadPlan, bindKeys, refsHtml } from '../fuel/components.js';

const vs = viewState('fuelGuide', {
  distId: 'hm', km: 21.0975, finish: '1:55', intensity: 'race', gut: 'some', mass: null, climate: 'hothumid', salty: false, sweat: null,
  rateOverride: null, preOn: true, preMin: 15, preType: '', preCount: true, endBuffer: 10, startClock: '', aidKm: null, snapAid: false,
  caffeineLate: true, inv: null, planName: '', set: 'contemporary',
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
          <div class="card-head"><h2>Race</h2><div class="row"><button class="btn small" data-load>Load</button><button class="btn small" data-save>Save</button></div></div>
          <div class="stack" style="margin-bottom:12px"><span class="small muted">Guideline set</span>
            <select data-k="set"><option value="contemporary" ${st.set !== 'classic' ? 'selected' : ''}>Contemporary (2022–25 research: up to 120 g/h if gut-trained)</option><option value="classic" ${st.set === 'classic' ? 'selected' : ''}>Classic (ACSM 2016 / Jeukendrup 2014: max 90 g/h)</option></select></div>
          <div class="fields">
            <label class="field"><span class="lbl">Distance</span><select data-k="distId">${DISTANCES.map((d) => `<option value="${d.id}" ${st.distId === d.id ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}<option value="custom" ${st.distId === 'custom' ? 'selected' : ''}>Custom…</option></select></label>
            ${st.distId === 'custom' ? `<label class="field"><span class="lbl">Distance km</span><input type="number" inputmode="decimal" step="any" data-k="km" value="${st.km ?? ''}"></label>` : ''}
            <label class="field"><span class="lbl">Expected finish <span class="muted">h:mm</span></span><input type="text" inputmode="numeric" data-k="finish" value="${esc(st.finish)}" placeholder="1:55"></label>
            <label class="field"><span class="lbl">Effort</span><select data-k="intensity">
              ${[['race', 'Race effort'], ['hard', 'Hard / tempo'], ['moderate', 'Steady'], ['easy', 'Easy (e.g. ultra pace)']].map(([v, l]) => `<option value="${v}" ${st.intensity === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="field"><span class="lbl">Gut training</span><select data-k="gut">${Object.entries(GUT).map(([k, g]) => `<option value="${k}" ${st.gut === k ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}</select></label>
            <label class="field"><span class="lbl">Body mass</span><div class="input-unit"><input type="number" inputmode="decimal" data-k="mass" value="${st.mass ?? ''}"><span class="u">kg</span></div></label>
          </div>
          <details class="more" style="margin-top:12px"><summary>Conditions, hydration & timing</summary><div class="inner">
            <div class="fields">
              <label class="field"><span class="lbl">Climate</span><select data-k="climate">${[['cool', 'Cool < 15 °C'], ['temperate', 'Mild 15–24 °C'], ['hot', 'Hot > 25 °C'], ['hothumid', 'Hot & humid (tropics)']].map(([v, l]) => `<option value="${v}" ${st.climate === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
              <label class="field"><span class="lbl">Sweat rate <span class="muted">optional</span></span><div class="input-unit"><input type="number" inputmode="decimal" step="any" data-k="sweat" value="${st.sweat ?? ''}" placeholder="e.g. 1.2"><span class="u">L/h</span></div></label>
              <label class="field"><span class="lbl">Stop fuelling before finish</span><div class="input-unit"><input type="number" inputmode="numeric" data-k="endBuffer" value="${st.endBuffer ?? 10}"><span class="u">min</span></div></label>
              <label class="field"><span class="lbl">Start clock</span><input type="time" data-k="startClock" value="${esc(st.startClock || '')}"></label>
              <label class="field"><span class="lbl">Aid stations every <span class="muted">km</span></span><input type="number" inputmode="decimal" step="any" data-k="aidKm" value="${st.aidKm ?? ''}" placeholder="e.g. 2.5"></label>
            </div>
            <label class="check"><input type="checkbox" data-k="salty" ${st.salty ? 'checked' : ''}> Salty sweater (white streaks on kit)</label>
            <label class="check"><input type="checkbox" data-k="snapAid" ${st.snapAid ? 'checked' : ''}> Move intakes to aid stations (take gels with water)</label>
            <label class="check"><input type="checkbox" data-k="caffeineLate" ${st.caffeineLate !== false ? 'checked' : ''}> Schedule caffeinated packets in the second half</label>
          </div></details>
        </div>
        <div class="card"><div class="card-head"><h2>Your arsenal for this race</h2></div><div data-inv>${inventoryHtml(st.inv)}</div>${preferHtml(st)}</div>
        <div class="card">${preStartHtml(st, st.inv)}</div>
      </div>
      <div class="stack" data-out></div>
    </div>`;
    bindKeys(root, st, (redraw) => { vs.save(); redraw ? draw() : compute(); }, ['distId']);
    bindInventory($('[data-inv]', root), st.inv, (redraw) => { vs.save(); redraw ? draw() : compute(); });
    $('[data-save]', root).onclick = () => savePlan('guide', st);
    $('[data-load]', root).onclick = async () => { const s = await loadPlan('guide'); if (s) { Object.assign(st, s); vs.save(); draw(); } };
    compute();
  };

  const compute = () => {
    const out = $('[data-out]', root);
    const dist = st.distId === 'custom' ? st.km : DISTANCES.find((d) => d.id === st.distId)?.km;
    const D = parseDur(st.finish);
    if (!(D > 0) || !(dist > 0)) { out.innerHTML = '<div class="card"><div class="empty">Enter distance and expected finish time.</div></div>'; return; }
    const m = st.mass || 65;
    const g = guidelineRate({ durationMin: D, intensity: st.intensity, gut: st.gut, set: st.set });
    const rate = st.rateOverride ?? g.target;
    const pace = (D * 60) / dist;
    const plan = rate > 0 || st.preOn ? buildSchedule({ prefer: st.prefer || 'frequent',
      durationMin: D, rate, packets: activePackets(st.inv),
      preStart: { on: st.preOn, min: st.preMin, typeId: st.preType, count: st.preCount !== false },
      endBuffer: st.endBuffer, startClock: st.startClock, paceSecKm: pace, distanceKm: dist,
      aidEveryKm: st.aidKm, snapAid: st.snapAid, caffeineLate: st.caffeineLate !== false, massKg: m,
    }) : null;
    const pre = preRace({ massKg: m, durationMin: D });
    const hyd = hydration({ durationMin: D, climate: st.climate, sweatRateL: st.sweat, salty: st.salty, massKg: m });
    const caf = caffeinePlan({ massKg: m, durationMin: D });
    const rec = recovery({ massKg: m });
    const title = `${DISTANCES.find((d) => d.id === st.distId)?.label || `${dist} km`} · ${fmtDur(D)}`;

    // overview across distances (Riegel prediction from this race)
    const overview = DISTANCES.map((d) => {
      const t = riegel(D, dist, d.km);
      const gg = guidelineRate({ durationMin: t, intensity: d.km > 50 ? 'moderate' : st.intensity, gut: st.gut, set: st.set });
      return { d, t, g: gg, total: (gg.target * t) / 60 };
    });

    out.innerHTML = `
      <div class="card accent">
        <div class="card-head"><h2>Recommendation</h2><span class="badge">${esc(title)} · ${fmtPace(pace)}/km</span></div>
        <div class="big-result"><span class="value">${rate}</span><span class="unit">g carbs / hour</span></div>
        <div class="small muted">Evidence range for this duration: ${g.min}–${g.max} g/h${g.gutCap < g.max ? ` (capped at ${g.gutCap} for your gut training)` : ''} · total ≈ ${fmt((rate * D) / 60, 'g', { d: 0 })}</div>
        <p class="small">${esc(g.why)}</p>
        <div class="note small">${esc(g.carbType)}</div>
        <div class="row" style="margin-top:10px"><label class="field" style="max-width:220px"><span class="lbl">Override g/h</span><input type="number" inputmode="decimal" data-ovr value="${st.rateOverride ?? ''}" placeholder="${g.target}"></label></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Race-day schedule</h2></div>
        ${plan ? planHtml(plan, { title, massKg: m, showKm: true }) : '<div class="empty">No fuel needed during this race. Focus on pre-race fuelling.</div>'}
      </div>
      <div class="card stack">
        <h2>Before the race</h2>
        <div><b>Carbohydrate ${D > 90 ? 'loading' : 'intake'}:</b> ${pre.loading.gkg[0]}–${pre.loading.gkg[1]} g/kg/day for ${pre.loading.window} → <b>${pre.loading.g[0]}–${pre.loading.g[1]} g/day</b>. <span class="muted small">${esc(pre.loading.note)}</span></div>
        <div><b>Pre-race meal:</b> ${pre.meal.gkg[0]}–${pre.meal.gkg[1]} g/kg ${pre.meal.window}: ${esc(pre.meal.suggestion)}. Familiar, low fibre/fat.</div>
        <div><b>Top-up:</b> ${esc(pre.topUp)}</div>
        <div><b>Caffeine (optional):</b> ${esc(caf.suggestion)} <span class="muted small">${esc(caf.note)}</span></div>
      </div>
      <div class="card stack">
        <h2>Fluids & electrolytes</h2>
        <div class="stat-row">
          <div class="stat"><div class="k">Fluid</div><div class="v">${hyd.fluid[0]}–${hyd.fluid[1]}<small> ml/h</small></div></div>
          <div class="stat"><div class="k">Sodium</div><div class="v">${hyd.sodium[0]}–${hyd.sodium[1]}<small> mg/h</small></div></div>
          ${plan && hyd.sodium[1] ? `<div class="stat"><div class="k">Sodium from your packets</div><div class="v">${fmt(plan.sodium / (D / 60), '', { d: 0 })}<small> mg/h</small></div></div>` : ''}
        </div>
        ${hyd.notes.map((n) => `<div class="small muted">• ${esc(n)}</div>`).join('')}
      </div>
      <div class="card stack">
        <h2>After</h2>
        <div class="small">${esc(rec.quick)}</div><div class="small muted">${esc(rec.normal)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>All distances at your level</h2><span class="tiny muted">times predicted from this race (Riegel)</span></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Race</th><th class="r">Est. time</th><th class="r">g/h</th><th class="r">Total</th><th>Notes</th></tr></thead><tbody>
          ${overview.map((o) => `<tr ${o.d.id === st.distId ? 'style="background:var(--card2)"' : ''}><td>${esc(o.d.label)}</td><td class="r num">${fmtDur(o.t)}</td><td class="r"><b>${o.g.target}</b></td><td class="r">${fmt(o.total, 'g', { d: 0 })}</td><td class="small muted">${o.t < 30 ? 'No fuel needed' : o.t < 75 ? 'Mouth rinse / optional gel' : o.t > 90 ? 'Carb-load 36–48 h' : 'Normal high-carb day before'}${o.g.target > 60 ? ' · dual-carb' : ''}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      ${refsHtml([...g.refs, ...pre.loading.refs, ...pre.meal.refs, ...hyd.refs, ...caf.refs, ...rec.refs])}`;
    out.querySelector('[data-ovr]').addEventListener('change', (e) => { const v = e.target.value === '' ? null : +e.target.value; st.rateOverride = v; vs.save(); compute(); });
    if (plan) bindPlan(out, plan, `Race fuel plan · ${title}`);
  };
  draw();
}
