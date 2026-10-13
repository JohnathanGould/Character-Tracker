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
  function hasFeat(st, name) {
    var pk = picksOf(st), re = new RegExp(name, "i");
    return Object.keys(pk).some(function (id) { return /^(feat|cs)-/.test(id) && re.test(String(pk[id])); });
  }
  var LOAD = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 230, 260, 300, 350, 400, 460, 530, 610, 700, 800, 920, 1040, 1200, 1380];

  /* gear that can come off. wt counts toward her load only while it is worn. */
  var ITEMS = [
    { k: "shirt", name: "+1 mithral chain shirt", slot: "Armor", wt: 12.5, fx: "+5 armor, max Dex +6 to AC, 10% arcane spell failure" },
    { k: "wrap", name: "+1 bodywrap of mighty strikes", slot: "Body", wt: 1, fx: "+1 attack and damage on 2 unarmed strikes a round" },
    { k: "cloak", name: "Cloak of resistance +3", slot: "Shoulders", wt: 1, fx: "+3 resistance bonus on Fort, Ref and Will" },
    { k: "belt", name: "Belt of incredible dexterity +2", slot: "Belt", wt: 1, fx: "+2 enhancement to Dex" },
    { k: "band", name: "Headband of alluring charisma +2", slot: "Head", wt: 1, fx: "+2 enhancement to Cha" },
    { k: "amulet", name: "Amulet of natural armor +2", slot: "Neck", wt: 0, fx: "+2 natural armor" }
  ];
  var FIXED_WT = 5; /* handy haversack, 5 lb however full */

  var CONDS = {
    forest: "In forest (favored terrain)",
    charge: "Charging",
    ffoot: "Flat-footed",
    sneak: "Target flat-footed (denied Dex)",
    flank: "Flanking with Gwathfaron",
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
    ["Acrobatics", "dex", 5, 1, 0, 0, 1], ["Bluff", "cha", 0, 0, 0, 0], ["Climb", "str", 1, 1, 0, 0, 1], ["Diplomacy", "cha", 8, 1, 0, 0],
    ["Disable Device", "dex", 8, 0, 1, 0], ["Disguise", "cha", 0, 0, 0, 0], ["Escape Artist", "dex", 0, 0, 0, 0, 1], ["Fly", "dex", 0, 0, 0, 0, 1],
    ["Heal", "wis", 1, 1, 0, 0], ["Intimidate", "cha", 0, 0, 0, 0], ["Knowledge (arcana)", "int", 4, 1, 1, 0], ["Knowledge (dungeoneering)", "int", 4, 1, 1, 0],
    ["Knowledge (nature)", "int", 4, 1, 1, 0], ["Knowledge (religion)", "int", 4, 1, 1, 0], ["Perception", "wis", 8, 1, 0, 0], ["Ride", "dex", 0, 0, 0, 0, 1],
    ["Sense Motive", "wis", 8, 1, 0, 0], ["Spellcraft", "int", 8, 1, 1, 0], ["Stealth", "dex", 8, 1, 0, 0, 1], ["Survival", "wis", 8, 1, 0, 0],
    ["Swim", "str", 1, 1, 0, 0, 1], ["Use Magic Device", "cha", 8, 1, 1, 0],
    ["Appraise", "int", 0, 0, 0, 1], ["Artistry", "int", 0, 0, 0, 1], ["Craft", "int", 0, 0, 0, 1], ["Handle Animal", "cha", 8, 1, 1, 1],
    ["Knowledge (history)", "int", 4, 1, 1, 1], ["Linguistics", "int", 4, 1, 1, 1], ["Lore", "int", 0, 0, 0, 1], ["Perform", "cha", 0, 0, 0, 1],
    ["Profession", "wis", 0, 0, 1, 1], ["Sleight of Hand", "dex", 0, 0, 1, 1, 1]
  ];
  /* her ranks: state.ranks {skill: n} once she places new ranks at level-up, else the printed sheet's */
  function ranksOf(st) {
    var r = {}, saved = st && st.ranks;
    SKILLS.forEach(function (s) { r[s[0]] = saved && typeof saved === "object" && saved[s[0]] != null ? Math.max(0, Math.floor(+saved[s[0]] || 0)) : s[2]; });
    return r;
  }
  var UNUSABLE = ["Knowledge (local)", "Knowledge (planes)", "Knowledge (engineering)", "Knowledge (geography)", "Knowledge (nobility)"];


  /* ---------- Gwathfaron ----------
     Core Rulebook "Cat, small" (leopard) companion, Medium after its 4th-level advancement. His effective druid level
     is her level; HD, BAB, saves, natural armor, Str/Dex bonus, skill ranks, feats and tricks follow the companion
     table (Levels.prog(L).pet). Improved Animal Companion (her Enhanced Companion feat): +1d8 hp, +1 Dex, +2 natural.
     Build (a scout: Stealth and Perception first): the HD 4 ability increase to Int (2 to 3, which lets him take any
     feat he can use); feats Skill Focus (Stealth), Skill Focus (Perception), Stealthy, Alertness; ranks Stealth 4,
     Perception 3 at 7 HD. Later increases, feats and ranks are her level-up picks. */
  var PET = {
    dead: 15, nat: 1, speed: 50,
    base: { str: 12, dex: 21, con: 13, int: 2, wis: 12, cha: 6 },        /* small cat */
    adv4: { str: 4, dex: -2, con: 2 },                                      /* 4th-level advancement, Medium */
    feats: ["Skill Focus (Stealth)", "Skill Focus (Perception)", "Stealthy", "Alertness"],
    /* name, ability, ranks at 7 HD, class skill, misc [label, value] */
    skills: [
      ["Acrobatics", "dex", 0, 1, [["speed 50 ft, jumping only", 0]]], ["Climb", "str", 0, 1, []], ["Escape Artist", "dex", 0, 1, [["Stealthy", 2]]],
      ["Intimidate", "cha", 0, 1, []], ["Perception", "wis", 3, 1, [["Skill Focus", 3], ["Alertness", 2]]], ["Sense Motive", "wis", 0, 0, [["Alertness", 2]]], ["Stealth", "dex", 4, 1, [["Skill Focus", 3], ["Stealthy", 2]]],
      ["Survival", "wis", 0, 1, []], ["Swim", "str", 0, 1, []]
    ]
  };
  /* his ranks: state.petRanks once new ranks are placed at level-up, else the 7-HD build */
  function petRanks(st) {
    var r = {}, saved = st && st.petRanks;
    PET.skills.forEach(function (s) { r[s[0]] = saved && typeof saved === "object" && saved[s[0]] != null ? Math.max(0, Math.floor(+saved[s[0]] || 0)) : s[2]; });
    return r;
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
    var pf = c.forest ? progOf(st).forest : 0;
    var p = { ab: ab, abParts: abParts, m: m, forest: pf, tgt: tgt, hpMax: hpMax, dead: ab.con, hd: hd, bab: cp.bab, nat: natT, cp: cp };
    p.init = m.dex + pf;
    p.ac = 10 + m.dex + natT; p.touch = 10 + m.dex; p.ff = 10 + natT;
    p.fort = cp.good + m.con; p.ref = cp.good + m.dex; p.will = cp.poor + m.wis;
    var fl = c.flank ? 2 : 0, sec2 = cp.multiattack ? 2 : 5;
    p.flank = fl; p.secPen = sec2;
    p.bite = cp.bab + m.str + tgt + fl; p.biteD = m.str + tgt;
    p.claw = cp.bab + m.str - sec2 + tgt + fl; p.clawD = Math.floor(m.str / 2) + tgt; /* secondary attacks */
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
    p.ranksMax = cp.ranks;
    p.feats = PET.feats.concat(Object.keys(pk).filter(function (id) { return /^pfeat-/.test(id) && pk[id]; }).map(function (id) { return pk[id]; }));
    var fe = tgt ? [["favored enemy", tgt]] : [];
    p.t = {
      hp: (hd * 4.5) + " (" + hd + "d8 average) + " + hd * m.con + " Con (" + sg(m.con) + " × " + hd + " HD) + 4.5 (1d8 Improved Animal Companion) = " + hpMax,
      ac: how([["base", 10], ["Dex", m.dex], ["natural, small cat", 1], ["natural, companion table", cp.natBonus], ["natural, Improved Animal Companion", 2]]) + " = " + p.ac,
      touch: how([["base", 10], ["Dex", m.dex]]) + " = " + p.touch,
      ff: how([["base", 10], ["natural armor", natT]]) + " = " + p.ff + " (loses Dex)",
      init: how([["Dex", m.dex], ["forest", pf]]) + " = " + sg(p.init),
      fort: how([["base save (companion, " + hd + " HD)", cp.good], ["Con", m.con]]) + " = " + sg(p.fort),
      ref: how([["base save (companion, " + hd + " HD)", cp.good], ["Dex", m.dex]]) + " = " + sg(p.ref) + ". " + (cp.impEvasion ? "Improved evasion" : "Evasion"),
      will: how([["base save (companion, " + hd + " HD)", cp.poor], ["Wis", m.wis]]) + " = " + sg(p.will) + ". Devotion: +4 morale vs enchantment",
      bite: how([["BAB", cp.bab], ["Str", m.str]].concat(fe).concat(fl ? [["flanking", fl]] : [])) + " = " + sg(p.bite) + ". Damage 1d6 " + how([["Str", m.str]].concat(fe), " ").trim() + ". On a hit: free trip, CMB " + sg(cp.bab + m.str),
      claw: how([["BAB", cp.bab], ["Str", m.str], [cp.multiattack ? "secondary attack (Multiattack)" : "secondary attack", -sec2]].concat(fe).concat(fl ? [["flanking", fl]] : [])) + " = " + sg(p.claw) + ". Damage 1d3 " + how([["half Str", Math.floor(m.str / 2)]].concat(fe), " ").trim(),
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
    var haste = act("exp-haste"), er = act("expeditious-retreat"), cg = act("exp-cats-grace");
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
      base: P.save, fort: P.save + CO + cloak - sp2, ref: P.save + D + cloak - sp2, will: P.save + W + cloak - sp2,
      cloak: cloak, status: -sp2
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
    var flank = c.flank ? 2 : 0; /* flanking: +2 on melee attacks */
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
      single: common, charge: common + 2, stun: common,
      mains: mains, twMains: mains.map(function (x) { return x - 2; }), offs: offs, gtwf: offN > 2,
      mainA: common - 2, mainB: common - 7, offA: common - 2, offB: common - 7,
      stunUses: P.stunUses, stealthDice: P.stealthDice,
      dmgM: dmgM, dmgO: dmgO, haste: haste,
      stunDc: 10 + Math.floor(LEVEL / 2) + W,
      flank: flank,
      sneak: !!((c.sneak || c.flank) && (c.forest || tgt))
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
      rays: clF >= 3 ? Math.min(3, 1 + Math.floor((clF - 3) / 4)) : 1,
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
      rows.push({ name: name, key: key, ranks: ranks, total: total, usable: usable, bg: !!bg, trained: !!trained, tip: tip, misc: mo });
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
  function sec(title, body, open) {
    return '<details class="sec"' + (open ? " open" : "") + "><summary>" + esc(title) + "</summary><div class=\"sb\">" + body + "</div></details>";
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
    var gear = ITEMS.map(function (i) { return tg("eq", i.k, i.name, worn(i.k), i.fx); }).join("");
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
      tg("cond", "flank", CONDS.flank, c.flank, "+2 melee attack for both; her stealth attack +" + SD + " if forest or favored enemy") +
      tg("cond", "sneak", CONDS.sneak, c.sneak, "stealth attack +" + SD + " if forest or favored enemy") + "</div>" +
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
    h += '<div class="panel"><div class="ph"><div><h2>Daerlieth Nightstar</h2><span class="hint">Moon elf · Eternal Mage ' + L + ' (Artillery Expert) / Spell-less Ranger ' + L + ' (Companion-Bound) · Archmage tier 2</span></div>' +
      (o.readOnly ? "" : '<div class="lvbtns">' + (L < LV().MAX ? '<button type="button" class="btn primary sm" data-act="lvlup">Level up to ' + (L + 1) + "</button>" : "") +
        (L > LV().MIN ? '<button type="button" class="btn sm" data-act="lvldown">Undo level ' + L + "</button>" : "") + "</div>") + "</div>" +
      '<div class="sgrid">' +
      box("Artillery", sp.artDice + "d6" + sg(sp.artFlat), "burst DC " + sp.secretDc) +
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
      ["Reflex", sg(d.save.ref), parts([["", d.save.base], ["Dex", d.ab.dex.mod], ["cloak", d.save.cloak], ["status", d.save.status]])],
      ["Will", sg(d.save.will), parts([["", d.save.base], ["Wis", d.ab.wis.mod], ["cloak", d.save.cloak], ["status", d.save.status]])]
    ];
    h += sec("Defense and saves", tbl(["", "Total", "How"], acRows) + '<p class="hint">' + esc(defNote) + "</p>" + tbl(["Save", "Total", "How"], svRows) +
      '<p class="hint">Base ' + d.save.base + ' on every save: gestalt takes the better side, ranger Fort and Ref, Eternal Mage Will. Cold resistance 5 (moon elf), fire resistance 10 (Elemental Bond). Hard to Kill: dies at −32.</p>', true);

    /* attacks */
    var tgtTxt = a.tgt ? " (" + sg(a.tgt) + " favored enemy)" : "";
    var wrapNote = a.wrap ? "With the bodywrap on a strike: +1 attack and damage, 2 uses a round." : "Bodywrap off: no bonus strikes.";
    var dm = function (n) { return a.die + (n ? sg(n) : "") + (a.sneak ? " +" + SD : ""); };
    var dmW = function (n) { return a.die + sg(n + a.wrap) + (a.sneak ? " +" + SD : ""); };
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
      atkRows.push(["Attack of opportunity", sg(one), dm(a.dmgM), "One a round (no Combat Reflexes). Improved Unarmed Strike means her fists threaten, so foes leaving her reach or acting carelessly next to her provoke. " + wr(one)]);
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
    if (a.canAttack) atkRows.push(["Stunning Fist", "on a hit", "", "Declare before the roll on any strike, 1 a round: Fort DC " + a.stunDc + " or stunned. " + a.stunUses + " a day (" + (st.stun == null ? a.stunUses : st.stun) + " left)"]);
    var sneakOn = (c.sneak || c.flank), sneakTxt = sneakOn ? ((c.forest || a.tgt) ? "Stealth attack +" + SD + " on every hit now (" + (c.flank ? "flanking" : "target flat-footed") + "); it isn't multiplied on a critical." : "Stealth attack needs forest or a favored enemy as well.") : "Stealth attack +" + SD + " when the target is flat-footed or flanked, in forest or against a favored enemy. Skirmishing Attack: move 10+ ft first and the first attack counts as against a flat-footed target.";
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
      ["Scorching ray", sg(d.rtouch) + " touch, " + sp.rays + (sp.rays > 1 ? " rays" : " ray"), "4d6 fire each", "Caster level " + sp.clFire + " for fire. Burnout 0"]
    ];
    h += sec("Attacks", pick + tbl(["Attack", "Bonus", "Damage", "Notes"], atkRows, "atk") +
      '<p class="hint">Unarmed strikes with Weapon Finesse (' + (a.fin === d.ab.dex.mod ? "Dex" : "Str") + ' ' + sg(a.fin) + '), Weapon Focus +1' + esc(tgtTxt) + (a.flank ? ", flanking +2" : "") + ". Damage " + a.die + " (Monastic Legacy, effective monk level " + Math.floor(L / 2) + "). Crit 20/x2. " + esc(wrapNote) + " " + esc(sneakTxt) + "</p>" +
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
        return [tip(esc(s.name), s.tip + " = " + (s.usable ? sg(s.total) : "needs ranks")) + (s.ranks ? "" : ' <small class="hint">untrained</small>'), rc, s.usable ? sg(s.total) : "— (needs ranks)"];
      });
      return tbl(["Skill", "Ranks", "Total"], rows, "sk");
    };
    var rkHead = function (lbl, used, max) { var lf = max - used; return "<h3>" + lbl + " (" + used + " of " + max + " ranks" + (lf > 0 ? ", <b>" + lf + " to place</b>" : lf < 0 ? ", <b>" + (-lf) + " too many</b>" : "") + ")</h3>"; };
    var bonusNote = "Hover or tap a skill name for the arithmetic. Ranks: (6 + Int " + sg(d.ab.int.mod) + ") a level plus 1 favored class bonus; background 2 a level; at most " + R_.cap + " in one skill. Track adds +" + PR.track + " to Survival to follow tracks. Wild Empathy " + sg(d.empathy) + " (+4 with Gwathfaron). Handle Animal with Gwathfaron +4.";
    h += sec("Skills", '<div class="two"><div>' + rkHead("Adventuring", R_.adv, R_.advMax) + sk(false) + '</div><div>' + rkHead("Background", R_.bg, R_.bgMax) + sk(true) +
      "</div></div><p class=\"hint\">Also trained only, no ranks, can't be used: " + esc(UNUSABLE.join(", ")) + ". " + esc(bonusNote) + "</p>", true);

    /* companion */
    var pet = d.pet;
    h += sec("Gwathfaron, panther",
      '<div class="sgrid sm">' + box("HP", st.petHp + "<small>/" + PETMAX + "</small>", "dies at −" + pet.dead) + box("AC", pet.ac, "touch " + pet.touch + " · flat-footed " + pet.ff) +
      box("Initiative", sg(pet.init)) + box("Bite", sg(pet.bite), "1d6" + sg(pet.biteD) + " + trip") + box("Stealth", sg(pet.stealth)) + box("Perception", sg(pet.perc)) + "</div>" +
      '<p class="hint">Summary. His full sheet is on the <a href="#gwathfaron">Gwathfaron</a> tab.</p>', false);

    /* prose */
    var prose = [["Racial traits and feats", "feats"], ["Spell-less Ranger", "ranger"], ["Eternal Mage", "mage"], ["Mythic", "mythic"],
      ["Daily resources", "daily"], ["Gear and money", "gear"], ["Languages", "lang"], ["Description and background", "bg"]];
    prose.forEach(function (p) { if (P[p[1]]) h += sec(p[0], P[p[1]], false); });
    h += '<p class="hint foot">Numbers above are live. The text sections come from the printed sheet and don\'t change with the toggles.</p>';
    return h;
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
     The tracker counts "left" down by 1 each round and drops an effect at 0. */
  var FX_UNITS = [["r", "rounds", 1], ["m", "minutes", 10], ["h", "hours", 600], ["x", "until removed", 0]];
  function fxLeft(n) {
    if (n == null) return "until removed";
    if (n >= 600) return (Math.round(n / 60) / 10) + " h";
    if (n >= 100 || (n >= 10 && n % 10 === 0)) return Math.round(n / 10) + " min";
    return n + (n === 1 ? " round" : " rounds");
  }
  function fxPanel(who, st, o) {
    var list = ((st.fx || {})[who] || []).slice();
    var rows = list.map(function (e) {
      return '<li class="fx ' + (e.kind === "bad" ? "bad" : "good") + '"><span class="fxk">' + (e.kind === "bad" ? "Harmful" : "Helpful") + "</span>" +
        '<span class="fxn"><b>' + esc(e.name) + "</b>" + (e.from ? ' <span class="hint">from ' + esc(e.from) + "</span>" : "") +
        (e.note ? '<span class="fxt">' + esc(e.note) + "</span>" : "") + "</span>" +
        '<span class="fxd num">' + esc(fxLeft(e.left)) + "</span>" +
        (o.readOnly ? "" : '<button type="button" class="btn sm" data-act="fxdel" data-who="' + who + '" data-id="' + esc(e.id) + '" aria-label="Remove ' + esc(e.name) + '">End</button>') + "</li>";
    });
    /* her duration spells live in the Tracker's concentration slots; show the ones on this creature */
    (st.active || []).forEach(function (a) {
      if ((a.on || "her") !== who) return;
      rows.push('<li class="fx good mine"><span class="fxk">Her spell</span><span class="fxn"><b>' + esc(a.name) + '</b> <span class="hint">in a concentration slot, ends there</span></span>' +
        '<span class="fxd num">' + (a.end == null ? "open" : fxLeft(Math.max(0, a.end - (st.round || 1)))) + "</span></li>");
    });
    var form = o.readOnly ? "" :
      '<div class="fxform">' +
      '<label class="field">Spell or effect<input type="text" id="fxName-' + who + '" maxlength="60" placeholder="e.g. Bless, Slow, Bull\'s strength"></label>' +
      '<label class="field">Cast by<input type="text" id="fxFrom-' + who + '" maxlength="40" placeholder="Daerlieth, or the caster\'s name"></label>' +
      '<label class="field">Type<select id="fxKind-' + who + '"><option value="good">Helpful</option><option value="bad">Harmful</option></select></label>' +
      '<label class="field">Lasts<span class="fxdur"><input type="text" inputmode="numeric" id="fxN-' + who + '" maxlength="4" placeholder="8">' +
      '<select id="fxU-' + who + '">' + FX_UNITS.map(function (u) { return '<option value="' + u[0] + '">' + u[1] + "</option>"; }).join("") + "</select></span></label>" +
      '<label class="field fxwide">Effect (optional)<input type="text" id="fxNote-' + who + '" maxlength="120" placeholder="e.g. +1 attack, −2 AC, half speed"></label>' +
      '<button type="button" class="btn primary" data-act="fxadd" data-who="' + who + '">Add effect</button></div>';
    return '<div class="panel s-fx"' + (who === "her" ? ' id="herfx"' : "") + '><div class="ph"><h2>Status effects</h2><span class="hint">Spells and effects on ' + (who === "pet" ? "Gwathfaron" : "her") + ", helpful or harmful</span></div>" +
      (rows.length ? '<ul class="fxlist">' + rows.join("") + "</ul>" : '<p class="hint">None right now.</p>') + form +
      '<p class="hint">Reminders only: they don\'t change the numbers on the sheet. Rounds count down as the round advances; minutes and hours count in rounds too (1 min = 10 rounds).</p></div>';
  }

  /* ---------- Gwathfaron tab ---------- */
  function renderPet(st, o) {
    o = o || {};
    var c = st.cond || {}, tgt = c.target ? feBonus(st, c.target) : 0;
    var p = derivePet(c, tgt, petRanks(st), st), m = p.m, cp = p.cp, hp = st.petHp == null ? p.hpMax : st.petHp, h = "";
    var PRp = progOf(st), fes = favoredEnemies(st);
    var hpBtn = function (d) { return '<button class="btn sm" data-act="hp" data-k="petHp" data-d="' + d + '">' + (d > 0 ? "+" : "−") + Math.abs(d) + "</button>"; };
    var shared = '<div class="grp"><div class="gl">Shared with Daerlieth</div>' +
      tg("cond", "forest", CONDS.forest, c.forest, "+" + PRp.forest + " initiative, Perception, Stealth, Survival") +
      tg("cond", "flank", "Flanking with Daerlieth", c.flank, "+2 melee attack for both; her stealth attack +" + PRp.stealthDice + "d6") +
      '<div class="seg" role="group" aria-label="Target">' +
      tg("cond", "target", "No favored enemy", !c.target, "", "") +
      fes.map(function (f) { return tg("cond", "target", f.name, c.target === f.k, "+" + f.b + " attack and damage", f.k); }).join("") + "</div></div>";
    var status = hp > 0 ? "Up" : hp === 0 ? "Disabled" : hp > -p.dead ? "Dying" : "Dead";

    h += '<div class="panel"><div class="ph"><div><h2>Gwathfaron</h2><span class="hint">Panther (Core Rulebook small cat, leopard), Medium animal companion · effective druid level ' + cp.druid + " · " + p.hd + ' HD · N</span></div></div>' +
      '<div class="sgrid">' +
      box("HP", hp + "<small>/" + p.hpMax + "</small>", status + " · dies at −" + p.dead, p.t.hp) +
      box("AC", p.ac, tip("touch " + p.touch, p.t.touch) + " · " + tip("flat-footed " + p.ff, p.t.ff), p.t.ac) +
      box("Initiative", sg(p.init), p.forest ? "forest counted" : "+" + PRp.forest + " in forest", p.t.init) +
      box("Speed", "50 ft", "sprint: 500 ft charge, once an hour", "Small cat base speed 50 ft. Sprint (Ex): once an hour, a charge at ten times his speed") +
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
    var biteD = "1d6" + sg(p.biteD), clawD = "1d3" + sg(p.clawD), tripTxt = "On a hit: free trip attempt at CMB " + sg(p.cmb) + ", doesn't provoke";
    var pRows = [];
    if (pm === "full") {
      pRows.push(["<b>Full attack: 3 attacks</b>", "<b>" + [p.bite, p.claw, p.claw].map(sg).join(" / ") + "</b>", "", "Full-round action; only a 5-ft step. Natural attacks, all at once."]);
      /* claws: secondary, −5 (−2 with Multiattack at 9th) */
      pRows.push([" Bite", sg(p.bite), biteD, "Primary, full Str. " + tripTxt]);
      pRows.push([" Claw", sg(p.claw), clawD, "Secondary (−" + p.secPen + (cp.multiattack ? ", Multiattack" : "") + ", half Str)"]);
      pRows.push([" Claw", sg(p.claw), clawD, "Secondary (−" + p.secPen + (cp.multiattack ? ", Multiattack" : "") + ", half Str)"]);
    } else if (pm === "std") {
      pRows.push(["Bite (standard action)", sg(p.bite), biteD, "One attack; he can still move. " + tripTxt]);
    } else if (pm === "charge") {
      pRows.push(["Charge", sg(p.bite + 2), biteD, "Up to 100 ft in a straight line, one bite at +2; −2 AC until his next turn. No pounce, so no claws. Sprint: once an hour a charge can cover 500 ft. " + tripTxt]);
    } else {
      pRows.push(["Attack of opportunity", sg(p.bite), biteD, "One a round. He threatens 5 ft. " + tripTxt]);
    }
    h += sec("Offense", pPick + tbl(["Attack", "Bonus", "Damage", "Notes"], pRows, "atk") +
      '<p class="hint">BAB ' + sg(cp.bab) + ', Str ' + sg(m.str) + ' on attack and damage. Space 5 ft, reach 5 ft. Built as a scout, not a fighter; his job is to flank so her stealth attack lands.' + (p.flank ? " Flanking +2 counted." : "") + (p.tgt ? " Favored enemy " + sg(p.tgt) + " counted." : "") + " Tap a bonus at the top for its breakdown.</p>", true);

    var pLeft = p.ranksMax - p.ranksUsed, pEdit = !o.readOnly && pLeft !== 0;
    h += sec("Skills", '<p class="rkhead"><b>' + p.ranksUsed + " of " + p.ranksMax + "</b> ranks" + (pLeft > 0 ? " · <b>" + pLeft + " to place</b>" : pLeft < 0 ? " · <b>" + (-pLeft) + " too many</b>" : "") + "</p>" +
      tbl(["Skill", "Ranks", "Ability", "Class", "Misc", "Total"], p.skills.map(function (s) {
        var rc = pEdit ? '<span class="rks"><button type="button" class="btn sm rk" data-act="prank" data-k="' + esc(s.name) + '" data-d="-1"' + (s.ranks < 1 ? " disabled" : "") + '>−</button><b class="num">' + s.ranks + '</b><button type="button" class="btn sm rk" data-act="prank" data-k="' + esc(s.name) + '" data-d="1"' + (pLeft < 1 || s.ranks >= p.hd ? " disabled" : "") + ">+</button></span>" : String(s.ranks);
        return [tip(esc(s.name), s.tip + " = " + sg(s.total)) + (s.ranks ? "" : ' <small class="hint">untrained</small>'),
          rc, sg(s.abil) + ' <small class="hint">' + s.key.toUpperCase() + "</small>", s.cls ? "+3" : "", s.misc ? sg(s.misc) : "", "<b>" + sg(s.total) + "</b>"];
      }), "sk pk") +
      '<p class="hint">' + p.ranksMax + " ranks: 1 per Hit Die from the companion table (Int would need to reach 10 to add more), at most " + p.hd + " in one skill. Rank buttons appear only while there are ranks to place." + ' Class skill +3 once a skill has a rank. All are animal companion class skills. Misc: Skill Focus and Stealthy on Stealth, Skill Focus and Alertness on Perception, Alertness on Sense Motive, Stealthy on Escape Artist, and her forest and favored enemy bonuses when those are on. Speed 50 ft gives +8 on Acrobatics checks to jump. Hover or tap a skill for the arithmetic.</p>', true);

    h += sec("Feats", "<ul>" +
      "<li><b>Skill Focus (Stealth)</b>: +3 Stealth (+6 at 10 ranks).</li>" +
      "<li><b>Skill Focus (Perception)</b>: +3 Perception (+6 at 10 ranks).</li>" +
      "<li><b>Stealthy</b>: +2 Stealth and Escape Artist.</li>" +
      "<li><b>Alertness</b>: +2 Perception and Sense Motive. Not on the Animal Feats list; Int 3 makes it legal.</li>" +
      p.feats.slice(4).map(function (f) { return "<li><b>" + esc(f) + "</b> (picked at level-up)</li>"; }).join("") +
      "<li><b>Bonded Mind</b> (teamwork, from Daerlieth through Coordinated Companion): silent messages between them while they can see each other.</li></ul>" +
      '<p class="hint">' + cp.feats + " feats at " + p.hd + " HD" + (p.feats.length < cp.feats ? " (" + (cp.feats - p.feats.length) + " still to pick on Daerlieth's tab, Level-up picks)" : "") + ".</p>", false);

    h += sec("Tricks", "<p>" + cp.tricks + " tricks (6 from Int, " + (cp.tricks - 6) + " bonus):</p><ul>" +
      "<li><b>Attack</b>, any creature (counts as 2 tricks)</li><li><b>Come</b></li><li><b>Down</b></li><li><b>Guard</b></li>" +
      "<li><b>Heel</b></li><li><b>Seek</b></li><li><b>Stay</b></li><li><b>Track</b></li></ul>" +
      '<p class="hint">Handle Animal +21 with him (+4 bond). Bonded Mind lets her give these silently.</p>', false);

    h += sec("Special abilities", "<ul>" +
      "<li><b>Link</b>: she handles him as a free action, or pushes him as a move action, with +4 on wild empathy and Handle Animal.</li>" +
      "<li><b>Share spells</b>: she can cast a spell with a target of “you” on him instead, as a touch spell.</li>" +
      (cp.impEvasion ? "<li><b>Improved evasion</b>: half damage even on a failed Reflex save, none on a success.</li>" : "<li><b>Evasion</b>: no damage on a successful Reflex save for half.</li>") +
      (cp.multiattack ? "<li><b>Multiattack</b>: his claws take −2 instead of −5.</li>" : "") +
      "<li><b>Devotion</b>: +4 morale bonus on Will saves against enchantment.</li>" +
      "<li><b>Scent</b> and <b>low-light vision</b>.</li>" +
      "<li><b>Sprint</b> (Ex): once an hour, charge at ten times his speed.</li>" +
      "<li><b>Trip</b> (bite).</li>" +
      "<li><b>Improved Animal Companion</b> (Daerlieth's Enhanced Companion feat, 7th level): +1d8 hp, +1 Dex, +2 natural armor, all counted above.</li>" +
      "<li><b>Shared with Daerlieth</b>: her favored enemy bonuses (" + fes.map(function (f) { return f.name + " +" + f.b; }).join(", ") + ") and forest bonus (+" + PRp.forest + ").</li></ul>", false);

    h += sec("Equipment", "<p>None.</p>" +
      '<p class="hint">Room for later: barding (he would need Light Armor Proficiency to wear it without penalty) and a collar in the neck slot (amulet of natural armor or amulet of mighty fists). Carrying capacity, Medium quadruped (1.5×) at Str ' + p.ab.str + ': light ' + Math.floor(maxLoad(p.ab.str) * 1.5 / 3) + ' lb, medium ' + Math.floor(maxLoad(p.ab.str) * 1.5 * 2 / 3) + ' lb, heavy ' + Math.floor(maxLoad(p.ab.str) * 1.5) + ' lb.</p>', true);

    var nx = LV().prog(Math.min(LV().MAX, d0level(st) + 1)).pet;
    h += sec("Advancement", d0level(st) >= LV().MAX ? "<p>Effective druid level 20: the table is complete.</p>" : "<ul>" +
      "<li><b>At her next level</b> (effective druid level " + nx.druid + "): " + nx.hd + " HD, BAB " + sg(nx.bab) + ", natural armor bonus +" + nx.natBonus + ", Str/Dex +" + nx.strDex + ", " + nx.ranks + " skill ranks, " + nx.feats + " feats, " + nx.tricks + " tricks" + (nx.multiattack && !cp.multiattack ? ", Multiattack" : "") + (nx.impEvasion && !cp.impEvasion ? ", improved evasion" : "") + ".</li>" +
      "<li><b>Greater Animal Companion</b> (her Enhanced Companion pick, later): a bonus animal feat for him, and a move action to give him her stealth attack and fast movement.</li></ul>", false);
    return h;
  }

  function d0level(st) { return levelOf(st); }
  var api = { derive: derive, render: render, renderPet: renderPet, PET: PET, petRanks: petRanks, ranksOf: ranksOf, SKILLS: SKILLS, hpMaxOf: hpMaxOf, levelOf: levelOf, FX_UNITS: FX_UNITS, fxLeft: fxLeft, ITEMS: ITEMS, CONDS: CONDS, BASE: BASE, PROSE: {} };
  root.SheetEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
