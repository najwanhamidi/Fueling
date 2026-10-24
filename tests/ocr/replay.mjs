// Replays captured OCR geometry (from run.cjs with DUMP=dir) through the parser, without the browser.
// Usage: node tests/ocr/replay.mjs <dumpDir> [filter] [--debug]
import fs from 'node:fs';
import path from 'node:path';
import { parseOcr, finalize } from '../../app/js/ocr/parser.js';
import { LABELS, DEGRADED } from './labels.mjs';

const dir = process.argv[2];
const filter = process.argv.slice(3).find((a) => !a.startsWith('--'));
const debug = process.argv.includes('--debug');
let tot = 0, ok = 0, perfect = 0, n = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const id = f.replace(/\.json$/, '');
  if (filter && !id.includes(filter)) continue;
  const src = DEGRADED.find((d) => d.id === id)?.src || id;
  const L = LABELS.find((x) => x.id === src);
  const passes = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) || [];
  const parsed = passes.map((p) => parseOcr(p));
  const r = finalize(parsed);
  const col = r.columns.find((c) => c.type === L.truth.type) || r.columns[0];
  const bad = [];
  let k = 0;
  for (const [key, v] of Object.entries(L.truth.values)) {
    const got = col?.values?.[key];
    if (got != null && Math.abs(got - v) <= Math.max(0.051, Math.abs(v) * 0.02)) k++;
    else bad.push(`${key}: want ${v} got ${got ?? '∅'}`);
  }
  const N = Object.keys(L.truth.values).length;
  const sOk = !L.truth.servingSize || r.servingSize === L.truth.servingSize;
  if (!sOk) bad.push(`serving: want ${L.truth.servingSize} got ${r.servingSize}`);
  tot += N; ok += k; n++; if (k === N && sOk) perfect++;
  console.log(`${k === N && sOk ? 'PASS' : 'MISS'} ${id.padEnd(26)} ${k}/${N}${bad.length ? '\n      ' + bad.join('\n      ') : ''}`);
  if (debug) {
    parsed.forEach((p, i) => console.log(`  pass ${i}: cols=${JSON.stringify(p.columns.map((c) => ({ t: c.type, a: c.amount, keys: Object.fromEntries(Object.entries(c.cands).map(([kk, l]) => [kk, l.slice(0, 3).map((x) => +x.v.toFixed(2))])) })))} serving=${p.servingSize}`));
    console.log('  final:', JSON.stringify(r.columns.map((c) => ({ t: c.type, v: c.values }))));
  }
}
console.log(`\nField accuracy: ${ok}/${tot} (${((ok / tot) * 100).toFixed(1)}%), perfect ${perfect}/${n}`);
