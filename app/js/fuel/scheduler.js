// Fueling scheduler: pick packets from inventory to hit a carb target and spread them over time.
// Pure functions (no DOM) so they can be unit-tested.

const UNIT = 0.5; // grams resolution for packet selection

/**
 * Choose how many of each packet type to use so total carbs ≈ target, respecting quantities.
 * @param {{id:string, carbs:number, qty:number}[]} types qty may be Infinity
 * @param {number} target grams
 * @returns {{counts:Record<string,number>, total:number, short:boolean}}
 */
export function selectPackets(types, target, { countPenalty = 1.0, prefer = 'fewer' } = {}) {
  if (prefer === 'frequent') return selectPacketsFrequent(types, target);
  const valid = types.filter((t) => t.carbs > 0 && (t.qty ?? 0) > 0);
  const counts = Object.fromEntries(types.map((t) => [t.id, 0]));
  if (!(target > 0) || !valid.length) return { counts, total: 0, short: target > 0 };
  const T = Math.round(target / UNIT);
  const maxC = Math.max(...valid.map((t) => Math.round(t.carbs / UNIT)));
  const S = T + maxC;
  // binary-split bounded items
  const items = [];
  for (const t of valid) {
    const w = Math.max(1, Math.round(t.carbs / UNIT));
    let q = Math.min(t.qty === Infinity ? 1e9 : t.qty, Math.ceil(S / w));
    let k = 1;
    while (q > 0) {
      const take = Math.min(k, q);
      items.push({ id: t.id, w: w * take, k: take });
      q -= take; k *= 2;
    }
  }
  const dp = new Float64Array(S + 1).fill(Infinity);
  dp[0] = 0;
  const take = items.map(() => new Uint8Array(S + 1));
  items.forEach((it, i) => {
    for (let s = S; s >= it.w; s--) {
      const v = dp[s - it.w] + it.k;
      if (v < dp[s]) { dp[s] = v; take[i][s] = 1; }
    }
  });
  let best = 0, bestCost = Infinity;
  for (let s = 0; s <= S; s++) {
    if (dp[s] === Infinity) continue;
    const diff = s < T ? (T - s) * 1.2 : s - T; // slight preference for not under-fuelling
    const cost = diff + countPenalty * dp[s];
    if (cost < bestCost) { bestCost = cost; best = s; }
  }
  let s = best;
  for (let i = items.length - 1; i >= 0; i--) {
    if (take[i][s]) { counts[items[i].id] += items[i].k; s -= items[i].w; }
  }
  const total = valid.reduce((a, t) => a + t.carbs * counts[t.id], 0);
  const maxPossible = valid.reduce((a, t) => a + (t.qty === Infinity ? Infinity : t.carbs * t.qty), 0);
  return { counts, total, short: maxPossible < target * 0.97 };
}

/**
 * Same as selectPackets but favours MORE, smaller intakes (steadier carb delivery, easier on the gut).
 * Minimises |total − target| plus a penalty on the sum of squared packet sizes, so for the same total
 * several small packets beat a few big ones, without rewarding overshoot.
 */
function selectPacketsFrequent(types, target) {
  const valid = types.filter((t) => t.carbs > 0 && (t.qty ?? 0) > 0);
  const counts = Object.fromEntries(types.map((t) => [t.id, 0]));
  if (!(target > 0) || !valid.length) return { counts, total: 0, short: target > 0 };
  const LAMBDA = 0.01; // per g² of packet size
  const T = Math.round(target / UNIT);
  const maxC = Math.max(...valid.map((t) => Math.round(t.carbs / UNIT)));
  const S = T + maxC;
  const items = [];
  for (const t of valid) {
    const w = Math.max(1, Math.round(t.carbs / UNIT));
    let q = Math.min(t.qty === Infinity ? 1e9 : t.qty, Math.ceil(S / w));
    let k = 1;
    while (q > 0) { const take = Math.min(k, q); items.push({ id: t.id, w: w * take, cost: take * t.carbs * t.carbs * LAMBDA }); q -= take; k *= 2; }
  }
  const dp = new Float64Array(S + 1).fill(Infinity);
  dp[0] = 0;
  const take = items.map(() => new Uint8Array(S + 1));
  items.forEach((it, i) => {
    for (let s = S; s >= it.w; s--) {
      const v = dp[s - it.w] + it.cost;
      if (v < dp[s]) { dp[s] = v; take[i][s] = 1; }
    }
  });
  let best = 0, bestCost = Infinity;
  for (let s = 0; s <= S; s++) {
    if (dp[s] === Infinity) continue;
    const diffG = Math.abs(T - s) * UNIT * 1.5 * (s < T ? 1.2 : 1);
    const cost = diffG + dp[s];
    if (cost < bestCost) { bestCost = cost; best = s; }
  }
  let s = best;
  for (let i = items.length - 1; i >= 0; i--) if (take[i][s]) { counts[items[i].id] += Math.round(items[i].w / Math.max(1, Math.round(valid.find((t) => t.id === items[i].id).carbs / UNIT))); s -= items[i].w; }
  const total = valid.reduce((a, t) => a + t.carbs * counts[t.id], 0);
  const maxPossible = valid.reduce((a, t) => a + (t.qty === Infinity ? Infinity : t.carbs * t.qty), 0);
  return { counts, total, short: maxPossible < target * 0.97 };
}

