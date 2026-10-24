// Nutrient model: definitions, scaling, combining, rendering a label.
import { esc, fmt } from './ui.js';

export const NUTRIENTS = [
  { k: 'energyKcal', label: 'Energy', unit: 'kcal', core: true, cls: 'energy' },
  { k: 'fat', label: 'Total fat', unit: 'g', core: true, cls: 'major' },
  { k: 'satFat', label: 'Saturated fat', unit: 'g', indent: 1 },
  { k: 'transFat', label: 'Trans fat', unit: 'g', indent: 1 },
  { k: 'cholesterol', label: 'Cholesterol', unit: 'mg', cls: 'major' },
  { k: 'carbs', label: 'Carbohydrate', unit: 'g', core: true, cls: 'major' },
  { k: 'sugars', label: 'Sugars', unit: 'g', core: true, indent: 1 },
  { k: 'addedSugars', label: 'Added sugars', unit: 'g', indent: 2 },
  { k: 'fiber', label: 'Dietary fibre', unit: 'g', indent: 1 },
  { k: 'protein', label: 'Protein', unit: 'g', core: true, cls: 'major' },
  { k: 'sodium', label: 'Sodium', unit: 'mg', core: true, cls: 'major' },
  { k: 'potassium', label: 'Potassium', unit: 'mg' },
  { k: 'caffeine', label: 'Caffeine', unit: 'mg' },
];
export const NKEYS = NUTRIENTS.map((n) => n.k);
export const nutrientDef = (k) => NUTRIENTS.find((n) => n.k === k);

export const KJ_PER_KCAL = 4.184;
export const SODIUM_MG_PER_SALT_G = 393.4; // salt (NaCl) is ~39.3% sodium

export function emptyFood() {
  return {
    id: null, name: '', brand: '', basis: 100, basisUnit: 'g', servingSize: null, servingName: '',
    n: Object.fromEntries(NKEYS.map((k) => [k, null])), notes: '', tags: [],
  };
}

export function normalizeFood(f) {
  const e = emptyFood();
  const out = { ...e, ...(f || {}) };
  out.n = { ...e.n, ...((f && f.n) || {}) };
  for (const k of NKEYS) {
    const v = out.n[k];
    out.n[k] = v === '' || v == null || !Number.isFinite(+v) ? null : +v;
  }
  out.basis = +out.basis > 0 ? +out.basis : 100;
  out.servingSize = +out.servingSize > 0 ? +out.servingSize : null;
  return out;
}

export function knownCount(food) {
  return NKEYS.filter((k) => food?.n?.[k] != null).length;
}

/** Nutrients for `amount` (g or ml) of food. Unknown stays null. */
export function scaleFood(food, amount) {
  const f = amount / (food.basis || 100);
  const out = {};
  for (const k of NKEYS) {
    const v = food.n?.[k];
    out[k] = v == null ? null : v * f;
  }
  return out;
}

/** Grams needed to reach `carbs` g of carbohydrate. */
export function amountForCarbs(food, carbs) {
  const c = food?.n?.carbs;
  if (!c || c <= 0 || carbs == null) return null;
  return (carbs * (food.basis || 100)) / c;
}

/**
 * Combine [{food, amount}] → { totals, partial:Set (some ingredients unknown), weight }
 * Totals: sum of known values. If some (but not all) ingredients lack a value it is flagged partial (≥).
 */
export function combine(items) {
  const totals = {};
  const partial = new Set();
  let weight = 0;
  const active = items.filter((it) => it.amount > 0);
  for (const it of active) weight += it.amount;
  for (const k of NKEYS) {
    let sum = 0, known = 0, unknown = 0;
    for (const it of active) {
      if (!it.food) { continue; }
      const v = it.food.n?.[k];
      if (v == null) { if (!it.zero) unknown++; continue; }
      sum += (v * it.amount) / (it.food.basis || 100);
      known++;
    }
    if (known === 0) totals[k] = null;
    else {
      totals[k] = sum;
      if (unknown) partial.add(k);
    }
  }
  return { totals, partial, weight };
}

