// App shell: routing, navigation, theme, PWA install, global paste.
import { $, esc, toast } from './ui.js';
import { settings } from './store.js';
import { getImageTarget } from './ui/scan.js';

export const VERSION = '1.0.1';

const ROUTES = {
  'single': { title: 'Carb calculator', icon: '🧮', short: 'Calc', load: () => import('./views/single.js') },
  'mixer': { title: 'Mixer', icon: '🧪', short: 'Mixer', load: () => import('./views/mixer.js') },
  'fuel/basic': { title: 'Fuel plan · Basic', icon: '⏱️', short: 'Basic', load: () => import('./views/fuelBasic.js'), group: 'fuel' },
  'fuel/guide': { title: 'Fuel plan · Guidelines', icon: '📘', short: 'Guidelines', load: () => import('./views/fuelGuide.js'), group: 'fuel' },
  'fuel/model': { title: 'Fuel plan · Metabolic model', icon: '🔬', short: 'Glycogen model', load: () => import('./views/fuelModel.js'), group: 'fuel' },
  'fuel/training': { title: 'Fuel plan · Training', icon: '🏃', short: 'Training', load: () => import('./views/fuelTraining.js'), group: 'fuel' },
  'fuel/arsenal': { title: 'Fuel arsenal', icon: '🎒', short: 'Arsenal', load: () => import('./views/arsenal.js'), group: 'fuel' },
  'library': { title: 'Library', icon: '📚', short: 'Library', load: () => import('./views/library.js') },
  'settings': { title: 'Settings & science', icon: '⚙️', short: 'More', load: () => import('./views/settings.js') },
};
const FUEL_TABS = ['fuel/basic', 'fuel/guide', 'fuel/model', 'fuel/training', 'fuel/arsenal'];

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h === 'fuel') return 'fuel/basic';
  return ROUTES[h] ? h : 'single';
}

function renderNav(route) {
  const isFuel = route.startsWith('fuel/');
  const bottom = [
    ['single', '🧮', 'Calc'], ['mixer', '🧪', 'Mixer'], ['fuel/basic', '⏱️', 'Fueling'], ['library', '📚', 'Library'], ['settings', '⚙️', 'More'],
  ];
  $('#bottom-nav').innerHTML = bottom.map(([r, ico, l]) => {
    const active = r === route || (r === 'fuel/basic' && isFuel);
    return `<a href="#/${r}" class="${active ? 'active' : ''}"><span class="ico">${ico}</span>${l}</a>`;
  }).join('');
  const link = (r, sub = false) => `<a href="#/${r}" class="${r === route ? 'active' : ''} ${sub ? 'sub' : ''}"><span>${ROUTES[r].icon}</span>${esc(sub ? ROUTES[r].short : ROUTES[r].title)}</a>`;
  $('#side-nav').innerHTML = `
    <div class="grp">Nutrition</div>${link('single')}${link('mixer')}${link('library')}
    <div class="grp">Fueling strategy</div>${FUEL_TABS.map((r) => link(r, true)).join('')}
    <div class="grp">App</div>${link('settings')}`;
  $('#subtabs').innerHTML = isFuel
    ? FUEL_TABS.map((r) => `<a class="pill ${r === route ? 'active' : ''}" href="#/${r}">${ROUTES[r].short}</a>`).join('')
    : '';
}

let navToken = 0;
async function navigate() {
  const route = currentRoute();
  const token = ++navToken;
  renderNav(route);
  const def = ROUTES[route];
  $('#page-title').textContent = def.title.split(' · ')[0];
  $('#topbar').dataset.title = def.title;
  document.title = `${def.title} · Fueling`;
  const view = $('#view');
  view.innerHTML = '<div class="muted">Loading…</div>';
  try {
    const mod = await def.load();
    if (token !== navToken) return;
    view.innerHTML = '';
    await mod.mount(view);
    view.scrollTop = 0;
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="note bad">Failed to load this page: ${esc(e.message)}</div>`;
  }
}

function applyTheme() {
  const t = settings.get().theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#0f1216' : '#f3f5f8';
}
export { applyTheme };

$('#theme-btn').onclick = () => {
  const cur = settings.get().theme;
  const dark = cur === 'dark' || (cur === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
  settings.set({ theme: dark ? 'light' : 'dark' });
  applyTheme();
};

// Global paste of an image → current scan target
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  const target = getImageTarget();
  if (!target) { toast('Open the calculator or mixer to paste a label image'); return; }
  e.preventDefault();
  target(item.getAsFile());
});
window.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) document.body.classList.add('dragging'); });
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
window.addEventListener('drop', () => document.body.classList.remove('dragging'));

// PWA install
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const b = $('#install-btn');
  b.hidden = false;
  b.onclick = async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; b.hidden = true; };
});
export function canInstall() { return !!deferredPrompt; }
export async function promptInstall() { if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; } }

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Update ready. Reopen the app to use it.');
        });
      });
    }).catch((e) => console.warn('SW', e));
  });
}

$('#version-tag').textContent = `v${VERSION}`;
applyTheme();
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);
window.addEventListener('hashchange', navigate);
navigate();
