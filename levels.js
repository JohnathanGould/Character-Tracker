/* Daerlieth Nightstar: level progression.
   Levels.prog(L) gives every number that depends on her gestalt level L (Eternal Mage L, Artillery Expert /
   Spell-less Ranger L, Companion-Bound) and on Gwathfaron's effective druid level (= L).
   Levels.choices(L) lists the picks she makes herself (feats, talents, secrets, spells, ability increases...),
   one slot per pick, for levels above 8 plus the two open feats from 5th level. Answers live in state.picks.
   Sources: Legendary Classes: Eternal Mage (Purple Duck Games), New Paths: The Expanded Spell-less Ranger
   (Kobold Press), Core Rulebook animal companion table. No DOM access, so it runs in Node for tests. */
(function (root) {
  "use strict";

  var MIN = 8, MAX = 20;
  function clampL(L) { L = Math.floor(+L || MIN); return Math.max(MIN, Math.min(MAX, L)); }
  function ord(n) { return n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"); }

  /* Eternal Mage spells known, 0th to 9th, by level */
  var KNOWN = [null,
    [4, 2, 0, 0, 0, 0, 0, 0, 0, 0], [5, 2, 0, 0, 0, 0, 0, 0, 0, 0], [5, 3, 0, 0, 0, 0, 0, 0, 0, 0], [6, 3, 1, 0, 0, 0, 0, 0, 0, 0],
    [6, 4, 2, 0, 0, 0, 0, 0, 0, 0], [7, 4, 2, 1, 0, 0, 0, 0, 0, 0], [7, 5, 3, 2, 0, 0, 0, 0, 0, 0], [8, 5, 3, 2, 1, 0, 0, 0, 0, 0],
    [8, 5, 4, 3, 2, 0, 0, 0, 0, 0], [9, 5, 4, 3, 2, 1, 0, 0, 0, 0], [9, 5, 5, 4, 3, 2, 0, 0, 0, 0], [9, 5, 5, 4, 3, 2, 1, 0, 0, 0],
    [9, 5, 5, 4, 4, 3, 2, 0, 0, 0], [9, 5, 5, 4, 4, 3, 2, 1, 0, 0], [9, 5, 5, 4, 4, 4, 3, 2, 0, 0], [9, 5, 5, 4, 4, 4, 3, 2, 1, 0],
    [9, 5, 5, 4, 4, 4, 3, 3, 2, 0], [9, 5, 5, 4, 4, 4, 3, 3, 2, 1], [9, 5, 5, 4, 4, 4, 3, 3, 3, 2], [9, 5, 5, 4, 4, 4, 3, 3, 3, 3]];

  /* Core Rulebook animal companion table by effective druid level: HD, natural armor bonus, Str/Dex bonus, bonus tricks */
  var COMP = [null,
    [2, 0, 0, 1], [3, 0, 0, 1], [3, 2, 1, 2], [4, 2, 1, 2], [5, 2, 1, 2], [6, 4, 2, 3], [6, 4, 2, 3], [7, 4, 2, 3], [8, 6, 3, 4], [9, 6, 3, 4],
    [9, 6, 3, 4], [10, 8, 4, 5], [11, 8, 4, 5], [12, 8, 4, 5], [12, 10, 5, 6], [13, 10, 5, 6], [14, 10, 5, 6], [15, 12, 6, 7], [15, 12, 6, 7], [16, 14, 7, 7]];

  /* unarmed damage (Medium) by effective monk level, Monastic Legacy = half her level */
  function unarmedDie(monk) { return monk >= 20 ? "2d10" : monk >= 16 ? "2d8" : monk >= 12 ? "2d6" : monk >= 8 ? "1d10" : monk >= 4 ? "1d8" : "1d6"; }

  /* class features by level (automatic: no choice), both sides of the gestalt and the companion */
  var FEATURES = {
    9: [["Eternal Mage", "Eternal secret (pick one)"], ["Ranger", "Evasion: no damage on a successful Reflex save for half"], ["Ranger", "Ranger talent (pick one)"]],
    10: [["Eternal Mage", "Additional school (pick one)"], ["Eternal Mage", "5th-level spells"], ["Ranger", "3rd favored enemy, +2 to one favored enemy (pick)"], ["Ranger", "Combat style feat (pick one)"], ["Ranger", "Stealth attack +1d6"], ["Ranger", "Enhanced Companion bonus feat (pick one)"]],
    11: [["Eternal Mage", "Advanced experimental spell: it may be her highest spell level, for +1 more burnout"], ["Ranger", "Quarry: +2 insight on attacks against a marked favored enemy, crits auto-confirm; Gwathfaron shares it (Companion-Bound)"], ["Ranger", "Ranger talent (pick one)"]],
    12: [["Eternal Mage", "Arcane buffer 3"], ["Eternal Mage", "6th-level spells"], ["Eternal Mage", "Eternal secret (pick one)"], ["Ranger", "Empathic Link: emotions shared with Gwathfaron up to 1 mile, +4 to track each other (replaces camouflage)"], ["Ranger", "Fast movement +20 ft in forest"]],
    13: [["Eternal Mage", "Empowered Artillery Overdrive: 2 overdrive empowers arcane artillery"], ["Ranger", "Favored terrain (forest) +2 more"], ["Ranger", "Ranger talent (pick one)"], ["Ranger", "Enhanced Companion bonus feat (pick one)"]],
    14: [["Eternal Mage", "Expanded concentration: 3 duration spells at once"], ["Eternal Mage", "7th-level spells"], ["Ranger", "Combat style feat (pick one)"], ["Ranger", "Stealth attack +1d6"]],
    15: [["Eternal Mage", "Additional school (pick one)"], ["Eternal Mage", "Eternal secret (pick one)"], ["Ranger", "4th favored enemy, +2 to one favored enemy (pick)"]],
    16: [["Eternal Mage", "Arcane buffer 4"], ["Eternal Mage", "8th-level spells"], ["Ranger", "Improved evasion: half damage even on a failed Reflex save"], ["Ranger", "Ranger talent (pick one)"], ["Ranger", "Enhanced Companion bonus feat (pick one)"]],
    17: [["Eternal Mage", "Additional experimental spell: two a day"], ["Ranger", "Hide in plain sight in forest"]],
    18: [["Eternal Mage", "Eternal secret (pick one)"], ["Eternal Mage", "9th-level spells"], ["Ranger", "Favored terrain (forest) +2 more"], ["Ranger", "Combat style feat (pick one)"], ["Ranger", "Stealth attack +1d6"]],
    19: [["Eternal Mage", "Quickened Artillery Overdrive: 4 overdrive makes arcane artillery a swift action"], ["Ranger", "Improved quarry: quarry as a free action, take 20 to track it; Gwathfaron shares it"], ["Ranger", "Ranger talent (pick one)"], ["Ranger", "Enhanced Companion bonus feat (pick one)"]],
    20: [["Eternal Mage", "Additional school (pick one)"], ["Eternal Mage", "Arcane buffer 5"], ["Eternal Mage", "True eternal casting: burnout has no effect until it reaches 20"], ["Ranger", "5th favored enemy, +2 to one favored enemy (pick)"], ["Ranger", "Master hunter"]]
  };

  function prog(L) {
    L = clampL(L);
    var row = KNOWN[L], maxSpell = 0;
    row.forEach(function (n, i) { if (n > 0) maxSpell = i; });
    var cp = COMP[L], hd = cp[0];
    var p = {
      level: L,
      bab: L,                                   /* ranger: full BAB, better than the Eternal Mage's 3/4 */
      iteratives: L >= 16 ? 4 : L >= 11 ? 3 : L >= 6 ? 2 : 1,
      save: 2 + Math.floor(L / 2),              /* gestalt: ranger good Fort/Ref, Eternal Mage good Will */
      cl: L, known: row.slice(), maxSpell: maxSpell,
      buffer: Math.floor(L / 4),
      odIgnore: Math.floor(L / 2), odBonus: Math.floor(L / 2),
      slots: 1 + (L >= 7 ? 1 : 0) + (L >= 14 ? 1 : 0),
      artLvl: Math.max(1, Math.floor(L / 2)),
      artDice: Math.min(10, 1 + Math.floor((L - 1) / 2)) + Math.floor(L / 3),
      secretBase: Math.floor(L / 2),
      expMax: L >= 11 ? maxSpell : maxSpell - 1, expCount: L >= 17 ? 2 : 1,
      stealthDice: Math.floor((L + 2) / 4) + 1,  /* +1 Improved Stealth Attack (7th) */
      forest: 2 + 2 * [8, 13, 18].filter(function (x) { return x <= L; }).length,
      fastMove: L >= 12 ? 20 : 10,
      stunUses: Math.floor(L / 4),
      unarmed: unarmedDie(Math.floor(L / 2)),
      track: Math.floor(L / 2),
      evasion: L >= 16 ? "improved" : L >= 9 ? "evasion" : "",
      pet: {
        druid: L, hd: hd, bab: Math.floor(hd * 3 / 4), good: 2 + Math.floor(hd / 2), poor: Math.floor(hd / 3),
        natBonus: cp[1], strDex: cp[2], tricks: 6 + cp[3], ranks: hd, feats: Math.ceil(hd / 2), asis: Math.floor(hd / 4),
        multiattack: L >= 9, impEvasion: L >= 15
      }
    };
    return p;
  }

  /* picks she makes herself. A slot's id is its key in state.picks. */
  var ABIL = [["str", "Str"], ["dex", "Dex"], ["con", "Con"], ["int", "Int"], ["wis", "Wis"], ["cha", "Cha"]];
  function choices(L) {
    L = clampL(L);
    var out = [];
    var add = function (lvl, id, group, label, type) { out.push({ lvl: lvl, id: id, group: group, label: label, type: type || "text" }); };
    /* her 5th-level feats are taken (Outflank, Precise Strike: sheet.js BASE_FEATS) */
    for (var l = MIN + 1; l <= L; l++) {
      if (l % 2) { add(l, "feat-" + l + "a", "Feat", "Feat (" + ord(l) + " level)"); add(l, "feat-" + l + "b", "Feat", "Feat, GM's extra (" + ord(l) + " level)"); }
      if (l % 4 === 0) add(l, "asi-" + l, "Ability", "Ability score +1", "ability");
      if ([9, 12, 15, 18].indexOf(l) >= 0) add(l, "sec-" + l, "Eternal Mage", "Eternal secret");
      if ([10, 15, 20].indexOf(l) >= 0) add(l, "sch-" + l, "Eternal Mage", "Additional school");
      if ([9, 11, 13, 16, 19].indexOf(l) >= 0) add(l, "tal-" + l, "Ranger", "Ranger talent");
      if ([10, 14, 18].indexOf(l) >= 0) add(l, "cs-" + l, "Ranger", "Combat style feat (Unarmed)");
      if ([10, 13, 16, 19].indexOf(l) >= 0) add(l, "ec-" + l, "Ranger", "Enhanced Companion feat (Greater Animal Companion, Increased Devotion, Invulnerable Animal Companion, or an animal feat for Gwathfaron)");
      if ([10, 15, 20].indexOf(l) >= 0) { add(l, "fe-" + l, "Ranger", "New favored enemy (type)"); add(l, "fep-" + l, "Ranger", "+2 to one favored enemy", "feplus"); }
      var now = KNOWN[l], before = KNOWN[l - 1];
      for (var s = 0; s <= 9; s++) for (var i = 0; i < now[s] - before[s]; i++) add(l, "sp-" + l + "-" + s + "-" + i, "Spells known", (s ? ord(s) + "-level" : "Cantrip") + " spell known");
      var hdNow = COMP[l][0], hdBefore = COMP[l - 1][0];
      if (Math.ceil(hdNow / 2) > Math.ceil(hdBefore / 2)) add(l, "pfeat-" + l, "Gwathfaron", "Feat for Gwathfaron");
      if (Math.floor(hdNow / 4) > Math.floor(hdBefore / 4)) add(l, "pasi-" + l, "Gwathfaron", "Ability score +1 for Gwathfaron", "ability");
      if (COMP[l][3] > COMP[l - 1][3]) add(l, "ptrick-" + l, "Gwathfaron", "New trick for Gwathfaron");
    }
    return out;
  }

  /* what changes going from level L-1 to L, for the level-up summary */
  function gains(L) {
    L = clampL(L);
    var a = prog(L - 1 < MIN ? MIN : L - 1), b = prog(L), g = [];
    var num = function (label, x, y, fmt) { if (x !== y) g.push([label, (fmt ? fmt(x) : x) + " → " + (fmt ? fmt(y) : y)]); };
    var plus = function (n) { return "+" + n; };
    num("Base attack bonus", a.bab, b.bab, plus);
    if (b.iteratives > a.iteratives) g.push(["Extra attack", "a " + ord(b.iteratives) + " main-hand strike at BAB " + plus(b.bab - 5 * (b.iteratives - 1))]);
    num("Base saves (Fort, Ref, Will)", a.save, b.save, plus);
    num("Caster level", a.cl, b.cl);
    num("Highest spell level", a.maxSpell, b.maxSpell, ord);
    num("Arcane buffer", a.buffer, b.buffer);
    num("Overdrive ignores up to", a.odIgnore, b.odIgnore);
    num("Overdrive pool (Cha +)", a.odBonus, b.odBonus);
    num("Duration spells at once", a.slots, b.slots);
    num("Arcane artillery dice", a.artDice, b.artDice, function (n) { return n + "d6"; });
    num("Artillery counts as a spell of level", a.artLvl, b.artLvl);
    num("Eternal secret and artillery DC base", a.secretBase, b.secretBase, function (n) { return 10 + n + " + Cha"; });
    num("Stealth attack", a.stealthDice, b.stealthDice, function (n) { return n + "d6"; });
    num("Forest bonus", a.forest, b.forest, plus);
    num("Fast movement in forest", a.fastMove, b.fastMove, function (n) { return "+" + n + " ft"; });
    num("Stunning Fist uses a day", a.stunUses, b.stunUses);
    num("Unarmed damage", a.unarmed, b.unarmed);
    num("Experimental spell up to", a.expMax, b.expMax, function (n) { return ord(n) + " level"; });
    var ap = a.pet, bp = b.pet;
    num("Gwathfaron: Hit Dice", ap.hd, bp.hd);
    num("Gwathfaron: BAB", ap.bab, bp.bab, plus);
    num("Gwathfaron: natural armor bonus", ap.natBonus, bp.natBonus, plus);
    num("Gwathfaron: Str/Dex bonus", ap.strDex, bp.strDex, plus);
    num("Gwathfaron: skill ranks", ap.ranks, bp.ranks);
    if (bp.multiattack && !ap.multiattack) g.push(["Gwathfaron: Multiattack", "claws at −2 instead of −5"]);
    if (bp.impEvasion && !ap.impEvasion) g.push(["Gwathfaron: Improved evasion", "half damage even on a failed Reflex save"]);
    return { gains: g, features: (FEATURES[L] || []).slice(), picks: choices(L).filter(function (c) { return c.lvl === L; }) };
  }

  var api = { MIN: MIN, MAX: MAX, prog: prog, choices: choices, gains: gains, clamp: clampL, ord: ord, ABIL: ABIL, FEATURES: FEATURES };
  root.Levels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
