/* App shell cache so the tracker opens offline. Bump VERSION when shipping changes. */
var VERSION = "daerlieth-v37";
var SHELL = ["./", "index.html", "config.js", "levels.js", "rules-info.js", "sheet.js", "sheet-prose.js", "rpol.js", "actions.js", "docs/daerlieth-sheet.txt", "docs/gwathfaron-sheet.txt", "sheet.css", "vendor/firebase-app-compat.js", "vendor/firebase-auth-compat.js", "vendor/firebase-firestore-compat.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "data/codex.json"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: "no-cache" }); })); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  var fonts = url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
  if (url.origin !== location.origin && !fonts) return; /* Firebase traffic goes straight to the network */
  if (fonts) {
    /* cache first: font files never change at a given URL */
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
        return res;
      });
    }));
    return;
  }
  /* network first for the app itself, so updates show up; cache when offline */
  /* no-cache: revalidate with the server, so a new deploy shows up on the next load
     instead of waiting out GitHub Pages' 10-minute browser cache */
  e.respondWith(fetch(req, { cache: "no-cache" }).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("index.html"); });
  }));
});
