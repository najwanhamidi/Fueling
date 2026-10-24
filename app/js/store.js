// Local persistence (localStorage) with simple collections + export/import.
const PREFIX = 'fueling.v1.';
const listeners = new Set();

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function load(key, def) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return clone(def);
    return JSON.parse(raw);
  } catch {
    return clone(def);
  }
}
export function save(key, val) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); }
  catch (e) { console.warn('save failed', e); }
  listeners.forEach((fn) => { try { fn(key); } catch {} });
}
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function collection(name, seed = []) {
  return {
    name,
    all() { return load(name, seed); },
    get(id) { return this.all().find((x) => x.id === id) || null; },
    upsert(item) {
      const list = this.all();
      const now = new Date().toISOString();
      if (!item.id) item.id = uid();
      const i = list.findIndex((x) => x.id === item.id);
      const rec = { ...clone(item), updated: now };
      if (i >= 0) list[i] = { ...list[i], ...rec };
      else list.unshift({ created: now, ...rec });
      save(name, list);
      return rec;
    },
    remove(id) { save(name, this.all().filter((x) => x.id !== id)); },
    replaceAll(list) { save(name, list); },
  };
}

export const DEFAULT_ARSENAL = [
  { id: 'gel22', name: 'Standard gel', kind: 'gel', carbs: 22, sodium: 60, caffeine: 0, fluid: 0, qty: 6 },
  { id: 'gel40', name: 'Dual-carb gel (high carb)', kind: 'gel', carbs: 40, sodium: 50, caffeine: 0, fluid: 0, qty: 4 },
  { id: 'gelcaf', name: 'Caffeine gel', kind: 'gel', carbs: 25, sodium: 50, caffeine: 75, fluid: 0, qty: 2 },
  { id: 'drink500', name: 'Sports drink 500 ml', kind: 'drink', carbs: 30, sodium: 250, caffeine: 0, fluid: 500, qty: 2 },
];

export const foods = collection('foods');
export const recipes = collection('recipes');
export const arsenal = collection('arsenal', DEFAULT_ARSENAL);
export const plans = collection('plans');

export const settings = {
  defaults: {
    theme: 'auto',
    ocrMode: 'thorough', // fast | thorough | max
    aiProvider: 'none', // none | anthropic | openai | gemini
    aiKey: '',
    aiModel: '',
    aiAlways: false,
    massKg: 65,
    sex: 'm',
  },
  get() { return { ...this.defaults, ...load('settings', {}) }; },
  set(patch) { save('settings', { ...this.get(), ...patch }); },
};

// UI state persistence per view (so tabs keep their inputs).
export function viewState(name, def) {
  const st = load('view.' + name, def);
  return {
    // re-read on every get() so changes made by other views (e.g. Library → "Use") are picked up
    get: () => {
      const fresh = load('view.' + name, def);
      Object.keys(st).forEach((k) => delete st[k]);
      Object.assign(st, { ...clone(def), ...fresh });
      return st;
    },
    save: () => save('view.' + name, st),
    reset: () => { Object.keys(st).forEach((k) => delete st[k]); Object.assign(st, clone(def)); save('view.' + name, st); },
  };
}

export function exportAll() {
  const s = settings.get();
  delete s.aiKey; // never export secrets
  return {
    app: 'fueling', version: 1, exported: new Date().toISOString(),
    foods: foods.all(), recipes: recipes.all(), arsenal: arsenal.all(), plans: plans.all(), settings: s,
  };
}

export function importAll(data, { merge = true } = {}) {
  if (!data || data.app !== 'fueling') throw new Error('Not a Fueling backup file');
  const out = {};
  for (const name of ['foods', 'recipes', 'arsenal', 'plans']) {
    const col = { foods, recipes, arsenal, plans }[name];
    const incoming = Array.isArray(data[name]) ? data[name] : [];
    if (!merge) { col.replaceAll(incoming); out[name] = incoming.length; continue; }
    const cur = col.all();
    const map = new Map(cur.map((x) => [x.id, x]));
    for (const it of incoming) {
      const ex = map.get(it.id);
      if (!ex || (it.updated || '') > (ex.updated || '')) map.set(it.id, it);
    }
    col.replaceAll([...map.values()]);
    out[name] = incoming.length;
  }
  if (data.settings) { const { aiKey, ...rest } = data.settings; settings.set(rest); }
  return out;
}
