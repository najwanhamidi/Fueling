// Science-based fueling calculators. Pure functions.
// Sources are listed in REFS and referenced by id in every recommendation.

export const REFS = {
  jeuk2014: { t: 'Jeukendrup AE (2014). A step towards personalized sports nutrition: carbohydrate intake during exercise. Sports Med 44(S1):S25–33.', u: 'https://doi.org/10.1007/s40279-014-0148-z' },
  acsm2016: { t: 'Thomas DT, Erdman KA, Burke LM (2016). ACSM / Academy of Nutrition & Dietetics / Dietitians of Canada joint position: Nutrition and athletic performance. Med Sci Sports Exerc 48(3):543–568.', u: 'https://doi.org/10.1249/MSS.0000000000000852' },
  medals2025: { t: '"From metabolism to medals": contemporary perspectives and revisiting carbohydrate intake guidelines for endurance exercise (review, 2025/26). Proposes up to 120 g/h for trained athletes; fructose:glucose 0.6–1.0.', u: 'https://researchonline.ljmu.ac.uk/id/eprint/28250/1/From%20Metabolism%20to%20Medals.pdf' },
  podlogar2022: { t: 'Podlogar T et al. (2022). Increased exogenous but unaltered endogenous carbohydrate oxidation with combined fructose-maltodextrin ingested at 120 g/h versus 90 g/h at different ratios. Eur J Appl Physiol 122:2393–2401.', u: 'https://doi.org/10.1007/s00421-022-05019-w' },
  stell2014: { t: 'Stellingwerff T, Cox GR (2014). Systematic review: carbohydrate supplementation on exercise performance or capacity of varying durations. Appl Physiol Nutr Metab 39:998–1011.', u: 'https://doi.org/10.1139/apnm-2014-0027' },
  burke2011: { t: 'Burke LM, Hawley JA, Wong SHS, Jeukendrup AE (2011). Carbohydrates for training and competition. J Sports Sci 29(S1):S17–27.', u: 'https://doi.org/10.1080/02640414.2011.585473' },
  rapoport2010: { t: 'Rapoport BI (2010). Metabolic factors limiting performance in marathon runners. PLoS Comput Biol 6(10):e1000960.', u: 'https://doi.org/10.1371/journal.pcbi.1000960' },
  romijn1993: { t: 'Romijn JA et al. (1993). Regulation of endogenous fat and carbohydrate metabolism in relation to exercise intensity and duration. Am J Physiol 265:E380–391.', u: 'https://doi.org/10.1152/ajpendo.1993.265.3.E380' },
  daniels: { t: 'Daniels J, Gilbert J (1979). Oxygen Power: performance tables for distance runners (VDOT equations).', u: 'https://en.wikipedia.org/wiki/Jack_Daniels_(coach)#VDOT' },
  costa2017: { t: 'Costa RJS et al. (2017). Gut-training: two weeks of repetitive gut-challenge during exercise improves GI status, glucose availability and running performance. Appl Physiol Nutr Metab 42:547–557.', u: 'https://doi.org/10.1139/apnm-2016-0453' },
  jeuk2017: { t: 'Jeukendrup AE (2017). Training the gut for athletes. Sports Med 47(S1):101–110.', u: 'https://doi.org/10.1007/s40279-017-0690-6' },
  guest2021: { t: 'Guest NS et al. (2021). International Society of Sports Nutrition position stand: caffeine and exercise performance. J Int Soc Sports Nutr 18:1.', u: 'https://doi.org/10.1186/s12970-020-00383-4' },
  sawka2007: { t: 'Sawka MN et al. (2007). ACSM position stand: Exercise and fluid replacement. Med Sci Sports Exerc 39(2):377–390.', u: 'https://doi.org/10.1249/mss.0b013e31802ca597' },
  vitale2019: { t: 'Vitale K, Getzin A (2019). Nutrition and supplement update for the endurance athlete: review and recommendations. Nutrients 11(6):1289.', u: 'https://doi.org/10.3390/nu11061289' },
  kerksick2017: { t: 'Kerksick CM et al. (2017). ISSN position stand: nutrient timing. J Int Soc Sports Nutr 14:33.', u: 'https://doi.org/10.1186/s12970-017-0189-4' },
  impey2018: { t: 'Impey SG et al. (2018). Fuel for the work required: carbohydrate periodization and the glycogen threshold hypothesis. Sports Med 48:1031–1048.', u: 'https://doi.org/10.1007/s40279-018-0867-7' },
  marquet2016: { t: 'Marquet LA et al. (2016). Enhanced endurance performance by periodization of carbohydrate intake: "sleep low" strategy. Med Sci Sports Exerc 48(4):663–672.', u: 'https://doi.org/10.1249/MSS.0000000000000823' },
  mountjoy2023: { t: 'Mountjoy M et al. (2023). IOC consensus statement on Relative Energy Deficiency in Sport (REDs). Br J Sports Med 57:1073–1097.', u: 'https://doi.org/10.1136/bjsports-2023-106994' },
};

