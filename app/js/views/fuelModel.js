// Fueling · Metabolic model: glycogen depletion ("hitting the wall") after Rapoport 2010.
import { $, esc, fmt, fmtDur, parseDur, fmtPace } from '../ui.js';
import { viewState, settings } from '../store.js';
import { buildSchedule } from '../fuel/scheduler.js';
import { DISTANCES, GUT, glycogenModel, wallFreeTime, vdotFromRace, predictTime, guidelineRate } from '../fuel/science.js';
import { preferHtml, inventoryHtml, bindInventory, activePackets, seedInventory, preStartHtml, planHtml, bindPlan, savePlan, loadPlan, bindKeys, refsHtml } from '../fuel/components.js';

const vs = viewState('fuelModel', {
  mass: null, sex: 'm', vo2Mode: 'race', vo2max: 50, refDist: '10k', refTime: '0:48:00', distId: 'm', km: 42.195, finish: '3:45',
  glyState: 'normal', fed: true, eff: 75, reserve: 10, gut: 'some', fatAdapt: 0, kcal: 1.0, rateChoice: 'rec', rateCustom: null,
  preOn: true, preMin: 15, preType: '', preCount: true, endBuffer: 15, startClock: '', inv: null, planName: '',
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
          <div class="card-head"><h2>Runner</h2><div class="row"><button class="btn small" data-load>Load</button><button class="btn small" data-save>Save</button></div></div>
          <div class="fields">
            <label class="field"><span class="lbl">Body mass</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="mass" value="${st.mass ?? ''}"><span class="u">kg</span></div></label>
            <label class="field"><span class="lbl">Sex <span class="muted">(leg-muscle default)</span></span><select data-k="sex"><option value="m" ${st.sex === 'm' ? 'selected' : ''}>Male</option><option value="f" ${st.sex === 'f' ? 'selected' : ''}>Female</option></select></label>
            <label class="field"><span class="lbl">Fitness from</span><select data-k="vo2Mode"><option value="race" ${st.vo2Mode === 'race' ? 'selected' : ''}>Recent race result</option><option value="direct" ${st.vo2Mode === 'direct' ? 'selected' : ''}>Known VO₂max</option></select></label>
            ${st.vo2Mode === 'direct'
              ? `<label class="field"><span class="lbl">VO₂max</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="vo2max" value="${st.vo2max ?? ''}"><span class="u">ml/kg/min</span></div></label>`
              : `<label class="field"><span class="lbl">Recent race</span><select data-k="refDist">${DISTANCES.slice(0, 7).map((d) => `<option value="${d.id}" ${st.refDist === d.id ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label>
                 <label class="field"><span class="lbl">Time <span class="muted">h:mm:ss</span></span><input type="text" data-k="refTime" value="${esc(st.refTime)}"></label>`}
          </div>
        </div>
        <div class="card">
          <h2>Target race</h2>
          <div class="fields">
            <label class="field"><span class="lbl">Distance</span><select data-k="distId">${DISTANCES.map((d) => `<option value="${d.id}" ${st.distId === d.id ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}<option value="custom" ${st.distId === 'custom' ? 'selected' : ''}>Custom…</option></select></label>
            ${st.distId === 'custom' ? `<label class="field"><span class="lbl">km</span><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" step="any" data-k="km" value="${st.km ?? ''}"></label>` : ''}
            <label class="field"><span class="lbl">Target finish <span class="muted">h:mm</span></span><input type="text" data-k="finish" value="${esc(st.finish)}"></label>
            <label class="field"><span class="lbl">Glycogen status</span><select data-k="glyState">${[['normal', 'Normal diet'], ['partial', 'Partial load (1 high-carb day)'], ['loaded', 'Full carb-load (36–48 h)']].map(([v, l]) => `<option value="${v}" ${st.glyState === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="field"><span class="lbl">Pre-race breakfast</span><select data-k="fed"><option value="true" ${st.fed !== false && st.fed !== 'false' ? 'selected' : ''}>Yes (liver topped up)</option><option value="false" ${st.fed === false || st.fed === 'false' ? 'selected' : ''}>No (overnight fast)</option></select></label>
            <label class="field"><span class="lbl">Gut tolerance</span><select data-k="gut">${Object.entries(GUT).map(([k, g]) => `<option value="${k}" ${st.gut === k ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}</select></label>
          </div>
          <details class="more" style="margin-top:12px"><summary>Model parameters</summary><div class="inner">
            <div class="fields">
              <label class="field"><span class="lbl">Oxidation efficiency</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="eff" value="${st.eff}"><span class="u">%</span></div></label>
              <label class="field"><span class="lbl">Safety reserve</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="reserve" value="${st.reserve}"><span class="u">%</span></div></label>
              <label class="field"><span class="lbl">Energy cost</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" step="0.05" data-k="kcal" value="${st.kcal}"><span class="u">kcal/kg/km</span></div></label>
              <label class="field"><span class="lbl">Fat adaptation</span><select data-k="fatAdapt">${[[0, 'None'], [0.05, 'Some (−5% carb use)'], [0.1, 'High (−10%)']].map(([v, l]) => `<option value="${v}" ${+st.fatAdapt === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
              <label class="field"><span class="lbl">Stop fuelling before finish</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-k="endBuffer" value="${st.endBuffer ?? 15}"><span class="u">min</span></div></label>
              <label class="field"><span class="lbl">Start clock</span><input type="time" data-k="startClock" value="${esc(st.startClock || '')}"></label>
            </div>
            <p class="tiny muted">Efficiency = share of ingested carbohydrate actually oxidised and sparing glycogen (~60–80%). Reserve = glycogen you shouldn't count on (muscle never fully empties).</p>
          </div></details>
        </div>
        <div class="card"><div class="card-head"><h2>Arsenal for this race</h2></div><div data-inv>${inventoryHtml(st.inv)}</div>${preferHtml(st)}</div>
        <div class="card">${preStartHtml(st, st.inv)}</div>
      </div>
      <div class="stack" data-out></div>
    </div>`;
    bindKeys(root, st, (redraw) => { vs.save(); redraw ? draw() : compute(); }, ['vo2Mode', 'distId']);
    bindInventory($('[data-inv]', root), st.inv, (redraw) => { vs.save(); redraw ? draw() : compute(); });
    $('[data-save]', root).onclick = () => savePlan('model', st);
    $('[data-load]', root).onclick = async () => { const s = await loadPlan('model'); if (s) { Object.assign(st, s); vs.save(); draw(); } };
    compute();
  };

  const compute = () => {
    const out = $('[data-out]', root);
    const dist = st.distId === 'custom' ? st.km : DISTANCES.find((d) => d.id === st.distId)?.km;
    const T = parseDur(st.finish);
    let vo2max = st.vo2max;
    if (st.vo2Mode === 'race') {
      const rd = DISTANCES.find((d) => d.id === st.refDist);
      const rt = parseDur(st.refTime);
      vo2max = rd && rt ? vdotFromRace(rd.km, rt) : null;
    }
    if (!(dist > 0 && T > 0 && vo2max > 20)) { out.innerHTML = '<div class="card"><div class="empty">Enter fitness, distance and target time.</div></div>'; return; }
    const m = st.mass || 65;
    const gutCap = GUT[st.gut]?.cap ?? 75;
    const fed = !(st.fed === false || st.fed === 'false');
    const preCarbs = st.preOn ? (activePackets(st.inv).find((p) => p.id === st.preType) || [...activePackets(st.inv)].sort((a, b) => (a.caffeine > 0) - (b.caffeine > 0) || a.carbs - b.carbs)[0])?.carbs || 0 : 0;
    const params = { massKg: m, sex: st.sex, vo2max, distKm: dist, timeMin: T, glyState: st.glyState, fed, eff: (st.eff || 75) / 100, reservePct: st.reserve ?? 10, fatAdapt: +st.fatAdapt || 0, kcalPerKgKm: st.kcal || 1, preCarbs };
    const base = glycogenModel(params);
    const g = guidelineRate({ durationMin: T, intensity: 'race', gut: st.gut });
    const minR = Math.ceil(base.minRate / 5) * 5;
    const rec = Math.min(gutCap, Math.max(minR > 0 ? minR + 5 : 0, g.target));
    const choice = st.rateChoice === 'min' ? minR : st.rateChoice === 'guide' ? g.target : st.rateChoice === 'custom' ? (st.rateCustom ?? rec) : rec;
    const model = glycogenModel({ ...params, planRate: choice });
    const feasible = base.minRate <= gutCap;
    const wfNone = wallFreeTime({ ...params, preCarbs: 0 }, 0);
    const wfGut = wallFreeTime(params, gutCap);
    const predicted = predictTime(vo2max, dist);
    const plan = choice > 0 || st.preOn ? buildSchedule({ prefer: st.prefer || 'frequent',
      durationMin: T, rate: choice, packets: activePackets(st.inv), preStart: { on: st.preOn, min: st.preMin, typeId: st.preType, count: st.preCount !== false },
      endBuffer: st.endBuffer, startClock: st.startClock, paceSecKm: (T * 60) / dist, distanceKm: dist, massKg: m,
    }) : null;
    const title = `${DISTANCES.find((d) => d.id === st.distId)?.label || `${dist} km`} · ${fmtDur(T)}`;

    out.innerHTML = `
      <div class="card accent">
        <div class="card-head"><h2>Glycogen forecast</h2><span class="badge">${esc(title)} · ${fmtPace(base.paceSecKm)}/km</span></div>
        <div class="stat-row">
          <div class="stat"><div class="k">VO₂max ${st.vo2Mode === 'race' ? '(VDOT)' : ''}</div><div class="v">${fmt(vo2max, '', { d: 1 })}</div></div>
          <div class="stat"><div class="k">Intensity</div><div class="v">${fmt(base.u * 100, '', { d: 0 })}<small> % VO₂max</small></div></div>
          <div class="stat"><div class="k">From carbs</div><div class="v">${fmt(base.fc * 100, '', { d: 0 })}<small> % energy</small></div></div>
          <div class="stat"><div class="k">Carb burn</div><div class="v">${fmt(base.carbGph, '', { d: 0 })}<small> g/h</small></div></div>
          <div class="stat"><div class="k">Glycogen stores</div><div class="v">${fmt(base.G0, '', { d: 0 })}<small> g (legs ${fmt(base.muscleG, '', { d: 0 })} + liver ${fmt(base.liverG, '', { d: 0 })})</small></div></div>
          <div class="stat ${base.wallKm < dist ? 'hl' : ''}"><div class="k">Wall without fuel</div><div class="v">${base.wallKm >= dist ? 'none' : `${fmt(base.wallKm, '', { d: 1 })}<small> km · ${fmtDur(base.wallMin)}</small>`}</div></div>
        </div>
        ${predicted < T * 0.97 ? `<p class="tiny muted">Your fitness predicts ${fmtDur(predicted)} for this distance, so the target is comfortably within reach.</p>` : predicted > T * 1.03 ? `<div class="note warn small" style="margin-top:8px">Your fitness predicts about ${fmtDur(predicted)}. The target pace is ${fmt(((predicted - T) / T) * 100, '%', { d: 0 })} faster, so carb burn (and wall risk) will be higher than shown if you push it.</div>` : ''}
        <div class="chart" style="margin-top:12px">${chartSvg(model, dist)}</div>
      </div>
      <div class="card">
        <h2>Carbohydrate needed during the race</h2>
        <div class="stat-row">
          <div class="stat ${st.rateChoice === 'min' ? 'hl' : ''}"><div class="k">Minimum (model)</div><div class="v">${minR}<small> g/h</small></div></div>
          <div class="stat ${st.rateChoice === 'guide' ? 'hl' : ''}"><div class="k">Guidelines</div><div class="v">${g.target}<small> g/h</small></div></div>
          <div class="stat ${st.rateChoice === 'rec' || !st.rateChoice ? 'hl' : ''}"><div class="k">Recommended</div><div class="v">${rec}<small> g/h</small></div></div>
          <div class="stat"><div class="k">Your gut limit</div><div class="v">${gutCap}<small> g/h</small></div></div>
        </div>
        ${!feasible ? `<div class="note bad" style="margin-top:10px">At this pace you'd need ≥ ${minR} g/h to avoid the wall, more than your gut tolerance (${gutCap} g/h). Options: carb-load, train your gut, or start slower. ${wfGut ? `The fastest wall-free finish at ${gutCap} g/h is about <b>${fmtDur(wfGut)}</b> (${fmtPace((wfGut * 60) / dist)}/km).` : ''}</div>`
          : `<div class="note good" style="margin-top:10px">${base.minRate <= 0 ? 'Your glycogen stores cover this race on their own.' : `≥ ${minR} g/h keeps you off the wall.`} The recommendation (${rec} g/h) adds performance headroom per current guidelines${rec >= gutCap ? ', capped at your gut limit' : ''}.</div>`}
        <p class="tiny muted">${wfNone ? `Without any fuel, you could hold up to ~${fmtPace((wfNone * 60) / dist)}/km (${fmtDur(wfNone)}) before glycogen runs out.` : ''}</p>
        <div class="row" style="margin-top:8px"><span class="small muted">Plan with</span>
          <div class="seg" data-rc>${[['rec', `Recommended ${rec}`], ['min', `Minimum ${minR}`], ['guide', `Guidelines ${g.target}`], ['custom', 'Custom']].map(([v, l]) => `<button type="button" data-v="${v}" class="${(st.rateChoice || 'rec') === v ? 'active' : ''}">${l}</button>`).join('')}</div>
          ${st.rateChoice === 'custom' ? `<input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" style="width:100px" data-rcv value="${st.rateCustom ?? rec}"> g/h` : ''}
        </div>
      </div>
      <div class="card"><div class="card-head"><h2>Race-day schedule</h2><span class="badge">${choice} g/h</span></div>${plan ? planHtml(plan, { title, massKg: m, showKm: true }) : '<div class="empty">No fuel needed.</div>'}</div>
      <div class="card small muted">
        <b>How this works.</b> Running costs ≈ ${st.kcal || 1} kcal per kg per km. At ${fmt(base.u * 100, '', { d: 0 })}% of VO₂max about ${fmt(base.fc * 100, '', { d: 0 })}% of that comes from carbohydrate (Romijn 1993 data, as used by Rapoport 2010). Usable carbohydrate is leg-muscle glycogen (${fmt(base.legFrac * 100, '', { d: 1 })}% of body mass as leg muscle) plus liver glycogen. When cumulative carbohydrate use exceeds stores you "hit the wall". Fuel taken during the race offsets the deficit at the oxidation efficiency set above. VO₂max from a race uses the Daniels–Gilbert VDOT equations. It's a model, so use it to compare scenarios, not as a guarantee.
      </div>
      ${refsHtml(['rapoport2010', 'romijn1993', 'daniels', ...g.refs, 'burke2011'])}`;
    out.querySelector('[data-rc]').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; st.rateChoice = b.dataset.v; vs.save(); compute(); };
    out.querySelector('[data-rcv]')?.addEventListener('change', (e) => { st.rateCustom = +e.target.value || 0; vs.save(); compute(); });
    if (plan) bindPlan(out, plan, `Fuel plan (model) · ${title}`);
  };
  draw();
}

function chartSvg(model, dist) {
  const s = model.series;
  const W = 640, H = 260, L = 48, R = 12, Tp = 14, B = 34;
  const all = [...s.none, ...s.min, ...(s.plan || [])];
  const yMax = Math.max(...all, 10) * 1.05;
  const yMin = Math.min(0, Math.min(...all));
  const x = (km) => L + (km / dist) * (W - L - R);
  const y = (g) => Tp + (1 - (g - yMin) / (yMax - yMin)) * (H - Tp - B);
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(s.km[i]).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const kmStep = dist > 100 ? 20 : dist > 50 ? 10 : dist > 20 ? 5 : dist > 8 ? 2 : 1;
  const gStep = yMax > 800 ? 200 : yMax > 400 ? 100 : 50;
  let grid = '';
  for (let g = 0; g <= yMax; g += gStep) grid += `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(g) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${g}</text>`;
  for (let k = 0; k <= dist + 0.01; k += kmStep) grid += `<text x="${x(k)}" y="${H - B + 16}" text-anchor="middle" font-size="11" fill="var(--muted)">${k}</text>`;
  const reserveY = y(model.reserveG);
  const wall = model.wallKm < dist ? `<line x1="${x(model.wallKm)}" x2="${x(model.wallKm)}" y1="${Tp}" y2="${H - B}" stroke="var(--bad)" stroke-dasharray="4 4"/><text x="${x(model.wallKm) + 4}" y="${Tp + 12}" font-size="11" fill="var(--bad)">wall ${model.wallKm.toFixed(1)} km</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Glycogen remaining vs distance">
    ${grid}
    <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)" stroke-width="1"/>
    <line x1="${L}" x2="${W - R}" y1="${reserveY}" y2="${reserveY}" stroke="var(--warn)" stroke-dasharray="2 4"/>
    ${wall}
    <path d="${path(s.none)}" fill="none" stroke="var(--bad)" stroke-width="2.5"/>
    <path d="${path(s.min)}" fill="none" stroke="var(--warn)" stroke-width="2" stroke-dasharray="6 4"/>
    ${s.plan && s.plan.length ? `<path d="${path(s.plan)}" fill="none" stroke="var(--good)" stroke-width="3"/>` : ''}
    <text x="${W - R}" y="${H - 4}" text-anchor="end" font-size="11" fill="var(--muted)">km</text>
    <text x="4" y="${Tp - 2}" font-size="11" fill="var(--muted)">glycogen g</text>
  </svg>
  <div class="legend"><span><i style="background:var(--bad)"></i>No fuel</span><span><i style="background:var(--warn)"></i>Minimum intake</span><span><i style="background:var(--good)"></i>Your plan</span><span><i style="background:var(--warn);height:1px"></i>Reserve</span></div>`;
}
