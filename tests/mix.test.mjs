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
