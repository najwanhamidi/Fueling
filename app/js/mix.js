// Mixer maths: carb types, ingredient templates, ratio templates and the mix solver. Pure (no DOM).
import { amountForCarbs, combine, normalizeFood } from './nutrients.js';

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
  { name: 'Table salt', ctype: 'none', n: { sodium: 39300, carbs: 0, energyKcal: 0, protein: 0, fat: 0 } },
  { name: 'Water', ctype: 'none', n: { carbs: 0, energyKcal: 0, protein: 0, fat: 0, sodium: 0, sugars: 0 } },
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

  if (!st.ratioOn) {
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
  return { out, comb, gf: G + F > 0 ? { G, F, unknownCarb } : null, warnings };
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
