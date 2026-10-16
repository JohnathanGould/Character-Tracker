/* Daerlieth Nightstar: live character sheet engine.
   derive(state) turns the tracker state (burnout, strength damage, active spells, worn gear in state.eq, conditions in state.cond)
   into every number on the sheet. render(state, opts) returns the sheet markup. No DOM access, so it also runs in Node for tests.
   An item is worn unless state.eq[key] === false. A condition is on when state.cond[key] is truthy. */
(function (root) {
  "use strict";

  var BASE = { str: 16, dex: 20, con: 16, int: 18, wis: 18, cha: 20 }; /* before items; Int includes the Tier 2 mythic +2 */
  var TIER = 2;
  /* level-dependent numbers come from levels.js (Levels.prog); state.level defaults to 8 */
  function LV() { return root.Levels; }
  function levelOf(st) { return LV() ? LV().clamp(st && st.level) : 8; }
  function progOf(st) { return LV().prog(levelOf(st)); }
  function picksOf(st) { return (st && st.picks && typeof st.picks === "object") ? st.picks : {}; }
  /* ability increases picked at level-up (4th and 8th are already in BASE) */
  function asiBonus(st, prefix, k) {
    var n = 0, pk = picksOf(st);
    Object.keys(pk).forEach(function (id) { if (id.indexOf(prefix) === 0 && pk[id] === k) n++; });
    return n;
  }
  /* favored enemies: elf +4 and undead +2 at 8th, new ones at 10/15/20, each +2 pick raises one by 2 */
  function favoredEnemies(st) {
    var pk = picksOf(st), L = levelOf(st);
    var list = [{ k: "elf", name: "Elf or drow", b: 4 }, { k: "undead", name: "Undead", b: 2 }];
    [10, 15, 20].forEach(function (l) { if (l <= L) list.push({ k: "fe-" + l, name: pk["fe-" + l] || "New favored enemy (" + l + "th)", b: 2 }); });
    [10, 15, 20].forEach(function (l) {
      if (l > L) return;
      var to = pk["fep-" + l];
      list.forEach(function (f) { if (f.k === to) f.b += 2; });
    });
    return list;
  }
  function feBonus(st, key) { var f = favoredEnemies(st).filter(function (x) { return x.k === key; })[0]; return f ? f.b : 0; }
  /* hit points: 82 at 8th, then her d10 roll + Con per level (favored class bonus goes to skills) */
  function hpMaxOf(st, conMod) {
    var L = levelOf(st), rolls = (st && st.hpRolls) || {}, hp = 82;
    for (var l = 9; l <= L; l++) hp += Math.max(1, (+rolls[l] || 6) + conMod);
    return hp;
  }
  /* she has taken Greater Two-Weapon Fighting if any feat pick names it */
  /* feats taken before the tracker's level-up picks (her 5th-level slots), plus any level-up pick */
  var BASE_FEATS = ["Outflank", "Precise Strike"];
  /* her Unarmed combat style feats so far (Combat Reflexes replaced Stunning Fist at 6th) */
  var STYLE_FEATS = ["Monastic Legacy", "Combat Reflexes"];
  function hasFeat(st, name) {
    var pk = picksOf(st), re = new RegExp(name, "i");
    return BASE_FEATS.concat(STYLE_FEATS).some(function (f) { return re.test(f); }) || Object.keys(pk).some(function (id) { return /^(feat|cs)-/.test(id) && re.test(String(pk[id])); });
  }
  /* teamwork with Gwathfaron (Coordinated Companion gives him her teamwork feats): Outflank makes flanking +4, Precise Strike adds 1d6 */
  function flankBonus(st) { return hasFeat(st, "Outflank") ? 4 : 2; }
  function precise(st) { return hasFeat(st, "Precise Strike"); }
  /* who she (or Gwathfaron) flanks with: a teamwork feat only counts when the partner has it too.
     cond.flank is hers, cond.petFlank his: "" not flanking, plain (+2), out (partner with Outflank), prec (partner with
     Precise Strike), both (partner with both: Gwathfaron for her, Daerlieth for him). An old true reads as both. */
  var FLANK_MODES = ["plain", "out", "prec", "both"];
  function flankMode(c, who) {
    var v = (c || {})[who === "pet" ? "petFlank" : "flank"];
    var m = v === true ? "both" : FLANK_MODES.indexOf(v) >= 0 ? v : "";
    /* Coordinated Companion: he has her teamwork feats only with her, so with anyone else it is a plain flank */
    return who === "pet" && (m === "out" || m === "prec") ? "plain" : m;
  }
  function flankAtk(st, mode) { return !mode ? 0 : (mode === "out" || mode === "both") && hasFeat(st, "Outflank") ? 4 : 2; }
  function flankPrec(st, mode) { return (mode === "prec" || mode === "both") && precise(st); }
  function flankLabel(mode, who) {
    return { plain: "flanking", out: "flanking with an Outflank ally", prec: "flanking with a Precise Strike ally", both: who === "pet" ? "flanking with Daerlieth" : "flanking with Gwathfaron" }[mode] || "";
  }
  function flankSeg(st, who) {
    var c = st.cond || {}, m = flankMode(c, who), k = who === "pet" ? "petFlank" : "flank", out = hasFeat(st, "Outflank"), ps = precise(st);
    var sub = function (md) { var b = flankAtk(st, md), pr = flankPrec(st, md); return "+" + b + " melee" + (pr ? ", +1d6 precision" : ""); };
    return '<div class="seg" role="group" aria-label="Flanking">' +
      tg("cond", k, "Not flanking", !m, "", "") +
      tg("cond", k, who === "pet" ? "Flanking with another ally" : "Flanking", m === "plain", "+2 melee" + (who === "pet" ? ": her teamwork feats work only with her" : ", no teamwork feat; any flank turns on her stealth attack in forest or vs a favored enemy"), "plain") +
      (out && who !== "pet" ? tg("cond", k, "With an Outflank ally", m === "out", sub("out"), "out") : "") +
      (ps && who !== "pet" ? tg("cond", k, "With a Precise Strike ally", m === "prec", sub("prec"), "prec") : "") +
      (out && ps ? tg("cond", k, who === "pet" ? "With Daerlieth" : "With Gwathfaron", m === "both", sub("both") + (who === "pet" ? " (her Outflank and Precise Strike)" : " for both (or an ally with both feats)"), "both") : "") +
      (who === "pet" && (out || ps) ? '<p class="hint">Coordinated Companion: her teamwork feats are his only while he is within 30 ft of her and aware of her, and only when he works with her, not with other allies.</p>' : "") +
      "</div>";
  }
  var LOAD = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 230, 260, 300, 350, 400, 460, 530, 610, 700, 800, 920, 1040, 1200, 1380];

  /* gear that can come off. wt counts toward her load only while it is worn. */
  var ITEMS = [
    { k: "shirt", name: "+1 mithral chain shirt", slot: "Armor", wt: 12.5, fx: "+5 armor, max Dex +6 to AC, 10% arcane spell failure" },
    { k: "wrap", name: "+1 bodywrap of mighty strikes", slot: "Body", wt: 1, fx: "+1 attack and damage on 2 unarmed strikes a round" },
    { k: "cloak", name: "Cloak of resistance +3", slot: "Shoulders", wt: 1, fx: "+3 resistance bonus on Fort, Ref and Will" },
    { k: "belt", name: "Belt of incredible dexterity +2", slot: "Belt", wt: 1, fx: "+2 enhancement to Dex" },
    { k: "band", name: "Headband of alluring charisma +2", slot: "Headband", wt: 1, fx: "+2 enhancement to Cha" },
    { k: "amulet", name: "Amulet of natural armor +2", slot: "Neck", wt: 0, fx: "+2 natural armor" }
  ];
  var FIXED_WT = 5; /* handy haversack, 5 lb however full */

  var CONDS = {
    forest: "In forest (favored terrain)",
    charge: "Charging",
    ffoot: "Flat-footed",
    sneak: "Target flat-footed (denied Dex)",
    flank: "Flanking",
    shaken: "Shaken",
    sickened: "Sickened",
    fatigued: "Fatigued",
    exhausted: "Exhausted",
    evil: "Attacker is evil"
  };

  function mod(n) { return Math.floor((n - 10) / 2); }
  function sg(n) { return (n >= 0 ? "+" : "−") + Math.abs(n); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function maxLoad(score) {
    if (score <= 0) return 0;
    if (score <= 29) return LOAD[score];
    return LOAD[score - 10] * 4;
  }
  function ceil5(n) { return Math.ceil(n / 5) * 5; }
  /* "10 + 5 armor + 6 Dex": zero terms are dropped, the first term keeps its sign off. */
  function parts(list) {
    var out = [];
    list.forEach(function (p) {
      if (!p[1]) return;
      out.push((out.length ? (p[1] < 0 ? "− " + Math.abs(p[1]) : "+ " + p[1]) : String(p[1])) + " " + p[0]);
    });
    return out.join(" ").replace(/ +/g, " ");
  }

  /* skills: key ability, ranks, class skill, trained only, background. Ranks are the table in the printed sheet. */
  var SKILLS = [
    ["Acrobatics", "dex", 5, 1, 0, 0, 1], ["Bluff", "cha", 1, 0, 0, 0], ["Climb", "str", 1, 1, 0, 0, 1], ["Diplomacy", "cha", 8, 1, 0, 0],
    ["Disable Device", "dex", 8, 0, 1, 0], ["Disguise", "cha", 0, 0, 0, 0], ["Escape Artist", "dex", 0, 0, 0, 0, 1], ["Fly", "dex", 1, 1, 0, 0, 1],
    ["Heal", "wis", 1, 1, 0, 0], ["Intimidate", "cha", 1, 1, 0, 0], ["Knowledge (arcana)", "int", 3, 1, 1, 0], ["Knowledge (dungeoneering)", "int", 3, 1, 1, 0],
    ["Knowledge (nature)", "int", 3, 1, 1, 0], ["Knowledge (religion)", "int", 3, 1, 1, 0], ["Perception", "wis", 8, 1, 0, 0], ["Ride", "dex", 1, 1, 0, 0, 1],
    ["Sense Motive", "wis", 8, 1, 0, 0], ["Spellcraft", "int", 8, 1, 1, 0], ["Stealth", "dex", 8, 1, 0, 0, 1], ["Survival", "wis", 8, 1, 0, 0],
    ["Swim", "str", 1, 1, 0, 0, 1], ["Use Magic Device", "cha", 8, 1, 1, 0],
    ["Appraise", "int", 1, 1, 0, 1], ["Artistry", "int", 0, 1, 0, 1], ["Craft", "int", 0, 1, 0, 1], ["Handle Animal", "cha", 6, 1, 1, 1],
    ["Knowledge (history)", "int", 3, 1, 1, 1], ["Linguistics", "int", 4, 1, 1, 1], ["Lore", "int", 1, 1, 0, 1], ["Perform", "cha", 0, 0, 0, 1],
    ["Profession", "wis", 0, 1, 1, 1], ["Sleight of Hand", "dex", 1, 0, 1, 1, 1]
  ];
  /* her ranks: state.ranks {skill: n} once she places new ranks at level-up, else the printed sheet's */
  function ranksOf(st) {
    var r = {}, saved = st && st.ranks;
    SKILLS.forEach(function (s) { r[s[0]] = saved && typeof saved === "object" && saved[s[0]] != null ? Math.max(0, Math.floor(+saved[s[0]] || 0)) : s[2]; });
    return r;
  }
  /* the subject of a skill that needs one, shown with its name (the name stays the key for ranks and rules text) */
  var SKILL_LABEL = { "Lore": "Lore (Cormanthyr)" };
  var UNUSABLE = ["Knowledge (local)", "Knowledge (planes)", "Knowledge (engineering)", "Knowledge (geography)", "Knowledge (nobility)"];


  /* ---------- Gwathfaron ----------
     Core Rulebook "Cat, small" (leopard) companion, Medium after its 4th-level advancement. His effective druid level
     is her level; HD, BAB, saves, natural armor, Str/Dex bonus, skill ranks, feats and tricks follow the companion
     table (Levels.prog(L).pet). Improved Animal Companion (her Enhanced Companion feat): +1d8 hp, +1 Dex, +2 natural.
     Build (an all-round scout: Stealth and Perception lead, every useful skill trained): the HD 4 ability increase to Int
     (2 to 3, which lets him take any feat he can use); feats Skill Focus (Stealth), Skill Focus (Perception),
     Cunning (+1 rank per Hit Die), Alertness;
     14 ranks at 7 HD: Stealth 4, Perception 3, Survival 2, Escape Artist 1, Intimidate 1, Climb 1, Swim 1, Acrobatics 1. Later increases, feats and ranks are her level-up picks. */
  var PET = {
    dead: 15, nat: 1, speed: 50,
    base: { str: 12, dex: 21, con: 13, int: 2, wis: 12, cha: 6 },        /* small cat */
    adv4: { str: 4, dex: -2, con: 2 },                                      /* 4th-level advancement, Medium */
    feats: ["Skill Focus (Stealth)", "Skill Focus (Perception)", "Cunning", "Alertness"],
    /* name, ability, ranks at 7 HD, class skill, misc [label, value] */
    skills: [
      ["Acrobatics", "dex", 1, 1, [["speed 50 ft, jumping only", 0]]], ["Climb", "str", 1, 1, []], ["Escape Artist", "dex", 1, 1, []],
      ["Intimidate", "cha", 1, 1, []], ["Perception", "wis", 3, 1, [["Skill Focus", 3], ["Alertness", 2]]], ["Sense Motive", "wis", 0, 0, [["Alertness", 2]]], ["Stealth", "dex", 4, 1, [["Skill Focus", 3]]],
      ["Survival", "wis", 2, 1, []], ["Swim", "str", 1, 1, []]
    ]
  };
  /* his ranks: state.petRanks once new ranks are placed at level-up, else the 7-HD build */
  function petRanks(st) {
    var r = {}, saved = st && st.petRanks;
    PET.skills.forEach(function (s) { r[s[0]] = saved && typeof saved === "object" && saved[s[0]] != null ? Math.max(0, Math.floor(+saved[s[0]] || 0)) : s[2]; });
    return r;
  }
  /* is haste on her ("her") or Gwathfaron ("pet")? Her own haste, however she cast it (known, experimental, Wild Arcana),
     or a Haste status effect someone else put on them. Haste targets one creature per level, so when she hastes
     herself Gwathfaron is counted too; cast on him alone it is his only. */
  function hastedOn(st, who) {
    var isH = function (n) { return /^haste\b/i.test(String(n || "")); };
    var mine = (st.active || []).some(function (a) { var on = a.on || "her"; return isH(a.name) && (on === who || (who === "pet" && on === "her")); });
    var fx = ((st.fx || {})[who] || []).some(function (e) { return isH(e.name) && e.kind !== "bad"; });
    return mine || fx;
  }

  function derivePet(c, tgt, ranksBy, st) {
    st = st || {};
    var cp = progOf(st).pet, hd = cp.hd, pk = picksOf(st);
    ranksBy = ranksBy || petRanks(st);
    var ab = {}, abParts = {};
    Object.keys(PET.base).forEach(function (k) {
      var parts_ = [["small cat", PET.base[k]]];
      if (PET.adv4[k]) parts_.push(["4th-level advancement", PET.adv4[k]]);
      if ((k === "str" || k === "dex") && cp.strDex) parts_.push(["companion Str/Dex bonus", cp.strDex]);
      if (k === "int") parts_.push(["ability score increase (4 HD)", 1]);
      if (k === "dex") parts_.push(["Improved Animal Companion", 1]);
      var extra = asiBonus(st, "pasi-", k);
      if (extra) parts_.push(["later ability increases", extra]);
      abParts[k] = parts_;
      ab[k] = parts_.reduce(function (t, x) { return t + x[1]; }, 0);
    });
    var m = {}; Object.keys(ab).forEach(function (k) { m[k] = mod(ab[k]); });
    var natT = PET.nat + cp.natBonus + 2;
    var hpMax = Math.floor(hd * 4.5 + hd * m.con + 4.5);
    var pf = c.forest ? progOf(st).forest : 0, hs = hastedOn(st, "pet") ? 1 : 0;
    var p = { haste: !!hs, speed: 50 + (hs ? 30 : 0), ab: ab, abParts: abParts, m: m, forest: pf, tgt: tgt, hpMax: hpMax, dead: ab.con, hd: hd, bab: cp.bab, nat: natT, cp: cp };
    p.init = m.dex + pf;
    p.ac = 10 + m.dex + natT + hs; p.touch = 10 + m.dex + hs; p.ff = 10 + natT; /* haste: +1 dodge, lost when flat-footed */
    p.fort = cp.good + m.con; p.ref = cp.good + m.dex + hs; p.will = cp.poor + m.wis;
    var pfm = flankMode(c, "pet"), fl = flankAtk(st, pfm), sec2 = cp.multiattack ? 2 : 5;
    p.flank = fl; p.flankMode = pfm; p.flankPrec = flankPrec(st, pfm); p.secPen = sec2;
    p.bite = cp.bab + m.str + tgt + fl + hs; p.biteD = m.str + tgt;
    p.claw = cp.bab + m.str - sec2 + tgt + fl + hs; p.clawD = Math.floor(m.str / 2) + tgt; /* secondary attacks */
    p.cmb = cp.bab + m.str; p.cmd = 10 + cp.bab + m.str + m.dex;
    p.skills = PET.skills.map(function (s) {
      var name = s[0], key = s[1], ranks = ranksBy[name] || 0, misc = s[4].slice();
      if (name === "Perception" || name === "Stealth" || name === "Survival") { if (pf) misc.push(["forest", pf]); }
      if ((name === "Perception" || name === "Survival") && tgt) misc.push(["favored enemy", tgt]);
      var cls = ranks && s[3] ? 3 : 0, mv = 0; misc.forEach(function (x) { mv += x[1]; });
      return { name: name, key: key, ranks: ranks, abil: m[key], cls: cls, misc: mv, total: ranks + m[key] + cls + mv,
        tip: parts([["ranks", ranks], [key[0].toUpperCase() + key.slice(1), m[key]], ["class skill", cls]].concat(misc)).replace(/^ /, "") };
    });
    p.ranksUsed = 0; p.skills.forEach(function (s) { p.ranksUsed += s.ranks; });
    p.cunning = PET.feats.indexOf("Cunning") >= 0 || Object.keys(pk).some(function (id) { return /^pfeat-/.test(id) && /^cunning$/i.test(String(pk[id]).trim()); });
    p.ranksMax = cp.ranks + (p.cunning ? hd : 0); /* Cunning: +1 rank per Hit Die */
    p.feats = PET.feats.concat(Object.keys(pk).filter(function (id) { return /^pfeat-/.test(id) && pk[id]; }).map(function (id) { return pk[id]; }));
    var fe = tgt ? [["favored enemy", tgt]] : [], hsT = hs ? [["haste", 1]] : [];
    p.t = {
      hp: (hd * 4.5) + " (" + hd + "d8 average) + " + hd * m.con + " Con (" + sg(m.con) + " × " + hd + " HD) + 4.5 (1d8 Improved Animal Companion) = " + hpMax,
      ac: how([["base", 10], ["Dex", m.dex], ["natural, small cat", 1], ["natural, companion table", cp.natBonus], ["natural, Improved Animal Companion", 2]].concat(hs ? [["dodge, haste", 1]] : [])) + " = " + p.ac,
      touch: how([["base", 10], ["Dex", m.dex]].concat(hs ? [["dodge, haste", 1]] : [])) + " = " + p.touch,
      ff: how([["base", 10], ["natural armor", natT]]) + " = " + p.ff + " (loses Dex)",
      init: how([["Dex", m.dex], ["forest", pf]]) + " = " + sg(p.init),
      fort: how([["base save (companion, " + hd + " HD)", cp.good], ["Con", m.con]]) + " = " + sg(p.fort),
      ref: how([["base save (companion, " + hd + " HD)", cp.good], ["Dex", m.dex]].concat(hsT)) + " = " + sg(p.ref) + ". " + (cp.impEvasion ? "Improved evasion" : "Evasion"),
      will: how([["base save (companion, " + hd + " HD)", cp.poor], ["Wis", m.wis]]) + " = " + sg(p.will) + ". Devotion: +4 morale vs enchantment",
      bite: how([["BAB", cp.bab], ["Str", m.str]].concat(fe).concat(fl ? [["flanking", fl]] : []).concat(hsT)) + " = " + sg(p.bite) + ". Damage 1d6 " + how([["Str", m.str]].concat(fe), " ").trim() + ". On a hit: free trip, CMB " + sg(cp.bab + m.str),
      claw: how([["BAB", cp.bab], ["Str", m.str], [cp.multiattack ? "secondary attack (Multiattack)" : "secondary attack", -sec2]].concat(fe).concat(fl ? [["flanking", fl]] : []).concat(hsT)) + " = " + sg(p.claw) + ". Damage 1d3 " + how([["half Str", Math.floor(m.str / 2)]].concat(fe), " ").trim(),
      cmb: "CMB " + how([["BAB", cp.bab], ["Str", m.str]]) + " = " + sg(p.cmb) + ". CMD " + how([["base", 10], ["BAB", cp.bab], ["Str", m.str], ["Dex", m.dex]]) + " = " + p.cmd + ", +4 vs trip (four legs)"
    };
    p.ab_t = {};
    Object.keys(abParts).forEach(function (k) {
      p.ab_t[k] = abParts[k].map(function (x, i) { return (i ? (x[1] < 0 ? "− " : "+ ") + Math.abs(x[1]) : x[1]) + " (" + x[0] + ")"; }).join(" ") + " = " + ab[k] + ", mod " + sg(m[k]);
    });
    p.stealth = p.skills.filter(function (s) { return s.name === "Stealth"; })[0].total;
    p.perc = p.skills.filter(function (s) { return s.name === "Perception"; })[0].total;
    p.t.stealth = p.skills.filter(function (s) { return s.name === "Stealth"; })[0].tip + " = " + sg(p.stealth);
    p.t.perc = p.skills.filter(function (s) { return s.name === "Perception"; })[0].tip + " = " + sg(p.perc);
    return p;
  }

  function derive(st) {
    st = st || {};
    var eq = st.eq || {}, c = st.cond || {};
    var worn = function (k) { return eq[k] !== false; };
    /* only her own spells on herself change her numbers (a.on is "pet" or "ally" for spells cast on others) */
    var act = function (id) { return (st.active || []).some(function (a) { return a.id === id && (!a.on || a.on === "her"); }); };
    var burn = Math.max(0, st.burnout || 0), dcP = Math.floor(burn / 2);
    var haste = hastedOn(st, "her"), er = act("expeditious-retreat"), cg = act("exp-cats-grace");
    var longArm = (st.active || []).some(function (a) { return /^long arm\b/i.test(a.name) && (!a.on || a.on === "her"); });
    var shieldSp = act("shield"), pfe = act("exp-protection-from-evil"), fly = act("exp-fly");
    var pen = c.exhausted ? 6 : c.fatigued ? 2 : 0;
    var L = levelOf(st), P = progOf(st), BAB = P.bab, LEVEL = L;
    var tgt = c.target ? feBonus(st, c.target) : 0;
    var d = { notes: [], c: c, level: L, prog: P };

    /* abilities */
    var ab = {};
    ["str", "dex", "con", "int", "wis", "cha"].forEach(function (k) {
      var o = { base: BASE[k] + asiBonus(st, "asi-", k), item: 0, dmg: 0, pen: 0 };
      if (k === "dex") { o.item = Math.max(worn("belt") ? 2 : 0, cg ? 4 : 0); }
      if (k === "cha") { o.item = worn("band") ? 2 : 0; }
      if (k === "str") { o.dmg = Math.max(0, st.strDmg || 0); }
      if (k === "str" || k === "dex") o.pen = pen;
      o.score = Math.max(0, o.base + o.item - o.dmg - o.pen);
      o.mod = o.score === 0 ? -5 : mod(o.score);
      ab[k] = o;
    });
    d.ab = ab;
    var S = ab.str.mod, D = ab.dex.mod, CO = ab.con.mod, W = ab.wis.mod, CH = ab.cha.mod;

    /* weight and load */
    var wt = FIXED_WT;
    ITEMS.forEach(function (i) { if (worn(i.k)) wt += i.wt; });
    var mx = maxLoad(ab.str.score);
    var light = Math.floor(mx / 3), med = Math.floor(mx * 2 / 3);
    var cat = wt <= light ? 0 : wt <= med ? 1 : wt <= mx ? 2 : 3;
    d.load = { wt: wt, light: light, med: med, max: mx, lift: mx * 2, push: mx * 5, cat: ["Light", "Medium", "Heavy", "Overloaded"][cat],
      maxDex: [99, 3, 1, 0][cat], acp: [0, 3, 6, 6][cat] };

    /* armor class */
    var armor = worn("shirt") ? 5 : 0, spellFail = worn("shirt") ? 10 : 0;
    var cap = Math.min(worn("shirt") ? 6 : 99, d.load.maxDex);
    var dexAc = Math.min(D, cap);
    var acroRanks = ranksOf(st).Acrobatics || 0;
    var dodge = (haste ? 1 : 0) + (c.defend === "fight" ? (acroRanks >= 3 ? 3 : 2) : c.defend === "total" ? (acroRanks >= 3 ? 6 : 4) : 0);
    var shieldB = shieldSp ? 4 : 0, nat = worn("amulet") ? 2 : 0;
    var defl = pfe && c.evil ? 2 : 0, chg = c.charge ? -2 : 0;
    d.ac = { armor: armor, shield: shieldB, dex: dexAc, nat: nat, dodge: dodge, defl: defl, chg: chg, cap: cap, capped: D > cap };
    d.ac.full = 10 + armor + shieldB + dexAc + nat + dodge + defl + chg;
    d.ac.touch = 10 + dexAc + dodge + defl + chg;
    d.ac.ffDex = Math.min(0, dexAc);
    d.ac.ff = 10 + armor + shieldB + d.ac.ffDex + nat + defl + chg;
    d.ac.now = c.ffoot ? d.ac.ff : d.ac.full;
    d.ac.text = parts([["", 10], ["armor", armor], ["shield spell", shieldB], ["Dex", dexAc], ["natural", nat], ["dodge", dodge], ["deflection", defl], ["charging", chg]]).replace(/^10 /, "10 ");
    d.spellFail = spellFail;

    /* saves */
    var cloak = worn("cloak") ? 3 : 0, sp2 = (c.shaken ? 2 : 0) + (c.sickened ? 2 : 0);
    d.save = {
      base: P.save, fort: P.save + CO + cloak - sp2, ref: P.save + D + cloak - sp2 + (haste ? 1 : 0), will: P.save + W + cloak - sp2,
      cloak: cloak, status: -sp2, haste: haste ? 1 : 0
    };

    /* initiative, speed */
    d.init = D + 2 + TIER + (c.forest ? P.forest : 0);
    var spd = 35 + (c.forest ? P.fastMove : 0) + (haste || er ? 30 : 0);
    if (cat >= 1) spd = ceil5(spd * 2 / 3);
    if (c.exhausted) spd = Math.floor(spd / 2 / 5) * 5;
    d.speed = spd; d.fly = fly ? 60 : 0;
    d.noCharge = !!(c.fatigued || c.exhausted);

    /* attacks */
    var fin = Math.max(S, D), stat = -sp2;
    var defAtk = c.defend === "fight" ? -4 : 0;
    var hasteAtk = haste ? 1 : 0;
    var fm = flankMode(c, "her"), flank = flankAtk(st, fm); /* flanking: +2 on melee attacks, +4 when both have Outflank */
    var common = BAB + fin + 1 + tgt + hasteAtk + defAtk + stat + flank;
    var half = S > 0 ? Math.floor(S / 2) : S;
    var dmgM = S + tgt - (c.sickened ? 2 : 0), dmgO = half + tgt - (c.sickened ? 2 : 0);
    var wrap = worn("wrap") ? 1 : 0;
    var offN = hasFeat(st, "greater two-weapon") ? 3 : 2; /* Two-Weapon Fighting + Improved; Greater adds a third */
    var mains = [], offs = [];
    for (var it = 0; it < P.iteratives; it++) mains.push(common - 5 * it);
    for (var ot = 0; ot < offN; ot++) offs.push(common - 2 - 5 * ot);
    d.atk = {
      canAttack: c.defend !== "total", fin: fin, tgt: tgt, wrap: wrap, die: P.unarmed, bab: BAB,
      single: common, charge: common + 2,
      mains: mains, twMains: mains.map(function (x) { return x - 2; }), offs: offs, gtwf: offN > 2,
      mainA: common - 2, mainB: common - 7, offA: common - 2, offB: common - 7,
      stealthDice: P.stealthDice,
      reach: longArm ? 10 : 5, longArm: longArm,
      aoo: hasFeat(st, "Combat Reflexes") ? 1 + Math.max(0, ab.dex.mod) : 1,
      dmgM: dmgM, dmgO: dmgO, haste: haste,
      flank: flank, flankMode: fm, flankPrec: flankPrec(st, fm),
      sneak: !!((c.sneak || fm) && (c.forest || tgt))
    };
    var rtouch = BAB + D + hasteAtk + stat + defAtk;
    d.rtouch = rtouch;
    d.cmb = BAB + S;
    d.cmd = 10 + BAB + S + D + dodge + defl;

    /* spellcasting */
    var cl = Math.max(0, LEVEL - burn);
    var clF = Math.max(0, LEVEL + TIER - burn);
    var spellLv = []; for (var sl = 1; sl <= P.maxSpell; sl++) spellLv.push(sl);
    d.sp = {
      cl: cl, clFire: clF, cha: CH, burn: burn, dcP: dcP,
      dc: spellLv.map(function (l) { return 10 + l + CH - dcP; }), maxSpell: P.maxSpell,
      conc: cl + CH, secretDc: 10 + P.secretBase + CH - dcP,
      artDice: Math.max(0, P.artDice - dcP), artFlat: CH, artLvl: P.artLvl, buffer: P.buffer, odIgnore: P.odIgnore,
      od: CH + P.odBonus,
      /* scorching ray: Elemental Bond (fire) and Gifted Adept (+1 CL on this one spell) */
      clRay: clF + 1,
      rays: clF + 1 >= 3 ? Math.min(3, 1 + Math.floor((clF + 1 - 3) / 4)) : 1,
      missiles: cl >= 1 ? Math.min(5, 1 + Math.floor((cl - 1) / 2)) : 0,
      fbDice: Math.min(10, clF), detDice: Math.min(10, clF),
      ddRange: 400 + 40 * cl, ddCarry: Math.floor(cl / 3), ddDoor: cl,
      eldritch: 10 + P.secretBase + CH - dcP
    };

    /* skills */
    var acpAll = d.load.acp + 0; /* the mithral chain shirt has no armor check penalty */
    var forest = c.forest ? P.forest : 0, rk = ranksOf(st);
    var rows = [];
    SKILLS.forEach(function (s) {
      var name = s[0], key = s[1], ranks = rk[name] || 0, cls = s[3], trained = s[4], bg = s[5], acpSk = s[6];
      var mo = [];
      var add = function (label, v) { if (v) mo.push([label, v]); };
      if (name === "Bluff") { add("racial", 2); add("favored enemy", tgt); }
      if (name === "Diplomacy") { add("racial", 2); add("trait", 1); }
      if (name === "Perception") { add("Keen Senses", 2); add("forest", forest); add("favored enemy", tgt); }
      if (name === "Sense Motive") add("favored enemy", tgt);
      if (name === "Survival") { add("forest", forest); add("favored enemy", tgt); }
      if (name === "Stealth") add("forest", forest);
      if (name === "Heal") add("Nature's Healing", c.forest ? 2 : 0);
      if (name === "Knowledge (religion)") add("undead", c.target === "undead" ? tgt : 0);
      var ability = ab[key].mod;
      var classB = ranks >= 1 && cls ? 3 : 0;
      var miscV = 0; mo.forEach(function (m) { miscV += m[1]; });
      var acp = acpSk ? -acpAll : 0;
      var total = ranks + ability + classB + miscV + acp - sp2;
      var usable = !(trained && ranks < 1);
      var tip = parts([["ranks", ranks], [key[0].toUpperCase() + key.slice(1), ability], ["class skill", classB]].concat(mo).concat([["armor check", acp], ["status", -sp2]])).replace(/^ /, "");
      rows.push({ name: name, label: SKILL_LABEL[name] || name, key: key, ranks: ranks, total: total, usable: usable, bg: !!bg, trained: !!trained, tip: tip, misc: mo });
    });
    d.skills = rows;
    /* skill rank budget: (6 + Int) a level + 1 favored class bonus; background 2 a level */
    var usedA = 0, usedB = 0; rows.forEach(function (r) { if (r.bg) usedB += r.ranks; else usedA += r.ranks; });
    d.ranks = { advMax: L * (6 + ab.int.mod) + L, bgMax: 2 * L, adv: usedA, bg: usedB, cap: L };
    d.track = P.track; d.empathy = L + CH;
    d.hpMax = hpMaxOf(st, CO);
    d.fe = favoredEnemies(st);

    /* panther: shares her favored enemy and forest bonuses */
    d.pet = derivePet(c, tgt, petRanks(st), st);
    d.tgt = tgt;
    d.hasteOn = haste;
    d.flags = { haste: haste, er: er, cg: cg, shield: shieldSp, pfe: pfe, fly: fly };
    return d;
  }

  /* ---------- markup ---------- */
  function box(l, v, s, t) { return '<div class="sbox"><div class="lbl">' + esc(l) + '</div><div class="v num">' + (t ? tip(v, t) : v) + (s ? '</div><div class="s">' + s : "") + "</div></div>"; }
  /* a number with its arithmetic: shows on hover, and on tap (focus) on phones */
  function tip(v, t) { return '<span class="tip" tabindex="0" data-tip="' + esc(t) + '">' + v + "</span>"; }
  /* "12 small cat + 4 advancement − 2 …": [label, value] pairs, zeros dropped, signs spelled out */
  function how(list, start) {
    var out = start || "";
    list.forEach(function (x) {
      if (!x[1] && out) return;
      out += (out ? (x[1] < 0 ? " − " : " + ") + Math.abs(x[1]) : String(x[1])) + " " + x[0];
    });
    return out;
  }
  function tg(act, k, label, on, extra, v) {
    return '<button type="button" class="tg" data-act="' + act + '" data-k="' + k + '"' + (v ? ' data-v="' + v + '"' : "") + ' aria-pressed="' + (!!on) + '">' + '<span class="dot"></span><span class="tl">' + esc(label) + "</span>" + (extra ? '<span class="tx">' + esc(extra) + "</span>" : "") + "</button>";
  }
  /* every section starts collapsed when the page opens (the third argument is kept for callers but ignored);
     renderSheet in index.html keeps the ones she opens open across re-renders */
  function sec(title, body) {
    return '<details class="sec"><summary>' + esc(title) + '</summary><div class="sb">' + body + "</div></details>";
  }
  function tbl(head, rows, cls) {
    return '<table class="t ' + (cls || "") + '"><thead><tr>' + head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + r.map(function (x, i) { return "<td" + (i ? ' class="num"' : "") + ">" + x + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
  }

  function render(st, o) {
    o = o || {};
    var d = derive(st), eq = st.eq || {}, c = st.cond || {}, P = (root.SheetEngine && root.SheetEngine.PROSE) || {};
    var worn = function (k) { return eq[k] !== false; };
    var a = d.atk, sp = d.sp, h = "";
    var L = d.level, PR = d.prog, HPMAX = d.hpMax, PETMAX = d.pet.hpMax, SD = PR.stealthDice + "d6";
    var feTg = function (pet) {
      return '<div class="seg" role="group" aria-label="Target">' + tg("cond", "target", "No favored enemy", !c.target, "", "") +
        d.fe.map(function (f) { return tg("cond", "target", f.name, c.target === f.k, "+" + f.b + (pet ? " attack and damage" : ""), f.k); }).join("") + "</div>";
    };

    /* gear and conditions */
    var gear = ITEMS.map(function (i) { return tg("eq", i.k, i.slot + ": " + i.name, worn(i.k), i.fx); }).join("");
    /* magic item slots (armor is its own category, not a slot); the handy haversack is slotless */
    var SLOTS = ["Head", "Headband", "Eyes", "Shoulders", "Neck", "Chest", "Body", "Belt", "Wrists", "Hands", "Ring", "Ring", "Feet"];
    var used = ITEMS.filter(function (i) { return worn(i.k); }).map(function (i) { return i.slot; }); /* gear set aside frees its slot */
    var open = SLOTS.filter(function (sl) { var k = used.indexOf(sl); if (k >= 0) { used[k] = null; return false; } return true; });
    gear += '<p class="hint slotsfree"><b>Open slots:</b> ' + esc(open.join(", ").replace("Ring, Ring", "2 rings")) + ". Slotless: handy haversack.</p>";
    gear += '<div class="row"><button type="button" class="btn sm" data-act="eqall" data-v="off">Take everything off</button><button type="button" class="btn sm" data-act="eqall" data-v="on">Put everything on</button></div>' +
      '<p class="hint">Off means set aside: it gives nothing and its weight leaves her load.</p>';
    var cond = '<div class="grp"><div class="gl">Where and who</div>' +
      tg("cond", "forest", CONDS.forest, c.forest, "+" + PR.forest + " Perception, Stealth, Survival, initiative; +" + PR.fastMove + " ft speed") +
      feTg(false) + "</div>" +
      '<div class="grp"><div class="gl">Stance</div>' +
      tg("cond", "charge", CONDS.charge, c.charge, "−2 AC, charge attack +2") +
      '<div class="seg" role="group" aria-label="Defense">' +
      tg("cond", "defend", "Normal", !c.defend, "", "") +
      tg("cond", "defend", "Fighting defensively", c.defend === "fight", "−4 attacks, +3 dodge AC", "fight") +
      tg("cond", "defend", "Total defense", c.defend === "total", "+6 dodge AC, no attacks", "total") + "</div>" +
      tg("cond", "ffoot", CONDS.ffoot, c.ffoot, "loses Dex and dodge to AC") +
      tg("cond", "sneak", CONDS.sneak, c.sneak, "stealth attack +" + SD + " if forest or favored enemy") +
      '<div class="gl">Flanking</div>' + flankSeg(st, "her") + "</div>" +
      '<div class="grp"><div class="gl">Status</div>' +
      tg("cond", "shaken", CONDS.shaken, c.shaken, "−2 attacks, saves, skills") +
      tg("cond", "sickened", CONDS.sickened, c.sickened, "−2 attacks, damage, saves, skills") +
      tg("cond", "fatigued", CONDS.fatigued, c.fatigued && !c.exhausted, "−2 Str and Dex, no charge") +
      tg("cond", "exhausted", CONDS.exhausted, c.exhausted, "−6 Str and Dex, half speed") +
      (d.flags.pfe ? tg("cond", "evil", CONDS.evil, c.evil, "protection from evil: +2 deflection AC") : "") + "</div>";

    h += '<div class="s-top">' +
      '<div class="panel s-eq"><div class="ph"><h2>Gear worn</h2></div>' + gear + "</div>" +
      '<div class="panel s-cond"><div class="ph"><h2>Conditions</h2></div>' + cond + "</div></div>";
    h += fxPanel("her", st, o);

    /* headline numbers */
    var acLbl = c.ffoot ? "AC (flat-footed)" : "AC";
    /* the headline panel (portrait, name, level buttons, key numbers) sits above the tracker: index.html draws it
       into #sheetHead with o.headOnly, and the sheet below leaves it out */
    var head = '<div class="panel s-head"><div class="ph"><div class="idhead"><button type="button" class="portrait" data-portrait="daerlieth" aria-label="Show Daerlieth\'s portrait"><img src="images/daerlieth-thumb.webp" alt="" width="64" height="64"></button><div><h2>Daerlieth Nightstar</h2><span class="hint">Moon elf · Eternal Mage ' + L + ' (Artillery Expert) // Spell-less Ranger ' + L + ' (Companion-Bound) · Archmage tier 2</span></div></div>' +
      (o.readOnly ? "" : '<div class="lvbtns">' + (L < LV().MAX ? '<button type="button" class="btn primary sm" data-act="lvlup">Level up to ' + (L + 1) + "</button>" : "") +
        (L > LV().MIN ? '<button type="button" class="btn sm" data-act="lvldown">Undo level ' + L + "</button>" : "") + "</div>") + "</div>" +
      '<div class="sgrid">' +
      (function () { /* current hit points; Hard to Kill: dies at twice her Con score below 0 */
        var hp = st.hp == null ? HPMAX : st.hp, dead = 2 * d.ab.con.score;
        var stt = hp > 0 ? "Up" : hp === 0 ? "Disabled" : hp > -dead ? "Dying, stable (Hard to Kill)" : "Dead";
        return box("HP", hp + "<small>/" + HPMAX + "</small>", stt + " · dies at −" + dead,
          "82 at 8th level = 13 (1st level: d10 max 10 + Con 3) + 63 (7 levels × (6 + Con 3)) + 6 (archmage bonus hit points, 3 per tier)" + (HPMAX > 82 ? "; " + (HPMAX - 82) + " more from later levels = " + HPMAX : ""));
      })() +
      box(acLbl, d.ac.now, "touch " + d.ac.touch + " · flat-footed " + d.ac.ff) +
      box("Initiative", sg(d.init), c.forest ? "forest +" + PR.forest + " included" : "+" + PR.forest + " in forest") +
      box("Speed", d.speed + " ft", d.fly ? "fly " + d.fly + " ft" : (35 + PR.fastMove) + " ft in forest") +
      box("Fort", sg(d.save.fort)) + box("Ref", sg(d.save.ref)) + box("Will", sg(d.save.will), d.save.cloak ? "cloak +3 counted" : "no cloak") +
      box("Melee", sg(a.single), "unarmed, one attack") +
      box("Ranged touch", sg(d.rtouch), "artillery, rays") +
      box("CMB / CMD", sg(d.cmb) + " / " + d.cmd) +
      box("Caster level", sp.cl, "fire " + sp.clFire + " · conc. " + sg(sp.conc)) +
      box("Spell DCs", sp.dc[0] + "–" + sp.dc[sp.dc.length - 1], "artillery burst " + sp.secretDc) +
      "</div></div>";
    if (o.headOnly) return head;

    h += choicesPanel(st, o, d);

    /* abilities */
    var abl = ["str", "dex", "con", "int", "wis", "cha"].map(function (k) {
      var o = d.ab[k], extra = [];
      if (o.item) extra.push("+" + o.item + " item");
      if (o.dmg) extra.push("−" + o.dmg + " damage");
      if (o.pen) extra.push("−" + o.pen + " fatigue");
      return [k.toUpperCase(), o.base, extra.join(", ") || "", o.score, sg(o.mod)];
    });
    h += sec("Abilities", tbl(["", "Base", "Changes", "Score", "Mod"], abl), true);

    /* defense */
    var acRows = [
      ["AC", d.ac.full, d.ac.text],
      ["Touch", d.ac.touch, parts([["", 10], ["Dex", d.ac.dex], ["dodge", d.ac.dodge], ["deflection", d.ac.defl], ["charging", d.ac.chg]])],
      ["Flat-footed", d.ac.ff, parts([["", 10], ["armor", d.ac.armor], ["shield spell", d.ac.shield], ["Dex", d.ac.ffDex], ["natural", d.ac.nat], ["deflection", d.ac.defl], ["charging", d.ac.chg]])]
    ];
    var defNote = (d.ac.capped ? "Dex " + sg(d.ab.dex.mod) + " but the armor or load caps it at +" + d.ac.cap + ". " : "") +
      (worn("shirt") ? "" : "No armor: no spell failure, no Dex cap. ") + "Spell failure on somatic spells: " + d.spellFail + "%. Load: " + d.load.cat + " (" + d.load.wt + " lb of " + d.load.light + " light, " + d.load.med + " medium, " + d.load.max + " max).";
    var svRows = [
      ["Fortitude", sg(d.save.fort), parts([["", d.save.base], ["Con", d.ab.con.mod], ["cloak", d.save.cloak], ["status", d.save.status]])],
      ["Reflex", sg(d.save.ref), parts([["", d.save.base], ["Dex", d.ab.dex.mod], ["cloak", d.save.cloak], ["haste", d.save.haste], ["status", d.save.status]])],
      ["Will", sg(d.save.will), parts([["", d.save.base], ["Wis", d.ab.wis.mod], ["cloak", d.save.cloak], ["status", d.save.status]])]
    ];
    h += sec("Defense and saves", tbl(["", "Total", "How"], acRows) + '<p class="hint">' + esc(defNote) + "</p>" + tbl(["Save", "Total", "How"], svRows) +
      '<p class="hint">Base ' + d.save.base + ' on every save: gestalt takes the better side, ranger Fort and Ref, Eternal Mage Will. Cold resistance 5 (moon elf), fire resistance 10 (Elemental Bond). Hard to Kill: dies at −32.</p>', true);

    /* attacks */
    var tgtTxt = a.tgt ? " (" + sg(a.tgt) + " favored enemy)" : "";
    var wrapNote = a.wrap ? "With the bodywrap on a strike: +1 attack and damage, 2 uses a round." : "Bodywrap off: no bonus strikes.";
    var psD = a.flankPrec ? " +1d6 precision" : "";
    var dm = function (n) { return a.die + (n ? sg(n) : "") + (a.sneak ? " +" + SD : "") + psD; };
    var dmW = function (n) { return a.die + sg(n + a.wrap) + (a.sneak ? " +" + SD : "") + psD; };
    /* attack picker: action (standard, full attack, charge, attack of opportunity) and one or two weapons, saved in cond */
    var mode = { std: "std", charge: "charge", aoo: "aoo" }[c.atk] || "full", two = c.hands !== "one";
    var pick = '<div class="atkpick"><div class="grp"><div class="gl">Action</div><div class="seg seg-row" role="group" aria-label="Attack action">' +
      tg("cond", "atk", "Standard attack", mode === "std", "standard action, 1 strike", "std") +
      tg("cond", "atk", "Full attack", mode === "full", "full-round action, 5-ft step only", "") +
      tg("cond", "atk", "Charge", mode === "charge", "full-round, 1 strike", "charge") +
      tg("cond", "atk", "Attack of opportunity", mode === "aoo", "free, on their turn", "aoo") + "</div></div>" +
      '<div class="grp"><div class="gl">Weapons</div><div class="seg seg-row" role="group" aria-label="Weapons">' +
      tg("cond", "hands", "One weapon", !two, "main hand only", "one") +
      tg("cond", "hands", "Two weapons", two, "Two-Weapon Fighting", "") + "</div></div></div>";
    var one = a.single, wr = function (b) { return "Bodywrap on this strike: " + sg(b + a.wrap) + ", " + dmW(a.dmgM); };
    var strikes = function (list) { return "<b>" + list.map(sg).join(" / ") + "</b>"; };
    var atkRows = [];
    if (!a.canAttack) atkRows = [["Total defense", "—", "", "She can't attack, or make attacks of opportunity, this round."]];
    else if (mode === "std") {
      atkRows.push(["Attack (standard action)", sg(one), dm(a.dmgM), "One strike; she can still move. " + wr(one)]);
      if (two) atkRows.push(["", "", "", "Two-Weapon Fighting only adds strikes on a full attack, so a standard attack is one strike either way."]);
    } else if (mode === "charge") {
      atkRows.push(["Charge", d.noCharge ? "can't charge" : sg(a.charge), dm(a.dmgM), "Move up to twice her speed in a straight line and make one strike at +2. −2 AC until her next turn. " + wr(a.charge)]);
      if (two) atkRows.push(["", "", "", "A charge is one strike, so the second weapon adds nothing."]);
    } else if (mode === "aoo") {
      atkRows.push(["Attack of opportunity", sg(one), dm(a.dmgM), (a.aoo > 1 ? a.aoo + " a round (Combat Reflexes: 1 + Dex), even while flat-footed. " : "One a round. ") + "She threatens " + a.reach + " ft" + (a.longArm ? " (long arm)" : "") + ": Improved Unarmed Strike means her fists threaten, so foes moving out of a threatened square, casting or shooting there provoke. " + wr(one)]);
      if (two) atkRows.push(["", "", "", "No Two-Weapon Fighting penalty: it's a single strike."]);
    } else if (!two) {
      /* one weapon: her iterative strikes from BAB (+6, +11, +16) */
      var ms = a.mains, nOne = ms.length + (a.haste ? 1 : 0);
      atkRows.push(["<b>Full attack, one weapon: " + nOne + " strikes" + (a.haste ? ", hasted" : "") + "</b>", strikes(a.haste ? [ms[0]].concat(ms) : ms), "", "Full-round action; only a 5-ft step. Strikes in this order."]);
      ms.forEach(function (b, i) { atkRows.push([" " + (i + 1) + ". Main hand", sg(b), dm(a.dmgM), i ? "Iterative strike from BAB +" + a.bab + " (−" + 5 * i + ")" : "BAB +" + a.bab]); });
      if (a.haste) atkRows.push([" " + (ms.length + 1) + ". Main hand (haste)", sg(ms[0]), dm(a.dmgM), "Haste: one extra strike at her highest bonus"]);
      else atkRows.push(["<b>If hasted: " + (ms.length + 1) + " strikes</b>", strikes([ms[0] + 1].concat(ms.map(function (x) { return x + 1; }))), "", "Haste gives +1 on every attack and one extra strike at her highest bonus"]);
    } else {
      /* two weapons: main hand iteratives and off-hand strikes (Two-Weapon Fighting, Improved, Greater), interleaved */
      var tm = a.twMains, of = a.offs, order = [];
      for (var q = 0; q < Math.max(tm.length, of.length); q++) {
        if (q < tm.length) order.push(["Main hand", tm[q], a.dmgM, q ? "Iterative strike from BAB +" + a.bab + " (−" + 5 * q + ")" : "Full Str to damage"]);
        if (q < of.length) order.push(["Off hand", of[q], a.dmgO, q === 0 ? "Two-Weapon Fighting; half Str to damage" : q === 1 ? "Improved Two-Weapon Fighting (−5)" : "Greater Two-Weapon Fighting (−10)"]);
      }
      var nTw = order.length + (a.haste ? 1 : 0);
      atkRows.push(["<b>Full attack, two weapons: " + nTw + " strikes" + (a.haste ? ", hasted" : "") + "</b>", strikes(a.haste ? [tm[0], of[0], tm[0]].concat(order.slice(2).map(function (x) { return x[1]; })) : order.map(function (x) { return x[1]; })), "", "Full-round action; only a 5-ft step. Two-Weapon Fighting: −2 on every strike (unarmed strikes count as light). Strikes in this order."]);
      order.forEach(function (x, i) { atkRows.push([" " + (i + 1) + ". " + x[0], sg(x[1]), dm(x[2]), x[3]]); });
      if (a.haste) atkRows.push([" " + (order.length + 1) + ". Main hand (haste)", sg(tm[0]), dm(a.dmgM), "Haste: one extra strike at her highest bonus"]);
      else atkRows.push(["<b>If hasted: " + (order.length + 1) + " strikes</b>", strikes([tm[0] + 1, of[0] + 1, tm[0] + 1].concat(order.slice(2).map(function (x) { return x[1] + 1; }))), "", "Haste gives +1 on every attack and one extra main-hand strike at her highest bonus"]);
    }
    var sneakOn = (c.sneak || a.flankMode), sneakTxt = sneakOn ? ((c.forest || a.tgt) ? "Stealth attack +" + SD + " on every hit now (" + (a.flankMode ? "flanking" : "target flat-footed") + "); it isn't multiplied on a critical." : "Stealth attack needs forest or a favored enemy as well.") : "Stealth attack +" + SD + " when the target is flat-footed or flanked, in forest or against a favored enemy. Skirmishing Attack: move 10+ ft first and the first attack counts as against a flat-footed target.";
    var art = sp.artDice + "d6" + sg(sp.artFlat), art8 = sp.artDice + "d8" + sg(sp.artFlat);
    /* artillery picker: delivery (secret) and die size, saved in cond */
    var artMode = c.art === "sniper" || c.art === "burst" ? c.art : "touch", d8 = !!c.artD8;
    var odNow = st.overdrive == null ? sp.od : st.overdrive;
    var artPick = '<div class="atkpick"><div class="grp"><div class="gl">Arcane artillery</div><div class="seg seg-row" role="group" aria-label="Artillery delivery">' +
      tg("cond", "art", "Touch", artMode === "touch", "ranged touch, 30 ft", "") +
      tg("cond", "art", "Sniper", artMode === "sniper", "ranged touch, 120 ft", "sniper") +
      tg("cond", "art", "Burst", artMode === "burst", "15 ft around her, Reflex half", "burst") + "</div></div>" +
      '<div class="grp"><div class="gl">Damage die</div><div class="seg seg-row" role="group" aria-label="Artillery die">' +
      tg("cond", "artD8", "d6", !d8, "no overdrive", "") +
      tg("cond", "artD8", "d8", d8, "artillery overdrive, 1 point", "1") + "</div></div></div>";
    var artDmg = (d8 ? art8 : art) + " arcane", artCost = "Standard action. " + Math.max(0, sp.artLvl - sp.buffer) + " burnout (as a " + LV().ord(sp.artLvl) + "-level spell, minus arcane buffer " + sp.buffer + "), or " + Math.max(0, sp.artLvl - sp.buffer - sp.odIgnore) + " with 1 overdrive." + (d8 ? " The d8s cost 1 overdrive on top." : "") + " She has " + odNow + " overdrive.";
    var artRow = artMode === "burst" ? ["Artillery burst", "Reflex DC " + sp.secretDc, artDmg, "Everyone in 15 ft of her, Reflex half; she takes none (Artillery Burst). " + artCost]
      : ["Arcane artillery" + (artMode === "sniper" ? " (sniper)" : ""), sg(d.rtouch) + " touch", artDmg, (artMode === "sniper" ? "Range 120 ft (Artillery Sniper). " : "Range 30 ft. ") + artCost];
    var spRows = [
      artRow,
      ["Scorching ray", sg(d.rtouch) + " touch, " + sp.rays + (sp.rays > 1 ? " rays" : " ray"), "4d6 fire each", "Caster level " + sp.clRay + " (fire +2 Elemental Bond, +1 Gifted Adept). 3 rays at CL 11. Burnout 0"]
    ];
    h += sec("Attacks", pick + tbl(["Attack", "Bonus", "Damage", "Notes"], atkRows, "atk") +
      '<p class="hint">Unarmed strikes with Weapon Finesse (' + (a.fin === d.ab.dex.mod ? "Dex" : "Str") + ' ' + sg(a.fin) + '), Weapon Focus +1' + esc(tgtTxt) + (a.flank ? ", " + flankLabel(a.flankMode) + " +" + a.flank + (a.flank > 2 ? " (Outflank)" : "") + (psD ? ", Precise Strike +1d6 on every hit" : "") : "") + ". Damage " + a.die + " (Monastic Legacy, effective monk level " + Math.floor(L / 2) + "). Crit 20/x2. " + esc(wrapNote) + " " + esc(sneakTxt) + "</p>" +
      artPick + tbl(["Spell attack", "Bonus", "Damage", "Notes"], spRows, "atk") +
      '<p class="hint">Companion bite: ' + sg(d.pet.bite) + ' for 1d6' + sg(d.pet.biteD) + ' plus trip, claws ' + sg(d.pet.claw) + ' for 1d3' + sg(d.pet.clawD) + ".</p>", true);

    /* spellcasting */
    var spl = [
      ["Caster level", sp.cl + " (fire " + sp.clFire + ")", L + " − " + sp.burn + " burnout; Elemental Bond +2 on fire spells"],
      ["Concentration", sg(sp.conc), "CL + Cha " + sg(sp.cha)],
      ["Spell DC, levels 1 to " + sp.maxSpell, sp.dc.join(" / "), "10 + level + Cha" + (sp.dcP ? ", −" + sp.dcP + " burnout" : "")],
      ["Eternal secret DC", sp.secretDc, "10 + " + PR.secretBase + " (half level) + Cha"],
      ["Arcane overdrive pool", sp.od, "Cha " + sg(sp.cha) + " + " + PR.odBonus + " (half level). Now " + st.overdrive + ". 1 point ignores up to " + sp.odIgnore + " burnout"],
      ["Arcane buffer", sp.buffer, "Every spell gives " + sp.buffer + " less burnout"],
      ["Duration spells at once", PR.slots, "Limited concentration"],
      ["Experimental spell", "up to " + LV().ord(PR.expMax) + " level", PR.expCount + " a day, +1 burnout" + (L >= 11 ? " (+1 more at her highest level)" : "")],
      ["Mythic power", "7 a day", "Now " + st.mythic],
      ["Fireball", Math.min(10, sp.clFire) + "d6 (mythic " + Math.min(10, sp.clFire) + "d10)", "Reflex DC " + sp.dc[2] + ", 20 ft radius"],
      ["Magic missile", sp.missiles + " missiles", "1d4+1 each, never misses"],
      ["Detonate (fire)", sp.detDice + "d8", "Reflex DC " + sp.dc[3] + ", 30 ft, goes off next round"],
      ["Dimension door", sp.ddRange + " ft", "Carries " + sp.ddCarry + " willing creature" + (sp.ddCarry > 1 ? "s" : "") + " (1 per 3 CL); mythic: " + sp.ddDoor + " use the portal"],
      ["Spell failure", d.spellFail + "%", "Somatic spells only. The shirt is the only source"]
    ];
    h += sec("Spellcasting", tbl(["", "Value", "Notes"], spl) + (P.spells || ""), false);

    /* skills */
    var R_ = d.ranks, leftA = R_.advMax - R_.adv, leftB = R_.bgMax - R_.bg;
    var sk = function (bg) {
      /* every skill she has on this side, ranked or not; trained-only skills without ranks show a dash.
         Rank buttons show while there are ranks to place (after a level-up) */
      var left = bg ? leftB : leftA, edit = !o.readOnly && left !== 0;
      var rows = d.skills.filter(function (s) { return !!s.bg === bg; }).map(function (s) {
        var rc = edit ? '<span class="rks"><button type="button" class="btn sm rk" data-act="rank" data-k="' + esc(s.name) + '" data-d="-1"' + (s.ranks < 1 ? " disabled" : "") + '>−</button><b class="num">' + s.ranks + '</b><button type="button" class="btn sm rk" data-act="rank" data-k="' + esc(s.name) + '" data-d="1"' + (left < 1 || s.ranks >= R_.cap ? " disabled" : "") + ">+</button></span>" : s.ranks;
        /* Linguistics: each rank is a language; the table shows the languages, not a check bonus */
        if (s.name === "Linguistics") return [featBtn("skill:" + s.name, s.name, s.ranks + " ranks: " + s.ranks + " extra language" + (s.ranks === 1 ? "" : "s") + " (one per rank). Deciphering writing or spotting a forgery uses " + sg(s.total) + "."), rc, s.ranks + " lang.", ""];
        return [featBtn("skill:" + s.name, s.label, s.tip + " = " + (s.usable ? sg(s.total) + "." + takeText(s.name, s.total) : "needs ranks")) + (s.ranks ? "" : ' <small class="hint">untrained</small>'), rc, s.usable ? sg(s.total) : "— (needs ranks)", s.usable ? takeCell(s.name, s.total) : ""];
      });
      return tbl(["Skill", "Ranks", "Total", "Take 10/20"], rows, "sk");
    };
    var rkHead = function (lbl, used, max) { var lf = max - used; return "<h3>" + lbl + " (" + used + " of " + max + " ranks" + (lf > 0 ? ", <b>" + lf + " to place</b>" : lf < 0 ? ", <b>" + (-lf) + " too many</b>" : "") + ")</h3>"; };
    var bonusNote = "Hover a skill name for what it does and her arithmetic; tap for the full rules. Ranks: (6 + Int " + sg(d.ab.int.mod) + ") a level plus 1 favored class bonus; background 2 a level; at most " + R_.cap + " in one skill. Wild Empathy " + sg(d.empathy) + " (+4 with Gwathfaron). Handle Animal with Gwathfaron +4.";
    /* situational bonuses: added to the table only while the matching toggle (In forest, favored enemy target) is on */
    var favNote = '<div class="favnote"><b>Situational, not in the totals above unless the toggle is on:</b><ul>' +
      "<li>+" + PR.forest + " (Forest) on Perception, Stealth, Survival and Knowledge (geography), and initiative (turn on <i>In forest</i> under Conditions).</li>" +
      "<li>" + d.fe.map(function (f) { return "+" + f.b + " (" + esc(f.name) + ")"; }).join(" ") + " on Bluff, Knowledge, Perception, Sense Motive and Survival against them, and on attack and damage (choose the target under Conditions).</li>" +
      "<li>+" + PR.track + " Track (Survival) to follow tracks.</li>" +
      "<li>+2 (Forest) to Heal using Nature's Healing.</li></ul></div>";
    h += sec("Skills", '<div class="two"><div>' + rkHead("Adventuring", R_.adv, R_.advMax) + sk(false) + '</div><div>' + rkHead("Background", R_.bg, R_.bgMax) + sk(true) +
      "</div></div>" + favNote + "<p class=\"hint\">Also trained only, no ranks, can't be used: " + esc(UNUSABLE.join(", ")) + ". " + esc(bonusNote) + "</p>", true);

    /* companion */
    var pet = d.pet;
    h += sec("Gwathfaron, panther",
      '<div class="sgrid sm">' + box("HP", st.petHp + "<small>/" + PETMAX + "</small>", "dies at −" + pet.dead) + box("AC", pet.ac, "touch " + pet.touch + " · flat-footed " + pet.ff) +
      box("Initiative", sg(pet.init)) + box("Bite", sg(pet.bite), "1d6" + sg(pet.biteD) + " + trip") + box("Stealth", sg(pet.stealth)) + box("Perception", sg(pet.perc)) + "</div>" +
      '<p class="hint">Summary. His full sheet is on the <a href="#gwathfaron">Gwathfaron</a> tab.</p>', false);

    /* prose */
    var prose = [["Racial traits and feats", "feats"], ["Spell-less Ranger", "ranger"], ["Eternal Mage", "mage"], ["Mythic", "mythic"],
      ["Daily resources", "daily"], ["Gear and money", "gear"], ["Languages", "lang"], ["Description and background", "bg"]];
    /* the feat list is built (featsSec) with a button per feat; the printed sheet's feat paragraph is left out */
    h += featsSec(st) + classSecs(st, d);
    var built = { feats: 1, ranger: 1, mage: 1, mythic: 1 };
    prose.forEach(function (p) { if (!built[p[1]] && P[p[1]]) h += sec(p[0], P[p[1]], false); if (p[1] === "gear") h += lettersSec(); });
    h += '<div class="panel rpolbar"><div><h2>RPoL character sheet</h2><span class="hint">Her sheet as plain text in her RPoL layout, with today\'s numbers. Copy it into her RPoL character sheet.</span></div><button type="button" class="btn primary" data-rpol="her">Generate RPoL sheet</button></div>';
    h += '<p class="hint foot">Numbers above are live. The text sections come from the printed sheet and don\'t change with the toggles.</p>';
    return h;
  }




  /* ---------- feats, traits and talents: a button per entry (hover = summary, tap = full text in the info dialog) ---------- */
  var FEAT_INFO = {
    /* racial (moon elf, alternate features) */
    "low-light vision": ["Racial", "Sees twice as far as a human in dim light.", "She can see twice as far as a human in starlight, moonlight, torchlight and similar dim light, and still tells colours and details apart in those conditions."],
    "keen senses": ["Racial", "+2 Perception.", "Elves have keen senses: +2 racial bonus on Perception checks."],
    "silver-tongued diplomacy": ["Racial (alternate)", "+2 Diplomacy and Bluff, 1 extra language.", "+2 racial bonus on Diplomacy and Bluff checks, and one extra bonus language. Replaces Elven Magic."],
    "wanderer's stride": ["Racial (alternate)", "+5 ft speed; ignores natural difficult terrain.", "Her base speed rises by 5 ft and she moves through natural difficult terrain (undergrowth, rubble, shallow bog) at normal speed. Replaces Elven Weapon Familiarity."],
    "moonlight resilience": ["Racial (alternate)", "Cold resistance 5; light or dancing lights 1/day.", "Cold resistance 5. Once a day she can produce light or dancing lights as a spell-like ability (no burnout). Replaces Elven Immunities."],
    /* traits */
    "reactionary": ["Trait (combat)", "+2 initiative.", "+2 trait bonus on initiative checks."],
    "umbral unmasking": ["Drawback (Champions of Corruption)", "She casts no shadow; a DC 15 Wisdom check notices it.", "She casts no shadow whatsoever (or a monstrous one). Under normal light it is not hard to observe but uncommon to notice: creatures that succeed at a DC 15 Wisdom check notice it plainly (a Perception check may also be needed, depending on conditions). This telltale sign of wickedness can't be concealed by misdirection, nondetection or illusions, except those that also affect shadows (such as invisibility). No penalty to her rolls; the cost is how people react."],
    "gifted adept": ["Trait (magic), taken with a drawback", "+1 caster level on scorching ray.", "Choose one spell: she casts it at +1 caster level. Hers is scorching ray, so with Elemental Bond it is cast at CL 11 and fires 3 rays (12d6 fire) for 0 burnout. Any burnout lowers her caster level, so the third ray needs a clean slate (or Wild Arcana's +2)."],
    "friend in every town": ["Trait (social)", "+1 Diplomacy and Knowledge (local); Diplomacy is a class skill.", "+1 trait bonus on Diplomacy and Knowledge (local) checks, and Diplomacy is always a class skill for her."],
    /* her feats */
    "weapon finesse": ["Combat feat", "Dex instead of Str on attack rolls with light weapons, unarmed strikes included.", "With light weapons (unarmed strikes and natural weapons count), rapiers, whips and spiked chains she adds her Dex modifier instead of Str to attack rolls. Damage still uses Str. A shield's armor check penalty applies to these attack rolls."],
    "improved unarmed strike": ["Combat feat", "Unarmed strikes count as armed: no attacks of opportunity, lethal damage.", "She is considered armed when unarmed: attacking unarmed doesn't provoke attacks of opportunity, she threatens squares with her fists, and she chooses lethal or nonlethal damage freely."],
    "two-weapon fighting": ["Combat feat", "Penalties for fighting with two weapons drop to −2/−2 with a light off-hand.", "Two-weapon penalties fall by 2 on the primary hand and 6 on the off hand. With a light off-hand weapon (an unarmed strike counts) that is −2 on every attack. She gets one extra off-hand attack in a full attack."],
    "weapon focus": ["Combat feat", "+1 on attack rolls with the chosen weapon (unarmed strike).", "+1 on all attack rolls with the chosen weapon. Hers is the unarmed strike. A prerequisite for Dazzling Display and other weapon feats."],
    "weapon focus (unarmed strike)": ["Combat feat", "+1 on attack rolls with unarmed strikes.", "+1 on all attack rolls with her unarmed strikes. A prerequisite for Dazzling Display and other weapon feats."],
    "improved two-weapon fighting": ["Combat feat", "A second off-hand attack at −5.", "In a full attack she gets a second attack with her off hand, at a −5 penalty (on top of the usual two-weapon penalties)."],
    "greater two-weapon fighting": ["Combat feat", "A third off-hand attack at −10.", "In a full attack she gets a third attack with her off hand, at a −10 penalty. The tracker adds this strike to her Attacks table when the feat is picked."],
    "expanded arcana": ["General feat", "One extra spell known (hers: detonate).", "Adds one spell from her class list to her spells known, of any level she can cast. (Or two spells, both at least one level below her highest.) Hers is detonate, 4th level."],
    "combat reflexes": ["Combat style feat (unarmed, 6th)", "Extra attacks of opportunity (Dex bonus), and while flat-footed.", "She can make a number of extra attacks of opportunity each round equal to her Dex bonus, and can make them while flat-footed."],
    "dodge": ["Combat feat", "+1 dodge bonus to AC.", "+1 dodge bonus to AC. Lost whenever she loses her Dex bonus to AC."],
    "mobility": ["Combat feat", "+4 AC against attacks of opportunity from moving.", "+4 dodge bonus to AC against attacks of opportunity provoked by moving out of or within a threatened area."],
    "combat expertise": ["Combat feat", "Trade attack for AC: −1 attack, +1 dodge AC per 4 BAB.", "Before attacking she can take −1 on melee attacks and combat maneuver checks for +1 dodge bonus to AC, plus another −1/+1 per 4 points of base attack bonus. A prerequisite for many maneuver and teamwork feats (Pack Flanking among them)."],
    "dazzling display": ["Combat feat", "Full-round action: Intimidate every foe within 30 ft that can see her.", "While wielding a weapon she has Weapon Focus in (her unarmed strike), a full-round action to demoralize every foe within 30 ft that can see her, with one Intimidate check."],
    "shatter defenses": ["Combat feat", "Shaken foes she hits are flat-footed to her until the end of her next turn.", "Any shaken, frightened or panicked opponent she hits this round is flat-footed against her attacks until the end of her next turn, including the hit that triggered it. Flat-footed means denied its Dex bonus, which turns on her stealth attack (ranged within 30 ft too)."],
    "point-blank shot": ["Combat feat", "+1 attack and damage with ranged attacks within 30 ft.", "+1 on attack and damage rolls with ranged weapons at ranges up to 30 ft."],
    "precise shot": ["Combat feat", "No −4 for shooting into melee.", "She can shoot or throw ranged weapons at an opponent engaged in melee without the −4 penalty."],
    /* teamwork */
    "coordinated companion": ["Teamwork (archetype bonus, 4th)", "Gwathfaron counts as having every teamwork feat she has.", "Her animal companion is considered to have any teamwork feat she possesses, while he is within 30 ft and can see or hear her (or is otherwise aware of her position). He can only coordinate with her this way, not with other allies."],
    "bonded mind": ["Teamwork (archetype bonus, 4th)", "Silent messages with an ally who has the feat, while in sight.", "While she and an ally with the feat can see each other, they can trade messages as the message spell, with no whispering or pointing, and nobody can overhear. Gwathfaron has it too through Coordinated Companion, while he is within 30 ft of Daerlieth and can see or hear her."],
    "outflank": ["Teamwork", "Flanking bonus +4 instead of +2; a crit gives the partner an attack of opportunity.", "When she and an ally with this feat flank the same creature, the flanking bonus on attack rolls is +4 instead of +2. When either of them scores a critical hit against the flanked creature, the other may make an attack of opportunity against it. Melee only. Prerequisite: BAB +4. Gwathfaron has it too through Coordinated Companion, while he is within 30 ft of Daerlieth and can see or hear her."],
    "precise strike": ["Teamwork", "+1d6 precision damage on melee hits while flanking with a partner.", "Whenever she and an ally with this feat flank the same creature, each deals +1d6 precision damage with every melee hit. Not multiplied on a critical; creatures immune to precision damage ignore it. Melee only. Prerequisites: Dex 13, BAB +1. Gwathfaron has it too through Coordinated Companion, while he is within 30 ft of Daerlieth and can see or hear her."],
    "stealth synergy": ["Teamwork", "Stealth together: each uses the best roll among them.", "When she and allies with this feat within 30 ft make Stealth checks at the same time, each takes the highest result of the group as their own. With Gwathfaron (+18) that lifts her Stealth to his. Gwathfaron has it too through Coordinated Companion, while he is within 30 ft of Daerlieth and can see or hear her."],
    "pack flanking": ["Teamwork", "Flank automatically while her companion is adjacent.", "When she and her companion both have this feat, the companion is adjacent to her, and both threaten the same opponent, they count as flanking it regardless of positioning. Prerequisites: Int 13, Combat Expertise. Gwathfaron has it too through Coordinated Companion, while he is within 30 ft of Daerlieth and can see or hear her."],
    "tandem trip": ["Teamwork", "Trips against a foe a partner threatens: roll twice, take the better.", "When she or a partner with this feat attempts a trip against an opponent the other threatens, roll the combat maneuver check twice and take the better result. Pairs with Gwathfaron's free trip on a bite. Gwathfaron has it too through Coordinated Companion, while he is within 30 ft of Daerlieth and can see or hear her."],
    "lookout": ["Teamwork", "Act in the surprise round if an adjacent partner can.", "When she is adjacent to an ally with this feat and the ally is aware of the enemy in a surprise round, she can act too. If she would act anyway, she uses the higher initiative. Gwathfaron has it too through Coordinated Companion, while he is within 30 ft of Daerlieth and can see or hear her."],
    "allied spellcaster": ["Teamwork", "+2 on checks to beat spell resistance next to a partner.", "When adjacent to an ally with this feat, +2 competence bonus on caster level checks to overcome spell resistance (more if the ally knows the same spell). Gwathfaron has it too through Coordinated Companion, while he is within 30 ft of Daerlieth and can see or hear her."],
    "paired opportunists": ["Teamwork", "+4 on attacks of opportunity against foes both threaten.", "When adjacent to an ally with this feat, +4 on attacks of opportunity against creatures you both threaten, and an enemy that provokes from the ally provokes from her too. Gwathfaron has it too through Coordinated Companion, while he is within 30 ft of Daerlieth and can see or hear her."],
    /* combat style (unarmed, prerequisites waived) */
    "punishing kick": ["Combat feat (unarmed style, 6th)", "On an unarmed hit, also push the foe 5 ft or knock it prone (Fort negates).", "Once a day per five character levels (1 at 8th, 2 at 10th), and no more than once a round: when she hits with an unarmed strike, besides the damage she can push the target 5 ft away or knock it prone. The target attempts a Fortitude save (DC 10 + half her level + Wis modifier, DC 18 now) to negate. The style waives its prerequisites."],
    "spring attack": ["Combat feat (unarmed style, 10th)", "Move, attack once, and keep moving without provoking from the target.", "As a full-round action she can move up to her speed and make a single melee attack anywhere along the way, without provoking an attack of opportunity from the creature she attacks. She can't use it in heavy armor."],
    "monastic legacy": ["Combat style (unarmed, 2nd)", "Unarmed damage as a monk of half her other levels (1d8 now).", "Her unarmed strikes deal damage as a monk whose level is half her levels in other classes, plus any monk levels. At 8th level that is an effective monk level of 4: 1d8."],
    "stunning fist": ["Unarmed style option (not taken: Combat Reflexes replaced it)", "Declare before an unarmed hit: Fort save or stunned 1 round.", "Declared before the attack roll, once per round. If the unarmed strike hits, the target makes a Fortitude save (DC 10 + half her level + Wis) or is stunned until just before her next turn. Uses per day are tracked under Hit points; a missed attack still spends the use."],
    /* ranger talents */
    "skirmishing attack": ["Ranger talent", "Move 10 ft and attack: the first attack counts as against a flat-footed foe.", "Whenever she moves at least 10 ft and attacks in the same round, she can apply stealth attack damage (if she otherwise qualifies by terrain or favored enemy) to her first attack, as though the target were flat-footed."],
    "improved stealth attack": ["Ranger talent", "+1d6 stealth attack damage.", "Adds 1d6 to her stealth attack damage."],
    "deadly range": ["Ranger talent", "Stealth attack range +10 ft (stacks).", "Increases the range at which her ranged stealth attacks work by 10 ft (from 30 ft). Can be taken more than once; the effects stack."],
    "hawk's eyes": ["Ranger talent", "Standard action: a ranged attack ignoring concealment and partial/soft cover.", "As a standard action, a ranged attack that ignores concealment (not total concealment), soft cover and partial cover, and can still deal stealth attack damage."],
    /* enhanced companion */
    "improved animal companion": ["Ranger bonus feat (Enhanced Companion, 7th)", "Gwathfaron: +1d8 hp, +1 Dex, +2 natural armor.", "Her animal companion gains an extra Hit Die's worth of hit points (+1d8), +1 Dex and +2 natural armor. All are counted on Gwathfaron's tab."],
    "greater animal companion": ["Ranger feat (needs Improved Animal Companion, stealth attack and fast movement)", "A bonus feat for Gwathfaron; move action: lend him her stealth attack and fast movement.", "Gwathfaron gains a bonus feat (an animal feat, or any feat he can physically use since his Int is 3). As a move action she can also grant him the benefits of her stealth attack and fast movement for rounds equal to twice her Wis modifier (minimum 1), while he stays within 30 ft and can see, hear or sense her."],
    /* mythic */
    "mythic spell lore": ["Mythic feat (tier 1)", "Mythic versions of fireball and dimension door.", "She learns mythic spells equal to her tier (2 now: fireball and dimension door) and can spend 1 mythic power when casting them to use the mythic version. See the Mythic version option on those spells."],
    /* Gwathfaron's */
    "skill focus": ["General feat", "+3 on one skill (+6 at 10 ranks).", "+3 on all checks with the chosen skill, rising to +6 once he has 10 ranks in it."],
    "skill focus (stealth)": ["General feat", "+3 Stealth (+6 at 10 ranks).", "+3 on Stealth checks, rising to +6 at 10 ranks."],
    "skill focus (perception)": ["General feat", "+3 Perception (+6 at 10 ranks).", "+3 on Perception checks, rising to +6 at 10 ranks."],
    "cunning": ["General feat", "+1 skill rank per Hit Die.", "He gains 1 additional skill rank per Hit Die: as many ranks as his Hit Dice right away when he takes it, and 1 more every time he gains a Hit Die. Taken in place of Stealthy for an all-round companion."],
    "stealthy": ["General feat", "+2 Stealth and Escape Artist.", "+2 on Stealth and Escape Artist checks (+4 with 10 ranks in a skill)."],
    "alertness": ["General feat", "+2 Perception and Sense Motive.", "+2 on Perception and Sense Motive checks (+4 with 10 ranks in a skill). Not on the animal feat list; his Int 3 lets him take any feat he can use."],
    "multiattack": ["Monster feat (bonus at effective druid level 9)", "Secondary natural attacks at −2 instead of −5.", "His secondary natural attacks (the claws) take only −2 on attack rolls instead of −5."]
  };
  /* one lookup for every info button: feats (by name), her class abilities ("ab:"), skills ("skill:"), tricks ("trick:"), Gwathfaron's abilities ("pet:") */
  function featInfo(name) {
    var n = String(name || "").trim(), k = n.toLowerCase(), R = root.RulesInfo || {};
    return DYN_INFO[k] || R[k] || FEAT_INFO[k] || FEAT_INFO[k.replace(/\s*\(.*\)$/, "")] || null;
  }
  function plainName(key) { return String(key).replace(/^(ab|skill|trick|pet):/i, ""); }
  /* label: what shows; extra: her own numbers, added to the hover and the dialog */
  function featBtn(key, label, extra) {
    var f = featInfo(key), nm = label || plainName(key);
    var tipTxt = (f ? f[1] : "Tap for details") + (extra ? " · " + extra : "");
    return '<button type="button" class="featbtn tip" data-feat="' + esc(key) + '" data-title="' + esc(nm) + '"' + (extra ? ' data-extra="' + esc(extra) + '"' : "") + ' data-tip="' + esc(tipTxt) + '">' + esc(nm) + "</button>";
  }
  /* take 10 (not threatened or distracted) and take 20 (20 times as long, only when failing costs nothing and the
     skill can be retried). Use Magic Device allows neither; skills with no retry can't take 20. */
  var NO_T20 = { "Appraise": "no retry", "Sense Motive": "no retry", "Spellcraft": "no retry to identify", "Use Magic Device": "not allowed" };
  function takes(name, total) {
    var no10 = name === "Use Magic Device", why = NO_T20[name] || (/^Knowledge/.test(name) ? "no retry" : "");
    return { t10: no10 ? null : 10 + total, t20: why ? null : 20 + total, why: no10 ? "Use Magic Device: no taking 10 or 20" : why ? "no take 20 (" + why + ")" : "" };
  }
  function takeCell(name, total) {
    var t = takes(name, total);
    return '<span class="num">' + (t.t10 == null ? "--" : t.t10) + "/" + (t.t20 == null ? "--" : t.t20) + "</span>";
  }
  function takeText(name, total) {
    var t = takes(name, total);
    return (t.t10 == null ? "" : " Take 10: " + t.t10 + ".") + (t.t20 == null ? " " + t.why.charAt(0).toUpperCase() + t.why.slice(1) + "." : " Take 20: " + t.t20 + ".");
  }
  var TAKE_RULES = "<b>Take 10:</b> when she isn't threatened or distracted, count the d20 as a 10 instead of rolling. <b>Take 20:</b> when she has plenty of time and failing costs nothing, count it as a 20; it takes 20 times as long (2 minutes for a 1-round check) and only works for checks she could retry.";
  function featHtml(key, extra) {
    var f = featInfo(key), nm = plainName(key);
    var url = "https://aonprd.com/Search.aspx?Query=" + encodeURIComponent(nm.replace(/\s*\(.*\)$/, ""));
    return (f ? '<p class="hint">' + esc(f[0]) + '</p><p class="feattext">' + esc(f[2]) + "</p>" : '<p class="hint">No description recorded for this one yet.</p>') +
      (extra ? '<p class="featextra"><b>Hers:</b> ' + esc(extra) + "</p>" : "") +
      (function () { var A = root.Actions, m = /^skill:(.*)$/i.exec(key), sa = A && m && A.SKILL_ACT[m[1]]; return sa ? '<p class="featextra"><b>Action:</b> ' + esc(A.ACT[sa[0]]) + ". " + esc(sa[1]) + "</p>" : ""; })() +
      (/^skill:/i.test(key) ? '<p class="hint">' + TAKE_RULES + "</p>" : "") +
      (/^(ab|pet|trick):/i.test(key) ? "" : '<p class="hint"><a href="' + esc(url) + '" target="_blank" rel="noopener">Look it up on Archives of Nethys</a></p>');
  }
  /* her feats, traits and talents, built from the printed sheet plus her level-up picks */
  /* her feats, traits and talents as data: [[group title, [[level, name, note, isOpenSlot]]]], used by the sheet and the RPoL export */
  function featGroups(st) {
    var pk = picksOf(st), L = levelOf(st);
    var R = function (lvl, name, note) { return [lvl, name, note || "", false]; };
    var open = function (lvl, id, what) { return pk[id] ? R(lvl, pk[id]) : [lvl, what, "open, see Level-up picks", true]; };
    var HN = "teamwork; Gwathfaron has it too (within 30 ft of her)";
    var regular = [R("L1", "Weapon Finesse"), R("L1", "Improved Unarmed Strike"), R("L3", "Two-Weapon Fighting"), R("L3", "Weapon Focus (unarmed strike)"),
      R("L5", "Outflank", HN), R("L5", "Precise Strike", "GM's extra feat; " + HN), R("L7", "Improved Two-Weapon Fighting"), R("L7", "Expanded Arcana", "detonate")];
    var style = [R("L2", "Monastic Legacy"), R("L6", "Combat Reflexes", "replaced Stunning Fist")], tal = [R("L4", "Skirmishing Attack"), R("L7", "Improved Stealth Attack")], ec = [R("L7", "Improved Animal Companion")];
    for (var l = 9; l <= L; l++) {
      if (l % 2) { regular.push(open("L" + l, "feat-" + l + "a", "Feat")); regular.push(open("L" + l, "feat-" + l + "b", "GM's extra feat")); }
      if ([10, 14, 18].indexOf(l) >= 0) style.push(open("L" + l, "cs-" + l, "Combat style feat"));
      if ([9, 11, 13, 16, 19].indexOf(l) >= 0) tal.push(open("L" + l, "tal-" + l, "Ranger talent"));
      if ([10, 13, 16, 19].indexOf(l) >= 0) ec.push(open("L" + l, "ec-" + l, "Enhanced Companion feat"));
    }
    return [
      ["Racial (moon elf, alternate features)", ["Low-Light Vision", "Keen Senses", "Silver-Tongued Diplomacy", "Wanderer's Stride", "Moonlight Resilience"].map(function (n) { return R("", n); })],
      ["Traits and drawback", [R("", "Reactionary"), R("", "Friend in Every Town"), R("", "Gifted Adept", "scorching ray"), R("", "Umbral Unmasking", "drawback, pays for Gifted Adept")]],
      ["Feats (the normal feat plus the GM's extra feat at odd levels)", regular],
      ["Teamwork (Companion-Bound, 4th; Gwathfaron shares them)", [R("L4", "Coordinated Companion", "Gwathfaron gets all her teamwork feats while within 30 ft of her"), R("L4", "Bonded Mind", HN)]],
      ["Combat style (unarmed, prerequisites waived)", style],
      ["Ranger talents", tal],
      ["Enhanced Companion", ec],
      ["Mythic", [R("T1", "Mythic Spell Lore")]]
    ];
  }
  function featsSec(st) {
    var row = function (r) {
      if (r[3]) return "<li><span class=\"flv\">" + esc(r[0]) + '</span><span class="hint">' + esc(r[1]) + " (" + esc(r[2]) + ")</span></li>";
      return "<li><span class=\"flv\">" + esc(r[0]) + "</span>" + featBtn(r[1]) + (r[2] ? ' <span class="hint">' + esc(r[2]) + "</span>" : "") + "</li>";
    };
    return sec("Feats, traits and talents",
      '<p class="hint">Hover or tap a name for what it does; tap for the full text.</p>' +
      featGroups(st).map(function (g) { return g[1].length ? '<div class="fgroup"><div class="gl">' + esc(g[0]) + '</div><ul class="featlist">' + g[1].map(row).join("") + "</ul></div>" : ""; }).join(""), false);
  }

  /* ---------- class and mythic abilities: built per render so the numbers follow her level ---------- */
  var DYN_INFO = {};
  function classLists(st, d) {
    var PR = d.prog, sp = d.sp, L = d.level, fe = d.fe, cha = sp.cha, sd = PR.stealthDice;
    var A = function (key, type, short, full) { DYN_INFO["ab:" + key.toLowerCase()] = [type, short, full]; return key; };
    var feTxt = fe.map(function (f) { return f.name + " +" + f.b; }).join(", ");
    var ranger = [
      A("Favored Enemy", "Spell-less Ranger (1st, more at 5th, 10th...)", feTxt + " on attack and damage.",
        "Her favored enemies: " + feTxt + ". Against them she adds the bonus to weapon attack and damage rolls (her unarmed strikes count) and to Bluff, Knowledge, Perception, Sense Motive and Survival checks. Gwathfaron shares it (Companion-Bound). Choose the target under Conditions to add it to the sheet."),
      A("Favored Terrain (forest)", "Companion-Bound (single terrain)", "+" + PR.forest + " initiative, Perception, Stealth, Survival, Knowledge (geography) in forest.",
        "Companion-Bound gives one favored terrain whose bonus grows instead of adding new terrains: forest +" + PR.forest + " on initiative, Knowledge (geography), Perception, Stealth and Survival there. +2 at 3rd level, +2 more at 8th and every five levels after (13th, 18th). Travelling through forest she normally leaves no trail and can't be tracked, unless she chooses to leave one. It also turns on her stealth attack and fast movement in forest, and Gwathfaron shares it. Replaces favored terrain. Turn on In forest under Conditions."),
      A("Track", "Spell-less Ranger (1st)", "+" + PR.track + " Survival to follow tracks.",
        "She adds half her level (+" + PR.track + ") to Survival checks made to follow or identify tracks. Swift Tracker (8th): she moves at normal speed while tracking without the −5 penalty, and takes only −10 (not −20) at up to twice normal speed."),
      A("Wild Empathy", "Spell-less Ranger (1st)", "Improve an animal's attitude: " + (d.empathy >= 0 ? "+" : "") + d.empathy + ".",
        "Like Diplomacy, but for animals (and magical beasts with Int 1 or 2 at −4): 1d20 + her level + Cha (" + (d.empathy >= 0 ? "+" : "") + d.empathy + "), +4 with Gwathfaron. She and the animal must be within 30 ft and able to study each other; it usually takes 1 minute."),
      A("Combat Style (unarmed)", "Spell-less Ranger (2nd, 6th, 10th...)", "Bonus unarmed style feats, prerequisites waived.",
        "She chose the Unarmed combat style (Ascension Games, Ranger Archetypes; GM-approved, since the Expanded Spell-less Ranger lists archery and two-weapon combat plus the APG styles). Bonus feats at 2nd, 6th, 10th, 14th and 18th level from the style's list, without needing the prerequisites (a feat needing Weapon Specialization needs Weapon Focus instead). The list: Combat Reflexes, Improved Unarmed Strike, Monastic Legacy, Two-Weapon Fighting; from 6th also Improved Two-Weapon Fighting, Punishing Kick, Stunning Fist; from 10th also Greater Two-Weapon Fighting and Spring Attack. Hers: Monastic Legacy (2nd) and Combat Reflexes (6th, in place of Stunning Fist). Still open to her: Stunning Fist, Punishing Kick, and from 10th Greater Two-Weapon Fighting or Spring Attack. Style feats only work in light, medium or no armor."),
      A("Stealth Attack", "Spell-less Ranger (2nd, +1d6 every 4 levels)", "+" + sd + "d6 when the target is denied Dex or flanked.",
        "Extra " + sd + "d6 damage (with Improved Stealth Attack) when the target is denied its Dex bonus to AC or she flanks it, but only in a favored terrain or against a favored enemy, and only in light, medium or no armor. Not multiplied on a critical hit. Ranged attacks (arcane artillery included) count only within 30 ft, and flanking never counts at range."),
      A("Nature's Healing", "Spell-less Ranger (3rd)", "+2 Heal in a favored terrain, better care in forest.",
        "+2 on Heal checks in a favored terrain. In forest she also gives long-term care (3 hp per character level for 8 hours of rest, or 6 for a full day; the same for ability damage), treats deadly wounds for an extra 1d6 + 1 hp per 3 levels with no healer's kit, and gives +8 on the patient's save when her Heal check beats a poison or disease DC by 5."),
      A("Animal Companion", "Companion-Bound (3rd)", "Gwathfaron, effective druid level " + PR.pet.druid + ".",
        "Companion-Bound gives her an animal companion at her full level (effective druid level " + PR.pet.druid + "): Gwathfaron, a panther. Unlike a normal ranger she may pick any animal a druid could. +4 on wild empathy and Handle Animal with him; he shares her favored enemy and terrain bonuses. His full sheet is on his tab. Replaces Endurance. Companion-Bound rangers may not take the Additional Animal Companion talent."),
      A("Teamwork", "Companion-Bound (4th)", "Coordinated Companion plus one teamwork feat (Bonded Mind).",
        "At 4th level she gains Coordinated Companion and another teamwork feat as bonus feats (she must meet its prerequisites). Through Coordinated Companion, Gwathfaron counts as having all her teamwork feats while he is within 30 ft and can see, hear or otherwise sense her, and only when working with her, not with other allies. Replaces hunter's bond."),
      A("Fast Movement", "Spell-less Ranger (5th)", "+" + PR.fastMove + " ft speed in a favored terrain.",
        "+" + PR.fastMove + " ft to her base speed while in a favored terrain (forest), only in light, medium or no armor. Speed " + (35 + PR.fastMove) + " ft in forest."),
      A("Enhanced Companion", "Companion-Bound (7th)", "Bonus companion feat: Improved Animal Companion.",
        "At 7th level, and again at 10th, 13th, 16th and 19th, she gains a bonus feat from Greater Animal Companion, Improved Animal Companion, Increased Devotion or Invulnerable Animal Companion, or an animal feat for Gwathfaron instead. Taken: Improved Animal Companion. Replaces woodland stride."),
      A("Swift Tracker", "Spell-less Ranger (8th)", "Track at normal speed with no penalty.",
        "She can move at her normal speed while using Survival to follow tracks without the normal −5 penalty, and takes only −10 (instead of −20) when moving at up to twice normal speed."),
      A("Proficiencies", "Spell-less Ranger", "Simple and martial weapons, light and medium armor, shields.",
        "All simple and martial weapons, light and medium armor, and shields except tower shields (from the ranger side; Eternal Mage adds nothing). Her unarmed strikes count as armed through Improved Unarmed Strike.")
    ];
    var mage = [
      A("Eternal Spellcasting", "Eternal Mage (1st)", "No slots: casting is limited only by burnout and concentration.",
        "Cha-based arcane casting from the wizard list with no spell slots and no preparation. She can cast any spell she knows as often as she likes, limited only by eldritch burnout and limited concentration. She needs Cha 10 + spell level to learn or cast a spell."),
      A("Eldritch Burnout", "Eternal Mage (1st)", "Each cast of 1st level or higher adds (level − " + PR.buffer + ") burnout.",
        "Casting a spell of 1st level or higher adds burnout equal to its level minus her arcane buffer (" + PR.buffer + ", minimum 0), +1 for the experimental spell. Each point is −1 caster level; every 2 points −1 spell DC and −1d6 artillery damage. At caster level 0 she can cast only cantrips. She recovers 1 at the end of any round with no burnout gained. Tracked in the Resources panel."),
      A("Arcane Buffer", "Eternal Mage (4th, 8th, 12th...)", "Every spell gives " + PR.buffer + " less burnout.",
        "Reduces the burnout from every spell she casts by " + PR.buffer + " (minimum 0). So 1st and 2nd-level spells cost nothing at 8th level."),
      A("Arcane Overdrive", "Eternal Mage (1st)", "Pool of " + sp.od + "; 1 point ignores up to " + sp.odIgnore + " burnout.",
        "A pool of " + sp.od + " points (Cha " + (cha >= 0 ? "+" : "") + cha + " + half her level). As a free action when casting she spends 1 to ignore up to " + sp.odIgnore + " burnout from that spell. Refills after 8 hours of sleep (New day). Some secrets spend overdrive too."),
      A("Limited Concentration", "Eternal Mage (1st; Expanded Focus at 7th)", PR.slots + " spells with a duration at once.",
        "She can keep only " + PR.slots + " spells with a duration (other than instantaneous or permanent) active at once (Expanded Focus adds one at 7th and 14th). Casting another ends the oldest. Shown under Concentration."),
      A("School Focus", "Eternal Mage (1st, more at 5th...)", "Evocation, Abjuration, Transmutation, Conjuration.",
        "She learns spells only from her focus schools (plus universal spells): Evocation, Abjuration, Transmutation, and Conjuration as her additional school at 5th. An additional school at 10th, 15th and 20th. Experimental spells and Wild Arcana ignore this."),
      A("Arcane Artillery", "Eternal secret (Artillery Adept, 1st)", sp.artDice + "d6+" + sp.artFlat + " ranged touch, 30 ft.",
        "Standard action: a ranged touch attack within 30 ft for " + sp.artDice + "d6 + Cha untyped arcane damage. Artillery Adept makes it cost no overdrive; instead it counts as a spell of half her level (" + LV().ord(PR.artLvl) + ") for burnout, and her buffer applies. Each 2 burnout: −1d6 and −1 DC. Only one secret modifies each shot."),
      A("Artillery Overdrive", "Artillery Expert (2nd)", "1 overdrive: artillery dice become d8s.",
        "She can spend 1 overdrive point when using arcane artillery to roll d8s instead of d6s. A separate spend from the overdrive that ignores burnout."),
      A("Artillery Burst", "Eternal secret", "A 15-ft burst around her instead, Reflex half.",
        "Instead of a single ranged touch, arcane artillery explodes in a 15-ft burst centered on her (she is unaffected). Reflex half, DC " + sp.secretDc + ". No attack roll, so no stealth attack."),
      A("Artillery Sniper", "Eternal secret", "Arcane artillery reaches 120 ft.",
        "Arcane artillery's range becomes 120 ft. A stealth attack still needs the target within 30 ft."),
      A("Experimental Spell", "Eternal Mage (6th)", "One spell a day from the whole list, +1 burnout.",
        "Each day she may learn one spell from the sorcerer/wizard list (any school), of any level except her highest (up to " + LV().ord(PR.expMax) + "), as her experimental spell; it costs +1 burnout. At 11th it may be her highest level for +1 more; at 17th she gets a second. Locked in from the Spells panel."),
      A("Expanded Concentration", "Eternal Mage (7th)", "One more duration spell at once.", "At 7th level (and 14th) she can keep one more spell with a duration active at once. She has " + PR.slots + " now.")
    ];
    var myth = [
      A("Mythic Power", "Mythic (tier 1)", "7 uses a day.", "3 + 2 × tier = 7 uses a day, refilled by 8 hours of rest. Spent on Surge, Amazing Initiative's extra action, Wild Arcana, and the mythic versions of her mythic spells."),
      A("Surge", "Mythic (Su, tier 1)", "1 mythic power: +1d6 on a d20 roll she just made.", "Immediate action, after seeing the result but before the outcome is known: spend 1 mythic power to add 1d6 to a d20 roll she just made (1d8 at tier 4, 1d10 at tier 7)."),
      A("Hard to Kill", "Mythic (Ex, tier 1)", "Stabilizes automatically; dies at −32.", "Below 0 hit points she stabilizes automatically, and she dies only at negative hit points equal to double her Con score (−32). Bleed damage still hurts."),
      A("Amazing Initiative", "Mythic (Ex, tier 2)", "+2 initiative; 1 mythic power for an extra standard action.", "+2 on initiative (her tier). Once per round, as a free action on her turn, she can spend 1 mythic power for an extra standard action that turn. It can't be used to cast a spell, so no spells or artillery."),
      A("Wild Arcana", "Archmage arcana (Su, tier 1)", "1 mythic power: cast any wizard spell she doesn't know, CL +2.", "Standard action (Mythic Adventures FAQ): spend 1 mythic power to cast any arcane spell on her list, known or not, with a casting time of 1 standard action or less. Its caster level counts as 2 higher. Burnout still applies; her focus schools don't restrict it. Wild Arcana lets her apply metamagic feats she knows, as long as the adjusted level is no higher than her highest castable spell level. She knows none yet; the Eternal Mage rules otherwise need the Metamagic Adept secret for metamagic, so if she ever learns one, ask the GM which rule wins. Cast it from the Wild Arcana column."),
      A("Eldritch Breach", "Archmage path ability (Su, tier 1)", "Roll caster level checks twice, take the higher.", "When she rolls a caster level check to dispel, to overcome spell resistance, or to see whether her magic affects a target, she rolls twice and takes the higher result."),
      A("Elemental Bond (fire)", "Archmage path ability (Su, tier 2)", "+2 CL on fire spells; fire resistance 10.", "Spells with the fire descriptor get her tier (+2) on caster level (fireball 10d6, scorching ray at CL 10). Fire resistance 10 (20 at tier 6, 30 at tier 9). Detonate counts only when she casts it as fire."),
      A("Mythic Ability Score", "Mythic (tier 2)", "+2 Int (counted).", "At tier 2 she raised Int by 2 (16 to 18). Already counted on the sheet.")
    ];
    return [["Spell-less Ranger abilities", ranger], ["Eternal Mage abilities", mage], ["Mythic abilities", myth]];
  }
  /* [[section, [[name, summary, full]]]] for the RPoL export */
  function classData(st, d) {
    return classLists(st, d).map(function (g) { return [g[0], g[1].map(function (k) { var e = DYN_INFO["ab:" + k.toLowerCase()]; return [k, e[1], e[2]]; })]; });
  }
  function classSecs(st, d) {
    var list = function (items) { return '<ul class="featlist">' + items.map(function (k) { return "<li>" + featBtn("ab:" + k.toLowerCase(), k) + ' <span class="hint">' + esc(DYN_INFO["ab:" + k.toLowerCase()][1]) + "</span></li>"; }).join("") + "</ul>"; };
    return classLists(st, d).map(function (g) { return sec(g[0], list(g[1]), false); }).join("");
  }

  /* ---------- letters of travel: picked from a list on her sheet, each opens in the info dialog ---------- */
  var MG_BASE = [
    "A sheet of sturdy parchment with a lacquer seal and a small colour-coded ribbon attached.",
    "It holds your given and sworn-to name, a description of your likeness, your given and sworn-to place of origin, and whether or not you're a magic-user (a tick box).",
    "If the box is ticked, a second sheet is attached: your sworn statement that you're not an aberration cultist, nor a necromancer.",
    "The seal at the bottom bears a simplified version of the High King's crest: a crown with rays connecting it to fields, valleys, a city and mountains, like rays of the sun. The symbols of Heironeous, St. Cuthbert and Pelor, together known as the Tri-theon, sit on the raised border of the seal at the cardinal West, East and South."
  ];
  var LETTERS = [
    { id: "kibrat", name: "Kibrat Erbetsim", sub: "Issued to people who wish to travel abroad; not used inside Kibrat Erbetsim", items: [
      "A square piece of vellum with a Celtic knot border, hand-drawn on each one.",
      "It specifies which Duchy you're from.",
      "It gives your name, or at least the name given at registration.",
      "It carries a small drawing of your likeness as it was at registration.",
      "A box to tick or leave for magic-use.",
      "For a magic-user, room to describe any familiar, with at least its species and name.",
      "Your signature or mark on a line, swearing the information given is correct.",
      "A stamp at the bottom shows the sigil of the Duke or Duchess reigning at the time of registration."] },
    { id: "mg-se", name: "Morningglory Kingdom: Southeast", ribbon: "Brown, with a single white line down the middle",
      covers: "the Uestor Provinces: Georglant, Bolotastna, Dolistrana, Elderhoch, Steegildye, Kritzen, Kapsil and Bergeston", items: MG_BASE },
    { id: "mg-ge", name: "Morningglory Kingdom: The Great East", ribbon: "Yellow, with a white border",
      covers: "Königsland, Sosserfann, Tempenkirn, Püresienstadt and Osterfeldte", items: MG_BASE },
    { id: "mg-ne", name: "Morningglory Kingdom: The Northeast", ribbon: "White, with a black border",
      covers: "Atmodtor, Dekkenholt, Barnheloff, Seeventor, Gausweer, Nortvoll, Eschen, Lassensil and Osterweer", items: MG_BASE },
    { id: "mg-nw", name: "Morningglory Kingdom: Neesenwald", ribbon: "Green, with a black border", covers: "Neesenwald",
      items: MG_BASE.concat(["It contains a small text in the Elven alphabet, though the language is Welorlarfe.",
        "You also sign a declaration that you're not a lycanthrope."]) },
    { id: "mg-radia", name: "Morningglory Kingdom: Radia", ribbon: "Cerulean, with three concentric circles in white",
      covers: "the city of Radia, a special case: it lies within the borders of Königsland",
      items: MG_BASE.concat(["Otherwise the same as the Great East letter."]) },
    { id: "eniran", name: "Eniran", ribbon: "Light blue; letters issued later than 1089 have a white starburst on the ribbon",
      items: ["Basically a copy of a Morningglory Kingdom letter of travel, except for the seal and ribbon."].concat(MG_BASE.slice(0, 3), [
        "The lacquer seal shows a silhouette of Mount Kashurra as seen from the East, and the holy symbols of the Tri-theon."]) },
    { id: "ekur", name: "Ekuran", items: [
      "An alchemically treated sheet of paper with the city seal embossed in the lower right corner.",
      "It has your name, at least the one you gave at registration.",
      "It states Ekur as your residence or nationality (one of the two is blotted out).",
      "People arriving without a letter of travel are made to register for one at the gate and are marked as Resident.",
      "A description of your likeness.",
      "A line quoting your own description of your potential magic-use.",
      "If you're a magic-user, a line describing any familiar you might have."] },
    { id: "serasole", name: "Serasole", items: [
      "It has the name you've given, where you have said you're from, and a description of your likeness.",
      "They will have asked whether you're a magic-user.",
      "Then a wax seal is added, made by stamping the heads side of a local Aûn (a platinum piece) into the hot wax."] }
  ];
  function letterHtml(id) {
    var l = LETTERS.filter(function (x) { return x.id === id; })[0];
    if (!l) return "";
    return (l.sub ? '<p class="hint">' + esc(l.sub) + "</p>" : "") +
      '<dl class="rows">' + (l.covers ? "<dt>Covers</dt><dd>" + esc(l.covers) + "</dd>" : "") + (l.ribbon ? "<dt>Ribbon</dt><dd>" + esc(l.ribbon) + "</dd>" : "") + "</dl>" +
      '<ul class="letter">' + l.items.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
  }
  function lettersSec() {
    return sec("Letters of travel", '<label class="field lettpick">Choose a letter to see it<select data-letter="1"><option value="">Choose…</option>' +
      LETTERS.map(function (l) { return '<option value="' + l.id + '">' + esc(l.name) + "</option>"; }).join("") + "</select></label>" +
      '<p class="hint">' + LETTERS.length + " letters: " + LETTERS.map(function (l) { return esc(l.name); }).join(" · ") + "</p>", false);
  }

  /* ---------- level-up picks ----------
     Every pick she makes herself (Levels.choices), grouped by level, each saved in state.picks[id] as she types.
     Ability picks change the numbers; the rest are names she fills in, shown here and on the printed sheet. */
  function choicesPanel(st, o, d) {
    var pk = picksOf(st), list = LV().choices(d.level), open = 0, byLvl = {};
    list.forEach(function (ch) { if (!pk[ch.id]) open++; (byLvl[ch.lvl] = byLvl[ch.lvl] || []).push(ch); });
    var feOpts = d.fe.map(function (f) { return [f.k, f.name]; });
    var field = function (ch) {
      var v = pk[ch.id] || "";
      if (o.readOnly) return '<span class="pkv">' + (v ? esc(ch.type === "ability" ? v.toUpperCase() : ch.type === "feplus" ? ((feOpts.filter(function (x) { return x[0] === v; })[0] || [0, v])[1]) : v) : '<span class="hint">open</span>') + "</span>";
      if (ch.type === "ability" || ch.type === "feplus") {
        var opts = ch.type === "ability" ? LV().ABIL : feOpts;
        return '<select class="pick" data-pick="' + ch.id + '"><option value="">Choose…</option>' + opts.map(function (x) { return '<option value="' + x[0] + '"' + (v === x[0] ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("") + "</select>";
      }
      var sm = /^sp-\d+-(\d)-/.exec(ch.id);
      if (sm) return '<input type="text" class="pick" data-pick="' + ch.id + '" list="wizL' + sm[1] + '" autocomplete="off" maxlength="80" value="' + esc(v) + '" placeholder="Search ' + (+sm[1] ? LV().ord(+sm[1]) + "-level" : "0-level") + ' wizard spells">';
      return '<input type="text" class="pick" data-pick="' + ch.id + '" maxlength="80" value="' + esc(v) + '" placeholder="Type the name">';
    };
    var body = Object.keys(byLvl).sort(function (x, y) { return x - y; }).map(function (l) {
      return '<div class="pklvl"><div class="gl">' + LV().ord(+l) + " level</div>" + byLvl[l].map(function (ch) {
        return '<label class="pkrow' + (pk[ch.id] ? "" : " open") + '"><span class="pkl"><span class="pkg">' + esc(ch.group) + "</span> " + esc(ch.label) + "</span>" + field(ch) + "</label>";
      }).join("") + "</div>";
    }).join("");
    var feats = LV().FEATURES, featLines = [];
    for (var l = 9; l <= d.level; l++) (feats[l] || []).forEach(function (f) { featLines.push("<li><b>" + LV().ord(l) + "</b> · " + esc(f[0]) + ": " + esc(f[1]) + "</li>"); });
    return '<div class="panel s-picks"><div class="ph"><h2>Level-up picks</h2><span class="hint">' + (open ? "<b>" + open + " open</b> · " : "All filled · ") + "level " + d.level + "</span></div>" + body +
      (featLines.length ? '<details class="sec"><summary>Class features gained since 8th level</summary><div class="sb"><ul>' + featLines.join("") + "</ul></div></details>" : "") +
      '<p class="hint">Ability increases count right away. Everything else is a name for your records: the tracker already counts the automatic gains (attack bonus, saves, caster level, artillery, stealth attack, Gwathfaron\'s table), but a feat or talent you type here doesn\'t change the numbers, except Greater Two-Weapon Fighting, which adds its strike.</p></div>';
  }

  /* ---------- status effects ----------
     state.fx = { her: [], pet: [] }, each {id, name, from, kind: "good" | "bad", left: rounds or null, note}.
     Entered by hand (from her or another caster). They are reminders: they don't change the numbers.
     The tracker counts "left" down by 1 each round (or by 10 / 100 / 600 with Pass time) and drops an effect at 0. */
  var FX_UNITS = [["r", "rounds", 1], ["m", "minutes", 10], ["h", "hours", 600], ["x", "until removed", 0]];
  function fxLeft(n) {
    if (n == null) return "until removed";
    /* hours, minutes and rounds, e.g. "1 h 12 min 3 rounds" (10 rounds = 1 min, 600 = 1 h) */
    var h = Math.floor(n / 600), m = Math.floor((n % 600) / 10), r = n % 10, out = [];
    if (h) out.push(h + " h");
    if (m) out.push(m + " min");
    if (r || !out.length) out.push(r + (r === 1 ? " round" : " rounds"));
    return out.join(" ");
  }
  function fxPanel(who, st, o) {
    var list = ((st.fx || {})[who] || []).slice();
    var rows = list.map(function (e) {
      return '<li class="fx ' + (e.kind === "bad" ? "bad" : "good") + '"><span class="fxk">' + (e.kind === "bad" ? "Harmful" : "Helpful") + "</span>" +
        '<span class="fxn">' + (e.spell ? '<button type="button" class="btn sm sinfo mini" data-spell="' + esc(e.spell) + '" aria-label="Spell text for ' + esc(e.spell) + '">i</button>' : "") + "<b>" + esc(e.name) + "</b>" + (e.from ? ' <span class="hint">from ' + esc(e.from) + "</span>" : "") +
        (e.note ? '<span class="fxt">' + esc(e.note) + "</span>" : "") + "</span>" +
        '<span class="fxd num">' + esc(fxLeft(e.left)) + "</span>" +
        (o.readOnly ? "" : '<button type="button" class="btn sm" data-act="fxdel" data-who="' + who + '" data-id="' + esc(e.id) + '" aria-label="Remove ' + esc(e.name) + '">End</button>') + "</li>";
    });
    /* her duration spells live in the Tracker's concentration slots; show the ones on this creature */
    (st.active || []).forEach(function (a) {
      if ((a.on || "her") !== who) return;
      rows.push('<li class="fx good mine"><span class="fxk">Her spell</span><span class="fxn"><button type="button" class="btn sm sinfo mini" data-spell="' + esc(a.name) + '" aria-label="Spell text for ' + esc(a.name) + '">i</button><b>' + esc(a.name) + '</b> <span class="hint">in a concentration slot, ends there</span></span>' +
        '<span class="fxd num">' + (a.end == null ? "open" : fxLeft(Math.max(0, a.end - (st.round || 1)))) + "</span></li>");
    });
    var form = o.readOnly ? "" :
      '<div class="fxform">' +
      '<div class="fxwide fxcombo"><label class="field">Spell or effect<input type="text" id="fxName-' + who + '" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="fxSug-' + who + '" autocomplete="off" maxlength="60" placeholder="Tap to pick, or type to narrow the list"></label>' +
      '<div class="fxsug" id="fxSug-' + who + '" role="listbox" hidden></div></div>' +
      '<label class="field">Cast by<input type="text" id="fxFrom-' + who + '" maxlength="40" placeholder="Daerlieth, or the caster\'s name"></label>' +
      '<label class="field">Caster level<input type="text" inputmode="numeric" id="fxCL-' + who + '" maxlength="2" placeholder="e.g. 8"></label>' +
      '<label class="field">Type<select id="fxKind-' + who + '"><option value="good">Helpful</option><option value="bad">Harmful</option></select></label>' +
      '<label class="field">Lasts<span class="fxdur"><input type="text" inputmode="numeric" id="fxN-' + who + '" maxlength="4" placeholder="8">' +
      '<select id="fxU-' + who + '">' + FX_UNITS.map(function (u) { return '<option value="' + u[0] + '">' + u[1] + "</option>"; }).join("") + "</select></span></label>" +
      '<label class="field fxwide">Effect (optional)<input type="text" id="fxNote-' + who + '" maxlength="120" placeholder="e.g. +1 attack, −2 AC, half speed"></label>' +
      '<p class="hint fxwide" id="fxInfo-' + who + '" aria-live="polite"></p>' +
      '<button type="button" class="btn primary" data-act="fxadd" data-who="' + who + '">Add effect</button></div>';
    return '<div class="panel s-fx"' + (who === "her" ? ' id="herfx"' : "") + '><div class="ph"><h2>Status effects</h2><span class="hint">Spells and effects on ' + (who === "pet" ? "Gwathfaron" : "her") + ", helpful or harmful</span></div>" +
      (rows.length ? '<ul class="fxlist">' + rows.join("") + "</ul>" : '<p class="hint">None right now.</p>') + form +
      '<p class="hint">Reminders only: they don\'t change the numbers on the sheet. Rounds count down as the round advances; minutes and hours count in rounds too (1 min = 10 rounds).</p></div>';
  }

  /* ---------- Gwathfaron tab ---------- */
  /* her Handle Animal with Gwathfaron: her skill total plus the +4 Companion-Bound bond */
  function handleWith(st) { var h = derive(st).skills.filter(function (s) { return s.name === "Handle Animal"; })[0]; return (h ? h.total : 0) + 4; }
  function renderPet(st, o) {
    o = o || {};
    var c = st.cond || {}, tgt = c.target ? feBonus(st, c.target) : 0;
    var p = derivePet(c, tgt, petRanks(st), st), m = p.m, cp = p.cp, hp = st.petHp == null ? p.hpMax : st.petHp, h = "";
    var PRp = progOf(st), fes = favoredEnemies(st);
    var hpBtn = function (d) { return '<button class="btn sm" data-act="hp" data-k="petHp" data-d="' + d + '">' + (d > 0 ? "+" : "−") + Math.abs(d) + "</button>"; };
    var shared = '<div class="grp"><div class="gl">Shared with Daerlieth</div>' +
      tg("cond", "forest", CONDS.forest, c.forest, "+" + PRp.forest + " initiative, Perception, Stealth, Survival") +
      '<div class="gl">His flanking</div>' + flankSeg(st, "pet") +
      '<div class="seg" role="group" aria-label="Target">' +
      tg("cond", "target", "No favored enemy", !c.target, "", "") +
      fes.map(function (f) { return tg("cond", "target", f.name, c.target === f.k, "+" + f.b + " attack and damage", f.k); }).join("") + "</div></div>";
    var status = hp > 0 ? "Up" : hp === 0 ? "Disabled" : hp > -p.dead ? "Dying" : "Dead";

    h += '<div class="panel"><div class="ph"><div class="idhead"><button type="button" class="portrait" data-portrait="gwathfaron" aria-label="Show Gwathfaron\'s portrait"><img src="images/gwathfaron-thumb.webp" alt="" width="64" height="64"></button><div><h2>Gwathfaron</h2><span class="hint">Panther (Core Rulebook small cat, leopard), Medium animal companion · effective druid level ' + cp.druid + " · " + p.hd + ' HD · N</span></div></div></div>' +
      '<div class="sgrid">' +
      box("HP", hp + "<small>/" + p.hpMax + "</small>", status + " · dies at −" + p.dead, p.t.hp) +
      box("AC", p.ac, tip("touch " + p.touch, p.t.touch) + " · " + tip("flat-footed " + p.ff, p.t.ff), p.t.ac) +
      box("Initiative", sg(p.init), p.forest ? "forest counted" : "+" + PRp.forest + " in forest", p.t.init) +
      box("Speed", p.speed + " ft", (p.haste ? "hasted · " : "") + "sprint: " + p.speed * 10 + " ft charge, once an hour", "Small cat base speed 50 ft" + (p.haste ? ", +30 ft haste" : "") + ". Sprint (Ex): once an hour, a charge at ten times his speed") +
      box("Fort", sg(p.fort), "", p.t.fort) + box("Ref", sg(p.ref), cp.impEvasion ? "improved evasion" : "evasion", p.t.ref) + box("Will", sg(p.will), "+4 vs enchantment", p.t.will) +
      box("Bite", sg(p.bite), "1d6" + sg(p.biteD) + " + trip", p.t.bite) +
      box("Claws ×2", sg(p.claw), "1d3" + sg(p.clawD), p.t.claw) +
      box("CMB / CMD", sg(p.cmb) + " / " + p.cmd, (p.cmd + 4) + " vs trip", p.t.cmb) +
      box("Stealth", sg(p.stealth), "", p.t.stealth) + box("Perception", sg(p.perc), "scent, low-light vision", p.t.perc) +
      "</div>" +
      (o.readOnly ? "" : '<div class="ctl">' + [-10, -5, -1, 1, 5, 10].map(hpBtn).join("") + "</div>") +
      shared + "</div>";
    h += fxPanel("pet", st, o);

    var abRow = function (k, label) { return [label, tip(String(p.ab[k]), p.ab_t[k]), sg(m[k])]; };
    h += sec("Abilities", tbl(["", "Score", "Mod"], [abRow("str", "STR"), abRow("dex", "DEX"), abRow("con", "CON"), abRow("int", "INT"), abRow("wis", "WIS"), abRow("cha", "CHA")]) +
      '<p class="hint">Small cat base Str 12, Dex 21, Con 13, Int 2, Wis 12, Cha 6. 4th-level advancement: Str +4, Dex −2, Con +2 (Medium). Companion bonus Str/Dex +' + cp.strDex + '. Ability score increase at 4 HD: +1 Int (2 to 3: at Int 3 a companion can take any feat it can use, which opens Alertness); later ones are her level-up picks. Improved Animal Companion +1 Dex. Tap a score for its breakdown.</p>', true);

    h += sec("Defense", tbl(["", "Total", "How"], [
      ["AC", p.ac, "10 + " + m.dex + " Dex + " + p.nat + " natural"],
      ["Touch", p.touch, "10 + " + m.dex + " Dex"],
      ["Flat-footed", p.ff, "10 + " + p.nat + " natural"],
      ["Hit points", p.hpMax, p.hd + "d8 " + sg(p.hd * m.con) + " Con, +1d8 Improved Animal Companion (averages)"],
      ["Fort", sg(p.fort), cp.good + " base + " + m.con + " Con"],
      ["Ref", sg(p.ref), cp.good + " base + " + m.dex + " Dex"],
      ["Will", sg(p.will), cp.poor + " base + " + m.wis + " Wis; +4 morale vs enchantment (devotion)"]
    ]) + '<p class="hint">Natural armor ' + p.nat + ' = 1 (small cat) + ' + cp.natBonus + ' (companion table) + 2 (Improved Animal Companion). ' + (cp.impEvasion ? "Improved evasion: half damage even on a failed Reflex save." : "Evasion: no damage on a successful Reflex save for half.") + " Dies at −" + p.dead + " (Con " + p.ab.con + ").</p>", true);

    /* attack picker, like hers: action saved in cond.petAtk */
    var pm = { std: "std", charge: "charge", aoo: "aoo" }[c.petAtk] || "full";
    var pPick = '<div class="atkpick"><div class="grp"><div class="gl">Action</div><div class="seg seg-row" role="group" aria-label="Gwathfaron attack action">' +
      tg("cond", "petAtk", "Standard attack", pm === "std", "standard action, bite", "std") +
      tg("cond", "petAtk", "Full attack", pm === "full", "bite and 2 claws, 5-ft step only", "") +
      tg("cond", "petAtk", "Charge", pm === "charge", "full-round, bite at +2", "charge") +
      tg("cond", "petAtk", "Attack of opportunity", pm === "aoo", "bite, on their turn", "aoo") + "</div></div></div>";
    var pps = p.flankPrec ? " +1d6 precision" : "";
    var biteD = "1d6" + sg(p.biteD) + pps, clawD = "1d3" + sg(p.clawD) + pps, tripTxt = "On a hit: free trip attempt at CMB " + sg(p.cmb) + ", doesn't provoke";
    var pRows = [];
    if (pm === "full") {
      pRows.push(["<b>Full attack: " + (p.haste ? "4 attacks, hasted" : "3 attacks") + "</b>", "<b>" + (p.haste ? [p.bite, p.bite, p.claw, p.claw] : [p.bite, p.claw, p.claw]).map(sg).join(" / ") + "</b>", "", "Full-round action; only a 5-ft step. Natural attacks, all at once." + (p.haste ? " Haste: +1 on every attack and one extra bite at his full bonus." : "")]);
      /* claws: secondary, −5 (−2 with Multiattack at 9th) */
      pRows.push([" Bite", sg(p.bite), biteD, "Primary, full Str. " + tripTxt]);
      if (p.haste) pRows.push([" Bite (haste)", sg(p.bite), biteD, "Haste: one extra attack at his highest bonus. " + tripTxt]);
      pRows.push([" Claw", sg(p.claw), clawD, "Secondary (−" + p.secPen + (cp.multiattack ? ", Multiattack" : "") + ", half Str)"]);
      pRows.push([" Claw", sg(p.claw), clawD, "Secondary (−" + p.secPen + (cp.multiattack ? ", Multiattack" : "") + ", half Str)"]);
    } else if (pm === "std") {
      pRows.push(["Bite (standard action)", sg(p.bite), biteD, "One attack; he can still move. " + tripTxt]);
    } else if (pm === "charge") {
      pRows.push(["Charge", sg(p.bite + 2), biteD, "Up to " + p.speed * 2 + " ft in a straight line, one bite at +2; −2 AC until his next turn. No pounce, so no claws. Sprint: once an hour a charge can cover 500 ft. " + tripTxt]);
    } else {
      pRows.push(["Attack of opportunity", sg(p.bite), biteD, "One a round. He threatens 5 ft. " + tripTxt]);
    }
    h += sec("Offense", pPick + tbl(["Attack", "Bonus", "Damage", "Notes"], pRows, "atk") +
      '<p class="hint">BAB ' + sg(cp.bab) + ', Str ' + sg(m.str) + ' on attack and damage. Space 5 ft, reach 5 ft. Built as a scout, not a fighter; his job is to flank so her stealth attack lands.' + (p.flank ? " " + flankLabel(p.flankMode, "pet").replace(/^f/, "F") + " +" + p.flank + (p.flank > 2 ? " (Outflank)" : "") + " counted" + (pps ? ", Precise Strike +1d6 on every hit" : "") + (p.flank > 2 || pps ? " (her teamwork feats, his while within 30 ft of her)." : ".") : "") + (p.tgt ? " Favored enemy " + sg(p.tgt) + " counted." : "") + " Tap a bonus at the top for its breakdown.</p>", true);

    var pLeft = p.ranksMax - p.ranksUsed, pEdit = !o.readOnly && pLeft !== 0;
    h += sec("Skills", '<p class="rkhead"><b>' + p.ranksUsed + " of " + p.ranksMax + "</b> ranks" + (pLeft > 0 ? " · <b>" + pLeft + " to place</b>" : pLeft < 0 ? " · <b>" + (-pLeft) + " too many</b>" : "") + "</p>" +
      tbl(["Skill", "Ranks", "Ability", "Class", "Misc", "Total", "Take 10/20"], p.skills.map(function (s) {
        var rc = pEdit ? '<span class="rks"><button type="button" class="btn sm rk" data-act="prank" data-k="' + esc(s.name) + '" data-d="-1"' + (s.ranks < 1 ? " disabled" : "") + '>−</button><b class="num">' + s.ranks + '</b><button type="button" class="btn sm rk" data-act="prank" data-k="' + esc(s.name) + '" data-d="1"' + (pLeft < 1 || s.ranks >= p.hd ? " disabled" : "") + ">+</button></span>" : String(s.ranks);
        return [featBtn("skill:" + s.name, s.name, s.tip + " = " + sg(s.total) + "." + takeText(s.name, s.total)) + (s.ranks ? "" : ' <small class="hint">untrained</small>'),
          rc, sg(s.abil) + ' <small class="hint">' + s.key.toUpperCase() + "</small>", s.cls ? "+3" : "", s.misc ? sg(s.misc) : "", "<b>" + sg(s.total) + "</b>", takeCell(s.name, s.total)];
      }), "sk pk") +
      '<p class="hint">' + p.ranksMax + " ranks: 1 per Hit Die from the companion table" + (p.cunning ? " and 1 per Hit Die from Cunning" : "") + " (Int would need to reach 10 to add more), at most " + p.hd + " in one skill. Rank buttons appear only while there are ranks to place." + ' Class skill +3 once a skill has a rank. All but Sense Motive are animal companion class skills (a rank there adds only +1). Misc: Skill Focus on Stealth, Skill Focus and Alertness on Perception, Alertness on Sense Motive, and her forest and favored enemy bonuses when those are on. Speed 50 ft gives +8 on Acrobatics checks to jump. Hover or tap a skill for the arithmetic.</p>', true);

    h += sec("Feats", "<ul>" +
      "<li>" + featBtn("Skill Focus (Stealth)") + "</li>" +
      "<li>" + featBtn("Skill Focus (Perception)") + "</li>" +
      "<li>" + featBtn("Cunning") + "</li>" +
      "<li>" + featBtn("Alertness") + "</li>" +
      p.feats.slice(4).map(function (f) { return "<li>" + featBtn(f) + ' <span class="hint">picked at level-up</span></li>'; }).join("") +
      (LV().prog(levelOf(st)).pet.multiattack ? "<li>" + featBtn("Multiattack") + ' <span class="hint">bonus</span></li>' : "") +
      ["Bonded Mind"].concat(BASE_FEATS).map(function (f) { return "<li>" + featBtn(f) + ' <span class="hint">teamwork, from Daerlieth (Coordinated Companion): his only while within 30 ft of her and aware of her</span></li>'; }).join("") + "</ul>" +
      '<p class="hint">' + cp.feats + " feats at " + p.hd + " HD" + (p.feats.length < cp.feats ? " (" + (cp.feats - p.feats.length) + " still to pick on Daerlieth's tab, Level-up picks)" : "") + ".</p>", false);

    h += sec("Tricks", "<p>" + cp.tricks + " tricks (6 from Int, " + (cp.tricks - 6) + " bonus):</p><ul>" +
      "<li>" + featBtn("trick:Attack", "Attack") + ' <span class="hint">any creature (counts as 2 tricks)</span></li>' +
      ["Come", "Down", "Guard", "Heel", "Seek", "Stay", "Track"].map(function (t) { return "<li>" + featBtn("trick:" + t, t) + "</li>"; }).join("") +
      Object.keys(st.picks || {}).filter(function (k) { return /^ptrick-/.test(k) && st.picks[k]; }).map(function (k) { return "<li>" + esc(st.picks[k]) + ' <span class="hint">picked at level-up</span></li>'; }).join("") + "</ul>" +
      '<p class="hint">Handle Animal ' + sg(handleWith(st)) + ' with him (+4 bond). Bonded Mind lets her give these silently.</p>', false);

    h += sec("Special abilities", "<ul>" +
      "<li>" + featBtn("pet:Link", "Link") + "</li>" +
      "<li>" + featBtn("pet:Share spells", "Share spells") + "</li>" +
      (cp.impEvasion ? "<li>" + featBtn("pet:Improved evasion", "Improved evasion") + "</li>" : "<li>" + featBtn("pet:Evasion", "Evasion") + "</li>") +
      (cp.multiattack ? "<li>" + featBtn("pet:Multiattack", "Multiattack") + "</li>" : "") +
      ["Devotion", "Scent", "Low-light vision", "Sprint", "Trip"].map(function (n) { return "<li>" + featBtn("pet:" + n, n) + "</li>"; }).join("") +
      "<li>" + featBtn("Improved Animal Companion") + ' <span class="hint">Daerlieth\'s Enhanced Companion feat, counted above</span></li>' +
      "<li>" + featBtn("pet:Shared bonuses", "Shared with Daerlieth", fes.map(function (f) { return f.name + " +" + f.b; }).join(", ") + ", forest +" + PRp.forest) + "</li></ul>", false);

    h += sec("Equipment", "<p>None.</p>" +
      '<p class="hint">Room for later: barding (he would need Light Armor Proficiency to wear it without penalty) and a collar in the neck slot (amulet of natural armor or amulet of mighty fists). Carrying capacity, Medium quadruped (1.5×) at Str ' + p.ab.str + ': light ' + Math.floor(maxLoad(p.ab.str) * 1.5 / 3) + ' lb, medium ' + Math.floor(maxLoad(p.ab.str) * 1.5 * 2 / 3) + ' lb, heavy ' + Math.floor(maxLoad(p.ab.str) * 1.5) + ' lb.</p>', true);

    var nx = LV().prog(Math.min(LV().MAX, d0level(st) + 1)).pet;
    h += sec("Advancement", d0level(st) >= LV().MAX ? "<p>Effective druid level 20: the table is complete.</p>" : "<ul>" +
      "<li><b>At her next level</b> (effective druid level " + nx.druid + "): " + nx.hd + " HD, BAB " + sg(nx.bab) + ", natural armor bonus +" + nx.natBonus + ", Str/Dex +" + nx.strDex + ", " + nx.ranks + " skill ranks, " + nx.feats + " feats, " + nx.tricks + " tricks" + (nx.multiattack && !cp.multiattack ? ", Multiattack" : "") + (nx.impEvasion && !cp.impEvasion ? ", improved evasion" : "") + ".</li>" +
      "<li><b>Greater Animal Companion</b> (her Enhanced Companion pick, later): a bonus animal feat for him, and a move action to give him her stealth attack and fast movement.</li></ul>", false);
    h += '<div class="panel rpolbar"><div><h2>RPoL character sheet</h2><span class="hint">Gwathfaron\'s sheet as plain text in the RPoL layout, with today\'s numbers.</span></div><button type="button" class="btn primary" data-rpol="pet">Generate RPoL sheet</button></div>';
    return h;
  }

  function d0level(st) { return levelOf(st); }
  var api = { takes: takes, flankMode: flankMode, flankLabel: flankLabel, hastedOn: hastedOn, derive: derive, render: render, renderPet: renderPet, PET: PET, petRanks: petRanks, ranksOf: ranksOf, SKILLS: SKILLS, hpMaxOf: hpMaxOf, levelOf: levelOf, FX_UNITS: FX_UNITS, LETTERS: LETTERS, letterHtml: letterHtml, featHtml: featHtml, featGroups: featGroups, classData: classData, featInfo: featInfo, hasFeat: hasFeat, BASE_FEATS: BASE_FEATS, fxLeft: fxLeft, handleWith: handleWith, ITEMS: ITEMS, CONDS: CONDS, BASE: BASE, PROSE: {} };
  root.SheetEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
