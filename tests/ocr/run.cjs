// End-to-end OCR accuracy test: renders synthetic labels, runs the real in-browser OCR pipeline, scores it.
// Usage: (serve the repo root on :8081) node tests/ocr/run.cjs [filter] [--mode=fast|thorough|max] [--out=dir]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const { LABELS, DEGRADED } = await import(path.join(__dirname, 'labels.mjs'));
  const args = process.argv.slice(2);
  const filter = args.find((a) => !a.startsWith('--'));
  const mode = (args.find((a) => a.startsWith('--mode=')) || '--mode=thorough').slice(7);
  const outDir = (args.find((a) => a.startsWith('--out=')) || '').slice(6);
  const PORT = process.env.PORT || 8081;

  const browser = await chromium.launch();
  const render = await browser.newPage({ deviceScaleFactor: 2 });
  const pngs = {};
  for (const L of LABELS) {
    await render.setContent(`<!doctype html><html><body style="margin:0;padding:20px;background:#fff">${L.html}</body></html>`);
    const buf = await render.locator('.l').screenshot();
    pngs[L.id] = 'data:image/png;base64,' + buf.toString('base64');
  }
  const cases = [...LABELS.map((L) => ({ id: L.id, src: L.id, degrade: null })), ...DEGRADED]
    .filter((c) => !filter || c.id.includes(filter));

  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text()); });
  await page.goto(`http://localhost:${PORT}/tests/ocr/harness.html`);
  await page.waitForFunction(() => window.ready);

  let totalFields = 0, totalOk = 0;
  const rows = [];
  for (const c of cases) {
    const L = LABELS.find((x) => x.id === c.src);
    const r = await page.evaluate(([u, d, m]) => window.runOne(u, d, m), [pngs[c.src], c.degrade, mode]);
    if (outDir && r.preview) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, c.id + '.jpg'), Buffer.from(r.preview.split(',')[1], 'base64'));
    }
    const col = r.columns.find((x) => x.type === L.truth.type) || r.columns[0];
    const bad = [];
    let ok = 0;
    for (const [k, v] of Object.entries(L.truth.values)) {
      const got = col?.values?.[k];
      const tol = Math.max(0.051, Math.abs(v) * 0.02);
      if (got != null && Math.abs(got - v) <= tol) ok++;
      else bad.push(`${k}: want ${v} got ${got ?? '∅'}`);
    }
    const n = Object.keys(L.truth.values).length;
    let servOk = true;
    if (L.truth.servingSize && r.servingSize !== L.truth.servingSize) { servOk = false; bad.push(`serving: want ${L.truth.servingSize} got ${r.servingSize ?? '∅'}`); }
    totalFields += n; totalOk += ok;
    rows.push({ id: c.id, ok, n, servOk, ms: r.ms, passes: r.passes, rotated: r.rotated });
    console.log(`${ok === n && servOk ? 'PASS' : 'MISS'} ${c.id.padEnd(26)} ${ok}/${n}${servOk ? '' : ' (serving)'}  ${r.ms} ms, ${r.passes} passes${r.rotated ? `, rot ${r.rotated}` : ''}${bad.length ? '\n      ' + bad.join('\n      ') : ''}`);
    if (process.env.DUMP) { fs.mkdirSync(process.env.DUMP, { recursive: true }); fs.writeFileSync(path.join(process.env.DUMP, c.id + '.json'), JSON.stringify(r.debugPasses)); }
    if (process.env.SHOW_TEXT && bad.length) console.log('----\n' + r.text + '\n----');
  }
  console.log(`\nField accuracy: ${totalOk}/${totalFields} (${((totalOk / totalFields) * 100).toFixed(1)}%), perfect labels: ${rows.filter((r) => r.ok === r.n && r.servOk).length}/${rows.length}`);
  await browser.close();
  process.exit(totalOk === totalFields ? 0 : 1);
})();
