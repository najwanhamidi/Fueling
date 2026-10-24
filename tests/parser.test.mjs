import test from 'node:test';
import assert from 'node:assert/strict';
import { parseText, columnToFood, fixNumericToken } from '../app/js/ocr/parser.js';

const near = (a, b, tol = 0.051) => assert.ok(a != null && Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 0.02), `expected ${b}, got ${a}`);

test('EU two-column table per 100g / per serving', () => {
  const t = `Nutrition Information
Typical values Per 100g Per 40g serving
Energy 1580kJ / 378kcal 632kJ / 151kcal
Fat 0.5g 0.2g
of which saturates 0.1g 0.0g
Carbohydrate 92.0g 36.8g
of which sugars 30.0g 12.0g
Fibre 0.5g 0.2g
Protein 0.5g 0.2g
Salt 0.50g 0.20g`;
  const r = parseText(t);
  const p = r.columns.find((c) => c.type === 'per100');
  const s = r.columns.find((c) => c.type === 'serving');
  assert.ok(p && s);
  near(p.values.carbs, 92); near(s.values.carbs, 36.8); near(p.values.energyKcal, 378);
  near(p.values.sugars, 30); near(p.values.sodium, 196.7, 2);
  assert.equal(r.servingSize, 40);
});

test('Malaysian bilingual label with OCR errors', () => {
  const t = `MAKLUMAT PEMAKANAN / NUTRITION INFORMATION
Saiz hidangan / Serving size: 1 sachet (45g)
Setiap 100g Setiap hidangan
Tenaga / Energy (kcal) 356 160
Karbohidrat / Carbohydrate 88.9g 4O.Og
Gula / Sugars 2l.3g 9.6g
Protein Og Og
Lemak / Fat O.1g O.O5g
Natrium / Sodium 444mg 2OOmg`;
  const r = parseText(t);
  const f = columnToFood(r, 0);
  assert.equal(r.columns[0].type, 'per100');
  near(f.n.carbs, 88.9); near(f.n.energyKcal, 356); near(f.n.sugars, 21.3); near(f.n.sodium, 444, 1); near(f.n.protein, 0);
  assert.equal(r.servingSize, 45);
});

test('US label single column with %DV and footnote', () => {
  const t = `Nutrition Facts
1 serving per container
Serving size 1 packet (32g)
Amount per serving
Calories 100
% Daily Value*
Total Fat 0g 0%
Sodium 85mg 4%
Total Carbohydrate 25g 9%
Dietary Fiber 0g 0%
Total Sugars 11g
Includes 11g Added Sugars 22%
Protein 0g
Potassium 40mg 0%
* The % Daily Value tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.
Calories per gram: Fat 9 Carbohydrate 4 Protein 4`;
  const r = parseText(t);
  const f = columnToFood(r, 0);
  assert.equal(r.columns[0].type, 'serving');
  assert.equal(f.basis, 32);
  near(f.n.carbs, 25); near(f.n.energyKcal, 100); near(f.n.sodium, 85, 1); near(f.n.sugars, 11); near(f.n.potassium, 40, 1);
});

test('linear paragraph label', () => {
  const t = `Nutrition: per 100ml: energy 105kJ/25kcal, fat 0g, of which saturates 0g, carbohydrate 6.0g, of which sugars 5.8g, protein 0g, salt 0.13g`;
  const r = parseText(t);
  const f = columnToFood(r, 0);
  near(f.n.carbs, 6); near(f.n.energyKcal, 25); near(f.n.sugars, 5.8); assert.equal(f.basisUnit, 'ml');
});

test('missing decimal + g read as 9 repaired by consistency', () => {
  const t = `Per 100g
Energy 380kcal
Fat 1.0g
Carbohydrate 90.59
Protein 1.0g`;
  const r = parseText(t);
  const f = columnToFood(r, 0);
  near(f.n.carbs, 90.5);
});

test('numeric token repair', () => {
  assert.equal(fixNumericToken('1O.5g'), '10.5g');
  assert.equal(fixNumericToken('Og'), '0g');
  assert.equal(fixNumericToken('25rng'), '25mg');
  assert.equal(fixNumericToken('l2.5q'), '12.5g');
});
