import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMix, GENERIC, newIng, carbTypeOf, guessCType } from '../app/js/mix.js';

const food = (name) => { const g = GENERIC.find((x) => x.name.startsWith(name)); return { name: g.name, basis: 100, basisUnit: 'g', n: g.n }; };
const ing = (name, extra = {}) => ({ ...newIng(), food: food(name), ctype: GENERIC.find((x) => x.name.startsWith(name)).ctype, ...extra });
const near = (a, b, tol = 0.15) => Math.abs(a - b) <= tol;

test('G:F mode, 3 ingredients (malto + dextrose + fructose) hits 1:0.8 at 90 g', () => {
  const st = { count: 3, ratioOn: true, ratioKind: 'gf', gfG: 1, gfF: 0.8, ratioValue: 90, ings: [ing('Maltodextrin'), ing('Dextrose'), ing('Fructose')] };
  const r = computeMix(st);
  assert.ok(near(r.out[0].c, 25) && near(r.out[1].c, 25) && near(r.out[2].c, 40), r.out.map((o) => o.c).join());
  assert.ok(near(r.gf.F / r.gf.G, 0.8, 0.005));
  assert.equal(r.warnings.length, 0);
});

test('G:F mode with honey and maple (mixed sugars) still reaches the target', () => {
  const st = { count: 3, ratioOn: true, ratioKind: 'gf', gfG: 1, gfF: 0.8, ratioValue: 80, ings: [ing('Maltodextrin'), ing('Honey'), ing('Maple')] };
  const r = computeMix(st);
  const tot = r.out.reduce((a, o) => a + (o.c || 0), 0);
  assert.ok(near(tot, 80, 0.5));
  assert.ok(near(r.gf.F / r.gf.G, 0.8, 0.01), `${r.gf.F / r.gf.G}`);
});