/** Spread packet types evenly; caffeine optionally pushed to the second half. */
export function orderPackets(list, { caffeineLate = true } = {}) {
  const byType = new Map();
  for (const p of list) { if (!byType.has(p.id)) byType.set(p.id, []); byType.get(p.id).push(p); }
  const placed = [];
  for (const arr of byType.values()) {
    const n = arr.length;
    const late = caffeineLate && arr[0].caffeine > 0;
    arr.forEach((p, k) => {
      const pos = late ? 0.45 + (0.55 * (k + 0.5)) / n : (k + 0.5) / n;
      placed.push({ p, pos });
    });
  }
  placed.sort((a, b) => a.pos - b.pos || b.p.carbs - a.p.carbs);
  return placed.map((x) => x.p);
}

const r5 = (x) => Math.round(x / 5) * 5;

/**
 * Build a full schedule.
 * @param {object} o
 * @param {number} o.durationMin
 * @param {number} o.rate g/h target
 * @param {{id,name,carbs,qty,caffeine?,sodium?,fluid?,kind?}[]} o.packets inventory
 * @param {{on:boolean, min:number, typeId?:string, count?:boolean}} [o.preStart]
 * @param {number|null} [o.firstAt] minutes (null = auto)
 * @param {number} [o.endBuffer] stop fuelling this many minutes before the finish
 * @param {string} [o.startClock] "06:30"
 * @param {number} [o.paceSecKm] for km markers
 * @param {number} [o.aidEveryKm] aid-station spacing for snapping
 * @param {boolean} [o.snapAid]
 * @param {boolean} [o.caffeineLate]
 * @param {boolean} [o.roundTo5]
 * @param {number} [o.massKg]
 */
