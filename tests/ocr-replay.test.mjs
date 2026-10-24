// Regression test: replays recorded OCR output (24 label photos/designs) through the parser.
// Re-record with: DUMP=tests/ocr/fixtures node tests/ocr/run.cjs  (needs a server on :8081 and Playwright)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOcr, finalize } from '../app/js/ocr/parser.js';
import { LABELS, DEGRADED } from './ocr/labels.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ocr', 'fixtures');

test('recorded OCR fixtures parse with ≥ 97% field accuracy', () => {
  let tot = 0, ok = 0;
  const misses = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const id = f.replace(/\.json$/, '');
    const L = LABELS.find((x) => x.id === (DEGRADED.find((d) => d.id === id)?.src || id));
    const r = finalize(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).map((p) => parseOcr(p)));
    const col = r.columns.find((c) => c.type === L.truth.type) || r.columns[0];
    for (const [k, v] of Object.entries(L.truth.values)) {
      tot++;
      const got = col?.values?.[k];
      if (got != null && Math.abs(got - v) <= Math.max(0.051, Math.abs(v) * 0.02)) ok++;
      else misses.push(`${id}.${k}: want ${v} got ${got}`);
    }
  }
  assert.ok(tot > 150, 'fixtures present');
  assert.ok(ok / tot >= 0.97, `accuracy ${(ok / tot * 100).toFixed(1)}%\n${misses.join('\n')}`);
});
