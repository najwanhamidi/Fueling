// Mixer maths: carb types, ingredient templates, ratio templates and the mix solver. Pure (no DOM).
import { amountForCarbs, combine, normalizeFood, NUTRIENTS } from './nutrients.js';

/**
 * Carbohydrate types: g / f = share of the ingredient's carbohydrate that ends up as glucose / fructose
 * after digestion (sucrose → 50 : 50, maltodextrin / starch → glucose).
 */
export const CARB_TYPES = [
  { id: 'auto', label: 'Auto (guess from the name)' },
  { id: 'glucose', label: 'Glucose-based: maltodextrin, dextrose, cluster dextrin, rice syrup, starch', short: 'Glucose', g: 1, f: 0 },
  { id: 'fructose', label: 'Fructose (crystalline fructose)', short: 'Fructose', g: 0, f: 1 },
  { id: 'sucrose', label: 'Sucrose 50:50: table sugar, maple syrup, gula melaka, coconut sugar', short: 'Sucrose', g: 0.5, f: 0.5 },
  { id: 'honey', label: 'Honey ≈ 47:53 glucose:fructose', short: 'Honey', g: 0.47, f: 0.53 },
  { id: 'agave', label: 'Agave syrup ≈ 25:75', short: 'Agave', g: 0.25, f: 0.75 },
  { id: 'invert', label: 'Invert / golden syrup 50:50', short: 'Invert syrup', g: 0.5, f: 0.5 },
  { id: 'isomaltulose', label: 'Isomaltulose / Palatinose 50:50 (slow-release)', short: 'Isomaltulose', g: 0.5, f: 0.5 },
  { id: 'dates', label: 'Dates ≈ 52:48', short: 'Dates', g: 0.52, f: 0.48 },
  { id: 'banana', label: 'Banana ≈ 65:35 (incl. starch)', short: 'Banana', g: 0.65, f: 0.35 },
  { id: 'custom', label: 'Custom glucose : fructose split…', short: 'Custom' },
  { id: 'other', label: 'Other / unknown', short: 'Unknown' },
  { id: 'none', label: 'No carbs (water, salt, electrolytes)', short: 'No carbs' },
];
const TYPE = Object.fromEntries(CARB_TYPES.map((t) => [t.id, t]));

/** Guess a carb type from an ingredient name (English + Malay). */
export function guessCType(name = '') {
  const s = name.toLowerCase();
  if (/high.?fructose|hfcs/.test(s)) return 'other';
  if (/fruct/.test(s)) return 'fructose';
  if (/agave/.test(s)) return 'agave';
  if (/honey|madu/.test(s)) return 'honey';
  if (/palatinose|isomaltulose/.test(s)) return 'isomaltulose';
  if (/golden syrup|invert/.test(s)) return 'invert';
  if (/\bdates?\b|kurma|medjool/.test(s)) return 'dates';
  if (/banana|pisang/.test(s)) return 'banana';
  if (/malto|dextrose|glucose|dextrin|cluster|hbcd|isomalto|vitargo|rice syrup|glukos|starch|kanji|waxy maize/.test(s)) return 'glucose';
  if (/sucrose|table sugar|cane|gula pasir|gula melaka|palm sugar|coconut sugar|gula kelapa|maple|\bsugar\b/.test(s)) return 'sucrose';
  if (/salt|garam|water|\bair\b|electrolyte/.test(s)) return 'none';
  return 'other';
}

/** Resolve an ingredient's carb type → { id, g, f } (g/f null when unknown / no carbs). */
export function carbTypeOf(ing, food) {
  let id = ing?.ctype || 'auto';
  if (id === 'auto') id = guessCType(food?.name || '');
  if (id === 'custom') {
    const gp = Math.max(0, Math.min(100, +ing.gPct || 0)) / 100;
    return { id, g: gp, f: 1 - gp };
  }
  const t = TYPE[id] || TYPE.other;
  return { id: t.id, g: t.g ?? null, f: t.f ?? null };
}