test('G:F mode: share weights split a side, fixed carbs counted first, water fixed', () => {
  const st = { count: 4, ratioOn: true, ratioKind: 'gf', gfG: 2, gfF: 1, ratioValue: 60,
    ings: [ing('Maltodextrin', { share: 3 }), ing('Dextrose', { share: 1 }), ing('Fructose'), ing('Water', { mode: 'grams', grams: 200 })] };
  const r = computeMix(st);
  assert.ok(near(r.out[0].c / r.out[1].c, 3, 0.01));
  assert.ok(near(r.gf.F / r.gf.G, 0.5, 0.005));
  assert.equal(r.out[3].g, 200);
  const st2 = { ...st, ings: [ing('Maltodextrin'), ing('Fructose', { mode: 'fixcarbs', carbs: 10 })] , count: 2 };
  const r2 = computeMix(st2);
  assert.ok(near(r2.out[1].c, 10) && near(r2.out[0].c, 50));
  assert.ok(r2.warnings.some((w) => /can't be reached/.test(w)));
});

test('G:F mode warns when one side is missing', () => {
  const st = { count: 2, ratioOn: true, ratioKind: 'gf', gfG: 1, gfF: 0.8, ratioValue: 60, ings: [ing('Maltodextrin'), ing('Dextrose')] };
  assert.ok(computeMix(st).warnings.some((w) => /fructose-rich/.test(w) && /can't be reached/.test(w)));
});

test('per-ingredient ratio still works with N ingredients', () => {
  const st = { count: 3, ratioOn: true, ratioKind: 'ingredient', ratioBasis: 'carbs', ratioTarget: 'total', ratioValue: 90,
    ings: [ing('Maltodextrin', { ratio: 1 }), ing('Dextrose', { ratio: 1 }), ing('Fructose', { ratio: 1.6 })] };
  const r = computeMix(st);
  assert.ok(near(r.out[0].c, 25) && near(r.out[2].c, 40));
});

test('carb types: custom split and name guessing', () => {
  assert.deepEqual(carbTypeOf({ ctype: 'custom', gPct: 70 }, {}), { id: 'custom', g: 0.7, f: 0.30000000000000004 });
  assert.equal(guessCType('Madu Lebah'), 'honey');
  assert.equal(guessCType('Pure maple syrup'), 'sucrose');
  assert.equal(guessCType('Kurma Ajwa'), 'dates');
  assert.equal(carbTypeOf({ ctype: null }, { name: 'Maltodextrin 19DE' }).g, 1);
});

// ───────── multi-target mode ─────────
const T = (k, v, op = '=') => ({ type: 'amount', k, op, v });
const tmix = (names, targets, extra = {}, ingExtra = {}) => ({
  count: names.length, ratioOn: true, ratioKind: 'targets', targets,
  ings: names.map((n) => ing(n, ingExtra[n] || {})), ...extra,
});
const total = (r, k) => r.out.reduce((a, o) => a + (o.g > 0 ? (o.g * o.food.n[k]) / o.food.basis : 0), 0);

test('targets: carbs 60 g + protein 15 g with maltodextrin and whey', () => {
  const r = computeMix(tmix(['Maltodextrin', 'Whey'], [T('carbs', 60), T('protein', 15)]));
  assert.ok(near(total(r, 'carbs'), 60, 0.3), `${total(r, 'carbs')}`);
  assert.ok(near(total(r, 'protein'), 15, 0.15), `${total(r, 'protein')}`);
  assert.ok(r.targets.every((t) => t.ok));
  assert.equal(r.warnings.length, 0);
});

test('targets: carbs : protein ratio 4 : 1 at 80 g carbs', () => {
  const r = computeMix(tmix(['Maltodextrin', 'Whey'], [T('carbs', 80), { type: 'ratio', k: 'carbs', k2: 'protein', a: 4, b: 1 }]));
  assert.ok(near(total(r, 'carbs'), 80, 0.5));
  assert.ok(near(total(r, 'carbs') / total(r, 'protein'), 4, 0.04), `${total(r, 'carbs') / total(r, 'protein')}`);
  assert.ok(r.targets.every((t) => t.ok));
});

test('targets: more ingredients than targets still hits both, nothing negative', () => {
  const r = computeMix(tmix(['Maltodextrin', 'Honey', 'Fructose', 'Whey'], [T('carbs', 70), T('protein', 12)]));
  assert.ok(near(total(r, 'carbs'), 70, 0.4) && near(total(r, 'protein'), 12, 0.15));
  assert.ok(r.out.every((o) => o.g >= 0));
  assert.ok(r.out.filter((o) => o.g > 0.5).length >= 3, 'spreads over several ingredients');
});

test('targets: share preference moves the amounts when several mixes fit', () => {
  const base = tmix(['Maltodextrin', 'Dextrose', 'Whey'], [T('carbs', 60), T('protein', 10)]);
  const a = computeMix(base);
  const b = computeMix(tmix(['Maltodextrin', 'Dextrose', 'Whey'], [T('carbs', 60), T('protein', 10)], {}, { Maltodextrin: { share: 4 } }));
  assert.ok(b.out[0].g > a.out[0].g * 1.3, `${a.out[0].g} → ${b.out[0].g}`);
  assert.ok(near(total(b, 'carbs'), 60, 0.4) && near(total(b, 'protein'), 10, 0.15));
});

test('targets: impossible target gives a warning and the closest fit', () => {
  const r = computeMix(tmix(['Maltodextrin', 'Dextrose'], [T('carbs', 60), T('protein', 15)]));
  assert.ok(r.warnings.some((w) => /closest fit/.test(w)));
  assert.ok(r.targets.some((t) => !t.ok));
  assert.ok(near(total(r, 'carbs'), 60, 1));
});

test('targets: "at least" and "at most" only bind when needed', () => {
  const r = computeMix(tmix(['Maltodextrin', 'Table salt'], [T('carbs', 40), T('sodium', 400, '>=')], {}, { 'Table salt': {} }));
  const na = total(r, 'sodium');
  assert.ok(na >= 399 && na < 440, `${na}`);
  const r2 = computeMix(tmix(['Maltodextrin', 'Table salt'], [T('carbs', 40), T('sodium', 5000, '<=')]));
  assert.ok(total(r2, 'sodium') < 100, `${total(r2, 'sodium')}`); // maltodextrin's own sodium only; salt not added
});

test('targets: total weight with water filling the rest, fixed ingredient counted first', () => {
  const r = computeMix(tmix(['Maltodextrin', 'Table salt', 'Water'], [T('carbs', 40), T('sodium', 400), T('weight', 500)], {}, { 'Table salt': { mode: 'carbs' }, Water: { mode: 'carbs' } }));
  const w = r.out.reduce((a, o) => a + (o.g || 0), 0);
  assert.ok(near(w, 500, 1), `${w}`);
  assert.ok(near(total(r, 'sodium'), 400, 4) && near(total(r, 'carbs'), 40, 0.3));
  const f = computeMix(tmix(['Skimmed milk', 'Maltodextrin'], [T('carbs', 80), T('protein', 36)], {}, { 'Skimmed milk': { mode: 'grams', grams: 100 } }));
  assert.ok(near(f.out[0].g, 100, 0.01) && near(total(f, 'protein'), 36, 0.8) && near(total(f, 'carbs'), 80, 0.5), `${total(f, 'carbs')} ${total(f, 'protein')}`);
});

test('targets: glucose and fructose grams as custom targets', () => {
  const r = computeMix(tmix(['Maltodextrin', 'Honey', 'Fructose'], [T('glucose', 50), T('fructose', 40)]));
  assert.ok(near(r.gf.G, 50, 0.4) && near(r.gf.F, 40, 0.4), `${r.gf.G} ${r.gf.F}`);
});
