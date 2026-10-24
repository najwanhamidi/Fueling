// Nutrition-label parser. Pure JS (no DOM) so it can be unit-tested in Node.
//
// Input: OCR output with geometry ({lines:[{text,bbox,words:[{text,bbox,confidence}]}], width, height})
//        or plain text (string).
// Output: { columns:[{type, amount, unit, values, conf, derived}], servingSize, servingUnit, ... }
//
// Robustness strategy:
//  1. Re-assemble table rows from OCR lines using geometry (labels and values that OCR split apart).
//  2. Fuzzy, multilingual keyword matching (EN / MS / ID / FR / DE / ES / IT / NL) tolerant of OCR typos.
//  3. Numeric repair of OCR confusions (O→0, l→1, S→5, "g" read as "9", missing decimal points...).
//  4. Column detection from x-positions + header text ("per 100 g", "per serving", "%DV").
//  5. Each reading produces several candidate values; the final choice maximises agreement between
//     passes and physical consistency (Atwater energy check, sugars ≤ carbs, per-serving = per-100 × size/100...).

/* ------------------------------------------------------------------ */
/* Dictionaries                                                        */
/* ------------------------------------------------------------------ */
const SYN = {
  energyKcal: ['energy', 'energi', 'energie', 'tenaga', 'calories', 'calorie', 'kalori', 'energy value', 'brennwert',
    'valor energetico', 'valore energetico', 'energia', 'energiewaarde', 'total calories', 'energi total', 'jumlah tenaga', 'nilai tenaga'],
  fat: ['total fat', 'fat', 'fats', 'lemak', 'jumlah lemak', 'lemak total', 'total lipid', 'lipid', 'lipids', 'matieres grasses',
    'fett', 'grasas', 'grassi', 'vet', 'vetten', 'grasa', 'lipidos', 'graisses', 'fat total', 'total fats'],
  satFat: ['saturated fat', 'saturated', 'saturates', 'sat fat', 'of which saturates', 'lemak tepu', 'asid lemak tepu', 'lemak jenuh',
    'acides gras satures', 'gesattigte fettsauren', 'davon gesattigte fettsauren', 'saturadas', 'grasas saturadas', 'acidi grassi saturi',
    'verzadigde vetzuren', 'saturated fatty acids', 'of which saturated', 'lemak tepu total'],
  transFat: ['trans fat', 'lemak trans', 'trans fatty acids', 'asid lemak trans', 'grasas trans', 'trans fats'],
  _ignore: ['monounsaturated fat', 'monounsaturates', 'polyunsaturated fat', 'polyunsaturates', 'unsaturated fat', 'lemak tak tepu',
    'mono unsaturates', 'poly unsaturates', 'lemak mono tak tepu', 'lemak poli tak tepu', 'lemak tak tepu mono', 'lemak tak tepu poli',
    'monounsaturated', 'polyunsaturated', 'calories from fat', 'energy from fat', 'fat calories', 'sugar alcohol', 'sugar alcohols',
    'polyols', 'poliol', 'starch', 'kanji', 'servings per container', 'serving per container', 'bilangan hidangan', 'bilangan sajian',
    'omega', 'nutrition facts', 'supplement facts', 'lactose', 'laktosa', 'erythritol', 'maltodextrin', 'glucose syrup'],
  cholesterol: ['cholesterol', 'kolesterol', 'colesterol', 'colesterolo'],
  carbs: ['total carbohydrate', 'total carbohydrates', 'carbohydrate', 'carbohydrates', 'carbs', 'carb', 'total carb', 'total carbs',
    'karbohidrat', 'jumlah karbohidrat', 'karbohidrat total', 'glucides', 'kohlenhydrate', 'hidratos de carbono', 'carbohidratos',
    'carboidrati', 'koolhydraten', 'available carbohydrate', 'carbohydrate total', 'total karbohidrat'],
  sugars: ['sugars', 'sugar', 'total sugars', 'total sugar', 'of which sugars', 'gula', 'jumlah gula', 'sucres', 'dont sucres', 'zucker',
    'davon zucker', 'azucares', 'zuccheri', 'suikers', 'gula total', 'total gula'],
  addedSugars: ['added sugars', 'added sugar', 'incl added sugars', 'includes added sugars', 'gula tambahan', 'includes added sugar'],
  fiber: ['dietary fiber', 'dietary fibre', 'fibre', 'fiber', 'fibres', 'fibers', 'serat', 'serat diet', 'serabut', 'serabut diet', 'serat pangan',
    'ballaststoffe', 'fibra', 'fibra alimentaria', 'fibre alimentaire', 'fibres alimentaires', 'vezels', 'voedingsvezel', 'total dietary fibre'],
  protein: ['protein', 'proteins', 'proteines', 'eiweiss', 'proteinas', 'proteine', 'eiwitten', 'protein total', 'protien'],
  sodium: ['sodium', 'natrium', 'sodio', 'sodium na'],
  salt: ['salt', 'garam', 'sel', 'salz', 'sal', 'sale', 'zout'],
  potassium: ['potassium', 'kalium', 'potasio', 'potassio'],
  caffeine: ['caffeine', 'kafein', 'koffein', 'cafeina', 'caffeina', 'cafeine'],
};

const UNIT_OF = {
  energyKcal: 'kcal', fat: 'g', satFat: 'g', transFat: 'g', cholesterol: 'mg', carbs: 'g', sugars: 'g', addedSugars: 'g',
  fiber: 'g', protein: 'g', sodium: 'mg', salt: 'g', potassium: 'mg', caffeine: 'mg',
};
// Upper bounds per 100 g (or ml) — physically impossible above these.
const MAX_PER100 = {
  energyKcal: 950, fat: 100, satFat: 100, transFat: 100, cholesterol: 3000, carbs: 100, sugars: 100, addedSugars: 100,
  fiber: 100, protein: 100, sodium: 40000, salt: 100, potassium: 20000, caffeine: 5000,
};
export const OUT_KEYS = ['energyKcal', 'fat', 'satFat', 'transFat', 'cholesterol', 'carbs', 'sugars', 'addedSugars', 'fiber', 'protein', 'sodium', 'potassium', 'caffeine'];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
const alpha = (s) => norm(s).replace(/[^a-z]/g, '');

