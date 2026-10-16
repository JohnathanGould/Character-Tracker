/* Service worker for the character list at the site root. It replaces the one that used to serve Daerlieth's
   tracker from here: each character folder registers its own worker (daerlieth/sw.js) for its pages, and this one
   only caches the list page so it opens offline. Bump VERSION when the list page changes. */
var VERSION = "characters-v2";
var SHELL = ["./", "index.html", "manifest.webmanifest", "daerlieth/icons/icon.svg", "daerlieth/images/daerlieth-thumb.webp", "daerlieth/images/gwathfaron-thumb.webp"];
var ROOT = new URL("./", self.location).pathname;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: "no-cache" }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  /* caches are shared by every worker on the site: drop only this one's old versions (each character's worker
     cleans up its own, "daerlieth-v…") */
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return /^characters-v/.test(k) && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  /* only the list page and its own files; a character's pages belong to that character's worker */
  var p = url.pathname, mine = p === ROOT || p === ROOT + "index.html" || p === ROOT + "manifest.webmanifest" || SHELL.some(function (s) { return p === ROOT + s; });
  if (!mine) return;
  e.respondWith(fetch(req, { cache: "no-cache" }).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () { return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("index.html"); }); }));
});