export const DISTANCES = [
  { id: '5k', label: '5 km', km: 5 },
  { id: '10k', label: '10 km', km: 10 },
  { id: '15k', label: '15 km', km: 15 },
  { id: 'hm', label: 'Half marathon', km: 21.0975 },
  { id: '25k', label: '25 km', km: 25 },
  { id: '30k', label: '30 km', km: 30 },
  { id: 'm', label: 'Marathon', km: 42.195 },
  { id: '50k', label: '50 km ultra', km: 50 },
  { id: '50mi', label: '50 miles', km: 80.47 },
  { id: '100k', label: '100 km', km: 100 },
  { id: '100mi', label: '100 miles', km: 160.93 },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r5 = (x) => Math.round(x / 5) * 5;

export const INTENSITY = { easy: 0.1, moderate: 0.45, hard: 0.8, race: 1 };
export const GUT = {
  untrained: { label: 'Untrained (rarely fuel in training)', cap: 60, f: 0.5 },
  some: { label: 'Some practice (~30–60 g/h)', cap: 75, f: 0.8 },
  trained: { label: 'Trained gut (≥ 90 g/h comfortably)', cap: 100, f: 1 },
  elite: { label: 'Highly trained (100–120 g/h practised)', cap: 120, f: 1 },
};

/**
 * Duration/intensity-based carbohydrate recommendation (sliding scale).
 * Jeukendrup 2014 + ACSM 2016, extended to 120 g/h for trained guts per recent reviews.
 */
export function guidelineRate({ durationMin, intensity = 'race', gut = 'some', set = 'contemporary' }) {
  const D = durationMin;
  const fI = INTENSITY[intensity] ?? 0.8;
  const g = GUT[gut] || GUT.some;
  const f = fI * g.f;
  let tier, min, max, target, why;
  const refs = ['jeuk2014', 'acsm2016'];
  if (D < 30) {
    tier = 'none'; min = 0; max = 0; target = 0;
    why = 'Under ~30 min, carbohydrate during exercise brings no benefit. Start well fuelled.';
  } else if (D < 75) {
    tier = 'rinse'; min = 0; max = 30;
    target = intensity === 'race' || intensity === 'hard' ? (D >= 50 ? 20 : 0) : 0;
    why = 'For 30–75 min, small amounts or a carbohydrate mouth rinse can improve high-intensity performance (central effect). Large intakes are unnecessary.';
    refs.push('stell2014');
  } else if (D < 150) {
    tier = 'low'; min = 30; max = 60;
    target = r5(30 + 30 * f);
    why = 'For ~1–2.5 h, 30–60 g/h maintains blood glucose and carbohydrate oxidation. Single-source carbs (glucose/maltodextrin) are adequate.';
  } else {
    tier = D > 360 ? 'ultra' : 'high';
    min = 60; max = set === 'classic' ? Math.min(g.cap, 90) : Math.min(g.cap, gut === 'elite' || gut === 'trained' ? 120 : 90);
    const ultraF = D > 360 ? Math.min(f, 0.75) : f; // ultra intensity is lower; GI risk accumulates
    target = r5(60 + (max - 60) * ultraF);
    why = D > 360
      ? 'Ultra-endurance (>6 h): aim 60–90 g/h (up to ~100–120 g/h in well-trained guts). Finishers typically consume more carbohydrate than non-finishers. Mix in real food and savoury options.'
      : 'Over ~2.5 h, up to 90 g/h from multiple transportable carbohydrates (glucose + fructose) maximises carbohydrate delivery. Well-trained athletes can benefit from up to 120 g/h.';
    if (set === 'classic') why = why.replace(' Well-trained athletes can benefit from up to 120 g/h.', '').replace(' (up to ~100–120 g/h in well-trained guts)', '');
    else refs.push('medals2025', 'podlogar2022');
  }
  if (target > g.cap) target = g.cap;
  if (set === 'classic' && target > 90) target = 90;
  const carbType = target <= 60
    ? 'Single source (glucose / maltodextrin) is fine at this rate; a glucose+fructose product works too and may be gentler on the gut.'
    : target < 90
      ? 'Use multiple transportable carbs: glucose(maltodextrin):fructose about 2:1 to 1:0.8.'
      : 'Use glucose:fructose ≈ 1:0.8 (fructose:glucose 0.6–1.0), the blend that maximises exogenous oxidation at 90–120 g/h.';
  return { tier, min, max, target, why, carbType, gutCap: g.cap, refs };
}

export function preRace({ massKg, durationMin }) {
  const m = massKg || 65;
  const long = durationMin > 90;
  return {
    loading: long
      ? { gkg: [10, 12], window: '36–48 h before the race', g: [Math.round(10 * m), Math.round(12 * m)], refs: ['acsm2016', 'burke2011'], note: 'Carbohydrate loading raises muscle glycogen (supercompensation). Choose low-fibre, low-fat carbs and taper training.' }
      : { gkg: [7, 12], window: '24 h before the race', g: [Math.round(7 * m), Math.round(12 * m)], refs: ['acsm2016'], note: 'For events < 90 min, general fuelling (7–12 g/kg in the prior 24 h) is enough. Full loading is unnecessary.' },
    meal: { gkg: [1, 4], window: '1–4 h before', suggestion: `${Math.round(2 * m)}–${Math.round(3 * m)} g carbs ~3 h before (or ~${Math.round(1 * m)} g if only 1 h)`, refs: ['acsm2016', 'kerksick2017'] },
    topUp: durationMin >= 45 ? 'Optional: 15–30 g (e.g. a gel) in the final 10–15 min before the start, which tops up blood glucose without a rebound.' : 'A gel 10–15 min before the start is optional.',
  };
}

export function hydration({ durationMin, climate = 'hot', sweatRateL = null, salty = false, massKg = 65 }) {
  const out = { refs: ['sawka2007', 'vitale2019', 'acsm2016'], notes: [] };
  if (durationMin < 60) {
    out.fluid = [0, 400]; out.sodium = [0, 0];
    out.notes.push('Under ~60 min, drink to thirst. Electrolytes are not needed during the run.');
    return out;
  }
  const base = { cool: [400, 600], temperate: [400, 800], hot: [500, 800], hothumid: [600, 1000] }[climate] || [400, 800];
  out.fluid = [...base];
  if (sweatRateL > 0) {
    const s = sweatRateL * 1000;
    out.fluid = [Math.round(s * 0.5), Math.round(Math.min(s * 0.8, 1200))];
    out.notes.push(`Based on your sweat rate (${sweatRateL} L/h): replace ~50–80% to keep body-mass loss under ~2% without over-drinking.`);
  }
  out.sodium = salty || climate === 'hot' || climate === 'hothumid' ? [500, 1000] : [300, 600];
  if (durationMin > 240) out.notes.push('Over 4 h, sodium matters more (hyponatraemia risk grows with over-drinking plain water). Never drink so much that you gain weight.');
  out.notes.push('Weigh yourself before and after training runs to learn your sweat rate: (kg lost + litres drunk) ÷ hours.');
  return out;
}

export function caffeinePlan({ massKg = 65, durationMin }) {
  const m = massKg;
  return {
    range: [Math.round(3 * m), Math.round(6 * m)],
    low: Math.round(2 * m),
    suggestion: `${Math.round(3 * m)} mg (3 mg/kg) 30–60 min before the start${durationMin > 150 ? `, or split: ~${Math.round(1.5 * m)} mg before + ~${Math.round(1.5 * m)} mg in the second half (caffeine gels)` : ''}.`,
    note: 'Benefits appear from about 2–3 mg/kg. Doses above 6 mg/kg add side effects (GI, jitters, poor sleep) without extra benefit. Never try it first on race day.',
    refs: ['guest2021'],
  };
}

export function recovery({ massKg = 65 }) {
  const m = massKg;
  return {
    quick: `${Math.round(1.0 * m)}–${Math.round(1.2 * m)} g carbs per hour for the first 4 h, plus ~${Math.round(0.3 * m)} g protein, if your next hard session is within 8 h.`,
    normal: `Otherwise eat a normal carb-rich meal with ~${Math.round(0.3 * m)} g protein within a couple of hours.`,
    refs: ['acsm2016', 'kerksick2017'],
  };
}

/* ---------------- Running physiology (Daniels & Gilbert, Rapoport) ---------------- */
export const vo2Demand = (vMperMin) => -4.6 + 0.182258 * vMperMin + 0.000104 * vMperMin * vMperMin;
export const pctSustainable = (tMin) => 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
export function vdotFromRace(km, timeMin) {
  if (!(km > 0 && timeMin > 0)) return null;
  return vo2Demand((km * 1000) / timeMin) / pctSustainable(timeMin);
}
/** Predict race time (min) for a VDOT by solving vo2Demand(d/t)/pct(t) = vdot. */
export function predictTime(vdot, km) {
  let lo = km * 2, hi = km * 15;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const v = vdotFromRace(km, mid);
    if (v > vdot) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
export function riegel(t1, d1, d2) {
  if (d2 <= 42.2) return t1 * (d2 / d1) ** 1.06;
  const tm = d1 <= 42.2 ? t1 * (42.195 / d1) ** 1.06 : t1 * (42.195 / d1) ** (1 / 1.15);
  return tm * (d2 / 42.195) ** 1.15;
}

// Fraction of energy from carbohydrate vs. %VO2max (approximated from Romijn 1993 / van Loon 2001, as used by Rapoport 2010)
const FC_TABLE = [[0.25, 0.12], [0.4, 0.3], [0.5, 0.4], [0.6, 0.52], [0.7, 0.64], [0.8, 0.78], [0.85, 0.85], [0.9, 0.9], [0.95, 0.95], [1.0, 1.0]];
export function carbFraction(u) {
  if (u <= FC_TABLE[0][0]) return FC_TABLE[0][1];
  for (let i = 1; i < FC_TABLE.length; i++) {
    const [x1, y1] = FC_TABLE[i];
    const [x0, y0] = FC_TABLE[i - 1];
    if (u <= x1) return y0 + ((u - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 1;
}

export const GLYCOGEN = {
  muscle: { normal: 20, partial: 27, loaded: 36 }, // g glycogen per kg leg muscle (≈80 / 108 / 144 kcal/kg, Rapoport)
  liver: { fasted: 22, fed: 44, loaded: 80 }, // g per kg liver (~270 typical, ~500 mmol/kg max)
};

/**
 * Glycogen-depletion model (after Rapoport 2010).
 */
export function glycogenModel(p) {
  const m = p.massKg || 65;
  const legFrac = p.legFrac || (p.sex === 'f' ? 0.2 : 0.214);
  const dist = p.distKm;
  const T = p.timeMin;
  const eff = p.eff ?? 0.75;
  const kcalKgKm = p.kcalPerKgKm ?? 1.0;
  const reserve = (p.reservePct ?? 10) / 100;
  const v = (dist * 1000) / T;
  const vo2 = vo2Demand(v);
  const u = vo2 / p.vo2max;
  const fc = clamp(carbFraction(u) - (p.fatAdapt || 0), 0.05, 1);
  const kcalPerKm = kcalKgKm * m;
  const carbGperKm = (kcalPerKm * fc) / 4;
  const hours = T / 60;
  const carbGph = (carbGperKm * dist) / hours;
  const muscleG = m * legFrac * (GLYCOGEN.muscle[p.glyState || 'normal'] ?? 20);
  const liverKey = p.glyState === 'loaded' ? (p.fed === false ? 'fed' : 'loaded') : p.fed === false ? 'fasted' : 'fed';
  const liverG = m * 0.025 * GLYCOGEN.liver[liverKey];
  const G0 = muscleG + liverG;
  const usable = G0 * (1 - reserve);
  const preCarbs = p.preCarbs || 0; // carbs eaten in the final minutes before the start
  const need = carbGperKm * dist;
  const wallKm = (usable + preCarbs * eff) / carbGperKm;
  const deficit = Math.max(0, need - usable - preCarbs * eff);
  const minRate = deficit / eff / hours;
  const out = {
    speedMmin: v, paceSecKm: (T * 60) / dist, vo2, u, fc, kcalPerKm, carbGperKm, carbGph, muscleG, liverG, G0, usable, need,
    wallKm, wallMin: (wallKm / dist) * T, deficit, minRate, eff, hours, legFrac,
  };
  // series for chart
  const steps = 60;
  const series = { km: [], none: [], min: [], plan: [] };
  const plan = p.planRate ?? null;
  for (let i = 0; i <= steps; i++) {
    const km = (dist * i) / steps;
    const h = (km / dist) * hours;
    const used = carbGperKm * km;
    series.km.push(km);
    series.none.push(G0 + preCarbs * eff - used);
    series.min.push(G0 + preCarbs * eff - used + eff * minRate * h);
    if (plan != null) series.plan.push(G0 + preCarbs * eff - used + eff * plan * h);
  }
  out.series = series;
  out.reserveG = G0 * reserve;
  return out;
}

/** Fastest finish time for which the wall can be avoided with ≤ maxRate g/h (bisection). */
export function wallFreeTime(p, maxRate) {
  let lo = p.distKm * 2.2, hi = p.distKm * 15;
  const ok = (t) => glycogenModel({ ...p, timeMin: t }).minRate <= maxRate + 1e-6;
  if (!ok(hi)) return null;
  if (ok(lo)) return lo;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

/* ---------------- Training ---------------- */
export const DAILY_LOAD = {
  light: { label: 'Light: low intensity or skill-based', gkg: [3, 5] },
  moderate: { label: 'Moderate: ~1 h/day', gkg: [5, 7] },
  high: { label: 'High: 1–3 h/day moderate–high intensity', gkg: [6, 10] },
  veryhigh: { label: 'Very high: > 4–5 h/day', gkg: [8, 12] },
};

export const SESSIONS = {
  recovery: { label: 'Recovery jog', def: 35, intensity: 'easy' },
  easy: { label: 'Easy run', def: 60, intensity: 'easy' },
  long: { label: 'Long run (easy)', def: 120, intensity: 'moderate' },
  longrp: { label: 'Long run with race-pace blocks', def: 130, intensity: 'hard' },
  tempo: { label: 'Tempo / threshold', def: 70, intensity: 'hard' },
  intervals: { label: 'Intervals / VO2max', def: 75, intensity: 'hard' },
  rehearsal: { label: 'Race rehearsal (gut training)', def: 150, intensity: 'race' },
  trainlow: { label: 'Train-low (fasted / low glycogen)', def: 60, intensity: 'easy' },
};

export function trainingSession({ type, durationMin, gut = 'some', raceRate = 60, massKg = 65 }) {
  const s = SESSIONS[type] || SESSIONS.easy;
  const D = durationMin || s.def;
  const m = massKg;
  const res = { type, label: s.label, durationMin: D, refs: ['acsm2016', 'burke2011', 'impey2018'], notes: [] };
  const g = guidelineRate({ durationMin: D, intensity: s.intensity, gut });
  res.pre = D >= 75 || ['tempo', 'intervals', 'longrp', 'rehearsal'].includes(type)
    ? `Carb-rich meal ${Math.round(1 * m)}–${Math.round(2 * m)} g carbs 2–3 h before (1–2 g/kg) so you start with good glycogen for the quality work.`
    : 'No special pre-run fuelling needed. Run after a normal meal or snack.';
  switch (type) {
    case 'recovery':
    case 'easy':
      res.rate = D >= 75 ? [0, 30] : [0, 0];
      res.target = D >= 90 ? 30 : 0;
      res.notes.push(D < 75 ? 'Water only is fine. Easy runs under ~75 min don\'t need carbohydrate.' : 'Optional 20–30 g/h. A good chance to practise taking gels while running.');
      break;
    case 'long':
      res.rate = [30, 60];
      res.target = Math.max(30, Math.min(60, g.target));
      res.notes.push('Fuel long runs ("fuel for the work required") to protect quality and recovery. Use these runs to practise your race products.');
      break;
    case 'longrp':
    case 'rehearsal':
      res.rate = [Math.min(raceRate, 60), raceRate];
      res.target = raceRate;
      res.notes.push('Rehearse race-day fuelling exactly: same products, timing, pace and breakfast. This is the most effective gut training.');
      res.refs.push('costa2017', 'jeuk2017');
      break;
    case 'tempo':
    case 'intervals':
      res.rate = D >= 75 ? [30, 60] : [0, 30];
      res.target = D >= 75 ? 30 : 0;
      res.notes.push(D >= 75 ? 'Long quality sessions benefit from 30–60 g/h.' : 'For sessions under ~75 min, a carb mouth rinse or a gel before the main set is optional.');
      break;
    case 'trainlow':
      res.rate = [0, 0];
      res.target = 0;
      res.pre = 'Done fasted (morning) or after an evening hard session with low-carb dinner ("sleep low"). Keep it easy and ≤ 60–90 min.';
      res.notes.push('Train-low can enhance metabolic adaptations but impairs high-intensity work. Use it only for easy sessions, 1–3× per week, never before key workouts. Skip it if you\'re at risk of low energy availability (REDs).');
      res.refs.push('marquet2016', 'mountjoy2023');
      break;
    default:
      res.rate = [0, 30]; res.target = 0;
  }
  res.post = D >= 90 || ['tempo', 'intervals', 'longrp', 'rehearsal'].includes(type)
    ? `Within ~1 h: ${Math.round(1 * m)}–${Math.round(1.2 * m)} g carbs + ~${Math.round(0.3 * m)} g protein (repeat carbs hourly for 4 h if training again within 8 h).`
    : 'Normal meals. No special recovery nutrition needed.';
  res.carbType = g.carbType;
  return res;
}

/** Weekly gut-training ramp from current tolerated rate to race target. */
export function gutPlan({ current = 40, target = 90, weeks = 8, perWeek = 1 }) {
  const out = [];
  const W = Math.max(1, Math.round(weeks));
  const rampWeeks = Math.max(1, W - 1); // final week(s) at target
  const step = (target - current) / rampWeeks;
  const warn = Math.abs(step) > 15 ? `That's a jump of ${Math.round(step)} g/h per week, faster than the ~10–15 g/h weekly increase most athletes tolerate. Allow more weeks if you can.` : null;
  for (let w = 1; w <= W; w++) {
    const rate = w > rampWeeks ? target : Math.round(current + step * w);
    out.push({ week: w, rate: Math.min(rate, target), sessions: perWeek, note: w === W ? 'Race-week: same products, smaller doses during taper runs.' : w === 1 ? 'Start in long runs; note GI comfort 1–10.' : '' });
  }
  return { weeks: out, warn, refs: ['costa2017', 'jeuk2017', 'medals2025'] };
}

/** Daily carbohydrate target. */
export function dailyCarbs(load, massKg) {
  const d = DAILY_LOAD[load] || DAILY_LOAD.moderate;
  return { ...d, g: [Math.round(d.gkg[0] * massKg), Math.round(d.gkg[1] * massKg)], refs: ['acsm2016', 'burke2011'] };
}