/** Per-ingredient ratio templates (ratio of carbohydrate from each ingredient). */
export const RATIO_TEMPLATES = [
  { id: '1:0.8', n: 2, r: [1, 0.8], label: '1 : 0.8', hint: 'Glucose/maltodextrin : fructose, the current "high-carb" blend (≈ 90–120 g/h)' },
  { id: '2:1', n: 2, r: [1, 0.5], label: '2 : 1', hint: 'Glucose/maltodextrin : fructose, the classic dual-source blend (≥ 60–90 g/h)' },
  { id: '1:1', n: 2, r: [1, 1], label: '1 : 1', hint: 'Equal parts (e.g. glucose : fructose, or what sucrose gives on its own)' },
  { id: '0.8:1', n: 2, r: [0.8, 1], label: '0.8 : 1', hint: 'Slightly fructose-dominant' },
  { id: '1:0.6', n: 2, r: [1, 0.6], label: '1 : 0.6', hint: 'Low end of the 0.6–1.0 fructose:glucose range' },
  { id: '3:1', n: 2, r: [1, 1 / 3], label: '3 : 1', hint: 'Glucose-dominant' },
  { id: 'mdf-0.8', n: 3, r: [1, 1, 1.6], label: '1 : 1 : 1.6', hint: 'Maltodextrin : dextrose : fructose, which gives glucose : fructose 1 : 0.8' },
  { id: 'mdf-2:1', n: 3, r: [1, 1, 1], label: '1 : 1 : 1', hint: 'Maltodextrin : dextrose : fructose, which gives glucose : fructose 2 : 1' },
  { id: 'msf', n: 3, r: [1, 0.5, 0.5], label: '1 : 0.5 : 0.5', hint: 'Maltodextrin : sucrose : fructose, which gives glucose : fructose ≈ 1 : 0.6' },
  { id: 'mdfs', n: 4, r: [1, 0.5, 0.9, 0.5], label: '1 : 0.5 : 0.9 : 0.5', hint: 'Malto : dextrose : fructose : sucrose, which gives glucose : fructose ≈ 1 : 0.65' },
];

/** Overall glucose : fructose targets for the G:F ratio mode. */
export const GF_TEMPLATES = [
  { id: '1:0.8', g: 1, f: 0.8, hint: 'Current "high-carb" blend, best for 90–120 g/h' },
  { id: '2:1', g: 1, f: 0.5, hint: 'Classic dual-source blend for 60–90 g/h' },
  { id: '1:0.7', g: 1, f: 0.7, hint: 'Middle of the recommended 0.5–1.0 fructose:glucose range' },
  { id: '1:0.6', g: 1, f: 0.6, hint: 'Lower fructose, often easier on the gut' },
  { id: '1:1', g: 1, f: 1, hint: 'Equal glucose and fructose (sucrose-like)' },
];

