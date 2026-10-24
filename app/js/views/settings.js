// Settings, label-reading options, install/desktop info, science references.
import { $, $$, esc, toast, confirmBox, num } from '../ui.js';
import { settings } from '../store.js';
import { AI_PROVIDERS } from '../ocr/ai.js';
import { REFS } from '../fuel/science.js';
import { applyTheme, canInstall, promptInstall, VERSION } from '../app.js';

export function mount(root) {
  const draw = () => {
    const s = settings.get();
    const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    root.innerHTML = `
    <div class="cols-2">
      <div class="stack">
        <div class="card stack">
          <h2>General</h2>
          <div class="fields">
            <label class="field"><span class="lbl">Theme</span><select data-s="theme">${[['auto', 'Match device'], ['dark', 'Dark'], ['light', 'Light']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="field"><span class="lbl">Default body mass</span><div class="input-unit"><input type="text" data-num autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-s="massKg" value="${s.massKg ?? ''}"><span class="u">kg</span></div></label>
          </div>
        </div>
        <div class="card stack">
          <h2>Label reading</h2>
          <label class="field"><span class="lbl">On-device OCR accuracy</span><select data-s="ocrMode">
            <option value="fast" ${s.ocrMode === 'fast' ? 'selected' : ''}>Fast: 1 pass</option>
            <option value="thorough" ${s.ocrMode === 'thorough' ? 'selected' : ''}>Thorough: 2–3 passes, cross-checked (recommended)</option>
            <option value="max" ${s.ocrMode === 'max' ? 'selected' : ''}>Maximum: 5 passes (slow on older phones)</option></select></label>
          <p class="small muted">On-device OCR straightens the photo, enhances contrast, reads it several ways and votes on every number, then checks the values against each other (energy vs macros, per-serving vs per-100 g, sugars ≤ carbs…). It handles English and Malay/Indonesian labels plus most European languages. Nothing leaves your phone.</p>
          <hr style="border:0;border-top:1px solid var(--line);width:100%">
          <h3>Optional: AI vision (most accurate on unusual designs)</h3>
          <p class="small muted">Use your own API key. The cropped label image goes straight from this device to the provider. The key is stored only on this device and never included in backups.</p>
          <div class="fields">
            <label class="field"><span class="lbl">Provider</span><select data-s="aiProvider"><option value="none" ${s.aiProvider === 'none' ? 'selected' : ''}>Off</option>${Object.entries(AI_PROVIDERS).map(([k, p]) => `<option value="${k}" ${s.aiProvider === k ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
            ${s.aiProvider !== 'none' ? `
            <label class="field"><span class="lbl">API key</span><input type="password" autocomplete="off" data-s="aiKey" value="${esc(s.aiKey || '')}" placeholder="${esc(AI_PROVIDERS[s.aiProvider]?.keyHint || '')}"></label>
            <label class="field"><span class="lbl">Model</span><input type="text" data-s="aiModel" value="${esc(s.aiModel || '')}" placeholder="${esc(AI_PROVIDERS[s.aiProvider]?.defaultModel || '')}"></label>` : ''}
          </div>
          ${s.aiProvider !== 'none' ? `<label class="check"><input type="checkbox" data-s="aiAlways" ${s.aiAlways ? 'checked' : ''}> Use AI by default (falls back to on-device OCR on error)</label>` : ''}
        </div>
        <div class="card stack">
          <h2>Install</h2>
          ${isStandalone ? '<div class="note good small">Running as an installed app.</div>' : ''}
          ${canInstall() ? '<button class="btn primary" data-install>Install Fueling on this device</button>' : ''}
          <div class="small"><b>Android (Chrome):</b> menu ⋮ → <i>Install app</i> / <i>Add to Home screen</i>.</div>
          <div class="small"><b>iPhone (Safari):</b> Share → <i>Add to Home Screen</i>.</div>
          <div class="small"><b>Windows / Mac (Chrome or Edge):</b> click the install icon in the address bar, or download the desktop build from the GitHub Releases page.</div>
          <div class="small muted">Works offline after the first load, including label scanning.</div>
        </div>
        <div class="card stack">
          <h2>Data</h2>
          <p class="small muted">Back up or move your foods, recipes, arsenal and plans from the <a href="#/library">Library</a> page.</p>
          <button class="btn danger small" data-reset style="justify-self:start">Erase all data on this device</button>
        </div>
      </div>
      <div class="stack">
        <div class="card stack">
          <h2>The science behind the fuelling calculators</h2>
          <p class="small"><b>Basic</b> spreads your packets evenly so cumulative carbohydrate tracks your hourly target, using the packets and quantities you actually have. The pre-start packet "covers" the opening minutes.</p>
          <p class="small"><b>Guidelines</b> applies the evidence-based sliding scale: no carbs under ~30 min; mouth rinse or small amounts for 30–75 min; 30–60 g/h for 1–2.5 h; up to 90 g/h of glucose+fructose beyond 2.5 h, and up to 120 g/h for athletes with trained guts (Jeukendrup 2014; ACSM 2016; recent reviews). Pre-race loading, meal, caffeine, fluid and sodium follow the ACSM/ISSN position stands.</p>
          <p class="small"><b>Glycogen model</b> estimates when you'd "hit the wall" from running economy, intensity (%VO₂max via Daniels VDOT), the carbohydrate share of energy at that intensity, and leg-muscle + liver glycogen (Rapoport 2010). It then finds the minimum intake that avoids depletion and the fastest wall-free pace for your gut tolerance.</p>
          <p class="small"><b>Training</b> follows "fuel for the work required" periodisation: daily carbs by load (3–12 g/kg), fuelled long and quality sessions, optional train-low for easy runs, and a progressive gut-training ramp (Costa 2017; Jeukendrup 2017; Impey 2018).</p>
          <div class="note warn small">General education, not medical advice. Individual needs vary; test everything in training. If you have diabetes, a GI condition or a history of disordered eating, work with a sports dietitian.</div>
          <details class="more"><summary>All references (${Object.keys(REFS).length})</summary><div class="inner"><ol class="refs" style="padding-left:18px;margin:0">${Object.values(REFS).map((r) => `<li style="margin-bottom:6px">${esc(r.t)} <a href="${r.u}" target="_blank" rel="noopener">link</a></li>`).join('')}</ol></div></details>
        </div>
        <div class="card small muted">Fueling v${VERSION} · open source · <a href="https://github.com/najwanhamidi/Fueling" target="_blank" rel="noopener">GitHub</a></div>
      </div>
    </div>`;
    $$('[data-s]', root).forEach((el) => {
      const ev = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        const k = el.dataset.s;
        const v = el.type === 'checkbox' ? el.checked : (el.type === 'number' || 'num' in el.dataset) ? num(el.value) : el.value;
        settings.set({ [k]: v });
        if (k === 'theme') applyTheme();
        if (k === 'aiProvider') draw();
      });
    });
    $('[data-install]', root)?.addEventListener('click', async () => { await promptInstall(); draw(); });
    $('[data-reset]', root).onclick = async () => {
      if (!(await confirmBox('Erase all foods, recipes, arsenal, plans and settings on this device? Export a backup first if unsure.', { ok: 'Erase', danger: true }))) return;
      Object.keys(localStorage).filter((k) => k.startsWith('fueling.')).forEach((k) => localStorage.removeItem(k));
      toast('All data erased');
      location.reload();
    };
  };
  draw();
}
