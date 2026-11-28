'use strict';
/* Service worker d'EcoScan · Application : l'app s'ouvre et fonctionne sans connexion.
   Stratégie : on précharge le « squelette » de l'app, puis on répond depuis le cache en se remettant à jour en arrière-plan. */
const VERSION = 'ecoscan-app-v5';
const SHELL = [
  './', 'index.html', 'app.css', 'app.js', 'data.js', 'live.js', 'scanner.js', 'manifest.webmanifest',
  'img/pochette.webp', 'img/carnet.webp', 'img/sac.webp',
  '../assets/fonts/inter-latin-wght-normal.woff2', '../assets/favicon.svg', '../assets/icon-180.png', '../assets/icon-192.png', '../assets/icon-512.png'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ecoscan-app-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