// Generic DIY ingredients (approximate typical values per 100 g; unknown values are left blank).
export const GENERIC = [
  { name: 'Maltodextrin', ctype: 'glucose', n: { carbs: 95, sugars: 5, energyKcal: 380, protein: 0, fat: 0, sodium: 50 } },
  { name: 'Dextrose (glucose)', ctype: 'glucose', n: { carbs: 91, sugars: 91, energyKcal: 364, protein: 0, fat: 0, sodium: 0 } },
  { name: 'Cluster dextrin (HBCD)', ctype: 'glucose', n: { carbs: 95, sugars: 1, energyKcal: 380, protein: 0, fat: 0 } },
  { name: 'Fructose', ctype: 'fructose', n: { carbs: 100, sugars: 100, energyKcal: 400, protein: 0, fat: 0, sodium: 0 } },
  { name: 'Table sugar (sucrose)', ctype: 'sucrose', n: { carbs: 100, sugars: 100, energyKcal: 387, protein: 0, fat: 0, sodium: 1 } },
  { name: 'Honey', ctype: 'honey', n: { carbs: 82.4, sugars: 82.1, energyKcal: 304, protein: 0.3, fat: 0, sodium: 4, potassium: 52 } },
  { name: 'Maple syrup', ctype: 'sucrose', n: { carbs: 67, sugars: 60.5, energyKcal: 260, protein: 0, fat: 0.1, sodium: 12, potassium: 212 } },
  { name: 'Agave syrup', ctype: 'agave', n: { carbs: 76.4, sugars: 68, energyKcal: 310, protein: 0.1, fat: 0.5, sodium: 4 } },
  { name: 'Golden syrup', ctype: 'invert', n: { carbs: 79, sugars: 79, energyKcal: 325, protein: 0, fat: 0 } },
  { name: 'Brown rice syrup', ctype: 'glucose', n: { carbs: 77, energyKcal: 316, protein: 0, fat: 0 } },
  { name: 'Gula Melaka (palm sugar)', ctype: 'sucrose', n: { carbs: 90, sugars: 85, energyKcal: 360, protein: 0, fat: 0 } },
  { name: 'Isomaltulose (Palatinose)', ctype: 'isomaltulose', n: { carbs: 95, sugars: 95, energyKcal: 380, protein: 0, fat: 0, sodium: 0 } },
  { name: 'Medjool dates', ctype: 'dates', n: { carbs: 75, sugars: 66.5, fiber: 6.7, energyKcal: 277, protein: 1.8, fat: 0.2, sodium: 1, potassium: 696 } },
  { name: 'Banana', ctype: 'banana', n: { carbs: 22.8, sugars: 12.2, fiber: 2.6, energyKcal: 89, protein: 1.1, fat: 0.3, sodium: 1, potassium: 358 } },
  { name: 'Whey protein isolate', ctype: 'other', n: { carbs: 2, sugars: 1, energyKcal: 370, protein: 90, fat: 1 } },
  { name: 'Pea protein', ctype: 'other', n: { carbs: 5, sugars: 1, energyKcal: 390, protein: 80, fat: 6 } },
  { name: 'Skimmed milk powder', ctype: 'other', n: { carbs: 52, sugars: 52, energyKcal: 360, protein: 36, fat: 1, sodium: 500, potassium: 1700 } },
  { name: 'Caffeine (pure powder)', ctype: 'none', n: { caffeine: 100000, carbs: 0, energyKcal: 0, protein: 0, fat: 0 } },
  { name: 'Table salt', ctype: 'none', n: { sodium: 39300, carbs: 0, energyKcal: 0, protein: 0, fat: 0 } },
  { name: 'Water', ctype: 'none', n: { carbs: 0, energyKcal: 0, protein: 0, fat: 0, sodium: 0, sugars: 0 } },
];

/** Things a target can be set on: every nutrient on the label, plus glucose / fructose (from carb type) and total weight. */
const TARGET_ORDER = ['carbs', 'protein', 'sodium', 'potassium', 'caffeine', 'energyKcal', 'fat', 'sugars', 'fiber', 'satFat', 'transFat', 'cholesterol', 'addedSugars'];
export const TARGET_KEYS = [
  ...TARGET_ORDER.map((k) => NUTRIENTS.find((n) => n.k === k)).filter(Boolean).map((n) => ({ k: n.k, label: n.label, unit: n.unit })),
  { k: 'glucose', label: 'Glucose (from carb type)', unit: 'g' },
  { k: 'fructose', label: 'Fructose (from carb type)', unit: 'g' },
  { k: 'weight', label: 'Total weight of the mix', unit: 'g' },
];
const TKEY = Object.fromEntries(TARGET_KEYS.map((t) => [t.k, t]));
export const targetDef = (k) => TKEY[k] || { k, label: k, unit: '' };

export const newTarget = (type = 'amount') =>
  type === 'ratio' ? { type: 'ratio', k: 'carbs', k2: 'protein', a: 4, b: 1 } : { type: 'amount', k: 'carbs', op: '=', v: null };