export function per100(totals, weight) {
  const out = {};
  for (const k of NKEYS) out[k] = totals[k] == null || !weight ? null : (totals[k] * 100) / weight;
  return out;
}

/** Atwater energy estimate (kcal) from macros when energy missing. */
export function atwater(n) {
  if (n.carbs == null && n.protein == null && n.fat == null) return null;
  return 4 * (n.carbs || 0) + 4 * (n.protein || 0) + 9 * (n.fat || 0);
}

/**
 * Render a nutrition-facts label.
 * columns: [{ head, values, partial:Set }]
 */
export function renderLabel({ title = 'Nutrition Facts', subtitle = '', columns, showAll = false, footnote = '' }) {
  const anyKnown = (k) => columns.some((c) => c.values?.[k] != null);
  const rows = NUTRIENTS.filter((n) => showAll || n.core || anyKnown(n.k));
  const saltKnown = columns.some((c) => c.values?.sodium != null);
  let html = `<div class="nlabel"><h3>${esc(title)}</h3>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : '<div class="sub"></div>'}
  <table><thead><tr><th></th>${columns.map((c) => `<th>${esc(c.head)}</th>`).join('')}</tr></thead><tbody>`;
  for (const n of rows) {
    const cls = [n.cls || '', n.indent ? `ind${n.indent}` : ''].join(' ');
    html += `<tr class="${cls}"><td>${esc(n.label)}</td>`;
    for (const c of columns) {
      const v = c.values?.[n.k];
      const part = c.partial?.has?.(n.k);
      if (v == null) html += `<td class="unk">—</td>`;
      else if (n.k === 'energyKcal') html += `<td class="${part ? 'partial' : ''}">${part ? '≥' : ''}${fmt(v, '', { d: 0 })} kcal<br><span style="font-size:.72rem;font-weight:500">${fmt(v * KJ_PER_KCAL, '', { d: 0 })} kJ</span></td>`;
      else html += `<td class="${part ? 'partial' : ''}">${part ? '≥' : ''}${fmt(v, n.unit)}</td>`;
    }
    html += `</tr>`;
    if (n.k === 'sodium' && saltKnown) {
      html += `<tr class="ind1"><td>Salt equivalent</td>${columns
        .map((c) => (c.values?.sodium == null ? '<td class="unk">—</td>' : `<td class="${c.partial?.has?.('sodium') ? 'partial' : ''}">${fmt(c.values.sodium / SODIUM_MG_PER_SALT_G, 'g', { d: 2 })}</td>`))
        .join('')}</tr>`;
    }
  }
  html += `</tbody></table>`;
  const anyPartial = columns.some((c) => c.partial && c.partial.size);
  const foot = [footnote, anyPartial ? '≥ = at least: one or more ingredients have no value for this nutrient.' : '', '— = not known.'].filter(Boolean).join(' ');
  html += `<div class="foot">${esc(foot)}</div></div>`;
  return html;
}

export function foodSubtitle(food) {
  const parts = [];
  parts.push(`Values per ${fmt(food.basis, food.basisUnit)}`);
  if (food.servingSize) parts.push(`serving ${fmt(food.servingSize, food.basisUnit)}${food.servingName ? ` (${food.servingName})` : ''}`);
  return parts.join(' · ');
}

export function foodShortFacts(food) {
  const n = food.n || {};
  const bits = [];
  if (n.carbs != null) bits.push(`${fmt(n.carbs, 'g')} carbs`);
  if (n.energyKcal != null) bits.push(`${fmt(n.energyKcal, 'kcal', { d: 0 })}`);
  if (n.protein != null) bits.push(`${fmt(n.protein, 'g')} protein`);
  if (n.sodium != null) bits.push(`${fmt(n.sodium, 'mg', { d: 0 })} Na`);
  return `per ${fmt(food.basis, food.basisUnit)}: ${bits.join(' · ') || 'no values'}`;
}
