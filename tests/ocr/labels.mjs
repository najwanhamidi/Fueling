// Synthetic nutrition labels with ground truth, covering many real-world layouts.
// Each: { id, html, css?, truth: { type: 'per100'|'serving', servingSize?, values: {...} }, degrade? }
// `degrade` is applied in the browser harness to mimic phone photos.

const base = `font-family: Arial, Helvetica, sans-serif; color:#111; background:#fff;`;

export const LABELS = [
  {
    id: 'eu-two-col',
    html: `<div class="l" style="${base} width:520px; padding:18px; border:2px solid #000">
      <div style="font-weight:700;font-size:20px;border-bottom:3px solid #000;padding-bottom:6px">Nutrition Information</div>
      <table style="width:100%;border-collapse:collapse;font-size:17px;margin-top:6px">
        <tr style="font-weight:700;border-bottom:1px solid #000"><td>Typical values</td><td style="text-align:right">Per 100g</td><td style="text-align:right">Per serving (40g)</td></tr>
        <tr><td>Energy</td><td style="text-align:right">1529kJ</td><td style="text-align:right">612kJ</td></tr>
        <tr><td></td><td style="text-align:right">360kcal</td><td style="text-align:right">144kcal</td></tr>
        <tr><td>Fat</td><td style="text-align:right">0.5g</td><td style="text-align:right">0.2g</td></tr>
        <tr><td>of which saturates</td><td style="text-align:right">0.1g</td><td style="text-align:right">&lt;0.1g</td></tr>
        <tr><td>Carbohydrate</td><td style="text-align:right">88g</td><td style="text-align:right">35g</td></tr>
        <tr><td>of which sugars</td><td style="text-align:right">22g</td><td style="text-align:right">8.8g</td></tr>
        <tr><td>Fibre</td><td style="text-align:right">0g</td><td style="text-align:right">0g</td></tr>
        <tr><td>Protein</td><td style="text-align:right">1.0g</td><td style="text-align:right">0.4g</td></tr>
        <tr><td>Salt</td><td style="text-align:right">0.50g</td><td style="text-align:right">0.20g</td></tr>
      </table></div>`,
    truth: { type: 'per100', servingSize: 40, values: { energyKcal: 360, fat: 0.5, satFat: 0.1, carbs: 88, sugars: 22, fiber: 0, protein: 1, sodium: 197 } },
  },
  {
    id: 'us-facts',
    html: `<div class="l" style="${base} width:360px; padding:8px 10px; border:1px solid #000; font-family:'Helvetica Neue',Arial">
      <div style="font-weight:900;font-size:38px;line-height:1">Nutrition Facts</div>
      <div style="border-bottom:1px solid #000;font-size:16px">1 servings per container</div>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:18px;border-bottom:10px solid #000"><span>Serving size</span><span>1 packet (32g)</span></div>
      <div style="font-size:13px;font-weight:700">Amount per serving</div>
      <div style="display:flex;justify-content:space-between;font-weight:900;font-size:30px;border-bottom:5px solid #000"><span>Calories</span><span>100</span></div>
      <div style="text-align:right;font-size:13px;font-weight:700;border-bottom:1px solid #000">% Daily Value*</div>
      ${[['<b>Total Fat</b> 0g', '0%'], ['&nbsp;&nbsp;Saturated Fat 0g', '0%'], ['&nbsp;&nbsp;<i>Trans</i> Fat 0g', ''], ['<b>Cholesterol</b> 0mg', '0%'], ['<b>Sodium</b> 85mg', '4%'], ['<b>Total Carbohydrate</b> 25g', '9%'], ['&nbsp;&nbsp;Dietary Fiber 0g', '0%'], ['&nbsp;&nbsp;Total Sugars 12g', ''], ['&nbsp;&nbsp;&nbsp;&nbsp;Includes 10g Added Sugars', '20%'], ['<b>Protein</b> 0g', '']]
        .map(([a, b]) => `<div style="display:flex;justify-content:space-between;font-size:16px;border-bottom:1px solid #000;padding:1px 0"><span>${a}</span><b>${b}</b></div>`).join('')}
      <div style="font-size:10px;margin-top:4px">*The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.</div></div>`,
    truth: { type: 'serving', servingSize: 32, values: { energyKcal: 100, fat: 0, satFat: 0, transFat: 0, cholesterol: 0, sodium: 85, carbs: 25, fiber: 0, sugars: 12, addedSugars: 10, protein: 0 } },
  },
  {
    id: 'my-bilingual',
    html: `<div class="l" style="${base} width:560px; padding:14px; border:2px solid #000">
      <div style="text-align:center;font-weight:700;font-size:19px">MAKLUMAT PEMAKANAN / NUTRITION INFORMATION</div>
      <div style="font-size:15px;margin:6px 0">Saiz Hidangan / Serving Size: 30 g</div>
      <div style="font-size:15px;margin-bottom:6px">Bilangan Hidangan Sebekas / Servings Per Pack: 10</div>
      <table style="width:100%;border-collapse:collapse;font-size:15px" border="1">
        <tr style="font-weight:700"><td></td><td style="text-align:center">Setiap 100 g<br>Per 100 g</td><td style="text-align:center">Setiap Hidangan<br>Per Serving</td></tr>
        <tr><td>Tenaga / Energy</td><td style="text-align:center">402 kcal</td><td style="text-align:center">121 kcal</td></tr>
        <tr><td>Karbohidrat / Carbohydrate</td><td style="text-align:center">78.5 g</td><td style="text-align:center">23.6 g</td></tr>
        <tr><td>Gula / Sugars</td><td style="text-align:center">31.2 g</td><td style="text-align:center">9.4 g</td></tr>
        <tr><td>Protein</td><td style="text-align:center">6.8 g</td><td style="text-align:center">2.0 g</td></tr>
        <tr><td>Lemak / Fat</td><td style="text-align:center">6.6 g</td><td style="text-align:center">2.0 g</td></tr>
        <tr><td>Natrium / Sodium</td><td style="text-align:center">240 mg</td><td style="text-align:center">72 mg</td></tr>
      </table></div>`,
    truth: { type: 'per100', servingSize: 30, values: { energyKcal: 402, carbs: 78.5, sugars: 31.2, protein: 6.8, fat: 6.6, sodium: 240 } },
  },
  {
    id: 'dark-gel',
    html: `<div class="l" style="font-family:'Arial Narrow',Arial; width:420px; padding:14px; background:#1b2a6b; color:#fff; border-radius:10px">
      <div style="font-weight:700;font-size:18px;letter-spacing:1px">NUTRITION FACTS</div>
      <table style="width:100%;font-size:15px;border-collapse:collapse;margin-top:6px">
        <tr style="font-weight:700;border-bottom:1px solid #fff"><td></td><td style="text-align:right">per 100ml</td><td style="text-align:right">per gel 60ml</td></tr>
        <tr><td>Energy</td><td style="text-align:right">167 kcal</td><td style="text-align:right">100 kcal</td></tr>
        <tr><td>Fat</td><td style="text-align:right">0 g</td><td style="text-align:right">0 g</td></tr>
        <tr><td>Carbohydrate</td><td style="text-align:right">41.7 g</td><td style="text-align:right">25 g</td></tr>
        <tr><td>Sugars</td><td style="text-align:right">8.3 g</td><td style="text-align:right">5 g</td></tr>
        <tr><td>Protein</td><td style="text-align:right">0 g</td><td style="text-align:right">0 g</td></tr>
        <tr><td>Sodium</td><td style="text-align:right">83 mg</td><td style="text-align:right">50 mg</td></tr>
        <tr><td>Caffeine</td><td style="text-align:right">125 mg</td><td style="text-align:right">75 mg</td></tr>
      </table></div>`,
    truth: { type: 'per100', servingSize: 60, values: { energyKcal: 167, fat: 0, carbs: 41.7, sugars: 8.3, protein: 0, sodium: 83, caffeine: 125 } },
  },
  {
    id: 'linear-paragraph',
    html: `<div class="l" style="${base} width:520px; padding:12px; font-size:15px; line-height:1.45">
      <b>Ingredients:</b> Maltodextrin. <b>Nutrition: Typical values per 100g:</b> Energy 1615kJ / 380kcal, Fat 0g, of which saturates 0g,
      Carbohydrate 95g, of which sugars 5.0g, Protein 0g, Salt 0.13g.</div>`,
    truth: { type: 'per100', values: { energyKcal: 380, fat: 0, satFat: 0, carbs: 95, sugars: 5, protein: 0, sodium: 51 } },
  },
  {
    id: 'horizontal',
    html: `<div class="l" style="${base} width:640px; padding:12px; border:2px solid #000">
      <div style="font-weight:700;font-size:16px;margin-bottom:4px">Nutrition facts (per 100 g)</div>
      <table style="width:100%;border-collapse:collapse;font-size:15px;text-align:center" border="1">
        <tr style="font-weight:700"><td>Energy</td><td>Protein</td><td>Fat</td><td>Carbohydrate</td><td>Sodium</td></tr>
        <tr><td>395 kcal</td><td>0.2 g</td><td>0.1 g</td><td>98.3 g</td><td>12 mg</td></tr>
      </table></div>`,
    truth: { type: 'per100', values: { energyKcal: 395, protein: 0.2, fat: 0.1, carbs: 98.3, sodium: 12 } },
  },
  {
    id: 'eu-comma-ri',
    html: `<div class="l" style="${base} width:600px; padding:14px; border:1px solid #444; font-family:Georgia,serif">
      <div style="font-weight:700;font-size:18px">Nährwerte / Nutrition</div>
      <table style="width:100%;border-collapse:collapse;font-size:15px;margin-top:6px">
        <tr style="font-weight:700;border-bottom:2px solid #000"><td></td><td style="text-align:right">pro 100 g</td><td style="text-align:right">per portion 25 g</td><td style="text-align:right">%RI*</td></tr>
        <tr><td>Brennwert / Energy</td><td style="text-align:right">1678 kJ / 397 kcal</td><td style="text-align:right">420 kJ / 99 kcal</td><td style="text-align:right">5%</td></tr>
        <tr><td>Fett / Fat</td><td style="text-align:right">1,2 g</td><td style="text-align:right">0,3 g</td><td style="text-align:right">0%</td></tr>
        <tr><td>Kohlenhydrate / Carbohydrate</td><td style="text-align:right">92,5 g</td><td style="text-align:right">23,1 g</td><td style="text-align:right">9%</td></tr>
        <tr><td>davon Zucker / of which sugars</td><td style="text-align:right">40,0 g</td><td style="text-align:right">10,0 g</td><td style="text-align:right">11%</td></tr>
        <tr><td>Eiweiß / Protein</td><td style="text-align:right">0,5 g</td><td style="text-align:right">0,1 g</td><td style="text-align:right">0%</td></tr>
        <tr><td>Salz / Salt</td><td style="text-align:right">0,25 g</td><td style="text-align:right">0,06 g</td><td style="text-align:right">1%</td></tr>
      </table>
      <div style="font-size:11px;margin-top:6px">*Reference intake of an average adult (8400 kJ / 2000 kcal)</div></div>`,
    truth: { type: 'per100', servingSize: 25, values: { energyKcal: 397, fat: 1.2, carbs: 92.5, sugars: 40, protein: 0.5, sodium: 98 } },
  },
  {
    id: 'colored-drink',
    html: `<div class="l" style="font-family:Verdana,sans-serif; width:460px; padding:14px; background:#ffd84d; color:#222">
      <div style="font-weight:700;font-size:16px;background:#222;color:#ffd84d;padding:4px 8px">NUTRITION INFORMATION</div>
      <div style="font-size:13px;margin:4px 0">Serving size: 1 scoop (40g) in 500ml water</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr style="font-weight:700"><td></td><td style="text-align:right">Per 100g</td><td style="text-align:right">Per Serve</td></tr>
        <tr><td>Energy</td><td style="text-align:right">1580kJ</td><td style="text-align:right">632kJ</td></tr>
        <tr><td>Protein</td><td style="text-align:right">0g</td><td style="text-align:right">0g</td></tr>
        <tr><td>Fat, total</td><td style="text-align:right">0g</td><td style="text-align:right">0g</td></tr>
        <tr><td>Carbohydrate</td><td style="text-align:right">92.5g</td><td style="text-align:right">37.0g</td></tr>
        <tr><td>&nbsp;&nbsp;- Sugars</td><td style="text-align:right">45.0g</td><td style="text-align:right">18.0g</td></tr>
        <tr><td>Sodium</td><td style="text-align:right">1250mg</td><td style="text-align:right">500mg</td></tr>
        <tr><td>Potassium</td><td style="text-align:right">375mg</td><td style="text-align:right">150mg</td></tr>
      </table></div>`,
    truth: { type: 'per100', servingSize: 40, values: { energyKcal: 377.6, protein: 0, fat: 0, carbs: 92.5, sugars: 45, sodium: 1250, potassium: 375 } },
  },
  {
    id: 'low-contrast',
    // dark text printed on a dark/saturated pack colour (common on gel sachets)
    html: `<div class="l" style="font-family:Arial; width:430px; padding:14px; background:#1d3a8f; color:#0b0b0b; border-radius:10px">
      <div style="font-weight:700;font-size:18px;color:#fff">NUTRITION FACTS</div>
      <table style="width:100%;font-size:15px;border-collapse:collapse;margin-top:6px;color:#0b0b0b">
        <tr style="font-weight:700;border-bottom:1px solid #000"><td></td><td style="text-align:right">per 100g</td><td style="text-align:right">per sachet 40g</td></tr>
        <tr><td>Energy</td><td style="text-align:right">250 kcal</td><td style="text-align:right">100 kcal</td></tr>
        <tr><td>Carbohydrate</td><td style="text-align:right">62.5 g</td><td style="text-align:right">25 g</td></tr>
        <tr><td>Sugars</td><td style="text-align:right">20 g</td><td style="text-align:right">8 g</td></tr>
        <tr><td>Protein</td><td style="text-align:right">0 g</td><td style="text-align:right">0 g</td></tr>
        <tr><td>Fat</td><td style="text-align:right">0 g</td><td style="text-align:right">0 g</td></tr>
        <tr><td>Sodium</td><td style="text-align:right">150 mg</td><td style="text-align:right">60 mg</td></tr>
      </table></div>`,
    truth: { type: 'per100', servingSize: 40, values: { energyKcal: 250, carbs: 62.5, sugars: 20, protein: 0, fat: 0, sodium: 150 } },
  },
  {
    id: 'au-serving-first',
    html: `<div class="l" style="${base} width:520px; padding:12px; border:2px solid #000">
      <div style="font-weight:700;font-size:19px;text-align:center;border-bottom:2px solid #000">NUTRITION INFORMATION</div>
      <div style="font-size:14px">Servings per package: 12</div><div style="font-size:14px;margin-bottom:4px">Serving size: 45g</div>
      <table style="width:100%;border-collapse:collapse;font-size:15px">
        <tr style="font-weight:700;border-bottom:1px solid #000"><td></td><td style="text-align:right">Avg. Quantity<br>per Serving</td><td style="text-align:right">Avg. Quantity<br>per 100g</td></tr>
        <tr><td>Energy</td><td style="text-align:right">738kJ</td><td style="text-align:right">1640kJ</td></tr>
        <tr><td>Protein</td><td style="text-align:right">4.5g</td><td style="text-align:right">10.0g</td></tr>
        <tr><td>Fat, total</td><td style="text-align:right">2.7g</td><td style="text-align:right">6.0g</td></tr>
        <tr><td>&nbsp;– saturated</td><td style="text-align:right">0.5g</td><td style="text-align:right">1.1g</td></tr>
        <tr><td>Carbohydrate</td><td style="text-align:right">29.7g</td><td style="text-align:right">66.0g</td></tr>
        <tr><td>&nbsp;– sugars</td><td style="text-align:right">9.9g</td><td style="text-align:right">22.0g</td></tr>
        <tr><td>Dietary Fibre</td><td style="text-align:right">2.9g</td><td style="text-align:right">6.5g</td></tr>
        <tr><td>Sodium</td><td style="text-align:right">72mg</td><td style="text-align:right">160mg</td></tr>
      </table></div>`,
    truth: { type: 'per100', servingSize: 45, values: { energyKcal: 392, protein: 10, fat: 6, satFat: 1.1, carbs: 66, sugars: 22, fiber: 6.5, sodium: 160 } },
  },
  {
    id: 'id-gizi',
    html: `<div class="l" style="${base} width:500px; padding:12px; border:2px solid #000; font-family:Tahoma,Verdana">
      <div style="font-weight:700;font-size:18px;text-align:center">INFORMASI NILAI GIZI</div>
      <div style="font-size:14px">Takaran saji 35 g</div>
      <div style="font-size:14px;border-bottom:4px solid #000">Jumlah sajian per kemasan : 1</div>
      <div style="font-weight:700;font-size:14px">JUMLAH PER SAJIAN</div>
      <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;border-bottom:2px solid #000"><span>Energi total</span><span>130 kkal</span></div>
      <div style="text-align:right;font-size:13px;font-weight:700">% AKG*</div>
      ${[['Lemak total', '0 g', '0 %'], ['Protein', '0 g', '0 %'], ['Karbohidrat total', '32 g', '10 %'], ['Gula', '12 g', ''], ['Garam (Natrium)', '55 mg', '4 %']]
        .map(([a, b, c]) => `<div style="display:flex;font-size:15px;border-bottom:1px solid #000"><span style="flex:1">${a}</span><span style="width:90px;text-align:right">${b}</span><span style="width:70px;text-align:right">${c}</span></div>`).join('')}
      <div style="font-size:10px;margin-top:4px">*Persen AKG berdasarkan kebutuhan energi 2150 kkal. Kebutuhan energi Anda mungkin lebih tinggi atau lebih rendah.</div></div>`,
    truth: { type: 'serving', servingSize: 35, values: { energyKcal: 130, fat: 0, protein: 0, carbs: 32, sugars: 12, sodium: 55 } },
  },
  {
    id: 'narrow-condensed',
    html: `<div class="l" style="font-family:'Arial Narrow','Liberation Sans Narrow',Arial; font-stretch:condensed; width:250px; padding:8px; background:#fff; color:#000; border:1px solid #000">
      <div style="font-weight:700;font-size:13px">NUTRITION / PER GEL (32g)</div>
      ${[['Energy', '360kJ / 86kcal'], ['Fat', '0g'], ['Carbohydrate', '21g'], ['of which sugars', '9.5g'], ['Protein', '0g'], ['Salt', '0.15g'], ['Caffeine', '100mg']]
        .map(([a, b]) => `<div style="display:flex;justify-content:space-between;font-size:12px"><span>${a}</span><span>${b}</span></div>`).join('')}</div>`,
    truth: { type: 'serving', servingSize: 32, values: { energyKcal: 86, fat: 0, carbs: 21, sugars: 9.5, protein: 0, sodium: 59, caffeine: 100 } },
  },
  {
    id: 'serif-centered',
    html: `<div class="l" style="font-family:'Times New Roman',Times,serif; width:400px; padding:14px; background:#f4efe6; color:#3a2a1a; text-align:center">
      <div style="font-size:20px;font-style:italic">Nutrition Facts</div>
      <div style="font-size:13px">per 100 g</div>
      <hr style="border:0;border-top:1px solid #3a2a1a">
      ${[['Energy', '310 kcal'], ['Fat', '1.5 g'], ['Saturated fat', '0.4 g'], ['Carbohydrate', '68 g'], ['Sugars', '41 g'], ['Fibre', '3.1 g'], ['Protein', '4.2 g'], ['Sodium', '20 mg']]
        .map(([a, b]) => `<div style="font-size:15px">${a} ........ ${b}</div>`).join('')}</div>`,
    truth: { type: 'per100', values: { energyKcal: 310, fat: 1.5, satFat: 0.4, carbs: 68, sugars: 41, fiber: 3.1, protein: 4.2, sodium: 20 } },
  },
];

