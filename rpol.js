/* RPoL character sheet export: plain fixed-width text in the layout of her printed sheet (docs/daerlieth-sheet.txt),
   with every number taken from the live tracker (SheetEngine.derive) and the static parts (personal details, gear,
   magic items, description and background) copied from the printed sheet. Gwathfaron's sheet follows
   docs/gwathfaron-sheet.txt the same way.
   RpolSheet.her(ctx, template) / RpolSheet.pet(ctx, template) return the text; ctx comes from index.html:
   { st: state, spells: [castable spells], gain: function (spell) -> burnout, today: "Oct 14 2026" }. */
(function (root) {
  var S = function () { return root.SheetEngine; };
  var LV = function () { return root.Levels; };
  var sg = function (n) { return (n >= 0 ? "+" : "") + n; };
  var pad = function (s, n) { s = String(s); return s.length >= n ? s : s + Array(n - s.length + 1).join(" "); };
  var lpad = function (s, n) { s = String(s); return s.length >= n ? s : Array(n - s.length + 1).join(" ") + s; };
  var RULE = "----------------------------------------------------------------------------";
  var ord = function (n) { return LV().ord(n); };

  /* lines of the printed sheet between a line starting with `from` and the next line starting with `to` */
  function slice(tpl, from, to, keepFirst) {
    var lines = String(tpl || "").split("\n"), i = -1, j = lines.length;
    for (var a = 0; a < lines.length; a++) if (lines[a].indexOf(from) === 0) { i = a; break; }
    if (i < 0) return [];
    if (to) for (var b = i + 1; b < lines.length; b++) if (lines[b].indexOf(to) === 0) { j = b; break; }
    var out = lines.slice(keepFirst === false ? i + 1 : i, j);
    while (out.length && /^\s*-{5,}\s*$/.test(out[out.length - 1]) || out.length && !out[out.length - 1].trim()) out.pop();
    return out;
  }
  /* the sheet as it stands, without temporary toggles, active spells, burnout or Strength damage */
  function baseState(st) {
    var b = JSON.parse(JSON.stringify(st || {}));
    b.cond = {}; b.active = []; b.burnout = 0; b.strDmg = 0; b.fx = { her: [], pet: [] };
    return b;
  }
  function wrap(text, width, indent) {
    var words = String(text).split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) {
      if ((cur + " " + w).trim().length > width && cur) { lines.push(cur); cur = (indent || "") + w; }
      else cur = cur ? cur + " " + w : (lines.length ? (indent || "") : "") + w;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  /* what is going on right now (live state, not the base sheet): HP, resources, spells holding concentration,
     status effects and conditions, so the RPoL sheet carries the same picture as the tracker */
  function nowLines(st, who) {
    var D = S().derive(st), c = st.cond || {}, out = [], fl = S().fxLeft;
    var fx = function (k) {
      var xs = ((st.fx || {})[k] || []).map(function (e) { return e.name + (e.from ? " from " + e.from : "") + " (" + (e.kind === "bad" ? "harmful, " : "") + fl(e.left) + (e.note ? "; " + e.note : "") + ")"; });
      if (who === "pet") (st.active || []).forEach(function (a) { if ((a.on || "her") === k) xs.push(a.name + " (her spell, " + (a.end == null ? "until ended" : fl(Math.max(0, a.end - (st.round || 1))) + " left") + ")"); });
      return xs;
    };
    var cd = [];
    if (who === "her") {
      if (c.forest) cd.push("in forest (favored terrain)");
      if (D.atk.flankMode) cd.push(S().flankLabel(D.atk.flankMode) + " (+" + D.atk.flank + (D.atk.flankPrec ? ", +1d6 precision" : "") + ")");
      if (c.target) { var fe = D.fe.filter(function (f) { return f.k === c.target; })[0]; if (fe) cd.push("favored enemy " + fe.name.toLowerCase() + " +" + fe.b); }
      if (c.defend === "fight") cd.push("fighting defensively"); if (c.defend === "total") cd.push("total defense");
      ["charge", "ffoot", "sneak", "shaken", "sickened", "fatigued", "exhausted", "evil"].forEach(function (k) { if (c[k]) cd.push(String(S().CONDS[k] || k).toLowerCase()); });
      if (st.blood) cd.push("Blood Money ready this round");
    } else {
      if (c.forest) cd.push("in forest (shared favored terrain)");
      if (D.pet.flankMode) cd.push(S().flankLabel(D.pet.flankMode, "pet") + " (+" + D.pet.flank + (D.pet.flankPrec ? ", +1d6 precision" : "") + ")");
      if (c.target) { var fp = D.fe.filter(function (f) { return f.k === c.target; })[0]; if (fp) cd.push("favored enemy " + fp.name.toLowerCase() + " +" + fp.b); }
    }
    if (who === "her") {
      out.push(" - Hit points " + (st.hp == null ? D.hpMax : st.hp) + " of " + D.hpMax + ". Gwathfaron " + (st.petHp == null ? D.pet.hpMax : st.petHp) + " of " + D.pet.hpMax + ".");
      out.push(" - Burnout " + (st.burnout || 0) + " (caster level " + D.sp.cl + " now, spell DCs " + D.sp.dc.join("/") + ", artillery " + D.sp.artDice + "d6" + sg(D.sp.artFlat) + ").");
      out.push(" - Arcane overdrive " + (st.overdrive == null ? D.sp.od : st.overdrive) + " of " + D.sp.od + " left. Mythic power " + (st.mythic == null ? 7 : st.mythic) + " of 7 left. Racial light " + (st.lightUsed ? "used today" : "ready") + ". Detonate vials: " + (st.vials == null ? 2 : st.vials) + " casts.");
      if (st.strDmg) out.push(" - Strength damage " + st.strDmg + " (Str " + D.ab.str.score + " now).");
      var act = (st.active || []).map(function (a) { return a.name + " on " + ({ pet: "Gwathfaron", ally: "an ally" }[a.on] || "her") + " (" + (a.end == null ? "until ended" : fl(Math.max(0, a.end - (st.round || 1))) + " left") + ")"; });
      (st.pending || []).forEach(function (q) { act.push(q.name + " (waiting to go off)"); });
      out.push(" - Concentration (" + act.length + " of " + D.prog.slots + "): " + (act.length ? act.join(", ") : "nothing held") + ".");
      var off = S().ITEMS.filter(function (i) { return (st.eq || {})[i.k] === false; }).map(function (i) { return i.name; });
      if (off.length) out.push(" - Set aside (giving nothing): " + off.join(", ") + ".");
    } else {
      out.push(" - Hit points " + (st.petHp == null ? D.pet.hpMax : st.petHp) + " of " + D.pet.hpMax + ".");
    }
    var ef = fx(who);
    out.push(" - Effects on " + (who === "her" ? "her" : "him") + ": " + (ef.length ? ef.join(", ") : "none") + ".");
    if (who === "her") { var ep = fx("pet"); out.push(" - Effects on Gwathfaron: " + (ep.length ? ep.join(", ") : "none") + "."); }
    out.push(" - Conditions: " + (cd.length ? cd.join(", ") : "none") + ".");
    return out;
  }
  /* flanking partners other than the two of them (a teamwork feat counts only when the partner has it too) */
  function otherFlank(st, pet) {
    if (pet) return "With anyone else: +2 (Coordinated Companion lends him her teamwork feats only with her).";
    var o = S().hasFeat(st, "Outflank"), p = S().hasFeat(st, "Precise Strike");
    return "With another ally: +2" + (o ? "; +4 if that ally has Outflank" : "") + (p ? "; +1d6 precision if that ally has Precise Strike" : "") + ".";
  }

  function her(ctx, tpl) {
    var st = ctx.st, b = baseState(st), d = S().derive(b), dNow = S().derive(Object.assign({}, b, { strDmg: st.strDmg || 0 }));
    var PR = d.prog, L = d.level, sp = d.sp, a = d.atk, ab = d.ab, out = [];
    var push = function () { for (var i = 0; i < arguments.length; i++) out.push(arguments[i]); };

    /* personal details: the printed sheet's header, with the date and speed brought up to date */
    var head = String(tpl || "").split("\n").slice(0, 5);
    if (head.length === 5) {
      head[2] = head[2].replace(/^Update: .{20}/, "Update: " + pad(ctx.today, 20));
      head[4] = head[4].replace(/Speed : [^|]*\|/, "Speed : " + pad(d.speed + "ft (" + (d.speed + PR.fastMove) + " forest)", 17) + "|");
      head.forEach(function (l) { push(l); });
    } else push("Name  : Daerlieth Nightstar");
    push(RULE);

    /* abilities and classes */
    var abl = ["str", "dex", "con", "int", "wis", "cha"], cls = [
      "Class                 Level", " Eternal Mage (A)      " + lpad(L, 3), " Spell-less Ranger (B) " + lpad(L, 3), "", "",
      "Total Level: " + L + " gestalt (Mythic Tier 2)", ""];
    push("       Ability    |   Temporary   | " + cls[0]);
    push("     Score   Mod  |  Score   Mod  | " + cls[1].trim());
    abl.forEach(function (k, i) {
      var o = ab[k], n = dNow.ab[k], temp = n.score !== o.score ? lpad(n.score, 6) + "   " + lpad(sg(n.mod), 4) : "             ";
      push(k.toUpperCase() + "   " + lpad(o.score, 2) + "      " + pad(sg(o.mod), 3) + " | " + temp + " | " + (cls[i + 2] || "").trim());
    });
    abl.forEach(function (k) { if (ab[k].item) push("- " + k.charAt(0).toUpperCase() + k.slice(1) + " " + (ab[k].score - ab[k].item) + " + " + ab[k].item + " (item)."); });
    push("- Int includes +2 mythic ability score (Tier 2).");
    push(RULE);

    /* hit points and initiative */
    var initMisc = d.init - ab.dex.mod;
    push("        Total   Current   Subdual |         Total   Dex   Misc");
    push("HP    :  " + lpad(d.hpMax, 3) + "      " + lpad(st.hp == null ? d.hpMax : st.hp, 3) + "             | Init  :  " + lpad(sg(d.init), 3) + "  =  " + ab.dex.mod + "  + " + initMisc + " (Reactionary 2, Amazing Initiative 2)");
    push("- Hard to Kill: stabilizes automatically below 0, dies at -" + (2 * ab.con.score) + ".");
    push("- Favored class bonus taken as skill ranks, not hit points.");
    push("- In forest: initiative +" + PR.forest + " more (favored terrain).");
    push(RULE);

    /* armor class */
    var ac = d.ac;
    push("          Total        Armr  Shld   Dex  Nat  Defl");
    var acl = function (lbl, tot, arm, sh, dx, nat, de) { return pad(lbl, 8) + ":  " + lpad(tot, 3) + "  =  10 + " + lpad(arm, 2) + "  + " + lpad(sh, 2) + "  + " + lpad(dx, 2) + "  + " + nat + " + " + lpad(de, 2); };
    push(acl("Full", ac.full, ac.armor, ac.shield, ac.dex, ac.nat, ac.defl), acl("AC", ac.full, ac.armor, ac.shield, ac.dex, ac.nat, ac.defl),
      acl("Touch", ac.touch, 0, 0, ac.dex, 0, ac.defl), acl("FlatFoot", ac.ff, ac.armor, ac.shield, 0, ac.nat, ac.defl));
    slice(tpl, "- +1 mithral chain shirt", RULE.slice(0, 10)).forEach(function (l) { if (!/^\* Shield/.test(l)) push(l); });
    push("* Shield spell adds +4: AC " + (ac.full + 4) + ".");
    push(RULE);

    /* saves */
    var sv = d.save, svl = function (lbl, k, tot) { return pad(lbl, 11) + ":  " + lpad(sg(tot), 3) + "    =  " + sv.base + "  +  " + ab[k].mod + "  +  " + (tot - sv.base - ab[k].mod); };
    push("SAVES                          Ability", "            Bonus    Base   Mod  Magic",
      svl("Fort (Con)", "con", sv.fort), svl("Ref  (Dex)", "dex", sv.ref), svl("Will (Wis)", "wis", sv.will));
    push("- Base " + sv.base + " on every save by gestalt. Magic = cloak of resistance +" + sv.cloak + ".");
    push("- Cold resistance 5 (moon elf), fire resistance 10 (Elemental Bond).");
    push(RULE);

    /* attack bonuses and maneuvers */
    var bab = a.bab, strM = ab.str.mod;
    push("Base    Total       Base   Str   Misc | Base    Total   Base   Dex   Misc");
    push("Melee :  " + sg(bab + strM) + "/" + sg(bab + ab.dex.mod) + "  =  " + bab + "  +  " + strM + "  +  " + (ab.dex.mod - strM) + "    | Range :  " + sg(d.rtouch) + "  =  " + bab + "  +  " + ab.dex.mod + "  +  0");
    push("- Melee " + sg(bab + strM) + " with Str; " + sg(bab + ab.dex.mod) + " with Weapon Finesse (Dex " + ab.dex.mod + " replaces Str " + strM + ") for unarmed strikes.");
    push(RULE);
    push("Combat  Total  Base  Str  Misc    | Mnvr   Total  Base   Str   Dex  Misc");
    push("Mnvr   : " + sg(d.cmb) + " =  " + bab + "  +  " + strM + "  +  " + (d.cmb - bab - strM) + "     | Defense: " + d.cmd + "  = 10  +  " + bab + "  +  " + strM + "  +  " + ab.dex.mod + "  +  " + (d.cmd - 10 - bab - strM - ab.dex.mod));
    push(RULE, "");

    /* weapon table */
    var die = a.die, dmM = die + sg(a.dmgM), dmO = die + sg(a.dmgO), fb = S().hasFeat(st, "Outflank") ? 4 : 2, ps = S().hasFeat(st, "Precise Strike");
    var tw = []; for (var q = 0; q < Math.max(a.twMains.length, a.offs.length); q++) { if (q < a.twMains.length) tw.push(a.twMains[q]); if (q < a.offs.length) tw.push(a.offs[q]); }
    var hasted = [tw[0] + 1, tw[1] + 1, tw[0] + 1].concat(tw.slice(2).map(function (x) { return x + 1; }));
    var row = function (n, atk, note) { return pad(n, 17) + "|Melee | " + pad(atk, 18) + "| " + pad(dmM, 5) + " | 20/x2 |   -   |   B   | " + note; };
    push("Weapon: Unarmed Strike (+1 bodywrap of mighty strikes)   Weight: 1 lb");
    push("Move Name         Type    Atk                 Damage   Crit   Range   Type    Special");
    push(row("Single", sg(a.single), "Standard action, one strike. Bodywrap use: " + sg(a.single + a.wrap) + " for " + die + sg(a.dmgM + a.wrap) + "."));
    push(row("Full, 2 weapons", tw.map(sg).join("/"), "Main and off hand alternate. Off hand " + dmO + " (half Str)."));
    push(row("Full, hasted", hasted.map(sg).join("/"), "Haste: +1 on every attack and one extra main-hand strike."));
    push(row("Full, 1 weapon", a.mains.map(sg).join("/"), "Hasted: " + [a.mains[0] + 1, a.mains[0] + 1].concat(a.mains.slice(1).map(function (x) { return x + 1; })).map(sg).join("/") + "."));
    push(row("Charge", sg(a.charge), "-2 AC until next turn. Bodywrap use: " + sg(a.charge + a.wrap) + "."));
    push(row("Attack of opp.", sg(a.single), a.aoo + " a round (Combat Reflexes), even while flat-footed. Reach 10 ft with long arm."));
    push("");
    push("Attack: BAB " + bab + " + Dex " + ab.dex.mod + " (Weapon Finesse) + 1 Weapon Focus = " + sg(a.single) + ". Two-Weapon Fighting: -2 on every strike (unarmed strikes count as light).");
    push("Damage: " + die + " unarmed (Monastic Legacy, effective monk level " + Math.floor(L / 2) + ") + Str " + strM + " main hand, " + sg(a.dmgO) + " off hand (half Str).");
    push("Flanking with Gwathfaron: +" + fb + " on every melee attack" + (fb > 2 ? " (Outflank)" : "") + (ps ? " and +1d6 precision damage on every melee hit (Precise Strike)" : "") + ", for both of them.");
    push(otherFlank(st) + " Any flank turns on her stealth attack.");
    push("");
    slice(tpl, "Bodywrap of mighty strikes", "Stealth attack").forEach(function (l) { push(l); });
    push("");
    push(pad("Stealth attack +" + PR.stealthDice + "d6", 24) + ": only in a favored terrain or vs a favored enemy, and the target is denied its Dex bonus or flanked.");
    push(pad("", 24) + "  Not multiplied on a critical. Ranged only within 30 ft. Light, medium or no armor only.");
    push(pad("Skirmishing Attack", 24) + ": if she moves 10+ ft and attacks, the first attack counts as against a flat-footed target.");
    push(pad("Favored enemy bonus", 24) + ": " + d.fe.map(function (f) { return "+" + f.b + " " + f.name.toLowerCase(); }).join(", ") + ". (to attack and damage)");
    push(pad("Improved Unarmed Strike", 24) + ": her fists are armed (no attacks of opportunity) and deal lethal damage.");
    push("");

    /* arcane artillery */
    var art = sp.artDice + "d6" + sg(sp.artFlat), burn = Math.max(0, sp.artLvl - sp.buffer);
    push("Arcane Artillery (Eternal Mage, Artillery Adept)");
    push("Move Name    Type    Atk   Damage    Crit      Range   Type    Special");
    push("Artillery   |Touch | " + sg(d.rtouch) + " | " + pad(art, 6) + " |    -     | 30ft  | arcane | Ranged touch, std action. 1 overdrive: dice become d8 (" + sp.artDice + "d8" + sg(sp.artFlat) + "). Burnout cost " + burn + ".");
    push("Sniper      |Touch | " + sg(d.rtouch) + " | " + pad(art, 6) + " |    -     | 120ft | arcane | Artillery Sniper secret");
    push("Burst       |Burst |  -  | " + pad(art, 6) + " |    -     | 15ft burst around her | arcane | Artillery Burst secret. Reflex half, DC " + sp.secretDc + ". She takes no damage.");
    push("- Only one secret per shot (sniper or burst). Each 2 burnout: -1d6 and -1 DC.");
    push("- Burnout " + burn + " a shot (a " + ord(sp.artLvl) + "-level spell minus arcane buffer " + sp.buffer + "), or " + Math.max(0, burn - sp.odIgnore) + " with 1 overdrive. The d8 upgrade is a separate 1-point spend.");
    push("");
    slice(tpl, "Armor: +1 Mithral", RULE.slice(0, 10)).forEach(function (l) { push(l); });
    push("");
    push(RULE);

    /* feats, traits, talents, class and mythic abilities */
    push("ABILITIES/FEATS", "");
    S().featGroups(st).forEach(function (g) {
      push(g[0] + ":");
      g[1].forEach(function (r) {
        var info = S().featInfo(r[1]), what = r[3] ? "(" + r[2] + ")" : (info ? info[1] : "") + (r[2] ? " [" + r[2] + "]" : "");
        push(" " + (r[0] ? r[0] + " - " : "- ") + (r[3] ? r[1] + " " : r[1] + ": ") + what);
      });
      push("");
    });
    S().classData(st, d).forEach(function (g) {
      push(g[0].replace(/ abilities$/, "") + " " + (/Mythic/.test(g[0]) ? "(Archmage, Tier 2)" : L) + ":");
      g[1].forEach(function (r) { push(" - " + r[0] + ": " + r[1]); });
      push("");
    });
    push(RULE);

    /* spells */
    var spells = ctx.spells || [], dur = function (x) { return x.per ? " (D)" : ""; }, myth = function (x) { return x.myth ? " (mythic)" : ""; };
    push("SPELLBOOK:", "None. She casts without a spellbook or prepared slots.", "", RULE);
    var nKnown = spells.filter(function (x) { return !x.art && !x.exp; }).length;
    push("SPELLS KNOWN (" + nKnown + " known, wizard list, from her focus schools):");
    for (var lv = 0; lv <= PR.maxSpell; lv++) {
      var at = spells.filter(function (x) { return x.lvl === lv && !x.art; });
      if (!at.length) continue;
      push((lv ? lv + " (burnout " + Math.max(0, lv - sp.buffer) + "): " : "0 (" + at.length + " known, no burnout): ") +
        at.map(function (x) { return x.name.toLowerCase() + dur(x) + myth(x) + (x.exp ? " [experimental, +1 burnout]" : ""); }).join(", "));
    }
    push("Racial light or dancing lights 1/day, no burnout.");
    push("(D) = duration spell: at most " + PR.slots + " active at once (limited concentration).");
    push("Magic missile: " + sp.missiles + " missiles at CL " + sp.cl + ", 1d4+1 force each, no attack roll.");
    push("Scorching ray: " + sp.rays + " rays at CL " + sp.clRay + " (Elemental Bond +2, Gifted Adept +1), 4d6 fire each, ranged touch " + sg(d.rtouch) + ".");
    push("Fireball: " + sp.fbDice + "d6 fire (CL " + sp.clFire + " with Elemental Bond), 20 ft radius spread, Reflex DC " + sp.dc[2] + " for half. Mythic: " + sp.fbDice + "d10 and burning.");
    push("Dimension door: her and up to " + sp.ddCarry + " willing Medium or smaller creatures, " + sp.ddRange + " ft. Mythic: a one-way portal " + sp.ddDoor + " creatures she picks can use.");
    var has = function (n) { return spells.some(function (x) { return x.name.toLowerCase() === n; }); };
    if (has("long arm")) push("Long arm: her arms stretch, reach 10 ft for " + sp.cl + " minutes (1 a level); unlike enlarge person, no change to size, Dex, AC or attacks.");
    if (has("blood money")) push("Blood money: swift action, she takes 1d6 damage and her blood replaces one material component this round; over 1 gp it costs 1 Strength damage plus 1 per full 500 gp.");
    if (has("detonate")) push("Detonate: " + Math.min(10, sp.cl) + "d8 (max 10d8), uses 50 gp of vials, holds a concentration slot for 1 round until it goes off.");
    push("Mythic spells (fireball, dimension door) cost 1 mythic power on top of the cast.");
    push("Experimental spell (any wizard/sorcerer spell up to " + ord(PR.expMax) + " level, chosen each day, +1 burnout): " +
      (ctx.exp ? ctx.exp.name.toLowerCase() + (ctx.expLocked ? " (locked in today)" : " (not yet locked in)") : "none chosen today") + ".");
    push("Wild Arcana (1 mythic power, standard action): any wizard spell she doesn't know, CL +2.");
    push("Armor: the mithral chain shirt gives " + d.spellFail + "% arcane spell failure on spells with a somatic component.");
    push("", RULE);
    push("SPELLS PER DAY / SAVE DC (Spell Level + Ability Mod + 10)", "No spells per day. Spells are cast freely and cost burnout instead.");
    sp.dc.forEach(function (dc, i) { push((i + 1) + ":  unlimited / DC " + dc); });
    push("Arcane artillery burst DC " + sp.secretDc + ". Eternal secret DC " + sp.secretDc + ".");
    push("Caster level " + sp.cl + " (" + sp.clFire + " for fire spells, " + sp.clRay + " for scorching ray). Concentration " + sg(sp.conc) + " (CL " + sp.cl + " + Cha " + sp.cha + ").");
    push("");
    push("Eldritch burnout: casting a spell of 1st level or higher adds burnout equal to its level, minus " + sp.buffer + " for arcane buffer (minimum 0), +1 for the experimental spell.");
    push("Each burnout point: -1 caster level. Each 2 points: -1 DC, and -1d6 artillery damage. At caster level 0 she can use only cantrips.");
    push("She recovers 1 burnout at the end of any round in which she gains none. Overdrive (" + sp.od + " points): 1 point ignores up to " + sp.odIgnore + " burnout.");
    push("", RULE);

    /* skills */
    var short = function (n) {
      return n.replace(/^Knowledge \(([^)]+)\)$/, function (m, k) { var t = k.charAt(0).toUpperCase() + k.slice(1); return "Knowledge:" + (t.length > 8 ? t.slice(0, 7) + "." : t); });
    };
    var skl = function (s) {
      if (s.name === "Linguistics") return pad("Linguistics^", 19) + "(Int) " + s.ranks + " ranks: " + s.ranks + " extra languages (one per rank)";
      var key = (S().SKILLS.filter(function (x) { return x[0] === s.name; })[0] || [0, "int"])[1], am = ab[key].mod;
      var cs = /class skill/.test(s.tip) ? 3 : 0, misc = s.total - am - s.ranks - cs;
      var nm = short(s.name) + (s.trained ? "^" : ""), tot = s.usable ? (s.total < 0 ? "-" : "+") + lpad(Math.abs(s.total), 3) : "   -";
      return pad(nm, 19) + "(" + key.charAt(0).toUpperCase() + key.slice(1) + ") " + tot + "  =  " + am + "  +  " + s.ranks + "  +  " + cs + "  +  " + misc + (s.usable ? "" : "   (trained only: can't be used)");
    };
    var R_ = d.ranks;
    push("SKILLS (Max Rank = Level, Class Skills get +3 bonus with at least 1 Rank)", "");
    push("ADVENTURING SKILLS (" + R_.adv + " of " + R_.advMax + " ranks)", "", "                 Key     Total Ability     Class  Misc", "                 Ability  Mod   Mod  Ranks Skill  Mod");
    d.skills.filter(function (s) { return !s.bg; }).forEach(function (s) { push(skl(s)); });
    push("", "BACKGROUND SKILLS (" + R_.bg + " of " + R_.bgMax + " ranks)", "", "                 Key     Total Ability     Class  Misc", "                 Ability  Mod   Mod  Ranks Skill  Mod");
    d.skills.filter(function (s) { return s.bg; }).forEach(function (s) { push(skl(s)); });
    push("", "^Trained only");
    push("Situational, not in the totals above:");
    push(" +" + PR.forest + " (Forest) on Perception, Stealth, Survival and Knowledge (geography), and initiative.");
    push(" " + d.fe.map(function (f) { return "+" + f.b + " (" + f.name + ")"; }).join(" ") + " on Bluff, Knowledge, Perception, Sense Motive and Survival against them.");
    push(" +" + PR.track + " Track (Survival) to follow tracks.", " +2 (Forest) to Heal using Nature's Healing.");
    push(" Untrained Knowledge (" + ["local", "planes", "engineering", "geography", "nobility"].join(", ") + "): " + sg(ab.int.mod) + " (Int), local " + sg(ab.int.mod + 1) + " (Friend in Every Town); DC 10 or lower only.");
    push("Take 10 / take 20: allowed on every skill but Use Magic Device; no take 20 on Knowledge, Appraise, Sense Motive or Spellcraft (no retry).");
    slice(tpl, "Languages (", null).slice(0, 1).forEach(function (l) { push(l); });
    var lingR = (d.skills.filter(function (s) { return s.name === "Linguistics"; })[0] || {}).ranks || 0;
    if (lingR > 4) push(" + " + (lingR - 4) + " more from new Linguistics ranks, not yet named.");
    push("", RULE);

    /* companion summary */
    var p = d.pet;
    push("ANIMAL COMPANION: Gwathfaron, panther (full sheet on the Gwathfaron tab)");
    push("Medium animal (Core Rulebook small cat, leopard), effective druid level " + PR.pet.druid + ", " + p.hd + " HD. Str " + p.ab.str + ", Dex " + p.ab.dex + ", Con " + p.ab.con + ", Int " + p.ab.int + ", Wis " + p.ab.wis + ", Cha " + p.ab.cha + ".");
    push("HP " + p.hpMax + " (dies at -" + p.dead + "). AC " + p.ac + ", touch " + p.touch + ", flat-footed " + p.ff + ". Init " + sg(p.init) + ". Speed 50 ft (sprint 500 ft charge, once an hour).");
    push("Fort " + sg(p.fort) + ", Ref " + sg(p.ref) + " (evasion), Will " + sg(p.will) + " (+4 vs enchantment). Bite " + sg(p.bite) + " (1d6" + sg(p.biteD) + " plus trip), 2 claws " + sg(p.claw) + " (1d3" + sg(p.clawD) + "). CMB " + sg(p.cmb) + ", CMD " + p.cmd + " (" + (p.cmd + 4) + " vs trip).");
    push("Stealth " + sg(p.stealth) + ", Perception " + sg(p.perc) + " (+" + PR.forest + " each in forest). Feats: " + p.feats.join(", ") + "; teamwork (from her): Bonded Mind, " + S().BASE_FEATS.join(", ") + ".");
    push("Tricks: Attack (any creature), Come, Down, Guard, Heel, Seek, Stay, Track" + petTricks(st).map(function (t) { return ", " + t; }).join("") + ". Equipment: none.");
    push("", RULE);

    /* gear and money, from the printed sheet */
    slice(tpl, "MONEY:", "LOAD:").forEach(function (l) { push(l); });
    var SLOTS = ["Head", "Headband", "Eyes", "Shoulders", "Neck", "Chest", "Body", "Belt", "Wrists", "Hands", "Ring", "Ring", "Feet"];
    var worn = S().ITEMS.filter(function (i) { return (st.eq || {})[i.k] !== false; }), usedS = worn.map(function (i) { return i.slot; });
    var openS = SLOTS.filter(function (sl) { var k = usedS.indexOf(sl); if (k >= 0) { usedS[k] = null; return false; } return true; });
    push("SLOTS: " + worn.map(function (i) { return i.slot.toLowerCase() + " - " + i.name.replace(/^(Cloak|Belt|Headband|Amulet)/, function (m) { return m.toLowerCase(); }); }).join("; ") + ".");
    push("       Open: " + openS.join(", ").replace("Ring, Ring", "2 rings").toLowerCase() + ". Slotless: handy haversack.");
    push(RULE);
    var ld = d.load;
    push("LOAD:  Light " + ld.light + " lb   Medium (-3) " + ld.med + " lb   Heavy/Max (-6) " + ld.max + " lb   Lift (x 2) " + ld.lift + " lb   Push/Drag (x 5) " + ld.push + " lb");
    push("        Carrying " + ld.wt + " lb: " + ld.cat.toLowerCase() + " load");
    push(RULE);
    slice(tpl, "MAGIC ITEMS", "DAILY RESOURCES").forEach(function (l) { push(l); });
    push(RULE);
    push("DAILY RESOURCES");
    push(" - Arcane overdrive: " + sp.od + " points (refills after 8 hours of sleep). 1 point: ignore up to " + sp.odIgnore + " burnout from one cast; 1 point: artillery dice become d8s.");
    push(" - Mythic power: 7 uses a day. 1 each: Wild Arcana, Surge (+1d6 on a d20), Amazing Initiative (extra standard action, no spells or artillery), a mythic spell.");
    push(" - Racial light or dancing lights: 1 a day");
    push(" - Detonate vials: " + (st.vials == null ? 2 : st.vials) + " casts");
    push(" - Natural healing on a new day: 8 hp for her, 7 for Gwathfaron.");
    push("", RULE);
    push("CURRENT STATUS (" + ctx.today + ", round " + (st.round || 1) + ")");
    nowLines(st, "her").forEach(function (l) { push(l); });
    push("", RULE);
    push("LETTERS OF TRAVEL: " + (S().LETTERS || []).map(function (l) { return l.name; }).join("; ") + ".");
    push(RULE);
    slice(tpl, "DESCRIPTION", null).forEach(function (l) { push(l); });
    return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  }

  /* tricks picked at level-up (Levels.choices "ptrick-<level>") */
  function petTricks(st) {
    var pk = st.picks || {};
    return Object.keys(pk).filter(function (k) { return /^ptrick-/.test(k) && pk[k]; }).sort(function (x, y) { return parseInt(x.slice(7), 10) - parseInt(y.slice(7), 10); }).map(function (k) { return String(pk[k]); });
  }

  function pet(ctx, tpl) {
    var st = ctx.st, b = baseState(st), d = S().derive(b), p = d.pet, PR = d.prog, cp = p.cp, out = [];
    var push = function () { for (var i = 0; i < arguments.length; i++) out.push(arguments[i]); };
    var head = String(tpl || "").split("\n").slice(0, 5);
    if (head.length === 5) { head[2] = head[2].replace(/^Update: .{20}/, "Update: " + pad(ctx.today, 20)); head.forEach(function (l) { push(l); }); }
    push(RULE);
    var abl = ["str", "dex", "con", "int", "wis", "cha"], side = ["Animal companion (small cat)", "Effective druid level   " + lpad(cp.druid, 3), "Hit Dice                " + lpad(cp.hd, 3), "", "Companion of Daerlieth (Spell-less Ranger " + d.level + ",", "Companion-Bound) with Improved Animal Companion", ""];
    push("       Ability    |   Temporary   | Class                     Level");
    push("     Score   Mod  |  Score   Mod  |  " + side[0]);
    abl.forEach(function (k, i) { push(k.toUpperCase() + "   " + lpad(p.ab[k], 2) + "      " + pad(sg(p.m[k]), 3) + " |               |" + (side[i + 1] ? "  " + side[i + 1] : "")); });
    abl.forEach(function (k) { push("- " + k.toUpperCase() + ": " + p.ab_t[k].replace(/−/g, "-")); });
    push(RULE);
    push("        Total   Current   Subdual |         Total   Dex   Misc");
    push("HP    :   " + lpad(p.hpMax, 2) + "       " + lpad(st.petHp == null ? p.hpMax : st.petHp, 2) + "             | Init  :  " + lpad(sg(p.init), 3) + "  =  " + p.m.dex + "  +  " + (p.init - p.m.dex));
    push("- " + cp.hd + "d8 + " + (cp.hd * p.m.con) + " Con + 1d8 Improved Animal Companion (averages) = " + p.hpMax + ".");
    push("- Dies at -" + p.dead + " (Con " + p.ab.con + "). +" + PR.forest + " initiative in forest (Daerlieth's favored terrain, shared).");
    push(RULE);
    var acl = function (lbl, tot, dx, nat) { return pad(lbl, 8) + ":  " + lpad(tot, 3) + "  =  10 +  0  +  0  + " + lpad(dx, 2) + "  + " + nat + " +  0"; };
    push("          Total        Armr  Shld   Dex  Nat  Defl", acl("Full", p.ac, p.m.dex, p.nat), acl("AC", p.ac, p.m.dex, p.nat), acl("Touch", p.touch, p.m.dex, 0), acl("FlatFoot", p.ff, 0, p.nat));
    push("- Natural armor " + p.nat + " = 1 small cat + " + cp.natBonus + " companion table + 2 Improved Animal Companion.");
    push(RULE);
    var svl = function (lbl, base, mod, tot) { return pad(lbl, 11) + ":  " + lpad(sg(tot), 3) + "    =  " + base + "  +  " + mod + "  +  " + (tot - base - mod); };
    push("SAVES                          Ability", "            Bonus    Base   Mod  Magic", svl("Fort (Con)", cp.good, p.m.con, p.fort), svl("Ref  (Dex)", cp.good, p.m.dex, p.ref), svl("Will (Wis)", cp.poor, p.m.wis, p.will));
    push("- " + (cp.impEvasion ? "Improved evasion: half damage even on a failed Reflex save." : "Evasion: no damage on a successful Reflex save for half."));
    push("- Devotion: +4 morale bonus on Will saves against enchantment (" + sg(p.will + 4) + ").");
    push(RULE);
    push("Base    Total       Base   Str   Misc | Base    Total   Base   Dex   Misc");
    push("Melee :   " + sg(cp.bab + p.m.str) + "      =  " + cp.bab + "  +  " + p.m.str + "  +  0    | Range :  " + sg(cp.bab + p.m.dex) + "  =  " + cp.bab + "  +  " + p.m.dex + "  +  0");
    push("- Natural attacks only. Space 5 ft, reach 5 ft.");
    push(RULE);
    push("Combat  Total  Base  Str  Misc    | Mnvr   Total  Base   Str   Dex  Misc");
    push("Mnvr   :  " + sg(p.cmb) + " =  " + cp.bab + "  +  " + p.m.str + "  +  0     | Defense: " + p.cmd + "  = 10  +  " + cp.bab + "  +  " + p.m.str + "  +  " + p.m.dex + "  +  0");
    push("- CMD " + (p.cmd + 4) + " vs trip (four legs).");
    push(RULE, "");
    var bd = "1d6" + sg(p.biteD), cd = "1d3" + sg(p.clawD), sec = "Secondary (-" + p.secPen + (cp.multiattack ? ", Multiattack" : "") + ", half Str).";
    var row = function (n, atk, dmg, type, note) { return pad(n, 17) + "|Melee | " + pad(atk, 13) + "| " + pad(dmg, 5) + " | 20/x2 |   -   | " + pad(type, 5) + " | " + note; };
    push("Weapon: Natural attacks", "Move Name         Type    Atk            Damage   Crit   Range   Type    Special");
    push(row("Bite", sg(p.bite), bd, "B/P/S", "Primary. On a hit: free trip, CMB " + sg(p.cmb) + ", no AoO."));
    push(row("Claw", sg(p.claw), cd, "B/S", sec), row("Claw", sg(p.claw), cd, "B/S", sec));
    push(pad("Full attack", 17) + "|Melee | " + pad([p.bite, p.claw, p.claw].map(sg).join("/"), 13) + "| as above              | Bite and 2 claws, 5-ft step only.");
    push(pad("Full, hasted", 17) + "|Melee | " + pad([p.bite + 1, p.bite + 1, p.claw + 1, p.claw + 1].map(sg).join("/"), 13) + "| as above              | Haste: +1 on every attack and one extra bite.");
    push(row("Charge", sg(p.bite + 2), bd, "B/P/S", "Bite only. -2 AC until his next turn."), row("Attack of opp.", sg(p.bite), bd, "B/P/S", "Bite."));
    push("");
    var fb = S().hasFeat(st, "Outflank") ? 4 : 2, ps = S().hasFeat(st, "Precise Strike");
    push("Flanking with Daerlieth: +" + fb + " on every melee attack" + (fb > 2 ? " (Outflank)" : "") + (ps ? " and +1d6 precision damage on every hit (Precise Strike)" : "") + ",");
    push("both hers through Coordinated Companion (his while within 30 ft of her); it also turns on her stealth attack.");
    push(otherFlank(st, true));
    push("Haste (hers or anyone's): +1 attack, +1 dodge AC, +1 Reflex, +30 ft speed, one extra bite on a full attack.");
    push("Favored enemy (shared from Daerlieth): " + d.fe.map(function (f) { return "+" + f.b + " vs " + f.name.toLowerCase(); }).join(", ") + " (attack and damage).");
    push("Sprint (Ex): once an hour, a charge at ten times his speed (500 ft).");
    push(RULE);
    push("Skills                    Total  Ranks  Abil   Class  Misc");
    p.skills.slice().sort(function (x, y) { return y.total - x.total; }).forEach(function (s) {
      push(pad(s.name, 18) + "(" + s.key.charAt(0).toUpperCase() + s.key.slice(1) + ")   " + lpad(sg(s.total), 4) + "  =  " + s.ranks + (s.abil < 0 ? "  -  " + (-s.abil) : "  +  " + s.abil) + "  +  " + (s.cls ? 3 : 0) + "  +  " + s.misc);
    });
    push("- " + p.ranksMax + " ranks (" + (p.cunning ? "2 per Hit Die with Cunning" : "1 per Hit Die") + "). +" + PR.forest + " Perception, Stealth and Survival in forest (shared).", "- Scent and low-light vision.");
    push(RULE);
    push("Feats (" + cp.feats + " at " + cp.hd + " HD)");
    p.feats.forEach(function (f) { var i = S().featInfo(f); push("- " + pad(f, 25) + ": " + (i ? i[1] : "")); });
    if (cp.multiattack) push("- " + pad("Multiattack", 25) + ": bonus; claws at -2 instead of -5.");
    ["Bonded Mind"].concat(S().BASE_FEATS).forEach(function (f) { var i = S().featInfo(f); push("- " + f + " (teamwork, from Daerlieth's Coordinated Companion, while within 30 ft of her): " + (i ? i[1] : "")); });
    push(RULE);
    push("Tricks (" + cp.tricks + ": 6 from Int, " + (cp.tricks - 6) + " bonus)", "Attack (any creature, counts as 2), Come, Down, Guard, Heel, Seek, Stay, Track" + petTricks(st).map(function (t) { return ", " + t; }).join(""));
    push("- Handle Animal " + sg(S().handleWith(b)) + " for Daerlieth (+4 bond). Bonded Mind lets her give these silently.");
    push(RULE);
    push("Special Abilities");
    ["Link", "Share spells", cp.impEvasion ? "Improved evasion" : "Evasion", "Devotion", "Sprint", "Trip"].forEach(function (n) {
      var i = (root.RulesInfo || {})["pet:" + n.toLowerCase()]; push(pad(n, 13) + ": " + (i ? i[1] : ""));
    });
    push("Improved Animal Companion (her Enhanced Companion pick): +1d8 hp, +1 Dex, +2 natural armor, all counted above.");
    push(pad("Shared", 13) + ": her favored enemies (" + d.fe.map(function (f) { return f.name.toLowerCase() + " +" + f.b; }).join(", ") + ") and forest bonus (+" + PR.forest + ").");
    push(RULE);
    slice(tpl, "Equipment", "Next level").forEach(function (l) { push(l); });
    push(RULE);
    push("CURRENT STATUS (" + ctx.today + ", round " + (st.round || 1) + ")");
    nowLines(st, "pet").forEach(function (l) { push(l); });
    push(RULE);
    return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  }

  root.RpolSheet = { her: her, pet: pet };
})(typeof window !== "undefined" ? window : this);