const SYN_LIST = [];
for (const [key, list] of Object.entries(SYN)) {
  for (const phrase of list) {
    const parts = norm(phrase).split(/\s+/).map((p) => p.replace(/[^a-z]/g, '')).filter(Boolean);
    SYN_LIST.push({ key, parts, joined: parts.join(''), phrase });
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
function simThreshold(len) {
  if (len <= 3) return 1;
  if (len === 4) return 0.75; // one OCR slip in a 4-letter word ("Sat" for "Salt")
  if (len <= 6) return 0.83;
  if (len <= 10) return 0.78;
  return 0.74;
}
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mode = (arr) => {
  const c = new Map();
  for (const x of arr) c.set(x, (c.get(x) || 0) + 1);
  let best = null, bc = 0;
  for (const [k, v] of c) if (v > bc || (v === bc && k > best)) { best = k; bc = v; }
  return best;
};

/** Repair common OCR confusions inside numeric tokens. */
export function fixNumericToken(t) {
  // "1529k)" / "1529kl" / "612k]" → kJ (must run before trailing punctuation is stripped)
  let s = String(t).replace(/(\d)\s*k[J\]j)|lI1!](?=$|[\s/,;])/g, '$1kJ').replace(/[,.;:)\]]+$/, '');
  // stray glyphs between number and unit: "25¢g", "12°g", "5'g"
  s = s.replace(/(\d)[¢©®°'`"’‘]+\s*(g|mg|kcal|kj)\b/gi, '$1$2');
  // zero written as letter O: "Og", "O.5g", "O mg"
  if (/^[Oo]([.,]\d+)?\s*(g|mg|kcal|kj|%)?$/i.test(s)) s = s.replace(/^[Oo]/, '0');
  // map confusable letters within sequences that already contain a digit
  s = s.replace(/[0-9OoIl|SBZ][0-9OoIl|SBZ.,]*/g, (seq) => {
    if (!/\d/.test(seq)) return seq;
    return seq.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
  });
  // unit confusions
  s = s.replace(/(\d)\s*q\b/gi, '$1g')
    .replace(/(\d)\s*(rng|rnq|mq|nng)\b/gi, '$1mg')
    .replace(/(\d)\s*(kkal|kkai|kka1|kcals|kca[l1I|]|kcai|kcol|kcat|keal|kcai|kcaI|kca1|kcaj|kcel)\b/gi, '$1kcal')
    .replace(/(\d)\s*k[J\]j)]\b/g, '$1kJ')
    .replace(/(\d)\s*(gm|grams?)\b/gi, '$1g');
  return s;
}

/** Parse "1,580" / "12,5" / "12.5" → number list of interpretations (first = most likely). */
export function parseNumberAlts(str, unit) {
  const s = str.trim();
  if (/^0\d+$/.test(s)) return [parseFloat('0.' + s.slice(1)), parseInt(s, 10)];
  if (/^\d+$/.test(s)) return [parseInt(s, 10)];
  if (/^\d+\.\d+$/.test(s)) return [parseFloat(s)];
  if (/^\d+,\d+$/.test(s)) {
    const dec = parseFloat(s.replace(',', '.'));
    const thou = parseFloat(s.replace(',', ''));
    if (/^\d{1,3},\d{3}$/.test(s) && (unit === 'kj' || unit === 'kcal' || unit === 'mg' || thou >= 1000)) return [thou, dec];
    return [dec, thou];
  }
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return [parseFloat(s.replace(/,/g, ''))];
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return [parseFloat(s.replace(/\./g, '').replace(',', '.'))];
  const f = parseFloat(s.replace(',', '.'));
  return Number.isFinite(f) ? [f] : [];
}

const UNIT_RE = '(kcal|kj|cal|mg|mcg|µg|ug|g|ml|%)';
const VALUE_RE = new RegExp(`(<|≤|<=|less\\s*than)?\\s*(\\d+(?:[.,]\\d+)*)\\s*${UNIT_RE}?(?![a-z])`, 'gi');
const UNIT_ONLY = /^\(?(kcal|kkal|kj|cal|mg|mcg|µg|ug|g|ml|%)\)?[.,:;]?$/i;
const TRACE = /^(trace|tr|nil|surih|kesan|traces|spuren)$/i;

/* ------------------------------------------------------------------ */
/* Input normalisation & row building                                  */
/* ------------------------------------------------------------------ */
function normalizeInput(input) {
  if (typeof input === 'string') {
    const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return {
      geometry: false, width: 1000, height: lines.length * 30,
      lines: lines.map((text, i) => {
        const words = [];
        let off = 0;
        for (const w of text.split(/\s+/)) {
          const idx = text.indexOf(w, off);
          words.push({ text: w, bbox: { x0: idx * 10, x1: (idx + w.length) * 10, y0: i * 30, y1: i * 30 + 20 }, confidence: 85 });
          off = idx + w.length;
        }
        return { text, words, bbox: { x0: 0, x1: text.length * 10, y0: i * 30, y1: i * 30 + 20 } };
      }),
    };
  }
  const lines = (input.lines || []).filter((l) => l && l.words && l.words.length)
    .map((l) => ({ ...l, words: l.words.filter((w) => w.text && w.text.trim()) }))
    .filter((l) => l.words.length);
  for (const l of lines) {
    if (!l.bbox) {
      l.bbox = {
        x0: Math.min(...l.words.map((w) => w.bbox.x0)), x1: Math.max(...l.words.map((w) => w.bbox.x1)),
        y0: Math.min(...l.words.map((w) => w.bbox.y0)), y1: Math.max(...l.words.map((w) => w.bbox.y1)),
      };
    }
  }
  return { geometry: input.geometry !== false, width: input.width || 1000, height: input.height || 1000, lines };
}

/** Merge OCR lines that sit on the same visual row (labels and values often split). */
function buildRows(lines, geometry) {
  const rows = lines.map((l) => ({ words: [...l.words], y0: l.bbox.y0, y1: l.bbox.y1, x0: l.bbox.x0, x1: l.bbox.x1 }));
  if (!geometry) return rows;
  rows.sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const out = [];
  for (const r of rows) {
    let merged = false;
    for (let k = out.length - 1; k >= Math.max(0, out.length - 4); k--) {
      const o = out[k];
      const ov = Math.min(o.y1, r.y1) - Math.max(o.y0, r.y0);
      const hmin = Math.min(o.y1 - o.y0, r.y1 - r.y0);
      const xov = Math.min(o.x1, r.x1) - Math.max(o.x0, r.x0);
      if (ov > 0.5 * hmin && xov < 0.2 * Math.min(o.x1 - o.x0, r.x1 - r.x0)) {
        o.words.push(...r.words);
        o.y0 = Math.min(o.y0, r.y0); o.y1 = Math.max(o.y1, r.y1);
        o.x0 = Math.min(o.x0, r.x0); o.x1 = Math.max(o.x1, r.x1);
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ ...r });
  }
  for (const r of out) r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
  return out;
}

