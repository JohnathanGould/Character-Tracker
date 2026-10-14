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
- `levels.js`: level progression. `Levels.prog(L)` gives every level-dependent number (BAB and iteratives, gestalt saves = best side, caster level, spells known and highest spell level, arcane buffer, overdrive pool/ignore, concentration slots, artillery dice and spell level, secret DC, stealth attack, forest bonus, fast movement, Stunning Fist uses, unarmed die, experimental spell level, and Gwathfaron's companion-table row). `Levels.choices(L)` lists her own picks (feats incl. the GM's extra feat at odd levels, ability increases, secrets, schools, talents, combat style, Enhanced Companion, favored enemies, spells known, Gwathfaron's feats/increases/tricks); `Levels.gains(L)` feeds the level-up dialog. Never hard-code level 8 numbers elsewhere.
- Tabs: **Daerlieth** (the tracker panels on top: clock bar, one resources panel for burnout, overdrive and mythic power (the burnout explanation opens from "How it works"), spells, cast, concentration, hit points; her sheet below; log and rules at the bottom) and **Gwathfaron** (`#gwathfaron`). `setView` toggles `body.view-pet`, which hides the tracker panels. There is no separate Tracker tab.
- Spells panel (full width, above Concentration): three pickers side by side, Known spells (`#knownSel`, `ui.knownSel`: her list plus level-up picks), Experimental (`#expSel`) and Wild Arcana (`#waSel`). All three start on "Choose a spell…" with the block below collapsed; the experimental and Wild Arcana lists leave out spells she already knows (`knownNames`). Under each is its own cast block (`castHtml(sp, col)`, col `k`/`x`/`w`): overdrive, mythic and Cast on options (Wild Arcana only in its own column, whose list leaves out spells slower than a standard action), burnout, CL, DC, damage and a Cast button. Each column keeps its own options in `ui.cols` (`withCol`), and control ids carry the column suffix (`odChk-k`...). There is no separate cast panel; the GM view shows the blocks without options or Cast buttons.
- `sheet.js`: her sheet (under the tracker panels on the Daerlieth tab). `SheetEngine.derive(state)` computes every sheet number (abilities, AC, saves, attacks, DCs, skills, load) from the tracker state plus `state.eq` (gear off when `eq[key] === false`) and `state.cond` (conditions). `SheetEngine.render` builds the markup. The tracker also calls `derive` for Cha, touch bonus, AC and the overdrive pool, so worn gear changes both tabs. Edit sheet numbers here, not in `index.html`.
- Gwathfaron tab (`#gwathfaron`): `SheetEngine.renderPet`, built from `PET` and `derivePet` in `sheet.js` (small cat companion at effective druid level 8 with Improved Animal Companion; scout build, Stealth and Perception first: Int 3, Skill Focus (Stealth), Skill Focus (Perception), Stealthy, Alertness). Renders into `#sheetView` like the Sheet tab.
- Letters of travel: `LETTERS` in `sheet.js` (Kibrat Erbetsim, five Morningglory Kingdom regions, Eniran, Ekuran, Serasole), a section after Gear and money on her sheet; picking one from the dropdown opens it in the info dialog (`letterHtml`, change listener on `select[data-letter]`, works read-only).
- `sheet-prose.js`: generated static text for the Sheet tab. Rebuild with `python3 tools/make-prose.py <printed sheet>.txt > sheet-prose.js`.
- `sheet.css`: styles for the tabs and the Sheet.
- `index.html`: all HTML, CSS and JS in one file. Keeps a local copy in `localStorage` key `ilmadria-burnout-ledger-v1` (plus an `:edit` flag).
- Storage is isolated in the storage section at the bottom of the script (`initStore`, `applyRemote`, `setUser`, `scheduleSave`, `flush`, `setReadOnly`, `setEditable`). It talks to Firebase using `config.js`; with an empty config it falls back to local-only. Everything else is pure UI and rules.
- `.ro` class on `<body>` hides every editing control (read-only mode already exists; reuse it for the GM view).
- `data/codex.json`: every Pathfinder 1e spell for every class (3,040, from The Spell Codex spreadsheet): school, levels by class, casting time, components, range, area/effect/targets, duration, save, SR, source, full text and mythic text. Loaded on demand (`loadCodex`, `codexFind`) and cached by the service worker. The "Spell text" / "i" buttons open it (`spellCard`), and the status-effect form autocompletes from it and fills type, duration (from the caster level field) and a note (`fxAutofill`).
- `data/spell-bank.json`: the wizard list, levels 1 to 9 (1,862 spells) with school, duration code and flags (F fire, L casting time over a standard action), inlined in `index.html` as `BANK` for the experimental spell and Wild Arcana pickers (`#expSel`, `#waSel`: both list the bank by level up to what she can cast). Both files are rebuilt with `python3 -I tools/make-codex.py <The_Spell_Codex.xlsx>`, which also rewrites the inline `BANK`.

## State (one JSON document)
`v, round, level, burnout, gained, overdrive, mythic, lightUsed, hp, petHp, stun, eq, cond, fx, picks, hpRolls, ranks, petRanks, vials, strDmg, blood, exp, active[], pending[], log[]`
- `active[]`: `{id, name, cast, end (null = open-ended), total, on}`, max 2 entries. `on` is who the spell is on: `her` (default), `pet` or `ally` (Cast on, in the cast panel). Only spells on her change her sheet numbers.
- `pending[]`: Detonate reminders `{id, name, fire, text}`.
- `cond.atk` (`std` | `charge` | `aoo`, absent = full attack) and `cond.hands` (`one`, absent = two weapons): the attack picker on her tab; the Attacks table shows only that combination.
- `cond.flank` (flanking: +2 melee for both, turns on her stealth attack), `cond.art` (`sniper` | `burst`, absent = touch) and `cond.artD8` (artillery picker on her tab), `cond.petAtk` (`std` | `charge` | `aoo`, absent = full attack; Gwathfaron's picker).
- `fx`: status effects `{her: [], pet: []}`, each `{id, name, from, kind: good|bad, left (rounds, null = until removed), note}`. Entered in each sheet's Status effects panel and listed (with End) under Concentration; reminders only; `left` counts down each round and the effect drops at 0; times show as hours, minutes and rounds (`fxLeft`). Pass time (1 min / 10 min / 1 hour, under Concentration) advances that many rounds at once (`passTime`): effects and spells count down and burnout recovers 1 per round.
- `level` (8 to 20, default 8): set by Level up / Undo on her tab. `hpRolls` {level: d10 roll} for levels above 8 (HP = 82 + roll + Con each). `picks` {choice id: text or ability key}: her level-up picks; `asi-*` and `pasi-*` (ability increases) and `fep-*` (+2 to a favored enemy) change numbers, a feat named Greater Two-Weapon Fighting adds its strike, spells known (`sp-<level>-<spell level>-<n>`) search that level's wizard spells (`#wizL0`..`#wizL9` datalists, built from the codex) and join her castable list (`knownSpells`), the rest are records. `ranks` / `petRanks`: skill ranks once new ones are placed (rank buttons show only while ranks are unplaced).
- `exp`: experimental spell id (empty = no pick yet, a preset id such as `haste`, or a `b-...` bank id), up to `Levels.prog(L).expMax`.

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
- **Hit points.** Daerlieth 82 max; Hard to Kill: stabilizes below 0, dies at -32 (twice Con 16). Gwathfaron (panther companion) 50 max, dies at -15. New day heals 8 and 7 (natural healing).
- **Stunning Fist** 2/day, refills on New day. **Mythic Surge** (+1d6 to a d20) and **Amazing Initiative** (extra standard action, no spells or artillery) each cost 1 mythic power.
- **Mythic spells** (Mythic Spell Lore): fireball (d10s, burning 2d6/round on a failed save) and dimension door (one-way portal for up to CL allies), +1 mythic power each.
- Ranged touch +14 (BAB 8 + Dex 6). Dimension door carries 1 willing Medium or smaller creature per 3 CL (2 at CL 8).
- Strength buttons act on the score: "Strength -1" adds Strength damage, "+1" heals it.

## Open rulings for the GM (no longer shown on the page)
Whether Detonate counts as a fire spell, whether cantrips with durations use a concentration slot, whether Wild Arcana may use spells outside her focus schools (Evocation, Abjuration, Transmutation, plus Conjuration proposed), and whether Blood Money's blood replaces both Detonate vials.

## Suggested stack
Static hosting plus a small realtime store (Firebase, Supabase or Cloudflare Durable Objects). One document per character. Writes require auth; reads are public. Keep `index.html` working without a build step if you can.
