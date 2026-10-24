// Library: saved foods (nutrition facts) and mixer recipes. Save / load / edit / backup.
import { $, $$, esc, fmt, modal, toast, confirmBox, downloadFile, seg, bindSeg } from '../ui.js';
import { foods, recipes, exportAll, importAll, viewState } from '../store.js';
import { foodShortFacts, renderLabel, foodSubtitle, normalizeFood, scaleFood } from '../nutrients.js';
import { openFoodEditor } from '../ui/foodEditor.js';
import { scanLabel } from '../ui/scan.js';

const vs = viewState('library', { tab: 'foods', q: '' });

export function mount(root) {
  const st = vs.get();
  const draw = () => {
    root.innerHTML = `
      <div class="card">
        <div class="card-head">${seg('tab', [['foods', `Foods (${foods.all().length})`], ['recipes', `Recipes (${recipes.all().length})`]], st.tab)}
          <div class="row">
            ${st.tab === 'foods' ? '<button class="btn small primary" data-new>+ Manual</button><button class="btn small" data-scan>📷 Scan</button>' : ''}
          </div></div>
        <input type="search" placeholder="Search…" value="${esc(st.q)}" data-q>
        <div class="list" style="margin-top:12px" data-list></div>
      </div>
      <div class="card" style="margin-top:14px">
        <h3>Backup & sync</h3>
        <p class="small muted">Everything is stored on this device only. Export a backup file to move data between phone and desktop, or to keep it safe.</p>
        <div class="row"><button class="btn small" data-export>Export backup (.json)</button><button class="btn small" data-import>Import backup</button></div>
      </div>`;
    bindSeg(root, 'tab', (v) => { st.tab = v; vs.save(); draw(); });
    const q = $('[data-q]', root);
    q.oninput = () => { st.q = q.value; vs.save(); list(); };
    $('[data-new]', root)?.addEventListener('click', async () => { if (await openFoodEditor(null, { title: 'New food', saveLabel: 'Save to library' })) draw(); });
    $('[data-scan]', root)?.addEventListener('click', async () => { if (await scanLabel('camera')) draw(); });
    $('[data-export]', root).onclick = () => downloadFile(`fueling-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportAll(), null, 2));
    $('[data-import]', root).onclick = () => {
      const input = document.getElementById('file-json');
      input.value = '';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          const merge = await modal({ title: 'Import backup', render: (b) => { b.innerHTML = '<p>Merge with your current data (keeps newest of each item), or replace everything?</p>'; }, actions: [{ label: 'Cancel', value: null }, { label: 'Replace all', value: 'replace' }, { label: 'Merge', kind: 'primary', value: 'merge' }] });
          if (!merge) return;
          const res = importAll(data, { merge: merge === 'merge' });
          toast(`Imported ${res.foods} foods, ${res.recipes} recipes, ${res.arsenal} packets, ${res.plans} plans`, 'good');
          draw();
        } catch (e) { toast(`Import failed: ${e.message}`, 'bad'); }
      };
      input.click();
    };
    list();
  };

  const list = () => {
    const box = $('[data-list]', root);
    const term = st.q.trim().toLowerCase();
    if (st.tab === 'foods') {
      const items = foods.all().filter((f) => !term || `${f.name} ${f.brand}`.toLowerCase().includes(term));
      box.innerHTML = items.length ? items.map((f) => `<div class="list-item" data-id="${f.id}"><div class="grow"><div class="t1">${esc(f.name)}${f.brand ? ` <span class="muted small">· ${esc(f.brand)}</span>` : ''}</div><div class="t2">${esc(foodShortFacts(normalizeFood(f)))}</div></div><span class="muted">›</span></div>`).join('')
        : '<div class="empty">No foods saved yet. Scan a label or add one manually.</div>';
      $$('[data-id]', box).forEach((el) => (el.onclick = () => showFood(el.dataset.id)));
    } else {
      const items = recipes.all().filter((r) => !term || r.name.toLowerCase().includes(term));
      box.innerHTML = items.length ? items.map((r) => `<div class="list-item" data-rid="${r.id}"><div class="grow"><div class="t1">${esc(r.name)}</div><div class="t2">${r.state.ings.slice(0, r.state.count).map((i) => esc(i.food?.name || '?')).join(' + ')}${r.state.ratioOn ? ' · ratio' : ''}</div></div><button class="btn small" data-open="${r.id}">Open</button><button class="btn small ghost danger" data-rdel="${r.id}">✕</button></div>`).join('')
        : '<div class="empty">No recipes yet. Build one in the Mixer and press Save.</div>';
      $$('[data-open]', box).forEach((b) => (b.onclick = (e) => {
        e.stopPropagation();
        const r = recipes.get(b.dataset.open);
        const mixer = viewState('mixer', {});
        const s = mixer.get();
        Object.keys(s).forEach((k) => delete s[k]);
        Object.assign(s, JSON.parse(JSON.stringify(r.state)));
        mixer.save();
        location.hash = '#/mixer';
      }));
      $$('[data-rdel]', box).forEach((b) => (b.onclick = async (e) => {
        e.stopPropagation();
        if (await confirmBox('Delete this recipe?', { ok: 'Delete', danger: true })) { recipes.remove(b.dataset.rdel); draw(); }
      }));
    }
  };

  async function showFood(id) {
    const f = normalizeFood(foods.get(id));
    const cols = [{ head: `Per ${fmt(f.basis, f.basisUnit)}`, values: f.n }];
    if (f.servingSize && f.servingSize !== f.basis) cols.push({ head: `Per serving ${fmt(f.servingSize, f.basisUnit)}`, values: scaleFood(f, f.servingSize) });
    const act = await modal({
      title: f.name,
      render: (b) => { b.innerHTML = `${renderLabel({ title: 'Nutrition Facts', subtitle: [f.brand, foodSubtitle(f)].filter(Boolean).join(' · '), columns: cols })}${f.notes ? `<p class="small muted">${esc(f.notes)}</p>` : ''}`; },
      actions: [
        { label: 'Delete', kind: 'danger', value: 'del' },
        { label: 'Duplicate', value: 'dup' },
        { label: 'Use in calculator', value: 'use' },
        { label: 'Edit', kind: 'primary', value: 'edit' },
      ],
    });
    if (act === 'edit') { if (await openFoodEditor(f)) draw(); }
    else if (act === 'dup') { foods.upsert({ ...f, id: null, name: `${f.name} (copy)` }); draw(); }
    else if (act === 'del') { if (await confirmBox(`Delete "${f.name}"?`, { ok: 'Delete', danger: true })) { foods.remove(id); draw(); } }
    else if (act === 'use') {
      const single = viewState('single', {});
      single.get().food = f; single.save();
      location.hash = '#/single';
    }
  }
  draw();
}
