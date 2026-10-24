// Service worker: offline app shell + runtime cache (incl. the on-device OCR engine and model).
const VERSION = 'fueling-v1.0.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './js/app.js', './js/ui.js', './js/store.js', './js/nutrients.js',
  './js/ui/scan.js', './js/ui/foodEditor.js',
  './js/ocr/ocr.js', './js/ocr/parser.js', './js/ocr/ai.js',
  './js/fuel/scheduler.js', './js/fuel/science.js', './js/fuel/components.js',
  './js/views/single.js', './js/views/mixer.js', './js/views/library.js', './js/views/settings.js',
  './js/views/fuelBasic.js', './js/views/fuelGuide.js', './js/views/fuelModel.js', './js/views/fuelTraining.js', './js/views/arsenal.js',
  './vendor/tesseract/tesseract.min.js', './vendor/tesseract/worker.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // AI APIs etc. go straight to the network
  const isVendor = url.pathname.includes('/vendor/');
  // Vendor files are big and immutable: cache-first. App code: network-first so updates land quickly.
  if (isVendor) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
