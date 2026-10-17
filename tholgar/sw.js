/* App shell cache so Tholgar's tracker opens offline. Bump VERSION when shipping changes. */
var VERSION = "tholgar-v1";
var SHELL = ["./", "index.html", "config.js", "docs/tholgar-sheet.txt", "data/spells.json", "vendor/firebase-app-compat.js", "vendor/firebase-auth-compat.js", "vendor/firebase-firestore-compat.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "images/tholgar-thumb.webp", "images/tholgar.webp"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: "no-cache" }); })); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    /* caches are shared with the character list's worker: drop only this tracker's old versions */
    return Promise.all(keys.filter(function (k) { return /^tholgar-v/.test(k) && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
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
