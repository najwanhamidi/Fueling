# Fueling

Nutrition-label carb calculator, homemade gel / drink mixer, and science-based running fuel planner.
Works on phones (install to home screen), desktops (Windows / macOS / Linux app) and in any browser, and works offline.

**Open the app:** https://najwanhamidi.github.io/Fueling/

## What it does

### Nutrition
| Tab | What it does |
|---|---|
| **Calc** | Scan a nutrition label (camera, gallery/file, webcam, paste or drag-and-drop) or type it in, even partially. Enter the carbs you need, and it tells you how many grams to weigh out and shows the full nutrition facts for that portion. Labels can be per 100 g/ml, per serving, per sachet, and so on. |
| **Mixer** | Combine 2–8 ingredients. You can set carbs per ingredient, or turn on **ratio mode**: ingredient 1 is the anchor and the others are calculated from a ratio. Templates: **1 : 0.8**, **2 : 1**, 1 : 1, 0.8 : 1, 1 : 0.6, 3 : 1, and 3–4-ingredient blends (malto : dextrose : fructose for 1 : 0.8 or 2 : 1). Ratios can be by carbs or by weight. Shows combined nutrition facts, glucose : fructose ratio and carb concentration, and can split the batch into servings. Zero-carb items (water, salt) take fixed grams. |
| **Library** | Save, load, edit, duplicate and delete foods and mixer recipes. Export/import a backup file to move data between devices. |

### Fueling strategy
| Tab | Method |
|---|---|
| **Basic** | Your g/h target + the packets you have (carbs and quantity of each) + duration → when to take what. Optional first intake *before* the start (any number of minutes), stop-fuelling buffer, start clock, km markers, and a choice between more frequent smaller intakes or fewest intakes. |
| **Guidelines** | Evidence-based sliding scale by duration, intensity and gut training. You choose **Classic** (ACSM 2016 / Jeukendrup 2014, max 90 g/h) or **Contemporary** (2022–25 research, up to 120 g/h for trained guts). Includes carb-loading, pre-race meal, caffeine, fluid and sodium guidance, recovery, aid-station snapping, and a table for every race distance. |
| **Glycogen model** | Personal "hit the wall" model after Rapoport 2010: fitness (VDOT from a race result, or VO₂max), pace, body mass, carb-loading and breakfast → glycogen forecast chart, the minimum g/h to avoid the wall, and the fastest wall-free pace for your gut limit. |
| **Training** | Fuelling per session type (easy, long, tempo, intervals, race rehearsal, train-low), daily carbohydrate by training load, and a week-by-week gut-training ramp. |
| **Arsenal** | Your gels, drinks, chews and bars, with carbs, sodium, caffeine and quantity. Every calculator can use them, and you can add packets straight from a scanned label or a mixer recipe. |

All fueling tabs let you pick the packets you have, take the first one before the start, and save, load and print plans.

## Label reading
Label reading runs **on your device** (Tesseract OCR in WebAssembly, ~3 MB model, cached for offline use), so photos never leave your phone. To cope with any label design it:

1. straightens tilted photos, normalises size and contrast, binarises adaptively (handles shadows, glare, coloured or dark packs and white-on-dark print) and removes table border lines;
2. reads the label 2–5 ways and **votes** on every number, retrying sideways and upside-down photos;
3. matches nutrient names fuzzily in English, Malay, Indonesian and the main European languages, and handles bilingual rows, %DV/%RI/%AKG columns, paragraph-style labels, horizontal tables and US "Nutrition Facts";
4. repairs typical OCR slips: `O`→`0`, `g` read as `9` (`12g` → `129`), lost decimal commas (`1,2 g` → `12g`), `kJ` read as `k)`, and so on;
5. picks the reading that is **physically consistent**: energy ≈ 4·carbs + 4·protein + 9·fat, sugars ≤ carbs, per-serving = per-100 g × serving ÷ 100, and values within physical limits.

You always get a review screen with the photo next to the detected values, and low-confidence numbers are highlighted. On a set of 24 test labels (EU, US, Malaysian, Indonesian, Australian, dark gel packs, low-contrast print, paragraph text, horizontal tables, and photo-like tilt, blur, shadow, noise and rotation), field accuracy is **98.8 %**.

Optionally, in **Settings** you can add your own Anthropic / OpenAI / Google Gemini API key to read labels with AI vision. The key stays on your device, and the app falls back to on-device OCR if AI fails.

## Install
- **Android / iPhone:** open the link above → browser menu → *Add to Home screen / Install app*. Or download the Android APK from [Releases](../../releases).
- **Windows / macOS / Linux:** download from [Releases](../../releases) (`.exe` installer or portable, `.dmg`, `.AppImage`), or click *Install* in Chrome/Edge's address bar.
  - The macOS build is unsigned: right-click the app → *Open* the first time.

## Development
```bash
npm test                         # unit tests + recorded-OCR regression (no browser needed)
npm run serve                    # http://localhost:8080
# full OCR accuracy run in a real browser (needs Playwright + a server at the repo root on :8081):
python3 -m http.server 8081 & node tests/ocr/run.cjs
cd desktop && npm install && npm start      # desktop app
```
No build step: the app is plain HTML/CSS/ES modules in `app/`.
- **Website:** every push to `main` runs the tests and deploys `app/` to GitHub Pages.
- **Installers:** pushing a tag like `v1.0.1`, or running the *Build desktop & Android apps* workflow, builds them and attaches them to a Release.

## Science
Every recommendation in the app links its sources, including Jeukendrup 2014; Thomas, Erdman & Burke 2016 (ACSM/AND/DC); Burke et al. 2011; Stellingwerff & Cox 2014; Podlogar et al. 2022; Rapoport 2010; Romijn et al. 1993; Daniels & Gilbert (VDOT); Costa et al. 2017; Jeukendrup 2017; Impey et al. 2018; Marquet et al. 2016; Guest et al. 2021 (ISSN caffeine); Sawka et al. 2007 (ACSM fluids); Mountjoy et al. 2023 (REDs).

*General education, not medical advice. Test everything in training first.*

License: MIT
