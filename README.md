# Daerlieth Nightstar tracker

Burnout, overdrive, mythic power and concentration tracker for a Pathfinder 1e gestalt character (Eternal Mage 8 / Spell-less Ranger 8, Archmage tier 2). Rules live in `CLAUDE.md`.

- **GM:** open the site link. No account; the page updates live as the player plays.
- **Player:** open the link with `?edit` once, tap **Sign in**, and add the page to the home screen. It works offline; changes made offline sync when the phone reconnects.

It is plain static files with no build step. Opening `index.html` straight from disk still works and saves in that browser only.

## Files
| File | What it is |
| --- | --- |
| `index.html` | The whole app: HTML, CSS, rules and UI. The storage section at the bottom of the script talks to Supabase. |
| `config.js` | Supabase URL, anon key and character id. Empty values run the page in local-only mode. |
| `supabase/schema.sql` | Table, row level security, realtime and the seed row. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable PWA and offline cache. |
| `vendor/supabase.js` | supabase-js 2.45.4 UMD build, vendored so the app shell caches offline. |
| `data/spell-bank.json` | The wizard spell bank (also inlined in `index.html` as `BANK`). |

## Setup (one time)
1. **Pick a Supabase project.** A new one, or an existing project you already use: the tracker only adds one table, `public.trackers`, and touches nothing else.
2. **Sign-ups:** in a project used only for this tracker, turn them off (Authentication > Sign In / Providers > Email > "Allow new users to sign up"). In a shared project that needs sign-ups for another app, leave them on. Writes are locked to the owner's account by row level security either way, so other accounts can only view.
3. **Create the player's login:** Authentication > Users > Add user > Create new user, with her email and a password. Tick "Auto confirm user".
4. **Run the SQL:** open SQL Editor, paste `supabase/schema.sql`, replace `PLAYER_EMAIL_HERE` with her email, and run it.
5. **Fill in `config.js`** from Project Settings > API: the Project URL and the `anon` `public` key. The anon key is safe to publish; row level security means only her account can write.
6. **Host it.** Any static host works. The included workflow deploys to GitHub Pages on every push to `main`: in the repo, Settings > Pages > Source: **GitHub Actions**. (Pages on a private repo needs a paid GitHub plan; otherwise make the repo public, or use Netlify or Cloudflare Pages with no build command and `.` as the output folder.)
7. Send the GM the plain link. Open `<link>?edit` yourself, sign in, then Share > Add to Home Screen (iPhone) or Install app (Android).

## How it works
- One row per character in `public.trackers` holds the whole state as JSON.
- Everyone can `select`; only `auth.uid() = owner` can `update`. The page checks the owner on sign-in and unlocks editing; anyone else gets the existing view-only mode (`.ro`).
- Saves are debounced (350 ms) and broadcast through Supabase Realtime, so every open page updates within a second.
- A copy is kept in `localStorage`. Offline edits are flagged as pending and pushed when the device is back online. The player is the only editor, so the newest local copy wins.
- The service worker serves the app network-first and falls back to its cache offline. Bump `VERSION` in `sw.js` when shipping changes if you want old caches dropped at once.

## Follow-ups
- Fill in school and duration for the ~1,000 non-Core spells in the bank (Archives of Nethys).
- More characters: add a row per character and point a copy of `config.js` (or a `?c=` parameter) at its id.