const A = (k, v, op = '=') => ({ type: 'amount', k, op, v });
const R = (k, k2, a, b) => ({ type: 'ratio', k, k2, a, b });

/** One-tap target sets. */
export const TARGET_TEMPLATES = [
  { id: 'cp', label: 'Carbs + protein', hint: '60 g carbs with 15 g protein', targets: [A('carbs', 60), A('protein', 15)] },
  { id: 'r41', label: 'Recovery 4 : 1', hint: '80 g carbs with carbs : protein = 4 : 1 (the classic post-run ratio)', targets: [A('carbs', 80), R('carbs', 'protein', 4, 1)] },
  { id: 'r31', label: 'Recovery 3 : 1', hint: '60 g carbs with carbs : protein = 3 : 1', targets: [A('carbs', 60), R('carbs', 'protein', 3, 1)] },
  { id: 'cs', label: 'Carbs + sodium', hint: '60 g carbs with 500 mg sodium', targets: [A('carbs', 60), A('sodium', 500)] },
  { id: 'cc', label: 'Carbs + caffeine', hint: '30 g carbs with 100 mg caffeine (a caffeinated gel)', targets: [A('carbs', 30), A('caffeine', 100)] },
  { id: 'gf', label: 'Glucose + fructose (g)', hint: '50 g glucose and 40 g fructose (1 : 0.8) from the ingredients\' carb types', targets: [A('glucose', 50), A('fructose', 40)] },
  { id: 'drink', label: 'Carb drink 500 g', hint: '40 g carbs, 400 mg sodium, 500 g total weight (water fills the rest)', targets: [A('carbs', 40), A('sodium', 400), A('weight', 500)] },
];

export const newIng = () => ({ food: null, mode: 'carbs', carbs: 30, grams: null, ratio: 1, ctype: null, gPct: 50, share: 1 });

const carbDensity = (f) => (f && f.n.carbs != null ? f.n.carbs / f.basis : null);

/**
 * Compute the amount of every ingredient.
 * Modes (per ingredient `mode`): 'carbs' = follow the target / ratio, 'fixcarbs' = fixed carbs, 'grams' = fixed amount.
 * Ratio kinds: 'ingredient' (ratio of each ingredient to #1) or 'gf' (overall glucose : fructose).
 */
