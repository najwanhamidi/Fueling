// Optional AI-vision extraction (user supplies their own API key; key stays on this device).
import { OUT_KEYS } from './parser.js';

export const AI_PROVIDERS = {
  anthropic: { label: 'Anthropic Claude', defaultModel: 'claude-haiku-5-5', keyHint: 'sk-ant-…' },
  openai: { label: 'OpenAI', defaultModel: 'gpt-4.1-mini', keyHint: 'sk-…' },
  gemini: { label: 'Google Gemini (free tier available)', defaultModel: 'gemini-2.5-flash', keyHint: 'AIza…' },
};

const PROMPT = `You are reading a photo of a food / sports-nutrition "Nutrition Facts" / "Nutrition Information" / "Maklumat Pemakanan" label.
Extract every value column exactly as printed (e.g. "per 100 g", "per serving (40 g)", "per sachet"). Ignore %DV / %RI columns.
Return ONLY JSON (no markdown) with this shape:
{"product_name": string|null,
 "serving_size": {"amount": number|null, "unit": "g"|"ml"|null, "name": string|null},
 "columns": [{"label": string, "basis_amount": number|null, "basis_unit": "g"|"ml", "is_per_100": boolean,
   "energy_kcal": number|null, "fat_g": number|null, "sat_fat_g": number|null, "trans_fat_g": number|null,
   "cholesterol_mg": number|null, "carbs_g": number|null, "sugars_g": number|null, "added_sugars_g": number|null,
   "fiber_g": number|null, "protein_g": number|null, "sodium_mg": number|null, "salt_g": number|null,
   "potassium_mg": number|null, "caffeine_mg": number|null}]}
Rules: convert kJ to kcal only if kcal is not printed (kcal = kJ / 4.184). Sodium in mg (convert g→mg). "<0.5 g" → 0. Values not printed → null. Do not invent values.`;

async function blobToBase64(blob) {
  const buf = await blob.arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function canvasToJpegBlob(canvas, maxSide = 1600) {
  const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * s); c.height = Math.round(canvas.height * s);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
}

function extractJson(text) {
  const t = String(text || '').replace(/```json|```/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('AI did not return JSON');
  return JSON.parse(t.slice(a, b + 1));
}

export async function aiExtract(canvas, { provider, key, model }) {
  if (!provider || provider === 'none') throw new Error('No AI provider selected');
  if (!key) throw new Error('Add your API key in Settings');
  const p = AI_PROVIDERS[provider];
  const m = model || p.defaultModel;
  const blob = await canvasToJpegBlob(canvas);
  const b64 = await blobToBase64(blob);
  let text;
  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: m, max_tokens: 1500,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: PROMPT },
        ] }],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Anthropic error ${r.status}`);
    text = (j.content || []).map((c) => c.text || '').join('');
  } else if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: m, response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ] }],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `OpenAI error ${r.status}`);
    text = j.choices?.[0]?.message?.content;
  } else if (provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: PROMPT }] }],
        generationConfig: { response_mime_type: 'application/json', temperature: 0 },
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Gemini error ${r.status}`);
    text = j.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('');
  }
  return aiJsonToResult(extractJson(text));
}

/** Map AI JSON → same structure as the OCR finaliser output. */
export function aiJsonToResult(j) {
  const map = {
    energy_kcal: 'energyKcal', fat_g: 'fat', sat_fat_g: 'satFat', trans_fat_g: 'transFat', cholesterol_mg: 'cholesterol',
    carbs_g: 'carbs', sugars_g: 'sugars', added_sugars_g: 'addedSugars', fiber_g: 'fiber', protein_g: 'protein',
    sodium_mg: 'sodium', potassium_mg: 'potassium', caffeine_mg: 'caffeine',
  };
  const serving = j.serving_size || {};
  const columns = (j.columns || []).map((c) => {
    const values = {}, conf = {};
    for (const k of OUT_KEYS) values[k] = null;
    for (const [src, dst] of Object.entries(map)) {
      const v = c[src];
      if (v != null && Number.isFinite(+v)) { values[dst] = +v; conf[dst] = 0.95; }
    }
    if (values.sodium == null && c.salt_g != null && Number.isFinite(+c.salt_g)) { values.sodium = Math.round(+c.salt_g * 393.4); conf.sodium = 0.9; }
    const per100 = c.is_per_100 || +c.basis_amount === 100;
    return {
      type: per100 ? 'per100' : 'serving',
      amount: per100 ? 100 : (+c.basis_amount || +serving.amount || null),
      unit: c.basis_unit || serving.unit || 'g',
      values, conf, label: c.label,
      known: Object.values(values).filter((v) => v != null).length,
    };
  }).filter((c) => c.known);
  columns.sort((a, b) => (a.type === 'per100' ? -1 : 1) - (b.type === 'per100' ? -1 : 1));
  const servingSize = +serving.amount || columns.find((c) => c.type === 'serving')?.amount || null;
  return {
    columns, servingSize, servingUnit: serving.unit || 'g', servingName: serving.name || '',
    productName: j.product_name || '', text: JSON.stringify(j, null, 2), score: 99, source: 'ai',
  };
}