/* ------------------------------------------------------------------ */
/* Keyword matching                                                    */
/* ------------------------------------------------------------------ */
function matchKeywords(words) {
  const toks = words.map((w) => (/\d/.test(w.text) ? null : alpha(w.text)));
  const found = [];
  for (let i = 0; i < toks.length; i++) {
    if (!toks[i]) continue;
    for (const syn of SYN_LIST) {
      const np = syn.parts.length;
      for (let w = Math.max(1, np - 1); w <= np + 1; w++) {
        if (i + w > toks.length) break;
        let ok = true, cand = '';
        for (let q = i; q < i + w; q++) { if (toks[q] == null) { ok = false; break; } cand += toks[q]; }
        if (!ok || !cand) continue;
        const L = syn.joined.length;
        if (Math.abs(cand.length - L) > Math.max(1, Math.round(L * 0.25))) continue;
        let sim = cand === syn.joined ? 1 : 1 - lev(cand, syn.joined) / Math.max(cand.length, L);
        // short words: only a substitution or a dropped letter, never an extra one ("facts" ≠ "fats")
        if (L <= 4 && sim < 1 && cand.length > L) sim = 0;
        // one junk glyph glued to the word: "BFat", "Fat|", "iProtein"
        if (sim < 1 && w === np && cand.length === L + 1 && L >= 3 && (cand.endsWith(syn.joined) || cand.startsWith(syn.joined))
          && !(L <= 4 && /s$/.test(cand) && cand.startsWith(syn.joined))) { found.push({ key: syn.key, i, j: i + w, sim: 0.9, len: L, phrase: syn.phrase }); continue; }
        if (sim >= simThreshold(L)) found.push({ key: syn.key, i, j: i + w, sim, len: L, phrase: syn.phrase });
      }
    }
  }
  found.sort((a, b) => b.sim ** 6 * b.len - a.sim ** 6 * a.len || b.len - a.len);
  const used = new Array(toks.length).fill(false);
  const picked = [];
  for (const f of found) {
    let free = true;
    for (let q = f.i; q < f.j; q++) if (used[q]) { free = false; break; }
    if (!free) continue;
    for (let q = f.i; q < f.j; q++) used[q] = true;
    picked.push(f);
  }
  picked.sort((a, b) => a.i - b.i);
  // collapse bilingual duplicates ("Karbohidrat / Carbohydrate") that are adjacent
  const out = [];
  for (const p of picked) {
    const last = out[out.length - 1];
    if (last && last.key === p.key && p.i - last.j <= 2) { last.j = p.j; continue; }
    out.push({ ...p });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Value extraction                                                    */
/* ------------------------------------------------------------------ */
function extractValues(words) {
  const vals = [];
  for (let wi = 0; wi < words.length; wi++) {
    const w = words[wi];
    const raw = w.text;
    if (TRACE.test(raw.replace(/[^a-z]/gi, ''))) {
      vals.push({ v: 0, alts: [0], unit: null, lt: false, pct: false, x: (w.bbox.x0 + w.bbox.x1) / 2, conf: w.confidence ?? 80, raw, trace: true });
      continue;
    }
    if (UNIT_ONLY.test(raw.trim()) || /^[9q]$/.test(raw.trim())) {
      // unit as its own word → attach to previous unit-less value if adjacent
      const prev = vals[vals.length - 1];
      const u = raw.trim().replace(/[().,:;]/g, '').toLowerCase();
      if (prev && !prev.unit && prev.wi === wi - 1) {
        const gap = w.bbox.x0 - words[wi - 1].bbox.x1;
        const ch = (w.bbox.y1 - w.bbox.y0) || 20;
        if (u === '9' || u === 'q') { if (gap < ch * 0.9) { prev.unit = 'g'; prev.glyph9 = true; } else continue; }
        else prev.unit = u === 'µg' || u === 'ug' ? 'mcg' : u === 'kkal' ? 'kcal' : u;
        if (prev.unit === '%') prev.pct = true;
        continue;
      }
      if (u === '%' && prev) continue;
      if (u !== '9') continue;
    }
    const fixed = fixNumericToken(raw);
    VALUE_RE.lastIndex = 0;
    let m;
    let any = false;
    while ((m = VALUE_RE.exec(fixed))) {
      any = true;
      const unitRaw = (m[3] || '').toLowerCase();
      const unit = unitRaw === 'µg' || unitRaw === 'ug' ? 'mcg' : unitRaw || null;
      const alts = parseNumberAlts(m[2], unit);
      if (!alts.length) continue;
      vals.push({
        v: alts[0], alts, unit, lt: !!m[1], pct: unit === '%', numStr: m[2],
        x: (w.bbox.x0 + w.bbox.x1) / 2, conf: w.confidence ?? 80, raw, wi,
      });
    }
    if (!any && raw.trim() === '<') {
      // "<" separate from number
      const nx = words[wi + 1];
      if (nx) nx._lt = true;
    }
    if (w._lt && vals.length) vals[vals.length - 1].lt = true;
  }
  return vals;
}

/** Candidate numeric interpretations for a value token, with plausibility weights. */
function valueAlternatives(tok, decimalDoc = false, unitDoc = false, unitHint = null) {
  const out = [];
  const add = (v, w, note) => { if (Number.isFinite(v) && v >= 0 && !out.some((o) => Math.abs(o.v - v) < 1e-9)) out.push({ v, w, note }); };
  const s = tok.numStr || '';
  const intLostDec = decimalDoc && /^[1-9]\d{1,3}$/.test(s) && (tok.unit === 'g' || tok.unit == null);
  // On labels that print units, a unit-less decimal ending in 8/9 is probably "…g" misread ("0,25g" → "0,258").
  const gGlyph = unitDoc && !tok.unit && !unitHint && /^\d+[.,]\d*[89]$/.test(s) && s.replace(/\D/g, '').length >= 2;
  // "22g" → "229": integer + trailing 9 with no unit, on a label that prints units
  const gInt9 = unitDoc && !tok.unit && !unitHint && /^\d{1,3}9$/.test(s) && s.length >= 2;
  if (gInt9) add(parseInt(s.slice(0, -1), 10), 0.85, 'g→9');
  tok.alts.forEach((v, i) => add(v, i === 0 ? (gInt9 ? 0.5 : intLostDec ? 0.8 : gGlyph ? 0.7 : 1) : 0.55));
  if (gGlyph) { const t = s.slice(0, -1).replace(',', '.'); add(parseFloat(t.endsWith('.') ? t.slice(0, -1) : t), 0.75, 'g misread'); }
  if (s && !tok.unit && /^\d+[.,]\d*9$/.test(s) && s.replace(/\D/g, '').length >= 3) add(parseFloat(s.slice(0, -1).replace(',', '.')), 0.75, 'g→9');
  if (s && !tok.unit && /^\d{2,}9$/.test(s)) add(parseInt(s.slice(0, -1), 10), 0.5, 'g→9');
  if (s && tok.unit === 'g' && /^\d{2,}9$/.test(s)) add(parseInt(s.slice(0, -1), 10), 0.55, 'g→9g');
  if (s && tok.unit === 'g' && /^\d+[.,]\d*9$/.test(s) && s.replace(/\D/g, '').length >= 3) add(parseFloat(s.slice(0, -1).replace(',', '.')), 0.5, 'g→9g');
  if (/^[1-9]\d{1,3}$/.test(s)) { add(parseInt(s, 10) / 10, gInt9 ? 0.35 : intLostDec ? 0.65 : 0.45, 'decimal lost'); add(parseInt(s, 10) / 100, 0.3, 'decimal lost'); }
  if (/^\d+\.\d{2,}$/.test(s)) add(parseFloat(s.slice(0, -1)), 0.3, 'extra digit');
  return out;
}

/* ------------------------------------------------------------------ */
/* Header / serving detection                                          */
/* ------------------------------------------------------------------ */
const HDR_PER100 = /(?:\b(?:per|setiap|pour|pro|por|je|bagi|tiap|in|each)\b\s*)?\b100\s*(g|ml|gram|grams|gm|mi|m1)\b/i;
const HDR_SERV = /\b(per\s+serv(?:ing|e)?|serving|per\s+portion|portion|sajian|hidangan|porsi|takaran\s+saji|porcion|porzione|portie|per\s+(?:bar|gel|sachet|pack|packet|stick|piece|bottle|can|scoop|cup|tablet|pouch|bag)|1\s*(?:gel|bar|sachet|pack|serving|scoop|tablet|bottle|pouch|stick))\b/i;
const HDR_DV = /(%\s*(?:dv|daily|ri|nrv|ar|akg|gda|vrn|rda|vd|nilai)|daily\s*value|reference\s*intake|%\s*\*|\bri\s*\*|% ?of)/i;
const FOOTNOTE = /(kebutuhan\s*energi|persen\s*akg|berdasarkan\s*kebutuhan|tells\s*you\s*how\s*much|contributes\s*to\s*a\s*daily|daily\s*value\s*\(dv\)|percent\s*daily|based\s*on\s*a\s*2[,.]?000|nilai\s*rujukan|2[,.]?000\s*(?:calorie|kcal|cal)|2[,.]?500\s*(?:calorie|kcal|cal)|daily\s*values?\s*(?:are|may)|calories\s*per\s*gram|percent\s*daily\s*values|reference\s*intake\s*of\s*an\s*average|8400\s*kj)/i;

function rowText(words) { return words.map((w) => w.text).join(' '); }

function findPhraseX(words, re) {
  const txt = rowText(words);
  const m = re.exec(txt);
  if (!m) return null;
  // map char span → words
  let pos = 0;
  const hit = [];
  for (const w of words) {
    const s = pos, e = pos + w.text.length;
    if (e > m.index && s < m.index + m[0].length) hit.push(w);
    pos = e + 1;
  }
  if (!hit.length) return null;
  const x0 = Math.min(...hit.map((w) => w.bbox.x0));
  const x1 = Math.max(...hit.map((w) => w.bbox.x1));
  return { x: (x0 + x1) / 2, x0, x1, m, charIndex: m.index };
}

function detectServing(text) {
  // "(40g)" is often read as "(409)": a parenthesised amount always carries a unit
  const t = fixNumericToken(norm(text)).replace(/\s+/g, ' ').replace(/\((\d{1,4}(?:[.,]\d+)?)\s*[9q]\s*\)/g, '($1g)');
  let m;
  const res = { servingSize: null, servingUnit: null, netWeight: null, servingsPerPack: null, servingName: '' };
  const pats = [
    /(?:serving\s*size|serv\.?\s*size|saiz\s*(?:hidangan|sajian)|takaran\s*saji|portion\s*size|taille\s*de\s*la\s*portion|tamano\s*de\s*la\s*porcion|porzione)\s*[:\-]?\s*([^\d\n]{0,30}?)\(?\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\b/,
    /per\s*(?:serving|serve|portion|sajian|hidangan|porsi)\s*(?:of\s*)?\(?\s*(\D{0,0})(\d+(?:[.,]\d+)?)\s*(g|ml)\b/,
    /per\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\s*(serving|serve|sachet|gel|bar|pack|packet|portion|hidangan|sajian|pouch|scoop|bottle)/,
    /(?:per|setiap|1)\s*(gel|bar|sachet|pack|packet|pouch|scoop|stick|bottle|tablet|serving|hidangan|sajian)\s*\(?\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\s*\)?/,
  ];
  for (const re of pats) {
    if ((m = re.exec(t))) {
      let amount, unit, name = '';
      if (re === pats[2]) { amount = m[1]; unit = m[2]; name = m[3]; }
      else if (re === pats[3]) { name = m[1]; amount = m[2]; unit = m[3]; }
      else { name = (m[1] || '').trim(); amount = m[2]; unit = m[3]; }
      const v = parseFloat(String(amount).replace(',', '.'));
      if (v > 0 && v !== 100 && v < 2000) { res.servingSize = v; res.servingUnit = unit; res.servingName = name.replace(/[^a-z0-9 ]/g, ' ').replace(/\b(serving|servings|size|saiz|hidangan|sajian|takaran|saji|portion|per|setiap)\b/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30); break; }
      if (v === 100 && re === pats[0]) { res.servingSize = v; res.servingUnit = unit; break; }
    }
  }
  if ((m = /(?:net\s*w(?:eigh)?t\.?|net\s*(?:content|contents|qty|quantity)|berat\s*bersih|kandungan\s*bersih|isi\s*bersih|poids\s*net|peso\s*neto|inhalt|netto)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(g|ml|kg|l)\b/.exec(t))) {
    let v = parseFloat(m[1].replace(',', '.'));
    if (m[2] === 'kg' || m[2] === 'l') v *= 1000;
    res.netWeight = v;
  }
  if ((m = /(\d+(?:[.,]\d+)?)\s*servings?\s*per\s*(?:container|pack|package|box|bottle)|servings?\s*per\s*(?:container|pack|package|box|bottle)\s*[:\-]?\s*(?:about\s*)?(\d+(?:[.,]\d+)?)|bilangan\s*(?:hidangan|sajian)[^\d]{0,40}(\d+(?:[.,]\d+)?)|sajian\s*per\s*(?:bekas|kemasan)[^\d]{0,20}(\d+)/.exec(t))) {
    res.servingsPerPack = parseFloat((m[1] || m[2] || m[3] || m[4]).replace(',', '.'));
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* Main parse                                                          */
/* ------------------------------------------------------------------ */
export function parseOcr(input) {
  const data = normalizeInput(input);
  const { geometry } = data;
  const rows = buildRows(data.lines, geometry);
  const fullText = rows.map((r) => rowText(r.words)).join('\n');
  const serving = detectServing(fullText);
  const hgts = rows.flatMap((r) => r.words.map((w) => w.bbox.y1 - w.bbox.y0)).filter((h) => h > 0);
  const charH = median(hgts) || 20;

  // --- headers ---
  const headers = []; // {type, x, unit, rowIdx}
  rows.forEach((r, ri) => {
    const txt = rowText(r.words);
    const kws = matchKeywords(r.words).filter((k) => k.key !== '_ignore');
    if (kws.length > 1) return; // nutrient rows are not header rows
    if (FOOTNOTE.test(txt) || r.words.length > 14) return; // sentences / footnotes are not headers
    const p = findPhraseX(r.words, HDR_PER100);
    if (p && !/serving\s*size|saiz/i.test(txt.slice(0, p.charIndex))) headers.push({ type: 'per100', x: p.x, unit: /ml|mi|m1/i.test(p.m[1]) ? 'ml' : 'g', rowIdx: ri, ci: p.charIndex });
    const s = findPhraseX(r.words, HDR_SERV);
    if (s && !/servings?\s*per|serving\s*size|size/i.test(txt)) headers.push({ type: 'serving', x: s.x, rowIdx: ri, ci: s.charIndex });
    const d = findPhraseX(r.words, HDR_DV);
    if (d && !FOOTNOTE.test(txt)) headers.push({ type: 'dv', x: d.x, rowIdx: ri, ci: d.charIndex });
  });
  const per100Unit = headers.find((h) => h.type === 'per100')?.unit || (/\b100\s*(ml|mℓ)\b/i.test(fullText) ? 'ml' : 'g');

  // --- nutrient rows ---
  const items = []; // {key, vals:[...], unitHint, rowIdx, label}
  let footnote = false;
  let pending = null; // keyword with no values waiting for next row
  let transposed = null; // header row of nutrient names with no values
  rows.forEach((r, ri) => {
    const txt = rowText(r.words);
    if (FOOTNOTE.test(txt)) { footnote = true; }
    if (footnote) return;
    const kws = matchKeywords(r.words);
    const allVals = extractValues(r.words);
    if (!kws.length) {
      // continuation rows
      if (transposed && geometry && allVals.length) {
        let type = null;
        if (HDR_PER100.test(txt)) type = 'per100'; else if (HDR_SERV.test(txt)) type = 'serving';
        for (const v of allVals) {
          if (v.pct) continue;
          let best = null, bd = Infinity;
          for (const k of transposed) { const d = Math.abs(k.x - v.x); if (d < bd) { bd = d; best = k; } }
          if (best && bd < Math.max(charH * 6, 0.12 * data.width)) items.push({ key: best.key, vals: [{ ...v, x: v.x }], unitHint: null, rowIdx: ri, forcedType: type, tcol: true });
        }
        return;
      }
      const kcalOnly = allVals.length && allVals.every((v) => v.unit === 'kcal' || v.unit === 'kj');
      const unitWord = r.words[0] && /^(kcal|kj)$/i.test(r.words[0].text.replace(/[^a-z]/gi, ''));
      if (kcalOnly || unitWord) {
        const unitHint = unitWord ? r.words[0].text.replace(/[^a-z]/gi, '').toLowerCase() : null;
        items.push({ key: 'energyKcal', vals: allVals, unitHint, rowIdx: ri });
        pending = null;
        return;
      }
      if (pending && allVals.length) {
        items.push({ key: pending.key, vals: allVals, unitHint: pending.unitHint, rowIdx: ri });
        pending = null;
      }
      return;
    }
    // transposed header: 3+ nutrient names, no numbers
    const realKws = kws.filter((k) => k.key !== '_ignore');
    if (realKws.length >= 3 && allVals.filter((v) => !v.pct).length === 0 && geometry) {
      transposed = realKws.map((k) => {
        const ws = r.words.slice(k.i, k.j);
        return { key: k.key, x: (Math.min(...ws.map((w) => w.bbox.x0)) + Math.max(...ws.map((w) => w.bbox.x1))) / 2 };
      });
      return;
    }
    transposed = null;
    const realCount = kws.filter((k) => k.key !== '_ignore').length;
    // Values that precede the first keyword on this row: they belong to a keyword left "pending"
    // on the previous line (paragraph labels: "... Energy" ⏎ "1615kJ / 380kcal, Fat 0g ...").
    const firstKw = kws[0];
    const leadWords = r.words.slice(0, firstKw.i);
    const leadVals = leadWords.length ? extractValues(leadWords).filter((v) => !(v.unit == null && v.v === 0 && /^\(/.test(v.raw))) : [];
    let leadUsed = false;
    if (pending && leadVals.length) {
      items.push({ key: pending.key, vals: leadVals, unitHint: pending.unitHint, rowIdx: ri, inline: true });
      leadUsed = true;
    }
    pending = null;
    for (let q = 0; q < kws.length; q++) {
      const k = kws[q];
      const segEnd = q + 1 < kws.length ? kws[q + 1].i : r.words.length;
      const segWords = r.words.slice(k.j, segEnd);
      if (k.key === '_ignore') continue;
      // unit hints in label area, e.g. "Energy (kcal)", "Sodium, mg"
      let unitHint = null;
      const labelZone = r.words.slice(k.i, Math.min(segEnd, k.j + 2)).map((w) => w.text).join(' ');
      const uh = /\(\s*(kcal|kj|g|mg|mcg|µg)\s*\)|[,/]\s*(kcal|kj|mg|g)\b/i.exec(labelZone);
      if (uh) unitHint = (uh[1] || uh[2]).toLowerCase();
      let vals = extractValues(segWords);
      // drop values that are actually part of label text like "Omega 3" (handled by ignore) or "(g)" hints
      vals = vals.filter((v) => !(v.unit == null && v.v === 0 && /^\(/.test(v.raw)));
      // value written before the name: "Includes 10g Added Sugars"
      if (!vals.filter((v) => !v.pct).length && q === 0 && !leadUsed && leadVals.some((v) => !v.pct)) {
        vals = [...leadVals.filter((v) => !v.pct), ...vals];
        leadUsed = true;
      }
      if (!vals.length) {
        // "Energy kJ / kcal" style label where the unit word itself is in the label
        if (k.key === 'energyKcal' || q === kws.length - 1) pending = { key: k.key, unitHint };
        continue;
      }
      items.push({ key: k.key, vals, unitHint, rowIdx: ri, label: k.phrase, inline: realCount >= 2 });
    }
  });

  // --- columns ---
  const isG = (key) => UNIT_OF[key] === 'g';
  const colTokens = items.filter((it) => it.key !== 'energyKcal' && !it.tcol).flatMap((it) => it.vals.filter((v) => !v.pct));
  let columns = []; // {x, type, support}
  if (geometry && colTokens.length) {
    const xs = colTokens.map((v) => v.x).sort((a, b) => a - b);
    const gapT = Math.max(charH * 2.6, data.width * 0.045);
    let cur = [xs[0]];
    const clusters = [];
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] - xs[i - 1] > gapT) { clusters.push(cur); cur = []; }
      cur.push(xs[i]);
    }
    clusters.push(cur);
    const maxSup = Math.max(...clusters.map((c) => c.length));
    columns = clusters.filter((c) => c.length >= Math.max(2, 0.3 * maxSup) || clusters.length === 1).map((c) => ({ x: median(c), support: c.length }));
    if (!columns.length) columns = [{ x: median(xs), support: xs.length }];
  } else {
    const counts = items.filter((it) => it.key !== 'energyKcal').map((it) => it.vals.filter((v) => !v.pct).length).filter((n) => n > 0);
    const K = Math.max(1, Math.min(4, mode(counts) || 1));
    columns = Array.from({ length: K }, (_, i) => ({ x: i, support: 0 }));
  }

  const assignCol = (v, idx) => {
    if (!geometry) return Math.min(idx, columns.length - 1);
    if (columns.length === 1) return 0;
    let best = 0, bd = Infinity;
    columns.forEach((c, i) => { const d = Math.abs(c.x - v.x); if (d < bd) { bd = d; best = i; } });
    return bd < Math.max(charH * 7, data.width * 0.15) ? best : -1;
  };

  // Does this label print decimals (e.g. "0,5 g", "40,0 g")? Then bare 2–4 digit numbers may have lost their separator.
  const gramToks = items.filter((it) => it.key !== 'energyKcal').flatMap((it) => it.vals.filter((v) => !v.pct && v.unit !== 'mg' && v.numStr && v.v > 0));
  const unitDoc = gramToks.length >= 3 && gramToks.filter((v) => v.unit).length / gramToks.length >= 0.6;
  const decimalDoc = gramToks.length >= 3 && gramToks.filter((v) => /[.,]/.test(v.numStr) || /^0\d/.test(v.numStr)).length / gramToks.length >= 0.35;

  // per column: candidate lists
  const colData = columns.map(() => ({ cands: {}, units: [], pctCount: 0, count: 0 }));
  const addCand = (ci, key, tok, unitHint, weightMul = 1) => {
    const cd = typeof ci === 'object' ? ci : colData[ci];
    if (!cd) return;
    cd.units ||= []; cd.count ||= 0;
    let unit = tok.unit || unitHint || null;
    const list = (cd.cands[key] ||= []);
    for (const alt of valueAlternatives(tok, decimalDoc, unitDoc, unitHint)) {
      let v = alt.v;
      let w = alt.w * (0.5 + (tok.conf ?? 80) / 200) * weightMul;
      if (tok.lt) { v = v <= 1 ? 0 : v / 2; w *= 0.9; }
      // unit conversions to canonical units
      if (key === 'energyKcal') {
        if (unit === 'kj') v = v / 4.184;
        else if (unit && unit !== 'kcal' && unit !== 'cal') w *= 0.4;
      } else if (UNIT_OF[key] === 'mg') {
        if (unit === 'g') v *= 1000;
        else if (unit === 'mcg') v /= 1000;
        else if (!unit && v < 3 && !Number.isInteger(v)) { list.push({ v: v * 1000, w: w * 0.8, raw: tok.raw }); w *= 0.4; }
      } else if (UNIT_OF[key] === 'g') {
        if (unit === 'mg') v /= 1000;
        else if (unit === 'mcg') v /= 1e6;
        else if (unit === 'kcal' || unit === 'kj') w *= 0.2;
      }
      list.push({ v, w, raw: tok.raw, note: alt.note });
    }
    cd.count++;
    if (tok.unit) cd.units.push(tok.unit);
  };

  for (const it of items) {
    const nonPct = it.vals.filter((v) => !v.pct);
    if (it.tcol) continue; // transposed tables handled after columns exist
    if (it.key === 'energyKcal') {
      const kcal = nonPct.filter((v) => v.unit === 'kcal' || v.unit === 'cal');
      const kj = nonPct.filter((v) => v.unit === 'kj');
      let use;
      if (kcal.length) use = kcal;
      else if (kj.length) use = kj;
      else use = nonPct.map((v) => ({ ...v, unit: it.unitHint === 'kj' ? 'kj' : 'kcal' }));
      if (!geometry) {
        use.forEach((v, i) => addCand(Math.min(i, columns.length - 1), 'energyKcal', v, null));
      } else {
        use.forEach((v) => addCand(assignCol(v, 0), 'energyKcal', v, null, it.tcol ? 0.9 : 1));
      }
      continue;
    }
    if (!geometry) {
      nonPct.forEach((v, i) => addCand(Math.min(i, columns.length - 1), it.key, v, it.unitHint));
    } else if (it.inline && columns.length > 1) {
      // paragraph-style: the value right after the name; nearest column for type only
      const v = nonPct[0];
      if (v) { let ci = assignCol(v, 0); if (ci < 0) ci = 0; addCand(ci, it.key, v, it.unitHint, 0.9); }
    } else if (nonPct.length === columns.length && columns.length > 1) {
      // as many values as columns → map in reading order (robust to perspective / skew)
      [...nonPct].sort((a, b) => a.x - b.x).forEach((v, i) => addCand(i, it.key, v, it.unitHint));
    } else {
      const seen = new Set();
      for (const v of nonPct) {
        const ci = assignCol(v, 0);
        if (seen.has(ci)) continue; // first value per column wins
        seen.add(ci);
        addCand(ci, it.key, v, it.unitHint);
      }
    }
    it.vals.filter((v) => v.pct).forEach((v) => {
      // percentages only count toward a column they actually sit in
      let ci = -1, bd = Infinity;
      columns.forEach((c, i) => { const d = Math.abs(c.x - v.x); if (d < bd) { bd = d; ci = i; } });
      if (ci >= 0 && bd < Math.max(charH * 3, data.width * 0.05) && colData[ci]) colData[ci].pctCount++;
    });
  }

  // --- column types ---
  const cols = columns.map((c, i) => ({ ...c, type: null, ...colData[i] }));
  // DV column: mostly percent or unitless where other columns carry units
  const unitCols = cols.filter((c) => c.units.length >= 2);
  for (const c of cols) {
    if (c.pctCount > c.count) c.type = 'dv';
    else if (unitCols.length && !unitCols.includes(c) && c.units.length === 0 && cols.length > 1) c.type = 'dv';
  }
  // headers by x
  if (geometry) {
    const hs = headers;
    for (const c of cols) {
      if (c.type) continue;
      let best, bd;
      // a column of numbers with g/mg units is never a %DV column, whatever header sits nearby
      const unitful = c.units.filter((u) => u !== '%').length >= Math.max(2, c.count * 0.5);
      const pool = unitful ? hs.filter((h) => h.type !== 'dv') : hs;
      best = null; bd = Infinity;
      for (const h of pool) { const d = Math.abs(h.x - c.x); if (d < bd) { bd = d; best = h; } }
      if (best && bd < Math.max(charH * 8, data.width * 0.2)) c.type = best.type;
    }
  } else {
    // textual order of headers
    const ordered = headers.filter((h) => h.type !== 'dv').sort((a, b) => a.rowIdx - b.rowIdx || a.ci - b.ci);
    const uniq = [];
    for (const h of ordered) if (!uniq.includes(h.type)) uniq.push(h.type);
    cols.filter((c) => !c.type).forEach((c, i) => { c.type = uniq[i] || null; });
  }
  // de-duplicate types (two columns both claiming the same header)
  const valCols = cols.filter((c) => c.type !== 'dv');
  const typeCount = {};
  valCols.forEach((c) => { if (c.type) typeCount[c.type] = (typeCount[c.type] || 0) + 1; });
  for (const t of Object.keys(typeCount)) if (typeCount[t] > 1) valCols.filter((c) => c.type === t).slice(1).forEach((c) => (c.type = null));

  const quickVal = (c, k) => {
    const l = c.cands[k];
    if (!l || !l.length) return null;
    return [...l].sort((a, b) => b.w - a.w)[0].v;
  };

  // ratio test between two value columns
  let inferredServing = null;
  const support = (p100, serv, f) => {
    let sup = 0;
    for (const k of Object.keys(p100.cands)) {
      const la = p100.cands[k], lb = serv.cands[k];
      if (!lb) continue;
      let best = 0;
      for (const ca of la) for (const cb of lb) {
        if (ca.v < 0.3 && cb.v < 0.3) continue;
        if (ca.v > 0 && Math.abs(cb.v / (ca.v * f) - 1) < 0.07) best = Math.max(best, Math.min(ca.w, cb.w));
      }
      sup += best;
    }
    return sup;
  };
  if (valCols.length >= 2 && serving.servingSize) {
    const [a, b] = valCols;
    const f = serving.servingSize / 100;
    const s1 = support(a, b, f), s2 = support(b, a, f);
    if (s2 > Math.max(1.5, s1 * 2) && !(b.type === 'serving' && a.type === 'per100' && s1 > 1)) { a.type = 'serving'; b.type = 'per100'; a.fixed = b.fixed = true; }
    else if (s1 > Math.max(1.5, s2 * 2)) { a.type = 'per100'; b.type = 'serving'; a.fixed = b.fixed = true; }
  }
  if (valCols.length >= 2 && !valCols[0].fixed) {
    const [a, b] = valCols;
    const ratios = [];
    for (const k of Object.keys(a.cands)) {
      const va = quickVal(a, k), vb = quickVal(b, k);
      if (va > 0.5 && vb > 0.5) ratios.push(vb / va);
    }
    const r = median(ratios);
    const consistent = ratios.length >= 2 && ratios.filter((x) => Math.abs(x / r - 1) < 0.12).length >= Math.ceil(ratios.length * 0.6);
    if (consistent && Math.abs(r - 1) > 0.03) {
      const s = serving.servingSize;
      if (s && Math.abs(r / (s / 100) - 1) < 0.12) { a.type = 'per100'; b.type = 'serving'; }
      else if (s && Math.abs(r / (100 / s) - 1) < 0.12) { a.type = 'serving'; b.type = 'per100'; }
      else if (a.type === 'per100' || b.type === 'serving') { b.type = 'serving'; a.type = 'per100'; inferredServing = niceServing(100 * r); }
      else if (a.type === 'serving' || b.type === 'per100') { a.type = 'serving'; b.type = 'per100'; inferredServing = niceServing(100 / r); }
    }
    // fill remaining unknown types
    const types = valCols.map((c) => c.type);
    if (types.includes('per100') && !types.includes('serving')) valCols.filter((c) => !c.type).slice(0, 1).forEach((c) => (c.type = 'serving'));
    if (types.includes('serving') && !types.includes('per100')) valCols.filter((c) => !c.type).slice(0, 1).forEach((c) => (c.type = 'per100'));
  } else if (valCols.length === 1 && !valCols[0].type) {
    const has100 = headers.some((h) => h.type === 'per100') || /\b(?:per|setiap|pour|pro|bagi)\s*100\s*(g|ml)/i.test(norm(fullText));
    const hasServ = headers.some((h) => h.type === 'serving') || /amount\s*per\s*serving|per\s*serving|setiap\s*(hidangan|sajian)/i.test(norm(fullText));
    valCols[0].type = has100 ? 'per100' : hasServ || serving.servingSize ? 'serving' : 'per100';
    valCols[0].assumed = !has100 && !hasServ;
  }

  const servingSize = serving.servingSize || inferredServing || (serving.netWeight && serving.netWeight < 250 && valCols.some((c) => c.type === 'serving') ? serving.netWeight : null);

  const outCols = valCols.filter((c) => Object.keys(c.cands).length).map((c, i) => ({
    type: c.type || `col${i + 1}`,
    amount: c.type === 'serving' ? servingSize : 100,
    unit: c.type === 'serving' ? (serving.servingUnit || per100Unit) : per100Unit,
    cands: c.cands,
    assumed: !!c.assumed,
  }));

  // transposed tables (nutrient names as column headers, values underneath)
  for (const it of items.filter((x) => x.tcol)) {
    const type = it.forcedType || (outCols[0] && outCols[0].type) || (headers.some((h) => h.type === 'per100') ? 'per100' : serving.servingSize ? 'serving' : 'per100');
    let target = outCols.find((c) => c.type === type);
    if (!target) {
      target = { type, amount: type === 'serving' ? servingSize : 100, unit: type === 'serving' ? (serving.servingUnit || per100Unit) : per100Unit, cands: {}, assumed: !it.forcedType };
      outCols.push(target);
    }
    it.vals.filter((v) => !v.pct).slice(0, 1).forEach((v) => addCand(target, it.key, v, it.unitHint, 0.9));
  }

  if (input.trace) console.log('TRACE', JSON.stringify({ charH, width: data.width, columns, cols: cols.map((c) => ({ x: c.x, type: c.type, count: c.count, pct: c.pctCount, units: c.units, keys: Object.keys(c.cands) })), headers, items: items.map((i) => ({ k: i.key, v: i.vals.map((v) => `${v.v}${v.unit || ''}${v.pct ? '%' : ''}@${Math.round(v.x)}`) })) }));
  return {
    columns: outCols,
    servingSize, servingUnit: serving.servingUnit || per100Unit, servingName: serving.servingName,
    netWeight: serving.netWeight, servingsPerPack: serving.servingsPerPack,
    inferredServing: !!inferredServing && !serving.servingSize,
    text: fullText,
    itemsFound: items.length,
  };
}

/** Inferred serving sizes come from rounded label values: snap 39.8 → 40. */
function niceServing(x) {
  const r = Math.round(x);
  return Math.abs(x - r) / x < 0.025 ? r : Math.round(x * 10) / 10;
}

/** Are two amounts equal within label rounding (labels round small values to 0.1 g, larger ones to ~1 %)? */
function roughlyEqual(a, b) {
  const m = Math.max(a, b);
  if (m < 0.25) return true;
  return Math.abs(a - b) <= Math.max(0.12 * m, 0.06);
}

/* ------------------------------------------------------------------ */
/* Candidate selection (consistency voting)                            */
/* ------------------------------------------------------------------ */
function clusterCands(list) {
  const clusters = [];
  for (const c of list) {
    const cl = clusters.find((k) => Math.abs(k.v - c.v) <= Math.max(0.05, Math.abs(k.v) * 0.012));
    if (cl) { cl.w += c.w; cl.n++; if (c.w > cl.best) { cl.best = c.w; cl.v = c.v; } }
    else clusters.push({ v: c.v, w: c.w, n: 1, best: c.w });
  }
  return clusters.sort((a, b) => b.w - a.w);
}

function plausible(key, v, amount) {
  const f = 100 / (amount || 100);
  const max = MAX_PER100[key];
  return v >= 0 && (max == null || v * f <= max * 1.02);
}

/**
 * Choose values for one column from candidate lists.
 * @returns {values, conf}
 */
export function chooseColumn(col, passes = 1, partner = null) {
  const amount = col.amount || 100;
  const top = {};
  for (const [key, list] of Object.entries(col.cands)) {
    const cl = clusterCands(list).filter((c) => plausible(key, c.v, amount));
    if (cl.length) top[key] = cl.slice(0, 4);
  }
  // salt → sodium when sodium missing
  if (!top.sodium && top.salt) top.sodium = top.salt.map((c) => ({ ...c, v: c.v * 393.4, w: c.w * 0.95 }));

  const pick = {};
  for (const k of Object.keys(top)) pick[k] = 0;
  const score = () => {
    let s = 0;
    for (const k of Object.keys(pick)) s += Math.log(1e-3 + top[k][pick[k]].w);
    const g = (k) => (top[k] ? top[k][pick[k]].v : null);
    const E = g('energyKcal'), C = g('carbs'), P = g('protein'), F = g('fat');
    if (E != null && C != null && P != null && F != null) {
      const fib = g('fiber') || 0;
      const est = 4 * C + 4 * P + 9 * F;
      const est2 = est + 2 * fib;
      const err = Math.min(Math.abs(E - est), Math.abs(E - est2)) / Math.max(E, est, 25);
      s -= Math.max(0, err - 0.12) * 12;
    }
    const S = g('sugars'), SF = g('satFat'), AS = g('addedSugars'), TF = g('transFat');
    if (S != null && C != null && S > C * 1.02 + 0.3) s -= 3;
    if (SF != null && F != null && SF > F * 1.02 + 0.2) s -= 3;
    if (AS != null && S != null && AS > S * 1.02 + 0.2) s -= 2;
    if (TF != null && F != null && TF > F + 0.2) s -= 2;
    if (partner) {
      // the other column (per 100 g ↔ per serving) must scale by the serving factor
      for (const k of Object.keys(pick)) {
        const pv = partner.values[k];
        if (pv == null) continue;
        const v = top[k][pick[k]].v;
        if (!roughlyEqual(v, pv * partner.f)) s -= 2.5;
      }
    }
    const Na = g('sodium'), salt = top.salt ? top.salt[pick.salt]?.v : null;
    if (Na != null && salt != null && salt > 0.05) {
      const r = Na / (salt * 393.4);
      if (r < 0.8 || r > 1.25) s -= 1.5;
    }
    return s;
  };
  // coordinate ascent over candidate indices
  let best = score();
  for (let iter = 0; iter < 4; iter++) {
    let improved = false;
    for (const k of Object.keys(pick)) {
      for (let i = 0; i < top[k].length; i++) {
        if (i === pick[k]) continue;
        const old = pick[k];
        pick[k] = i;
        const s = score();
        if (s > best + 1e-9) { best = s; improved = true; } else pick[k] = old;
      }
    }
    if (!improved) break;
  }
  const values = {}, conf = {};
  for (const k of OUT_KEYS) {
    if (!top[k]) { values[k] = null; continue; }
    const c = top[k][pick[k]];
    const totalW = top[k].reduce((a, b) => a + b.w, 0);
    values[k] = roundSmart(c.v, k);
    conf[k] = Math.max(0, Math.min(1, (c.w / totalW) * Math.min(1, c.n / Math.max(1, passes * 0.6))));
  }
  return { values, conf };
}

function roundSmart(v, k) {
  if (v == null) return v;
  if (UNIT_OF[k] === 'mg' || k === 'energyKcal') return v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100; // label precision
}

/** Cross-check per-100 and per-serving columns and fill gaps from each other. */
function crossFill(cols, servingSize) {
  const p = cols.find((c) => c.type === 'per100');
  const s = cols.find((c) => c.type === 'serving');
  if (!p || !s || !servingSize) return;
  const f = servingSize / 100;
  p.derived = p.derived || {}; s.derived = s.derived || {};
  for (const k of OUT_KEYS) {
    const a = p.values[k], b = s.values[k];
    if (a == null && b != null) { p.values[k] = roundSmart(b / f, k); p.derived[k] = true; p.conf[k] = (s.conf[k] || 0.5) * 0.8; }
    else if (b == null && a != null) { s.values[k] = roundSmart(a * f, k); s.derived[k] = true; s.conf[k] = (p.conf[k] || 0.5) * 0.8; }
    else if (a != null && b != null && a > 0.3) {
      if (!roughlyEqual(b, a * f) && !roughlyEqual(a, b / f)) {
        // disagreement: trust the higher-confidence side
        if ((p.conf[k] || 0) >= (s.conf[k] || 0)) { s.values[k] = roundSmart(a * f, k); s.derived[k] = true; s.conf[k] = 0.4; }
        else { p.values[k] = roundSmart(b / f, k); p.derived[k] = true; p.conf[k] = 0.4; }
      } else { p.conf[k] = Math.min(1, (p.conf[k] || 0) + 0.25); s.conf[k] = Math.min(1, (s.conf[k] || 0) + 0.25); }
    }
  }
}

/** Finalise one or many parse results (one per OCR pass) into a single answer. */
export function finalize(parses, passWeights) {
  const list = Array.isArray(parses) ? parses : [parses];
  // A pass that recognised far fewer nutrient rows than the best pass was probably garbled: down-weight it.
  const maxItems = Math.max(1, ...list.map((p) => p.itemsFound || 0));
  const weights = (passWeights || list.map(() => 1)).map((w, i) => w * Math.max(0.05, ((list[i].itemsFound || 0) / maxItems) ** 2));
  const servingVotes = list.map((p) => p.servingSize).filter(Boolean);
  const servingSize = mode(servingVotes) || null;
  const byType = new Map();
  list.forEach((p, pi) => {
    for (const c of p.columns) {
      const key = c.type;
      if (!byType.has(key)) byType.set(key, { type: key, unit: c.unit, cands: {}, assumed: c.assumed, hits: 0 });
      const agg = byType.get(key);
      agg.hits++;
      for (const [k, arr] of Object.entries(c.cands)) {
        (agg.cands[k] ||= []).push(...arr.map((x) => ({ ...x, w: x.w * weights[pi] })));
      }
    }
  });
  const aggs = [...byType.values()];
  aggs.forEach((c) => { c.amount = c.type === 'serving' ? servingSize : 100; c.choice = chooseColumn(c, list.length); });
  // Joint refinement: per-100 and per-serving readings must agree via the serving factor.
  const A = aggs.find((c) => c.type === 'per100'), B = aggs.find((c) => c.type === 'serving');
  if (A && B && servingSize) {
    const f = servingSize / 100;
    for (let it = 0; it < 3; it++) {
      B.choice = chooseColumn(B, list.length, { values: A.choice.values, f });
      A.choice = chooseColumn(A, list.length, { values: B.choice.values, f: 1 / f });
    }
  }
  const cols = aggs.map((c) => {
    const { values, conf } = c.choice;
    return { type: c.type, amount: c.amount, unit: c.unit || 'g', values, conf, assumed: c.assumed, known: Object.values(values).filter((v) => v != null).length };
  }).filter((c) => c.known > 0);
  crossFill(cols, servingSize);
  const order = { per100: 0, serving: 1 };
  cols.sort((a, b) => (order[a.type] ?? 2) - (order[b.type] ?? 2) || b.known - a.known);
  const pick = (k) => mode(list.map((p) => p[k]).filter((v) => v != null && v !== '')) ?? null;
  return {
    columns: cols,
    servingSize,
    servingUnit: pick('servingUnit') || 'g',
    servingName: pick('servingName') || '',
    netWeight: pick('netWeight'),
    servingsPerPack: pick('servingsPerPack'),
    inferredServing: list.some((p) => p.inferredServing),
    text: list.map((p) => p.text).join('\n\n— pass —\n\n'),
    score: scoreResult(cols),
  };
}

/** Quality score of a finalised result: more nutrients + energy consistency. */
export function scoreResult(cols) {
  if (!cols || !cols.length) return 0;
  const c = cols[0];
  const v = c.values;
  let s = c.known;
  if (v.carbs != null) s += 2;
  if (v.energyKcal != null && v.carbs != null && v.protein != null && v.fat != null) {
    const est = 4 * v.carbs + 4 * v.protein + 9 * v.fat;
    const err = Math.abs(v.energyKcal - est) / Math.max(v.energyKcal, est, 25);
    s += err < 0.12 ? 3 : err < 0.25 ? 1 : -1;
  }
  return s;
}

/** Convert a finalised result column to the app's food format. */
export function columnToFood(result, colIdx = 0) {
  const c = result.columns[colIdx];
  if (!c) return null;
  const n = {};
  for (const k of OUT_KEYS) n[k] = c.values[k] ?? null;
  const isServ = c.type === 'serving';
  return {
    basis: isServ ? (result.servingSize || 100) : 100,
    basisUnit: c.unit || 'g',
    servingSize: result.servingSize || (result.netWeight && result.netWeight < 250 ? result.netWeight : null),
    servingName: result.servingName || '',
    n,
    _conf: c.conf,
    _derived: c.derived || {},
    _needsServing: isServ && !result.servingSize,
  };
}

/** Convenience: parse plain text (e.g. from an AI model or pasted). */
export function parseText(text) {
  return finalize([parseOcr(text)]);
}
export const _internals = { normalizeInput, buildRows, matchKeywords, extractValues, detectServing };
