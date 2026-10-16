# Character Tracker

Live site: https://johnathangould.github.io/Character-Tracker/ (Daerlieth: https://johnathangould.github.io/Character-Tracker/daerlieth/, GM view: add `?view`).

Courynna Talaudrym (D&D 3.5 Factotum): https://johnathangould.github.io/Character-Tracker/courynna/ (GM view: add `?view`). Her tracker is the single file `courynna/index.html`.

Nhym Ashcloak (D&D 3.5 whisper gnome rogue): https://johnathangould.github.io/Character-Tracker/nhym/ (GM view: add `?view`).

## Daerlieth Nightstar

Burnout, overdrive, mythic power and concentration tracker for a Pathfinder 1e gestalt character (Eternal Mage 8 // Spell-less Ranger 8, Archmage tier 2). Rules live in `CLAUDE.md`.

- **GM:** open the site link. No account; the page updates live as the player plays.
- **Player:** open the link with `?edit` once, tap **Sign in**, and add the page to the home screen. It works offline; changes made offline sync when the phone reconnects. While signed in, the plain link opens the editor on that device (with Sign out); add `?view` to see the page exactly as the GM does.

The site root lists Balthazar's characters (`index.html`, with a live line for each); each character's tracker is its own folder, starting with `daerlieth/`. Links to the old address with `?view` or `?edit` still open Daerlieth's tracker. The file table below is for `daerlieth/`.

It is plain static files with no build step. Opening `index.html` straight from disk still works and saves in that browser only.

## Files
| File | What it is |
| --- | --- |
| `index.html` | The whole app: HTML, CSS, rules and UI. The storage section at the bottom of the script talks to Firebase. |
| `config.js` | Firebase web config, the player's User UID and the character id. An empty `apiKey` runs the page in local-only mode. |
| `firestore.rules` | Security rules: anyone reads, only the player writes. |
| `levels.js` | Level progression for both classes and Gwathfaron, and the level-up picks. |
| `sheet.js`, `sheet-prose.js`, `sheet.css` | The Sheet tab: live character sheet with worn-gear and condition toggles (saved in the same synced document). |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable PWA and offline cache. |
| `vendor/firebase-*-compat.js` | Firebase JS SDK 10.14.1 (app, auth, firestore), vendored so the app shell caches offline. |
| `data/spell-bank.json` | The wizard spell bank (also inlined in `index.html` as `BANK`). |

## Setup (one time, Firebase project `tracker-fe359`, free Spark plan)
1. **Add a web app:** Project settings (gear) > General > Your apps > the `</>` web icon. Name it anything; skip Firebase Hosting. Copy the `firebaseConfig` values into `config.js`.
2. **Turn on email sign-in:** Build > Authentication > Get started > Sign-in method > Email/Password > Enable (leave "Email link" off).
3. **Create the player's login:** Authentication > Users > Add user, with her email and a password. Copy its **User UID** into `ownerUids` in `config.js` (a list; more than one account can edit).
4. **Create the database:** Build > Firestore Database > Create database. Pick a location near you and start in **production mode**.
5. **Set the rules:** Firestore > Rules: paste `firestore.rules` (her UID is already in it) and Publish.
6. **Host it.** The included workflow deploys to GitHub Pages on every push to `main`: in the repo, Settings > Pages > Source: **GitHub Actions**. (Pages on a private repo needs a paid GitHub plan, so keep the repo public. Firebase Hosting or Netlify also work: they need no build step and serve `.` as the output folder.)
7. **Allow the site to sign in:** Authentication > Settings > Authorized domains > Add domain: your Pages host, e.g. `<user>.github.io`.
8. Send the GM the plain link. Open `<link>?edit` yourself, sign in, then Share > Add to Home Screen (iPhone) or Install app (Android).

The config values are meant to be public. The rules are what keep everyone but her from writing, so anyone can open the page but only she can change it.

## How it works
- One Firestore document per character, `trackers/daerlieth`, holds the whole state as a JSON string.
- Rules allow everyone to read and only the listed UIDs to write. The page checks the signed-in UID against `ownerUids` to unlock editing; everyone else gets the view-only mode (`.ro`).
- Saves are debounced (350 ms), and `onSnapshot` pushes them to every open page within a second.
- Firestore's offline cache (IndexedDB) keeps the last state on every device. Offline edits are queued and sent automatically when she reconnects, even after closing the app.
- The service worker serves the app network-first and falls back to its cache offline. Bump `VERSION` in `sw.js` when shipping changes if you want old caches dropped at once.

## Follow-ups
- Fill in school and duration for the ~1,000 non-Core spells in the bank (Archives of Nethys).
- More characters: add a row per character and point a copy of `config.js` (or a `?c=` parameter) at its id.
