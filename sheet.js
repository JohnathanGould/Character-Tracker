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

    /* panther */
    var pf = c.forest ? 4 : 0;
    d.pet = {
      init: 5 + pf, stealth: 16 + pf, perc: 9 + pf, forest: pf,
      bite: 10 + tgt, biteD: 4 + tgt, claw: 4 + tgt, clawD: 2 + tgt
    };
    d.tgt = tgt;
    d.hasteOn = haste;
    d.flags = { haste: haste, er: er, cg: cg, shield: shieldSp, pfe: pfe, fly: fly };
    return d;
  }

  /* ---------- markup ---------- */
  function box(l, v, s) { return '<div class="sbox"><div class="lbl">' + esc(l) + '</div><div class="v num">' + v + (s ? '</div><div class="s">' + s : "") + "</div></div>"; }
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
    var HPMAX = 82, PETMAX = 45;

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

    /* panther */
    var pf = c.forest ? 4 : 0;
    d.pet = {
      init: 5 + pf, stealth: 16 + pf, perc: 9 + pf, forest: pf,
      bite: 10 + tgt, biteD: 4 + tgt, claw: 4 + tgt, clawD: 2 + tgt
    };
    d.tgt = tgt;
    d.hasteOn = haste;
    d.flags = { haste: haste, er: er, cg: cg, shield: shieldSp, pfe: pfe, fly: fly };
    return d;
  }

  /* ---------- markup ---------- */
  function box(l, v, s) { return '<div class="sbox"><div class="lbl">' + esc(l) + '</div><div class="v num">' + v + (s ? '</div><div class="s">' + s : "") + "</div></div>"; }
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
    var HPMAX = 82, PETMAX = 45;

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
      ["Full attack, main hand", sg(a.mainA) + " / " + sg(a.mainB), dm(a.dmgM), "Two-weapon fighting −2 each. Haste adds one more at " + sg(a.mainA) + (a.haste ? " (active)" : " (if hasted)")],
      ["Full attack, off hand", sg(a.offA) + " / " + sg(a.offB), dm(a.dmgO), "Off hand adds half Str"],
      ["Charge" + (c.charge ? " (now)" : ""), d.noCharge ? "can't charge" : sg(a.charge), dm(a.dmgM), "−2 AC until her next turn. Bodywrap: " + sg(a.charge + a.wrap)],
      ["Stunning Fist", sg(a.stun), dm(a.dmgM), "Fort DC " + a.stunDc + ", 2 a day (" + st.stun + " left)"]
    ];
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
      var rows = d.skills.filter(function (s) { return !!s.bg === bg && (s.ranks > 0 || o.allSkills); }).map(function (s) {
        return ['<span title="' + esc(s.tip) + '">' + esc(s.name) + "</span>", s.ranks, s.usable ? sg(s.total) : "—"];
      });
      return tbl(["Skill", "Ranks", "Total"], rows, "sk");
    };
    var lite = d.skills.filter(function (s) { return s.ranks === 0 && s.usable; }).map(function (s) { return esc(s.name) + " " + sg(s.total); }).join(", ");
    var bonusNote = "Hover or tap a skill name for the arithmetic. Track adds +4 to Survival to follow tracks. Wild Empathy " + sg(d.empathy) + " (+4 with Gwathfaron). Handle Animal with Gwathfaron +4.";
    h += sec("Skills", '<div class="two"><div><h3>Adventuring (88 ranks)</h3>' + sk(false) + '</div><div><h3>Background (16 ranks)</h3>' + sk(true) +
      "</div></div><p class=\"hint\">Untrained, no ranks: " + lite + ".</p><p class=\"hint\">Can't be used without ranks: " + esc(UNUSABLE.join(", ")) + ". " + esc(bonusNote) + "</p>", true);

    /* companion */
    var pet = d.pet;
    h += sec("Gwathfaron, panther",
      '<div class="sgrid sm">' + box("HP", st.petHp + "<small>/" + PETMAX + "</small>", "dies at −15") + box("AC", 20, "touch 15 · flat-footed 15") +
      box("Initiative", sg(pet.init)) + box("Speed", "50 ft", "sprint 500 ft, once per hour") + box("Fort / Ref / Will", "+7 / +10 / +3") +
      box("Bite", sg(pet.bite), "1d6" + sg(pet.biteD) + " + trip") + box("Claws ×2", sg(pet.claw), "1d3" + sg(pet.clawD)) +
      box("Stealth", sg(pet.stealth)) + box("Perception", sg(pet.perc)) + box("CMB / CMD", "+9 / 24", "28 vs trip") + "</div>" +
      '<p class="hint">Shares her favored enemy and forest bonuses: the toggles above change these numbers. Full block: Gwathfaron\'s sheet.</p>', false);

    /* prose */
    var prose = [["Racial traits and feats", "feats"], ["Spell-less Ranger", "ranger"], ["Eternal Mage", "mage"], ["Mythic", "mythic"],
      ["Daily resources", "daily"], ["Gear and money", "gear"], ["Languages", "lang"], ["Description and background", "bg"], ["Awaiting a GM ruling", "gm"]];
    prose.forEach(function (p) { if (P[p[1]]) h += sec(p[0], P[p[1]], false); });
    h += '<p class="hint foot">Numbers above are live. The text sections come from the printed sheet and don\'t change with the toggles.</p>';
    return h;
  }

  var api = { derive: derive, render: render, ITEMS: ITEMS, CONDS: CONDS, BASE: BASE, PROSE: {} };
  root.SheetEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
