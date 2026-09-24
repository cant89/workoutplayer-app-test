/* WorkoutPlayer · service worker minimo (T2, piano §3.13: l'offline è un di più, non un requisito).
   - All'installazione mette in cache i file dell'app e della libreria (elenco da ../lib/manifest.json).
   - File dell'app e della libreria: dalla cache, aggiornati in sottofondo (alla visita dopo si vede la versione nuova).
   - Caratteri (Google Fonts): dalla cache dopo il primo caricamento.
   - Il resto (catalogo e file del banco per l'importazione): dalla rete, con la cache solo se la rete manca.
   I piani aperti non passano di qui: stanno già nel deposito del dispositivo (IndexedDB, app/js/deposito.js).
   Cambiare VERSION a ogni modifica dei file elencati. */
const VERSION = "wp-t2-7";
const APP = ["./", "./index.html", "./app.css", "./manifest.webmanifest", "./js/deposito.js", "./js/revisione.js", "./js/anteprima.js",
  "./js/viste.js", "./js/avvio.js", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const fresh = u => new Request(u, { cache: "reload" }); // mai dalla cache HTTP del browser: sempre la versione del server
    await cache.addAll(APP.map(fresh));
    const m = await (await fetch(fresh("../lib/manifest.json"))).json();
    await cache.addAll(["../lib/manifest.json", "../lib/" + m.html].concat(m.css.map(f => "../lib/" + f), m.js.map(f => "../lib/" + f)).map(fresh));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
async function fromCacheThenUpdate(req, ignoreSearch) {
  const cache = await caches.open(VERSION), hit = await cache.match(req, { ignoreSearch });
  const net = fetch(new Request(req.url, { cache: "no-cache" })).then(res => { if (res.ok) cache.put(ignoreSearch ? new URL(req.url).pathname : req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
async function fromNetworkElseCache(req) {
  try { return await fetch(req); } catch (e) { return (await caches.match(req)) || Response.error(); }
}
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url), here = new URL(self.registration.scope);
  if (FONTS.test(req.url)) { event.respondWith(fromCacheThenUpdate(req, false)); return; }
  if (url.origin !== here.origin) return;
  const root = here.pathname.replace(/app\/$/, "");
  if (url.pathname.startsWith(root + "app/") || url.pathname.startsWith(root + "lib/")) event.respondWith(fromCacheThenUpdate(req, req.mode === "navigate"));
  else event.respondWith(fromNetworkElseCache(req));
});