export function computeMix(st) {
  const ings = st.ings.slice(0, st.count);
  const out = ings.map((ing) => {
    const food = ing.food ? normalizeFood(ing.food) : null;
    return { ...ing, food, g: null, c: null, err: null, type: food ? carbTypeOf(ing, food) : null, side: null };
  });
  const warnings = [];
  const fixedAmount = (o) => {
    if (o.mode === 'grams') o.g = o.grams;
    else if (o.mode === 'fixcarbs') {
      if (!(o.food.n.carbs > 0)) o.err = 'No carbs in this food: use fixed grams';
      else o.g = amountForCarbs(o.food, o.carbs);
    }
  };
  const kind = st.ratioKind || 'ingredient';
  let targets = null;

  if (st.ratioOn && kind === 'targets') {
    targets = solveTargets(out, st, warnings, fixedAmount);
  } else if (!st.ratioOn) {
    for (const o of out) {
      if (!o.food) continue;
      if (o.mode === 'grams') o.g = o.grams;
      else {
        if (!(o.food.n.carbs > 0)) { o.err = 'No carbs in this food: enter grams instead'; continue; }
        o.g = amountForCarbs(o.food, o.carbs);
      }
    }
  } else if (kind === 'gf') {
    solveGF(out, st, warnings, fixedAmount);
  } else {
    const r1 = +out[0]?.ratio || 1;
    const T = st.ratioValue;
    // Ingredients without carbs (water, salt) or set to fixed are not part of the ratio.
    const inRatio = out.map((o, i) => o.food && (i === 0 || o.mode === 'carbs') && (st.ratioBasis === 'weight' || carbDensity(o.food) > 0));
    out.forEach((o, i) => { if (o.food && !inRatio[i]) fixedAmount(o); });
    if (out[0].food && inRatio[0] && T > 0) {
      if (st.ratioBasis !== 'weight') {
        const sumR = out.reduce((a, o, i) => a + (inRatio[i] ? +o.ratio || 0 : 0), 0);
        out.forEach((o, i) => {
          if (!inRatio[i]) return;
          const c = st.ratioTarget === 'total' ? (T * (+o.ratio || 0)) / sumR : (T * (+o.ratio || 0)) / r1;
          o.c = c;
          o.g = amountForCarbs(o.food, c);
        });
      } else {
        const d1 = carbDensity(out[0].food);
        let G1 = null;
        if (st.ratioTarget !== 'total') G1 = d1 > 0 ? T / d1 : null;
        else {
          const k = out.reduce((a, o, i) => a + (inRatio[i] ? ((+o.ratio || 0) / r1) * (carbDensity(o.food) || 0) : 0), 0);
          G1 = k > 0 ? T / k : null;
        }
        if (G1 == null) out[0].err = 'First ingredient needs a carb value for this target';
        else out.forEach((o, i) => { if (inRatio[i]) o.g = ((+o.ratio || 0) / r1) * G1; });
      }
    } else if (out[0].food && !inRatio[0]) out[0].err = 'First ingredient must contain carbs to anchor the ratio';
  }

  for (const o of out) if (o.food && o.g != null && o.c == null) o.c = o.food.n.carbs != null ? (o.food.n.carbs * o.g) / o.food.basis : null;
  const items = out.filter((o) => o.food && o.g > 0).map((o) => ({ food: o.food, amount: o.g }));
  if (st.water > 0) items.push({ food: { basis: 100, n: {} }, amount: st.water, zero: true });
  const comb = combine(items);
  let G = 0, F = 0, unknownCarb = 0;
  for (const o of out) {
    if (!o.food || !(o.c > 0)) continue;
    if (o.type?.g == null) { if (o.type?.id !== 'none') unknownCarb += o.c; continue; }
    G += o.c * o.type.g; F += o.c * o.type.f;
  }
  return { out, comb, gf: G + F > 0 ? { G, F, unknownCarb } : null, warnings, targets };
}

// ───────────── Multi-target solver (carbs + protein, ratios, any nutrient) ─────────────

/** Amount of target `k` per unit (g / ml) of an ingredient, and whether that value is unknown for the food. */
function dens(o, k) {
  if (k === 'weight') return { d: 1, unknown: false };
  const f = o.food;
  if (k === 'glucose' || k === 'fructose') {
    const c = f.n.carbs;
    if (c == null) return { d: 0, unknown: true };
    const s = o.type?.[k === 'glucose' ? 'g' : 'f'];
    if (s == null) return { d: 0, unknown: o.type?.id !== 'none' && c > 0 };
    return { d: (c / f.basis) * s, unknown: false };
  }
  const v = f.n[k];
  return v == null ? { d: 0, unknown: true } : { d: v / f.basis, unknown: false };
}

