/* Daerlieth Nightstar: live character sheet engine.
   derive(state) turns the tracker state (burnout, strength damage, active spells, worn gear in state.eq, conditions in state.cond)
   into every number on the sheet. render(state, opts) returns the sheet markup. No DOM access, so it also runs in Node for tests.
   An item is worn unless state.eq[key] === false. A condition is on when state.cond[key] is truthy. */
(function (root) {
  "use strict";

  var BASE = { str: 16, dex: 20, con: 16, int: 18, wis: 18, cha: 20 }; /* before items; Int includes the Tier 2 mythic +2 */
  var BAB = 8, LEVEL = 8, TIER = 2;
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
    sneak: "Target flat-footed or flanked",
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
  var UNUSABLE = ["Knowledge (local)", "Knowledge (planes)", "Knowledge (engineering)", "Knowledge (geography)", "Knowledge (nobility)"];


  /* ---------- Gwathfaron ----------
     Core Rulebook "Cat, small" (leopard) companion at effective druid level 8, Medium after its 4th-level advancement.
     Druid table at 8th: 7 HD, BAB +5, Fort +5 / Ref +5 / Will +2, 7 skill ranks, 4 feats, natural armor +4,
     Str/Dex +2, 3 bonus tricks, plus link, share spells, evasion, devotion, one ability score increase.
     Improved Animal Companion (Daerlieth's Enhanced Companion feat): +1d8 hp, +1 Dex, +2 natural armor.
     Build choices (a scout: Stealth and Perception first, not attacks): ability increase to Int (2 to 3, which
     lets a companion take any feat it can use), Improved Animal Companion +1 to Dex; feats Skill Focus (Stealth),
     Skill Focus (Perception), Stealthy, Alertness; ranks Stealth 4, Perception 3. The 7 ranks are fixed by the
     companion table (Int would have to reach 10 to add any). */
  var PET = {
    hpMax: 50, dead: 15, hd: 7, bab: 5, fort: 5, ref: 5, will: 2, nat: 7, speed: 50,
    ab: { str: 18, dex: 22, con: 15, int: 3, wis: 12, cha: 6 },
    /* where each score comes from; must add up to ab above */
    abParts: {
      str: [["small cat", 12], ["4th-level advancement", 4], ["companion Str/Dex bonus", 2]],
      dex: [["small cat", 21], ["4th-level advancement", -2], ["companion Str/Dex bonus", 2], ["Improved Animal Companion", 1]],
      con: [["small cat", 13], ["4th-level advancement", 2]],
      int: [["small cat", 2], ["ability score increase", 1]],
      wis: [["small cat", 12]],
      cha: [["small cat", 6]]
    },
    /* name, ability, ranks, class skill, misc [label, value] */
    skills: [
      ["Acrobatics", "dex", 0, 1, [["speed 50 ft, jumping only", 0]]], ["Climb", "str", 0, 1, []], ["Escape Artist", "dex", 0, 1, [["Stealthy", 2]]],
      ["Intimidate", "cha", 0, 1, []], ["Perception", "wis", 3, 1, [["Skill Focus", 3], ["Alertness", 2]]], ["Sense Motive", "wis", 0, 0, [["Alertness", 2]]], ["Stealth", "dex", 4, 1, [["Skill Focus", 3], ["Stealthy", 2]]],
      ["Survival", "wis", 0, 1, []], ["Swim", "str", 0, 1, []]
    ]
  };
  /* his skill ranks are fixed: the build above (Stealth 4, Perception 3) */
  var PET_RANKS = 7;
  function petRanks() {
    var r = {};
    PET.skills.forEach(function (s) { r[s[0]] = s[2]; });
    return r;
  }
  function derivePet(c, tgt, ranksBy) {
    ranksBy = ranksBy || petRanks(null);
    var m = {}; Object.keys(PET.ab).forEach(function (k) { m[k] = mod(PET.ab[k]); });
    var pf = c.forest ? 4 : 0;
    var p = { ab: PET.ab, m: m, forest: pf, tgt: tgt, hpMax: PET.hpMax, dead: PET.dead };
    p.init = m.dex + pf;
    p.ac = 10 + m.dex + PET.nat; p.touch = 10 + m.dex; p.ff = 10 + PET.nat;
    p.fort = PET.fort + m.con; p.ref = PET.ref + m.dex; p.will = PET.will + m.wis;
    p.bite = PET.bab + m.str + tgt; p.biteD = m.str + tgt;
    p.claw = PET.bab + m.str - 5 + tgt; p.clawD = Math.floor(m.str / 2) + tgt; /* secondary attacks */
    p.cmb = PET.bab + m.str; p.cmd = 10 + PET.bab + m.str + m.dex;
    p.skills = PET.skills.map(function (s) {
      var name = s[0], key = s[1], ranks = ranksBy[name] || 0, misc = s[4].slice();
      if (name === "Perception" || name === "Stealth" || name === "Survival") { if (pf) misc.push(["forest", pf]); }
      if ((name === "Perception" || name === "Survival") && tgt) misc.push(["favored enemy", tgt]);
      var cls = ranks && s[3] ? 3 : 0, mv = 0; misc.forEach(function (x) { mv += x[1]; });
      return { name: name, key: key, ranks: ranks, abil: m[key], cls: cls, misc: mv, total: ranks + m[key] + cls + mv,
        tip: parts([["ranks", ranks], [key[0].toUpperCase() + key.slice(1), m[key]], ["class skill", cls]].concat(misc)).replace(/^ /, "") };
    });
    p.ranksUsed = 0; p.skills.forEach(function (s) { p.ranksUsed += s.ranks; });
    var fe = tgt ? [["favored enemy", tgt]] : [];
    p.t = {
      hp: "31.5 (7d8 average) + 14 Con (+2 × 7 HD) + 4.5 (1d8 Improved Animal Companion) = " + PET.hpMax,
      ac: how([["base", 10], ["Dex", m.dex], ["natural, small cat", 1], ["natural, companion at 8th", 4], ["natural, Improved Animal Companion", 2]]) + " = " + p.ac,
      touch: how([["base", 10], ["Dex", m.dex]]) + " = " + p.touch,
      ff: how([["base", 10], ["natural armor", PET.nat]]) + " = " + p.ff + " (loses Dex)",
      init: how([["Dex", m.dex], ["forest", pf]]) + " = " + sg(p.init),
      fort: how([["base save (companion)", PET.fort], ["Con", m.con]]) + " = " + sg(p.fort),
      ref: how([["base save (companion)", PET.ref], ["Dex", m.dex]]) + " = " + sg(p.ref) + ". Evasion: no damage on a successful save for half",
      will: how([["base save (companion)", PET.will], ["Wis", m.wis]]) + " = " + sg(p.will) + ". Devotion: +4 morale vs enchantment",
      bite: how([["BAB", PET.bab], ["Str", m.str]].concat(fe)) + " = " + sg(p.bite) + ". Damage 1d6 " + how([["Str", m.str]].concat(fe), " ").trim() + ". On a hit: free trip, CMB " + sg(PET.bab + m.str),
      claw: how([["BAB", PET.bab], ["Str", m.str], ["secondary attack", -5]].concat(fe)) + " = " + sg(p.claw) + ". Damage 1d3 " + how([["half Str", Math.floor(m.str / 2)]].concat(fe), " ").trim(),
      cmb: "CMB " + how([["BAB", PET.bab], ["Str", m.str]]) + " = " + sg(p.cmb) + ". CMD " + how([["base", 10], ["BAB", PET.bab], ["Str", m.str], ["Dex", m.dex]]) + " = " + p.cmd + ", +4 vs trip (four legs)"
    };
    p.ab_t = {};
    Object.keys(PET.abParts).forEach(function (k) {
      p.ab_t[k] = PET.abParts[k].map(function (x, i) { return (i ? (x[1] < 0 ? "− " : "+ ") + Math.abs(x[1]) : x[1]) + " (" + x[0] + ")"; }).join(" ") + " = " + PET.ab[k] + ", mod " + sg(m[k]);
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
    var act = function (id) { return (st.active || []).some(function (a) { return a.id === id; }); };
    var burn = Math.max(0, st.burnout || 0), dcP = Math.floor(burn / 2);
    var haste = act("exp-haste"), er = act("expeditious-retreat"), cg = act("exp-cats-grace");
    var shieldSp = act("shield"), pfe = act("exp-protection-from-evil"), fly = act("exp-fly");
    var pen = c.exhausted ? 6 : c.fatigued ? 2 : 0;
    var tgt = c.target === "elf" ? 4 : c.target === "undead" ? 2 : 0;
    var d = { notes: [], c: c };

    /* abilities */
    var ab = {};
    ["str", "dex", "con", "int", "wis", "cha"].forEach(function (k) {
      var o = { base: BASE[k], item: 0, dmg: 0, pen: 0 };
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
    var acroRanks = 5;
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
      fort: 6 + CO + cloak - sp2, ref: 6 + D + cloak - sp2, will: 6 + W + cloak - sp2,
      cloak: cloak, status: -sp2
    };

    /* initiative, speed */
    d.init = D + 2 + 2 + (c.forest ? 4 : 0);
    var spd = 35 + (c.forest ? 10 : 0) + (haste || er ? 30 : 0);
    if (cat >= 1) spd = ceil5(spd * 2 / 3);
    if (c.exhausted) spd = Math.floor(spd / 2 / 5) * 5;
    d.speed = spd; d.fly = fly ? 60 : 0;
    d.noCharge = !!(c.fatigued || c.exhausted);

    /* attacks */
    var fin = Math.max(S, D), stat = -sp2;
    var defAtk = c.defend === "fight" ? -4 : 0;
    var hasteAtk = haste ? 1 : 0;
    var common = BAB + fin + 1 + tgt + hasteAtk + defAtk + stat;
    var half = S > 0 ? Math.floor(S / 2) : S;
    var dmgM = S + tgt - (c.sickened ? 2 : 0), dmgO = half + tgt - (c.sickened ? 2 : 0);
    var wrap = worn("wrap") ? 1 : 0;
    d.atk = {
      canAttack: c.defend !== "total", fin: fin, tgt: tgt, wrap: wrap,
      single: common, charge: common + 2, stun: common,
      mainA: common - 2, mainB: common - 7, offA: common - 2, offB: common - 7,
      dmgM: dmgM, dmgO: dmgO, haste: haste,
      stunDc: 10 + Math.floor(LEVEL / 2) + W,
      sneak: !!(c.sneak && (c.forest || tgt) && true)
    };
    var rtouch = BAB + D + hasteAtk + stat + defAtk;
    d.rtouch = rtouch;
    d.cmb = BAB + S;
    d.cmd = 10 + BAB + S + D + dodge + defl;

    /* spellcasting */
    var cl = Math.max(0, LEVEL - burn);
    var clF = Math.max(0, LEVEL + TIER - burn);
    d.sp = {
      cl: cl, clFire: clF, cha: CH, burn: burn, dcP: dcP,
      dc: [1, 2, 3, 4].map(function (l) { return 10 + l + CH - dcP; }),
      conc: cl + CH, secretDc: 10 + Math.floor(LEVEL / 2) + CH - dcP,
      artDice: Math.max(0, 6 - dcP), artFlat: CH,
      od: CH + Math.floor(LEVEL / 2),
      rays: clF >= 3 ? Math.min(3, 1 + Math.floor((clF - 3) / 4)) : 1,
      missiles: cl >= 1 ? Math.min(5, 1 + Math.floor((cl - 1) / 2)) : 0,
      fbDice: Math.min(10, clF), detDice: Math.min(10, clF),
      ddRange: 400 + 40 * cl, ddCarry: Math.floor(cl / 3), ddDoor: cl,
      eldritch: 10 + 4 + CH - dcP
    };

    /* skills */
    var acpAll = d.load.acp + 0; /* the mithral chain shirt has no armor check penalty */
    var forest = c.forest ? 4 : 0;
    var rows = [];
    SKILLS.forEach(function (s) {
      var name = s[0], key = s[1], ranks = s[2], cls = s[3], trained = s[4], bg = s[5], acpSk = s[6];
      var mo = [];
      var add = function (label, v) { if (v) mo.push([label, v]); };
      if (name === "Bluff") { add("racial", 2); add("favored enemy", tgt); }
      if (name === "Diplomacy") { add("racial", 2); add("trait", 1); }
      if (name === "Perception") { add("Keen Senses", 2); add("forest", forest); add("favored enemy", tgt); }
      if (name === "Sense Motive") add("favored enemy", tgt);
      if (name === "Survival") { add("forest", forest); add("favored enemy", tgt); }
      if (name === "Stealth") add("forest", forest);
      if (name === "Heal") add("Nature's Healing", c.forest ? 2 : 0);
      if (name === "Knowledge (religion)") add("undead", c.target === "undead" ? 2 : 0);
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
    d.track = 4 + 0; d.empathy = BAB + CH;

    /* panther: shares her favored enemy and forest bonuses */
    d.pet = derivePet(c, tgt, petRanks());
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
    var HPMAX = 82, PETMAX = PET.hpMax;

    /* gear and conditions */
    var gear = ITEMS.map(function (i) { return tg("eq", i.k, i.name, worn(i.k), i.fx); }).join("");
    gear += '<div class="row"><button type="button" class="btn sm" data-act="eqall" data-v="off">Take everything off</button><button type="button" class="btn sm" data-act="eqall" data-v="on">Put everything on</button></div>' +
      '<p class="hint">Off means set aside: it gives nothing and its weight leaves her load.</p>';
    var cond = '<div class="grp"><div class="gl">Where and who</div>' +
      tg("cond", "forest", CONDS.forest, c.forest, "+4 Perception, Stealth, Survival, initiative; +10 ft speed") +
      '<div class="seg" role="group" aria-label="Target">' +
      tg("cond", "target", "No favored enemy", !c.target, "", "") +
      tg("cond", "target", "Elf or drow", c.target === "elf", "+4", "elf") +
      tg("cond", "target", "Undead", c.target === "undead", "+2", "undead") + "</div></div>" +
      '<div class="grp"><div class="gl">Stance</div>' +
      tg("cond", "charge", CONDS.charge, c.charge, "−2 AC, charge attack +2") +
      '<div class="seg" role="group" aria-label="Defense">' +
      tg("cond", "defend", "Normal", !c.defend, "", "") +
      tg("cond", "defend", "Fighting defensively", c.defend === "fight", "−4 attacks, +3 dodge AC", "fight") +
      tg("cond", "defend", "Total defense", c.defend === "total", "+6 dodge AC, no attacks", "total") + "</div>" +
      tg("cond", "ffoot", CONDS.ffoot, c.ffoot, "loses Dex and dodge to AC") +
      tg("cond", "sneak", CONDS.sneak, c.sneak, "stealth attack +3d6 if forest or favored enemy") + "</div>" +
      '<div class="grp"><div class="gl">Status</div>' +
      tg("cond", "shaken", CONDS.shaken, c.shaken, "−2 attacks, saves, skills") +
      tg("cond", "sickened", CONDS.sickened, c.sickened, "−2 attacks, damage, saves, skills") +
      tg("cond", "fatigued", CONDS.fatigued, c.fatigued && !c.exhausted, "−2 Str and Dex, no charge") +
      tg("cond", "exhausted", CONDS.exhausted, c.exhausted, "−6 Str and Dex, half speed") +
      (d.flags.pfe ? tg("cond", "evil", CONDS.evil, c.evil, "protection from evil: +2 deflection AC") : "") + "</div>";

    var live = [];
    if (st.burnout) live.push("Burnout " + st.burnout + ": caster level " + sp.cl + ", spell DCs −" + sp.dcP + ", artillery " + sp.artDice + "d6");
    if (st.strDmg) live.push("Strength damage " + st.strDmg + ": Str " + d.ab.str.score);
    (st.active || []).forEach(function (x) { live.push(x.name + " active"); });
    var liveH = live.length ? live.map(function (x) { return '<span class="chip on">' + esc(x) + "</span>"; }).join("") : '<span class="hint">Nothing running. Spells, burnout and Strength damage come from the Tracker tab.</span>';

    h += '<div class="s-top">' +
      '<div class="panel s-eq"><div class="ph"><h2>Gear worn</h2></div>' + gear + "</div>" +
      '<div class="panel s-cond"><div class="ph"><h2>Conditions</h2></div>' + cond + "</div>" +
      '<div class="panel s-live"><div class="ph"><h2>From the Tracker</h2></div><div class="chips">' + liveH + "</div></div></div>";
    h += fxPanel("her", st, o);

    /* headline numbers */
    var acLbl = c.ffoot ? "AC (flat-footed)" : "AC";
    h += '<div class="panel"><div class="ph"><h2>Daerlieth Nightstar</h2><span class="hint">Moon elf · Eternal Mage 8 (Artillery Expert) / Spell-less Ranger 8 (Companion-Bound) · Archmage tier 2</span></div>' +
      '<div class="sgrid">' +
      box("HP", st.hp + "<small>/" + HPMAX + "</small>", "dies at −32") +
      box(acLbl, d.ac.now, "touch " + d.ac.touch + " · flat-footed " + d.ac.ff) +
      box("Initiative", sg(d.init), c.forest ? "forest +4 included" : "+4 in forest") +
      box("Speed", d.speed + " ft", d.fly ? "fly " + d.fly + " ft" : "45 ft in forest") +
      box("Fort", sg(d.save.fort)) + box("Ref", sg(d.save.ref)) + box("Will", sg(d.save.will), d.save.cloak ? "cloak +3 counted" : "no cloak") +
      box("Melee", sg(a.single), "unarmed, one attack") +
      box("Ranged touch", sg(d.rtouch), "artillery, rays") +
      box("CMB / CMD", sg(d.cmb) + " / " + d.cmd) +
      box("Caster level", sp.cl, "fire " + sp.clFire + " · conc. " + sg(sp.conc)) +
      box("Spell DCs", sp.dc[0] + "–" + sp.dc[3], "artillery burst " + sp.secretDc) +
      "</div></div>";

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
      ["Fortitude", sg(d.save.fort), parts([["", 6], ["Con", d.ab.con.mod], ["cloak", d.save.cloak], ["status", d.save.status]])],
      ["Reflex", sg(d.save.ref), parts([["", 6], ["Dex", d.ab.dex.mod], ["cloak", d.save.cloak], ["status", d.save.status]])],
      ["Will", sg(d.save.will), parts([["", 6], ["Wis", d.ab.wis.mod], ["cloak", d.save.cloak], ["status", d.save.status]])]
    ];
    h += sec("Defense and saves", tbl(["", "Total", "How"], acRows) + '<p class="hint">' + esc(defNote) + "</p>" + tbl(["Save", "Total", "How"], svRows) +
      '<p class="hint">Base 6 on every save by gestalt. Cold resistance 5 (moon elf), fire resistance 10 (Elemental Bond). Hard to Kill: dies at −32.</p>', true);

    /* attacks */
    var tgtTxt = a.tgt ? " (" + sg(a.tgt) + " favored enemy)" : "";
    var wrapNote = a.wrap ? "With the bodywrap on a strike: +1 attack and damage, 2 uses a round." : "Bodywrap off: no bonus strikes.";
    var dm = function (n) { return "1d8" + (n ? sg(n) : ""); };
    var dmW = function (n) { return dm(n + a.wrap); };
    var atkRows;
    if (!a.canAttack) atkRows = [["Total defense", "—", "She can't attack this round."]];
    else atkRows = [
      ["Single attack", sg(a.single), dm(a.dmgM), "Bodywrap: " + sg(a.single + a.wrap) + ", " + dmW(a.dmgM)],
      ["<b>Full attack: " + (a.haste ? "5 strikes, hasted" : "4 strikes") + "</b>", "<b>" + [a.mainA, a.offA].concat(a.haste ? [a.mainA] : []).concat([a.mainB, a.offB]).map(sg).join(" / ") + "</b>", "", "Full-round action, in this order. Two-Weapon Fighting: −2 on every strike (unarmed strikes count as light). BAB +8 gives the second main-hand strike at −5; Improved Two-Weapon Fighting gives the second off-hand strike at −5."],
      [" 1. Main hand", sg(a.mainA), dm(a.dmgM), "Full Str to damage"],
      [" 2. Off hand", sg(a.offA), dm(a.dmgO), "Two-Weapon Fighting; half Str to damage"],
      [" 3. Main hand", sg(a.mainB), dm(a.dmgM), "Second strike from BAB +8"],
      [" 4. Off hand", sg(a.offB), dm(a.dmgO), "Improved Two-Weapon Fighting"]
    ].concat(a.haste ? [[" 5. Main hand (haste)", sg(a.mainA), dm(a.dmgM), "Haste: one extra strike at her highest bonus"]] : [
      ["<b>If hasted: 5 strikes</b>", "<b>" + [a.mainA + 1, a.offA + 1, a.mainA + 1, a.mainB + 1, a.offB + 1].map(sg).join(" / ") + "</b>", "", "Haste gives +1 on every attack and one extra main-hand strike at her highest bonus"]
    ]).concat([
      ["Charge" + (c.charge ? " (now)" : ""), d.noCharge ? "can't charge" : sg(a.charge), dm(a.dmgM), "−2 AC until her next turn. Bodywrap: " + sg(a.charge + a.wrap)],
      ["Stunning Fist", sg(a.stun), dm(a.dmgM), "Fort DC " + a.stunDc + ", 2 a day (" + (st.stun == null ? 2 : st.stun) + " left)"]
    ]);
    var sneakTxt = c.sneak ? ((c.forest || a.tgt) ? "Stealth attack +3d6 applies now (the extra damage isn't multiplied on a critical)." : "Stealth attack needs forest or a favored enemy.") : "Stealth attack +3d6 when the target is flat-footed or flanked, in forest or against a favored enemy. Skirmishing Attack: move 10+ ft first and the first attack counts as against a flat-footed target.";
    var art = sp.artDice + "d6" + sg(sp.artFlat), art8 = sp.artDice + "d8" + sg(sp.artFlat);
    var spRows = [
      ["Arcane artillery", sg(d.rtouch) + " touch", art, "1 overdrive: " + art8 + ". Sniper 120 ft, 30 ft otherwise"],
      ["Artillery burst", "Reflex DC " + sp.secretDc, art, "15 ft burst around her, she takes none"],
      ["Scorching ray", sg(d.rtouch) + " touch, " + sp.rays + (sp.rays > 1 ? " rays" : " ray"), "4d6 fire each", "Caster level " + sp.clFire + " for fire. Burnout 0"]
    ];
    h += sec("Attacks", tbl(["Attack", "Bonus", "Damage", "Notes"], atkRows) +
      '<p class="hint">Unarmed strikes with Weapon Finesse (' + (a.fin === d.ab.dex.mod ? "Dex" : "Str") + ' ' + sg(a.fin) + '), Weapon Focus +1' + esc(tgtTxt) + ". Crit 20/x2. " + esc(wrapNote) + " " + esc(sneakTxt) + "</p>" +
      tbl(["Spell attack", "Bonus", "Damage", "Notes"], spRows) +
      '<p class="hint">Companion bite: ' + sg(d.pet.bite) + ' for 1d6' + sg(d.pet.biteD) + ' plus trip, claws ' + sg(d.pet.claw) + ' for 1d3' + sg(d.pet.clawD) + ".</p>", true);

    /* spellcasting */
    var spl = [
      ["Caster level", sp.cl + " (fire " + sp.clFire + ")", "8 − " + sp.burn + " burnout; Elemental Bond +2 on fire spells"],
      ["Concentration", sg(sp.conc), "CL + Cha " + sg(sp.cha)],
      ["Spell DC, levels 1 to 4", sp.dc.join(" / "), "10 + level + Cha" + (sp.dcP ? ", −" + sp.dcP + " burnout" : "")],
      ["Eternal secret DC", sp.secretDc, "10 + 4 + Cha"],
      ["Arcane overdrive pool", sp.od, "Cha " + sg(sp.cha) + " + 4. Now " + st.overdrive],
      ["Mythic power", "7 a day", "Now " + st.mythic],
      ["Fireball", Math.min(10, sp.clFire) + "d6 (mythic " + Math.min(10, sp.clFire) + "d10)", "Reflex DC " + sp.dc[2] + ", 20 ft radius"],
      ["Magic missile", sp.missiles + " missiles", "1d4+1 each, never misses"],
      ["Detonate (fire)", sp.detDice + "d8", "Reflex DC " + sp.dc[3] + ", 30 ft, goes off next round"],
      ["Dimension door", sp.ddRange + " ft", "Carries " + sp.ddCarry + " willing creature" + (sp.ddCarry > 1 ? "s" : "") + " (1 per 3 CL); mythic: " + sp.ddDoor + " use the portal"],
      ["Spell failure", d.spellFail + "%", "Somatic spells only. The shirt is the only source"]
    ];
    h += sec("Spellcasting", tbl(["", "Value", "Notes"], spl) + (P.spells || ""), false);

    /* skills */
    var sk = function (bg) {
      /* every skill she has on this side, ranked or not; trained-only skills without ranks show a dash */
      var rows = d.skills.filter(function (s) { return !!s.bg === bg; }).map(function (s) {
        return [tip(esc(s.name), s.tip + " = " + (s.usable ? sg(s.total) : "needs ranks")) + (s.ranks ? "" : ' <small class="hint">untrained</small>'), s.ranks, s.usable ? sg(s.total) : "— (needs ranks)"];
      });
      return tbl(["Skill", "Ranks", "Total"], rows, "sk");
    };
    var bonusNote = "Hover or tap a skill name for the arithmetic. Track adds +4 to Survival to follow tracks. Wild Empathy " + sg(d.empathy) + " (+4 with Gwathfaron). Handle Animal with Gwathfaron +4.";
    h += sec("Skills", '<div class="two"><div><h3>Adventuring (88 ranks)</h3>' + sk(false) + '</div><div><h3>Background (16 ranks)</h3>' + sk(true) +
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



  /* ---------- status effects ----------
     state.fx = { her: [], pet: [] }, each {id, name, from, kind: "good" | "bad", left: rounds or null, note}.
     Entered by hand (from her or another caster). They are reminders: they don't change the numbers.
     The tracker counts "left" down by 1 each round and drops an effect at 0. */
  var FX_UNITS = [["r", "rounds", 1], ["m", "minutes", 10], ["h", "hours", 600], ["x", "until removed", 0]];
  function fxLeft(n) {
    if (n == null) return "until removed";
    if (n >= 600 && n % 600 === 0) return (n / 600) + " h";
    if (n >= 10 && n % 10 === 0) return (n / 10) + " min";
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
    /* her own duration spells are tracked in the concentration slots; show them here too */
    if (who === "her") (st.active || []).forEach(function (a) {
      rows.push('<li class="fx good mine"><span class="fxk">Her spell</span><span class="fxn"><b>' + esc(a.name) + '</b> <span class="hint">concentration slot, ends from the Tracker</span></span>' +
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
    return '<div class="panel s-fx"><div class="ph"><h2>Status effects</h2><span class="hint">Spells and effects on ' + (who === "pet" ? "Gwathfaron" : "her") + ", helpful or harmful</span></div>" +
      (rows.length ? '<ul class="fxlist">' + rows.join("") + "</ul>" : '<p class="hint">None right now.</p>') + form +
      '<p class="hint">Reminders only: they don\'t change the numbers on the sheet. Rounds count down as the Tracker advances; minutes and hours count in rounds too (1 min = 10 rounds).</p></div>';
  }

  /* ---------- Gwathfaron tab ---------- */
  function renderPet(st, o) {
    o = o || {};
    var c = st.cond || {}, tgt = c.target === "elf" ? 4 : c.target === "undead" ? 2 : 0;
    var p = derivePet(c, tgt, petRanks()), m = p.m, hp = st.petHp == null ? p.hpMax : st.petHp, h = "";
    var hpBtn = function (d) { return '<button class="btn sm" data-act="hp" data-k="petHp" data-d="' + d + '">' + (d > 0 ? "+" : "−") + Math.abs(d) + "</button>"; };
    var shared = '<div class="grp"><div class="gl">Shared with Daerlieth</div>' +
      tg("cond", "forest", CONDS.forest, c.forest, "+4 initiative, Perception, Stealth, Survival") +
      '<div class="seg" role="group" aria-label="Target">' +
      tg("cond", "target", "No favored enemy", !c.target, "", "") +
      tg("cond", "target", "Elf or drow", c.target === "elf", "+4 attack and damage", "elf") +
      tg("cond", "target", "Undead", c.target === "undead", "+2 attack and damage", "undead") + "</div></div>";
    var status = hp > 0 ? "Up" : hp === 0 ? "Disabled" : hp > -p.dead ? "Dying" : "Dead";

    h += '<div class="panel"><div class="ph"><div><h2>Gwathfaron</h2><span class="hint">Panther (Core Rulebook small cat, leopard), Medium animal companion · effective druid level 8 · N</span></div></div>' +
      '<div class="sgrid">' +
      box("HP", hp + "<small>/" + p.hpMax + "</small>", status + " · dies at −" + p.dead, p.t.hp) +
      box("AC", p.ac, tip("touch " + p.touch, p.t.touch) + " · " + tip("flat-footed " + p.ff, p.t.ff), p.t.ac) +
      box("Initiative", sg(p.init), p.forest ? "forest counted" : "+4 in forest", p.t.init) +
      box("Speed", "50 ft", "sprint: 500 ft charge, once an hour", "Small cat base speed 50 ft. Sprint (Ex): once an hour, a charge at ten times his speed") +
      box("Fort", sg(p.fort), "", p.t.fort) + box("Ref", sg(p.ref), "evasion", p.t.ref) + box("Will", sg(p.will), "+4 vs enchantment", p.t.will) +
      box("Bite", sg(p.bite), "1d6" + sg(p.biteD) + " + trip", p.t.bite) +
      box("Claws ×2", sg(p.claw), "1d3" + sg(p.clawD), p.t.claw) +
      box("CMB / CMD", sg(p.cmb) + " / " + p.cmd, (p.cmd + 4) + " vs trip", p.t.cmb) +
      box("Stealth", sg(p.stealth), "", p.t.stealth) + box("Perception", sg(p.perc), "scent, low-light vision", p.t.perc) +
      "</div>" +
      (o.readOnly ? "" : '<div class="ctl">' + [-10, -5, -1, 1, 5, 10].map(hpBtn).join("") + "</div>") +
      shared + "</div>";
    h += fxPanel("pet", st, o);

    var abRow = function (k, label) { return [label, tip(String(PET.ab[k]), p.ab_t[k]), sg(m[k])]; };
    h += sec("Abilities", tbl(["", "Score", "Mod"], [abRow("str", "STR"), abRow("dex", "DEX"), abRow("con", "CON"), abRow("int", "INT"), abRow("wis", "WIS"), abRow("cha", "CHA")]) +
      '<p class="hint">Small cat base Str 12, Dex 21, Con 13, Int 2, Wis 12, Cha 6. 4th-level advancement: Str +4, Dex −2, Con +2 (Medium). Companion bonus Str/Dex +2. Ability score increase +1 Int (2 to 3: at Int 3 a companion can take any feat it can use, which opens Alertness). Improved Animal Companion +1 Dex.</p>', true);

    h += sec("Defense", tbl(["", "Total", "How"], [
      ["AC", p.ac, "10 + " + m.dex + " Dex + " + PET.nat + " natural"],
      ["Touch", p.touch, "10 + " + m.dex + " Dex"],
      ["Flat-footed", p.ff, "10 + " + PET.nat + " natural"],
      ["Hit points", p.hpMax, "7d8 + 14 Con, +1d8 Improved Animal Companion (averages)"],
      ["Fort", sg(p.fort), PET.fort + " base + " + m.con + " Con"],
      ["Ref", sg(p.ref), PET.ref + " base + " + m.dex + " Dex"],
      ["Will", sg(p.will), PET.will + " base + " + m.wis + " Wis; +4 morale vs enchantment (devotion)"]
    ]) + '<p class="hint">Natural armor 7 = 1 (small cat) + 4 (companion at 8th) + 2 (Improved Animal Companion). Evasion: no damage on a successful Reflex save for half. Dies at −15 (Con 15).</p>', true);

    h += sec("Offense", tbl(["Attack", "Bonus", "Damage", "Notes"], [
      ["Bite", sg(p.bite), "1d6" + sg(p.biteD), "Primary. Trip: on a hit, a free trip attempt at CMB " + sg(p.cmb) + " that doesn't provoke"],
      ["Claw", sg(p.claw), "1d3" + sg(p.clawD), "Secondary, two of them (−5, half Str)"],
      ["Full attack", "", "", "Bite " + sg(p.bite) + " and 2 claws " + sg(p.claw)],
      ["Sprint", "", "", "Once an hour, a charge at 10× speed (500 ft)"]
    ]) + '<p class="hint">BAB +5, Str +4 on attack and damage. Space 5 ft, reach 5 ft. He is built as a scout, not a fighter; he can still flank so her stealth attack and Skirmishing Attack land.' + (p.tgt ? " Favored enemy " + sg(p.tgt) + " counted." : "") + "</p>", true);

    h += sec("Skills", '<p class="rkhead"><b>' + p.ranksUsed + " of " + PET_RANKS + "</b> ranks: Stealth 4, Perception 3</p>" +
      tbl(["Skill", "Ranks", "Ability", "Class", "Misc", "Total"], p.skills.map(function (s) {
        return [tip(esc(s.name), s.tip + " = " + sg(s.total)) + (s.ranks ? "" : ' <small class="hint">untrained</small>'),
          String(s.ranks), sg(s.abil) + ' <small class="hint">' + s.key.toUpperCase() + "</small>", s.cls ? "+3" : "", s.misc ? sg(s.misc) : "", "<b>" + sg(s.total) + "</b>"];
      }), "sk pk") +
      '<p class="hint">7 ranks: the animal companion table fixes them at 7 for effective druid level 8 (Int would need to reach 10 to add more), at most 7 in one skill. Class skill +3 once a skill has a rank. All are animal companion class skills. Misc: Skill Focus and Stealthy on Stealth, Skill Focus and Alertness on Perception, Alertness on Sense Motive, Stealthy on Escape Artist, and her forest and favored enemy bonuses when those are on. Speed 50 ft gives +8 on Acrobatics checks to jump. Hover or tap a skill for the arithmetic.</p>', true);

    h += sec("Feats", "<ul>" +
      "<li><b>Skill Focus (Stealth)</b>: +3 Stealth (+6 at 10 ranks).</li>" +
      "<li><b>Skill Focus (Perception)</b>: +3 Perception (+6 at 10 ranks).</li>" +
      "<li><b>Stealthy</b>: +2 Stealth and Escape Artist.</li>" +
      "<li><b>Alertness</b>: +2 Perception and Sense Motive. Not on the Animal Feats list; Int 3 makes it legal.</li>" +
      "<li><b>Bonded Mind</b> (teamwork, from Daerlieth through Coordinated Companion): silent messages between them while they can see each other.</li></ul>" +
      '<p class="hint">4 feats at 7 HD. Next feat at 9 HD; Greater Animal Companion (Daerlieth, later) adds one more.</p>', false);

    h += sec("Tricks", "<p>9 tricks (6 from Int, 3 bonus):</p><ul>" +
      "<li><b>Attack</b>, any creature (counts as 2 tricks)</li><li><b>Come</b></li><li><b>Down</b></li><li><b>Guard</b></li>" +
      "<li><b>Heel</b></li><li><b>Seek</b></li><li><b>Stay</b></li><li><b>Track</b></li></ul>" +
      '<p class="hint">Handle Animal +21 with him (+4 bond). Bonded Mind lets her give these silently.</p>', false);

    h += sec("Special abilities", "<ul>" +
      "<li><b>Link</b>: she handles him as a free action, or pushes him as a move action, with +4 on wild empathy and Handle Animal.</li>" +
      "<li><b>Share spells</b>: she can cast a spell with a target of “you” on him instead, as a touch spell.</li>" +
      "<li><b>Evasion</b>: no damage on a successful Reflex save for half.</li>" +
      "<li><b>Devotion</b>: +4 morale bonus on Will saves against enchantment.</li>" +
      "<li><b>Scent</b> and <b>low-light vision</b>.</li>" +
      "<li><b>Sprint</b> (Ex): once an hour, charge at ten times his speed.</li>" +
      "<li><b>Trip</b> (bite).</li>" +
      "<li><b>Improved Animal Companion</b> (Daerlieth's Enhanced Companion feat, 7th level): +1d8 hp, +1 Dex, +2 natural armor, all counted above.</li>" +
      "<li><b>Shared with Daerlieth</b>: her favored enemy bonuses (elf +4, undead +2) and forest bonuses (+4).</li></ul>", false);

    h += sec("Equipment", "<p>None.</p>" +
      '<p class="hint">Room for later: barding (he would need Light Armor Proficiency to wear it without penalty) and a collar in the neck slot (amulet of natural armor or amulet of mighty fists). Carrying capacity, Medium quadruped (1.5×) at Str 19: light 174 lb, medium 349 lb, heavy 525 lb.</p>', true);

    h += sec("Advancement", "<ul>" +
      "<li><b>9th level</b>: 8 HD, BAB +6, a 5th feat, ability score increase, natural armor +6, Str/Dex +3, Multiattack (claws at −2 instead of −5).</li>" +
      "<li><b>Greater Animal Companion</b> (Daerlieth, later): a bonus animal feat for him, and a move action to give him her stealth attack and fast movement.</li></ul>", false);
    return h;
  }

  var api = { derive: derive, render: render, renderPet: renderPet, PET: PET, FX_UNITS: FX_UNITS, ITEMS: ITEMS, CONDS: CONDS, BASE: BASE, PROSE: {} };
  root.SheetEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
