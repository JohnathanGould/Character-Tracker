# Daerlieth Nightstar tracker: build brief

This folder is a working single-file tracker (`index.html`) for a Pathfinder 1e gestalt character: Eternal Mage 8 (Artillery Expert) / Spell-less Ranger 8, mythic Archmage tier 2. The player is the only editor. Her GM only needs to view.

## Status
The hosted version is built: Firebase (Firestore document `trackers/{characterId}`, security rules in `firestore.rules`), email/password sign-in for the player, public live view for the GM, PWA with offline edits that sync on reconnect. Setup steps are in `README.md`.

## Goal
Turn it into a hosted web app:
1. Public read-only link for the GM. No account needed to view.
2. Editing locked to the player (login, or a secret edit link).
3. Live shared state, so the GM sees changes as she makes them.
4. Installable on a phone (PWA, works offline for the editor, syncs when back online).
Keep the look (black background, silver-blue accent, Marcellus / Albert Sans / IBM Plex Mono) and every rule below.

## What exists
- `index.html`: all HTML, CSS and JS in one file. Keeps a local copy in `localStorage` key `ilmadria-burnout-ledger-v1` (plus an `:edit` flag).
- Storage is isolated in the storage section at the bottom of the script (`initStore`, `applyRemote`, `setUser`, `scheduleSave`, `flush`, `setReadOnly`, `setEditable`). It talks to Firebase using `config.js`; with an empty config it falls back to local-only. Everything else is pure UI and rules.
- `.ro` class on `<body>` hides every editing control (read-only mode already exists; reuse it for the GM view).
- `data/spell-bank.json`: 1,192 wizard spells, levels 1 to 4 (names, levels, summaries). The same data is inlined in `index.html` as `BANK`. School and duration are recorded only for about 170 Core Rulebook spells; the rest are `?`. Filling those gaps from a source such as Archives of Nethys is a good follow-up.

## State (one JSON document)
`v, round, burnout, gained, overdrive, mythic, lightUsed, vials, strDmg, blood, exp, active[], pending[], log[]`
- `active[]`: `{id, name, cast, end (null = open-ended), total}`, max 2 entries.
- `pending[]`: Detonate reminders `{id, name, fire, text}`.
- `exp`: experimental spell id (`haste` default, or a `b-...` bank id, level 3 or lower).

## Rules the tracker encodes
- Character: caster level 8, Cha 22 (+6), concentration +14.
- **Eldritch burnout.** A cast of 1st level or higher gains `spell level - 2` (arcane buffer, minimum 0), +1 if it is the experimental spell. Orisons gain none. Arcane artillery counts as 4th level (2). Each point is -1 CL. Every 2 points is -1 DC and -1d6 artillery damage. At the end of any round with no burnout gained, recover 1. At CL 0 only orisons can be cast. "No cast" passes a round and recovers 1.
- **Arcane overdrive**, pool 10. Spend 1 (free action) to ignore up to 4 burnout from one cast. Artillery overdrive is a separate 1-point spend (d6 to d8). Refills after 8 hours of sleep ("New day").
- **Limited concentration.** 2 durational spells at once. A third ends the oldest. Detonate holds a slot until it goes off.
- **Experimental spell.** One pick per day from the whole sorcerer/wizard list (any school, focus or not), any level below her highest castable (so up to 3rd at 8th level), +1 burnout. At 11th level it may be her highest level for +1 more burnout; at 17th she gets a second one.
- **Mythic.** 7 power per day. Wild Arcana costs 1, is a standard action (per the Mythic Adventures FAQ), casts any spell on her list, known or not, with casting time 1 standard action or less, and gives +2 CL. Elemental Bond (fire) gives +2 CL to fire-descriptor spells and fire resistance 10. Eldritch Breach rolls caster level checks twice.
- **Blood Money** is a swift action: 1d6 damage, and blood replaces one material component this round. Components over 1 gp cost 1 Strength damage plus 1 per full 500 gp.
- **Detonate**: costs 50 gp in vials, max 10d8, holds a concentration slot for 1 round.
- Top bar order: Reset, No cast, Cast spell, New day. Reset clears concentration. New day needs two taps.
- Strength buttons act on the score: "Strength -1" adds Strength damage, "+1" heals it.

## Open rulings for the GM (no longer shown on the page)
Whether Detonate counts as a fire spell, whether cantrips with durations use a concentration slot, whether Wild Arcana may use spells outside her focus schools (Evocation, Abjuration, Transmutation, plus Conjuration proposed), and whether Blood Money's blood replaces both Detonate vials.

## Suggested stack
Static hosting plus a small realtime store (Firebase, Supabase or Cloudflare Durable Objects). One document per character. Writes require auth; reads are public. Keep `index.html` working without a build step if you can.