function solveSmall(M, y) {
  const n = y.length;
  const Aug = M.map((r, i) => [...r, y[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(Aug[r][c]) > Math.abs(Aug[p][c])) p = r;
    if (Math.abs(Aug[p][c]) < 1e-14) return null;
    [Aug[c], Aug[p]] = [Aug[p], Aug[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = Aug[r][c] / Aug[c][c];
      if (f) for (let k = c; k <= n; k++) Aug[r][k] -= f * Aug[c][k];
    }
  }
  return Aug.map((r, i) => r[n] / r[i]);
}

/**
 * Non-negative least squares: minimise Σ (a·x − b)² + Σ reg_i·x_i² over x ≥ 0.
 * The problem is convex and tiny (≤ 8 unknowns), so try every support set and keep the best feasible one.
 */
function nnls(rows, n, reg) {
  let best = new Array(n).fill(0), bestJ = Infinity;
  for (let mask = 1; mask < 1 << n; mask++) {
    const idx = [];
    for (let i = 0; i < n; i++) if ((mask >> i) & 1) idx.push(i);
    const m = idx.length;
    const M = Array.from({ length: m }, () => new Array(m).fill(0));
    const y = new Array(m).fill(0);
    for (const r of rows) {
      for (let p = 0; p < m; p++) {
        y[p] += r.a[idx[p]] * r.b;
        for (let q = 0; q < m; q++) M[p][q] += r.a[idx[p]] * r.a[idx[q]];
      }
    }
    for (let p = 0; p < m; p++) M[p][p] += reg[idx[p]];
    const s = solveSmall(M, y);
    if (!s || s.some((v) => v < -1e-9)) continue;
    const x = new Array(n).fill(0);
    idx.forEach((i, p) => (x[i] = Math.max(0, s[p])));
    let J = 0;
    for (const r of rows) { let t = -r.b; for (let i = 0; i < n; i++) t += r.a[i] * x[i]; J += t * t; }
    for (let i = 0; i < n; i++) J += reg[i] * x[i] * x[i];
    if (J < bestJ - 1e-15) { bestJ = J; best = x; }
  }
  return best;
}

/**
 * Target mode: choose the amounts of the "Auto" ingredients so the whole mix meets several targets at once,
 * e.g. carbs = 60 g AND protein = 15 g, a carbs : protein ratio, sodium ≥ 400 mg, total weight = 500 g…
 * Targets: { type:'amount', k, op:'='|'>='|'<=', v } or { type:'ratio', k, k2, a, b } (k : k2 = a : b).
 * With more unknowns than targets, many mixes fit; the solution that spreads evenly (weighted by each
 * ingredient's `share` preference) is picked. If the targets can't all be met, the closest fit is returned.
 */
function solveTargets(out, st, warnings, fixedAmount) {
  const fixed = out.filter((o) => o.food && (o.mode === 'grams' || o.mode === 'fixcarbs'));
  fixed.forEach(fixedAmount);
  const auto = out.filter((o) => o.food && o.mode !== 'grams' && o.mode !== 'fixcarbs');
  const tg = (st.targets || []).filter((t) => (t.type === 'ratio'
    ? t.k && t.k2 && t.k !== t.k2 && +t.a > 0 && +t.b > 0
    : t.k && t.v != null && Number.isFinite(+t.v) && +t.v >= 0));
  if (!tg.length) { warnings.push('Add at least one target.'); return []; }
  if (!auto.length) { warnings.push('Set at least one ingredient to "Auto (solve)".'); return []; }
  const n = auto.length;
  const fixedTotal = (k) => fixed.reduce((a, o) => a + (o.g || 0) * dens(o, k).d, 0) + (k === 'weight' ? +st.water || 0 : 0);

  // typical gram scale of the mix (used to normalise rows and the tie-break term)
  const scales = [];
  for (const t of tg) {
    if (t.type !== 'amount') continue;
    const mx = Math.max(0, ...auto.map((o) => dens(o, t.k).d));
    if (mx > 0 && +t.v > 0) scales.push(+t.v / mx);
  }
  scales.sort((p, q) => p - q);
  const S = scales.length ? scales[Math.floor(scales.length / 2)] : 100;

  const rowOf = (t) => {
    if (t.type === 'ratio') {
      const a = auto.map((o) => dens(o, t.k).d * +t.b - dens(o, t.k2).d * +t.a);
      const norm = Math.hypot(...a);
      if (!(norm > 0)) return { a: a.map(() => 0), b: 0, scale: 1, op: '=', t };
      return { a, b: -(fixedTotal(t.k) * +t.b - fixedTotal(t.k2) * +t.a), scale: norm * S, op: '=', t };
    }
    const a = auto.map((o) => dens(o, t.k).d);
    const mx = Math.max(0, ...a);
    return { a, b: +t.v - fixedTotal(t.k), scale: +t.v > 0 ? +t.v : (mx * S) || 1, op: t.op || '=', t };
  };
  const rows = tg.map(rowOf);
  const scaled = (r) => ({ a: r.a.map((v) => v / r.scale), b: r.b / r.scale });
  const w = auto.map((o) => (+o.share > 0 ? +o.share : 1));
  const wMean = w.reduce((p, q) => p + q, 0) / n;
  const LAMBDA = 1e-5;
  const reg = w.map((v) => LAMBDA / ((S * (v / wMean)) ** 2));

  const active = rows.filter((r) => r.op === '=');
  const ineq = rows.filter((r) => r.op !== '=');
  let x = new Array(n).fill(0);
  for (let iter = 0; iter < 8; iter++) {
    x = nnls(active.map(scaled), n, reg);
    const bad = ineq.filter((r) => {
      if (active.includes(r)) return false;
      const got = r.a.reduce((p, v, i) => p + v * x[i], 0);
      const tol = 1e-4 * r.scale;
      return r.op === '>=' ? got < r.b - tol : got > r.b + tol;
    });
    if (!bad.length) break;
    active.push(...bad);
  }
  auto.forEach((o, i) => { o.g = x[i] > 1e-7 ? x[i] : 0; });

  // report: what the final mix actually gives
  const totalOf = (k) => out.reduce((a, o) => (o.food && o.g > 0 ? a + o.g * dens(o, k).d : a), 0) + (k === 'weight' ? +st.water || 0 : 0);
  const report = tg.map((t) => {
    if (t.type === 'ratio') {
      const g1 = totalOf(t.k), g2 = totalOf(t.k2);
      const want = +t.a / +t.b;
      const got = g2 > 0 ? g1 / g2 : g1 > 0 ? Infinity : null;
      const ok = got != null && Number.isFinite(got) && Math.abs(got - want) <= 0.01 * want;
      return { type: 'ratio', k: t.k, k2: t.k2, a: +t.a, b: +t.b, got1: g1, got2: g2, gotRatio: got, ok, miss: got == null || !Number.isFinite(got) ? 1 : Math.abs(got - want) / want };
    }
    const got = totalOf(t.k);
    const v = +t.v, op = t.op || '=';
    const tol = Math.max(0.01 * v, 0.02);
    const ok = op === '=' ? Math.abs(got - v) <= tol : op === '>=' ? got >= v - tol : got <= v + tol;
    const miss = ok ? 0 : Math.abs(got - v) / (v || 1);
    return { type: 'amount', k: t.k, op, v, got, ok, miss };
  });

  // warn about missing label values that the targets depend on
  const keys = [...new Set(tg.flatMap((t) => (t.type === 'ratio' ? [t.k, t.k2] : [t.k])))].filter((k) => k !== 'weight');
  for (const k of keys) {
    const names = out.filter((o) => o.food && o.g > 0 && dens(o, k).unknown).map((o) => o.food.name);
    if (names.length) warnings.push(`${names.join(', ')} ${names.length > 1 ? 'have' : 'has'} no ${targetDef(k).label.toLowerCase()} value${names.length > 1 ? 's' : ''}, counted as 0 for that target. Add the value in the ingredient if it contains some.`);
  }
  const off = report.filter((r) => !r.ok).sort((p, q) => q.miss - p.miss);
  if (off.length) {
    const r = off[0];
    const hint = r.type === 'ratio'
      ? `Check the ratio between ${targetDef(r.k).label.toLowerCase()} and ${targetDef(r.k2).label.toLowerCase()}: the ingredients may not allow it together with the other targets.`
      : `Add an ingredient that is rich in ${targetDef(r.k).label.toLowerCase()}, or relax another target.`;
    warnings.push(`These ingredients can't meet every target at once, so this is the closest fit (${off.length} target${off.length > 1 ? 's' : ''} off). ${hint}`);
  }
  return report;
}

/**
 * Glucose : fructose mode. Fixed ingredients contribute first; the remaining "auto" ingredients are split into a
 * glucose side (glucose share ≥ target) and a fructose side. Within a side, carbs are shared by each
 * ingredient's `share` weight. Two equations (total carbs, total glucose) give each side's carbs.
 */
function solveGF(out, st, warnings, fixedAmount) {
  const gT = +st.gfG > 0 ? +st.gfG : 1;
  const fT = +st.gfF >= 0 && st.gfF !== '' && st.gfF != null ? +st.gfF : 0.8;
  const p = gT / (gT + fT); // target glucose share of carbohydrate
  const T = +st.ratioValue || 0;
  let Cfix = 0, Gfix = 0, unknownFix = 0;
  const auto = [];
  for (const o of out) {
    if (!o.food) continue;
    const hasCarbs = o.food.n.carbs > 0;
    if (o.mode === 'grams' || o.mode === 'fixcarbs' || !hasCarbs || o.type?.id === 'none') {
      // fixed ingredients; zero-carb items (water, salt) always use their fixed grams
      if (o.mode === 'fixcarbs' && hasCarbs) fixedAmount(o);
      else o.g = o.grams;
      const c = o.g != null && o.food.n.carbs != null ? (o.food.n.carbs * o.g) / o.food.basis : 0;
      Cfix += c;
      if (o.type?.g != null) Gfix += c * o.type.g; else if (o.type?.id !== 'none') unknownFix += c;
      continue;
    }
    if (o.type?.g == null) { o.err = 'Choose a carb type to use it in a glucose : fructose ratio'; continue; }
    auto.push(o);
  }
  if (unknownFix > 0.5) warnings.push(`${Math.round(unknownFix)} g of carbs from fixed ingredients have an unknown type and are left out of the glucose : fructose balance.`);
  if (!(T > 0)) { warnings.push('Enter the total carbs for the mix.'); return; }
  if (!auto.length) { warnings.push('Add at least one ingredient set to "Auto (G : F)".'); return; }
  const R = T - Cfix;
  if (R <= 0) { warnings.push(`Fixed ingredients already give ${Math.round(Cfix)} g of carbs, which meets or exceeds the ${T} g target.`); return; }
  const needG = T * p - Gfix;
  const A = auto.filter((o) => o.type.g >= p - 1e-9);
  const B = auto.filter((o) => o.type.g < p - 1e-9);
  const w = (o) => (+o.share > 0 ? +o.share : 1);
  const sideShare = (list) => { const W = list.reduce((a, o) => a + w(o), 0); return { W, g: list.reduce((a, o) => a + w(o) * o.type.g, 0) / (W || 1) }; };
  const sa = sideShare(A), sb = sideShare(B);
  A.forEach((o) => (o.side = 'glucose')); B.forEach((o) => (o.side = 'fructose'));
  let x; // carbs from the glucose side
  if (!A.length) x = 0;
  else if (!B.length) x = R;
  else x = Math.max(0, Math.min(R, (needG - R * sb.g) / (sa.g - sb.g)));
  const y = R - x;
  for (const o of A) { o.c = (x * w(o)) / sa.W; o.g = amountForCarbs(o.food, o.c); }
  for (const o of B) { o.c = (y * w(o)) / sb.W; o.g = amountForCarbs(o.food, o.c); }
  // check what was actually achieved
  const gotG = Gfix + A.reduce((a, o) => a + o.c * o.type.g, 0) + B.reduce((a, o) => a + o.c * o.type.g, 0);
  const share = gotG / (T - unknownFix);
  if (Math.abs(share - p) > 0.01) {
    const ratio = (q) => (q >= 1 ? 'glucose only' : `1 : ${(Math.round(((1 - q) / q) * 100) / 100).toFixed(2)}`);
    const hint = share > p ? 'Add a fructose-rich ingredient (fructose, agave, honey…) on Auto, or fix less glucose.' : 'Add a glucose-rich ingredient (maltodextrin, dextrose…) on Auto, or fix less fructose.';
    warnings.push(`The target can't be reached with these ingredients. Closest possible: glucose : fructose ${ratio(share)} (target ${ratio(p)}). ${hint}`);
  }
}
