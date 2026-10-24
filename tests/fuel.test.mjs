import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPackets, buildSchedule } from '../app/js/fuel/scheduler.js';
import { guidelineRate, glycogenModel, vdotFromRace, predictTime, wallFreeTime, gutPlan } from '../app/js/fuel/science.js';

test('selectPackets hits target within inventory', () => {
  const r = selectPackets([{ id: 'a', carbs: 25, qty: 10 }, { id: 'b', carbs: 40, qty: 2 }], 180);
  const total = r.counts.a * 25 + r.counts.b * 40;
  assert.ok(Math.abs(total - 180) <= 5, `total ${total}`);
  assert.ok(r.counts.b <= 2);
});
test('selectPackets shortfall', () => {
  const r = selectPackets([{ id: 'a', carbs: 25, qty: 2 }], 200);
  assert.equal(r.counts.a, 2); assert.equal(r.short, true);
});

test('basic schedule: 2h at 60 g/h with 25 g gels, pre-start', () => {
  const p = buildSchedule({ durationMin: 120, rate: 60, packets: [{ id: 'g', name: 'Gel', carbs: 25, qty: 10 }], preStart: { on: true, min: 10 } });
  assert.equal(p.rows[0].pre, true); assert.equal(p.rows[0].t, -10);
  assert.ok(Math.abs(p.total - 120) <= 13, `total ${p.total}`);
  const inRun = p.rows.filter((r) => !r.pre);
  assert.equal(inRun[0].t, 25); // covered by pre packet 25 g at 1 g/min
  assert.ok(inRun.every((r) => r.t <= 120));
  console.log(p.rows.map((r) => `${r.t}:${r.carbs}`).join(' '));
});

test('schedule without pre-start, endBuffer compresses', () => {
  const p = buildSchedule({ durationMin: 180, rate: 90, packets: [{ id: 'g', name: 'Gel40', carbs: 40, qty: 10 }, { id: 'c', name: 'Caf', carbs: 25, qty: 2, caffeine: 75 }], endBuffer: 15 });
  const ts = p.rows.map((r) => r.t);
  assert.ok(Math.max(...ts) <= 165);
  const cafIdx = p.rows.findIndex((r) => r.caffeine > 0);
  assert.ok(cafIdx >= p.rows.length / 3, 'caffeine late');
  console.log(p.rows.map((r) => `${r.t}:${r.name}`).join(' '), p.total);
});

test('guidelines tiers', () => {
  assert.equal(guidelineRate({ durationMin: 20 }).target, 0);
  const hm = guidelineRate({ durationMin: 100, intensity: 'race', gut: 'some' });
  assert.ok(hm.target >= 50 && hm.target <= 60, String(hm.target));
  const m = guidelineRate({ durationMin: 200, intensity: 'race', gut: 'trained' });
  assert.ok(m.target >= 90, String(m.target));
  const mu = guidelineRate({ durationMin: 200, intensity: 'race', gut: 'untrained' });
  assert.ok(mu.target <= 60);
});

test('VDOT & glycogen model sanity', () => {
  const vdot = vdotFromRace(10, 45);
  assert.ok(vdot > 44 && vdot < 47, String(vdot));
  const tm = predictTime(vdot, 42.195);
  assert.ok(tm > 205 && tm < 220, String(tm));
  const normal = glycogenModel({ massKg: 65, vo2max: vdot, distKm: 42.195, timeMin: tm, glyState: 'normal', reservePct: 0 });
  const loaded = glycogenModel({ massKg: 65, vo2max: vdot, distKm: 42.195, timeMin: tm, glyState: 'loaded', reservePct: 0 });
  console.log({ u: normal.u.toFixed(2), fc: normal.fc.toFixed(2), wallN: normal.wallKm.toFixed(1), wallL: loaded.wallKm.toFixed(1), minN: normal.minRate.toFixed(0), minL: loaded.minRate.toFixed(0), G0: normal.G0.toFixed(0), G0L: loaded.G0.toFixed(0) });
  assert.ok(normal.wallKm < loaded.wallKm);
  assert.ok(normal.wallKm > 20 && normal.wallKm < 40);
  const wf = wallFreeTime({ massKg: 65, vo2max: vdot, distKm: 42.195, glyState: 'normal' }, 60);
  assert.ok(wf > 150 && wf < 400, String(wf));
});

test('gut plan ramps', () => {
  const g = gutPlan({ current: 40, target: 90, weeks: 6 });
  assert.equal(g.weeks.at(-1).rate, 90);
  assert.ok(g.weeks[0].rate > 40);
});

test('frequent preference uses more, smaller packets than "fewer"', async () => {
  const { selectPackets } = await import('../app/js/fuel/scheduler.js');
  const types = [{ id: 's', carbs: 22, qty: 10 }, { id: 'b', carbs: 40, qty: 4 }];
  const few = selectPackets(types, 120, { prefer: 'fewer' });
  const many = selectPackets(types, 120, { prefer: 'frequent' });
  const n = (r) => Object.values(r.counts).reduce((a, b) => a + b, 0);
  assert.ok(n(many) > n(few), `${n(many)} vs ${n(few)}`);
  assert.ok(Math.abs(many.total - 120) <= 12);
});

test('classic guideline set caps at 90 g/h, contemporary allows 120 for trained guts', async () => {
  const { guidelineRate } = await import('../app/js/fuel/science.js');
  const c = guidelineRate({ durationMin: 240, intensity: 'race', gut: 'elite', set: 'classic' });
  const n = guidelineRate({ durationMin: 240, intensity: 'race', gut: 'elite', set: 'contemporary' });
  assert.equal(c.max, 90); assert.ok(c.target <= 90);
  assert.equal(n.max, 120); assert.ok(n.target > 90);
  assert.equal(guidelineRate({ durationMin: 25 }).target, 0);
});