export function buildSchedule(o) {
  const D = Math.max(0, +o.durationMin || 0);
  const rate = Math.max(0, +o.rate || 0);
  const R = rate / 60; // g per min
  const target = (rate * D) / 60;
  const inv = (o.packets || []).filter((p) => p && p.carbs > 0).map((p) => ({ ...p, qty: p.qty === '' || p.qty == null ? 0 : +p.qty === -1 ? Infinity : +p.qty }));
  const warnings = [];
  const rows = [];
  let pre = null;
  let remainingTarget = target;

  if (o.preStart?.on && inv.length) {
    let t = inv.find((p) => p.id === o.preStart.typeId && p.qty > 0);
    if (!t) t = [...inv].filter((p) => p.qty > 0).sort((a, b) => (a.caffeine > 0) - (b.caffeine > 0) || a.carbs - b.carbs)[0];
    if (t) {
      t.qty -= 1;
      pre = { ...t, t: -Math.abs(+o.preStart.min || 0), pre: true };
      if (o.preStart.count !== false) remainingTarget = Math.max(0, target - t.carbs);
    } else warnings.push('No packet left for the pre-start intake.');
  }

  const sel = selectPackets(inv, remainingTarget, { prefer: o.prefer || 'fewer' });
  if (sel.short) warnings.push(`Not enough packets: your inventory holds ${Math.round(sel.total)} g of the ${Math.round(remainingTarget)} g needed (excluding pre-start). Add packets or lower the target.`);
  const list = [];
  for (const t of inv) for (let i = 0; i < (sel.counts[t.id] || 0); i++) list.push({ ...t });
  const ordered = orderPackets(list, { caffeineLate: o.caffeineLate !== false });

  // ideal coverage times
  const n = ordered.length;
  const L = Math.max(0, D - Math.max(0, +o.endBuffer || 0));
  const hasFirst = o.firstAt != null && o.firstAt !== '' && Number.isFinite(+o.firstAt);
  const autoFirst = n && R > 0 ? Math.max(10, Math.min(30, r5(ordered[0].carbs / R / 2))) : 15;
  let A;
  if (pre && o.preStart.count !== false) {
    // the pre-start packet "covers" the opening minutes; next intake when it's used up
    A = R > 0 ? pre.carbs / R : autoFirst;
    if (hasFirst) A = Math.min(A, +o.firstAt);
  } else {
    A = hasFirst ? +o.firstAt : autoFirst;
  }
  A = Math.max(0, Math.min(A, L));

  const times = [];
  let cum = 0;
  for (let k = 0; k < n; k++) {
    times.push(A + (R > 0 ? cum / R : 0));
    cum += ordered[k].carbs;
  }
  if (n) {
    const last = times[n - 1];
    const shortfall = sel.short || sel.total < remainingTarget * 0.9;
    if (shortfall && n > 1) {
      const step = (L - A) / n;
      for (let k = 0; k < n; k++) times[k] = A + k * step + step * 0.0;
    } else if (last > L && last > A) {
      const f = (L - A) / (last - A);
      for (let k = 0; k < n; k++) times[k] = A + (times[k] - A) * f;
    }
  }

  // aid-station snapping
  const pace = +o.paceSecKm || 0;
  if (o.snapAid && pace > 0 && o.aidEveryKm > 0) {
    const stations = [];
    const distKm = o.distanceKm || (D * 60) / pace;
    for (let km = o.aidEveryKm; km < distKm - 0.2; km += o.aidEveryKm) stations.push((km * pace) / 60);
    let lastIdx = -1;
    for (let k = 0; k < n; k++) {
      let bi = -1, bd = Infinity;
      for (let j = lastIdx + 1; j < stations.length; j++) {
        const d = Math.abs(stations[j] - times[k]);
        if (d < bd) { bd = d; bi = j; }
        if (stations[j] > times[k] + 30) break;
      }
      if (bi >= 0 && bd <= Math.max(10, (o.aidEveryKm * pace) / 60)) { times[k] = stations[bi]; lastIdx = bi; ordered[k].aid = bi + 1; }
    }
  }

  const round = (t) => (o.roundTo5 ? r5(t) : Math.round(t));
  const all = [];
  if (pre) all.push(pre);
  ordered.forEach((p, k) => all.push({ ...p, t: round(times[k]) }));
  let c = 0, caf = 0, na = 0, fl = 0;
  for (const p of all) {
    c += p.carbs; caf += p.caffeine || 0; na += p.sodium || 0; fl += p.fluid || 0;
    rows.push({
      t: p.t, pre: !!p.pre, name: p.name, id: p.id, carbs: p.carbs, caffeine: p.caffeine || 0, sodium: p.sodium || 0, fluid: p.fluid || 0,
      cum: c, targetCum: Math.max(0, R * Math.max(0, p.t)), kind: p.kind, aid: p.aid || null,
      clock: o.startClock ? addClock(o.startClock, p.t) : null,
      km: pace > 0 ? Math.max(0, (p.t * 60) / pace) : null,
    });
  }
  // gaps
  const inRun = rows.filter((r) => !r.pre);
  for (let i = 1; i < inRun.length; i++) {
    if (inRun[i].t - inRun[i - 1].t > 50) { warnings.push(`Long gap of ${inRun[i].t - inRun[i - 1].t} min between intakes. Consider smaller, more frequent packets.`); break; }
  }
  if (inRun.length > 1) {
    const minGap = Math.min(...inRun.slice(1).map((r, i) => r.t - inRun[i].t));
    if (minGap < 8) warnings.push(`Some intakes are only ${minGap} min apart. Larger packets or a drink mix would make this easier.`);
  }
  if (rate > 120) warnings.push('More than 120 g/h is above what research currently supports for most athletes.');
  if (o.massKg && caf / o.massKg > 6) warnings.push(`Caffeine total ${Math.round(caf)} mg (${(caf / o.massKg).toFixed(1)} mg/kg) exceeds the 6 mg/kg upper range.`);

  const usedCounts = {};
  for (const r of rows) usedCounts[r.id] = (usedCounts[r.id] || 0) + 1;
  const leftovers = (o.packets || []).filter((p) => p && p.carbs > 0).map((p) => ({ id: p.id, name: p.name, used: usedCounts[p.id] || 0, left: +p.qty === -1 ? Infinity : Math.max(0, (+p.qty || 0) - (usedCounts[p.id] || 0)) }));

  return {
    rows, warnings, target, total: c, caffeine: caf, sodium: na, fluid: fl,
    rateActual: D > 0 ? (c / D) * 60 : 0,
    rateInRun: D > 0 ? ((c - (pre && o.preStart.count !== false ? 0 : pre?.carbs || 0)) / D) * 60 : 0,
    avgInterval: inRun.length > 1 ? (inRun[inRun.length - 1].t - inRun[0].t) / (inRun.length - 1) : null,
    leftovers, durationMin: D,
  };
}

export function addClock(hhmm, addMin) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  if (!m) return null;
  let t = +m[1] * 60 + +m[2] + Math.round(addMin);
  t = ((t % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Plain-text version of a plan (for copy/share). */
export function scheduleText(plan, { title = 'Fuel plan' } = {}) {
  const fmtT = (t) => `${t < 0 ? '-' : ''}${Math.floor(Math.abs(t) / 60)}:${String(Math.abs(t) % 60).padStart(2, '0')}`;
  const lines = [`${title}`, `Target ${Math.round(plan.target)} g · planned ${Math.round(plan.total)} g (${Math.round(plan.rateActual)} g/h)`, ''];
  for (const r of plan.rows) {
    lines.push(`${r.pre ? 'PRE ' : ''}${fmtT(r.t)}${r.clock ? ` (${r.clock})` : ''}${r.km != null && !r.pre ? ` ~${r.km.toFixed(1)} km` : ''}  ${r.name}  ${r.carbs} g${r.caffeine ? ` +${r.caffeine} mg caf` : ''}  [Σ ${Math.round(r.cum)} g]`);
  }
  if (plan.warnings.length) lines.push('', ...plan.warnings.map((w) => `! ${w}`));
  return lines.join('\n');
}