// Photo-like degradations applied to copies of some labels.
export const DEGRADED = [
  { id: 'eu-two-col~photo', src: 'eu-two-col', degrade: { rotate: 4, blur: 0.8, shadow: true, noise: 18, jpeg: 0.6, scale: 0.8 } },
  { id: 'my-bilingual~photo', src: 'my-bilingual', degrade: { rotate: -3, blur: 0.6, shadow: true, noise: 14, jpeg: 0.65, scale: 0.9 } },
  { id: 'us-facts~small', src: 'us-facts', degrade: { scale: 0.55, blur: 0.4, jpeg: 0.7 } },
  { id: 'dark-gel~photo', src: 'dark-gel', degrade: { rotate: 2, blur: 0.6, noise: 12, jpeg: 0.6 } },
  { id: 'colored-drink~sideways', src: 'colored-drink', degrade: { rotate: 90 } },
  { id: 'low-contrast~photo', src: 'low-contrast', degrade: { rotate: 3, blur: 0.5, noise: 10, jpeg: 0.65 } },
  { id: 'horizontal~photo', src: 'horizontal', degrade: { rotate: -2, blur: 0.5, shadow: true, noise: 10, jpeg: 0.7 } },
  { id: 'au-serving-first~photo', src: 'au-serving-first', degrade: { rotate: 6, blur: 0.7, shadow: true, noise: 12, jpeg: 0.6 } },
  { id: 'id-gizi~photo', src: 'id-gizi', degrade: { rotate: -4, blur: 0.5, noise: 12, jpeg: 0.65, scale: 0.85 } },
  { id: 'narrow-condensed~upside', src: 'narrow-condensed', degrade: { rotate: 180, noise: 8, jpeg: 0.7 } },
  { id: 'eu-comma-ri~photo', src: 'eu-comma-ri', degrade: { rotate: -5, shadow: true, noise: 10, jpeg: 0.7 } },
];
