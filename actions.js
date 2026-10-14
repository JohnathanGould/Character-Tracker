/* Action economy for the "This round" panel: what each thing she (or Gwathfaron) can do costs in actions.
   Acts: std (standard), move, swift, imm (immediate, uses next turn's swift), free, full (full-round), step (5-ft step),
   react (on an enemy's turn, uses none of her own actions: attacks of opportunity, one a round),
   none (no action, e.g. reactive checks), long (takes a minute or more: out of combat).
   Actions.catalog(who, ctx) builds the picker list from the live sheet; ctx = { d: SheetEngine.derive(state), spells: [castable], ct: function (name) -> casting time text or "" }. */
(function (root) {
  var ACT = { std: "Standard", move: "Move", swift: "Swift", imm: "Immediate", free: "Free", react: "Reaction", full: "Full-round", step: "5-ft step", none: "No action", long: "1 minute or more" };
  var sg = function (n) { return (n >= 0 ? "+" : "") + n; };

  /* what a skill normally costs in combat, and a note for the common uses */
  var SKILL_ACT = {
    "Acrobatics": ["move", "Part of a move: tumble past foes, balance or jump while moving."],
    "Appraise": ["std", "Standard action per item (full-round to find the best item in a hoard)."],
    "Artistry": ["long", "Hours or days of work."],
    "Bluff": ["std", "Feint: standard action (move with Improved Feint). A lie is part of talking (free)."],
    "Climb": ["move", "A move action climbs a quarter of her speed (half speed at −5)."],
    "Craft": ["long", "Days or weeks of work."],
    "Diplomacy": ["long", "1 minute to change an attitude; gather information takes 1d4 hours."],
    "Disable Device": ["full", "Simple device 1 round; tricky 1d4 rounds; difficult or wicked 2d4 rounds."],
    "Disguise": ["long", "1d3 × 10 minutes."],
    "Escape Artist": ["std", "Standard action to escape a grapple; a full-round action or more for ropes and manacles."],
    "Fly": ["move", "Part of a move action while flying."],
    "Handle Animal": ["free", "With Gwathfaron (Link): handle is a free action, push a move action. Teaching tricks takes a week."],
    "Heal": ["std", "First aid: standard action. Treat deadly wounds: 1 hour. Long-term care: 8 hours."],
    "Intimidate": ["std", "Demoralize: standard action. Influence attitude: 1 minute."],
    "Knowledge (arcana)": ["none", "Identifying a creature in combat takes no action."],
    "Knowledge (dungeoneering)": ["none", "Identifying a creature in combat takes no action."],
    "Knowledge (history)": ["none", "Recalling something takes no action."],
    "Knowledge (nature)": ["none", "Identifying a creature in combat takes no action."],
    "Knowledge (religion)": ["none", "Identifying a creature (undead) in combat takes no action."],
    "Linguistics": ["long", "Deciphering takes 1 minute per page."],
    "Lore": ["none", "Recalling something takes no action."],
    "Perception": ["move", "Actively searching is a move action; noticing something is reactive and takes no action."],
    "Perform": ["full", "At least a full-round action."],
    "Profession": ["long", "A week of work."],
    "Ride": ["move", "Guiding with the knees is a free check each round; mounting or dismounting is a move action."],
    "Sense Motive": ["none", "Reacting to a lie or feint takes no action; a hunch takes 1 minute."],
    "Sleight of Hand": ["std", "Standard action (move with a −20 penalty)."],
    "Spellcraft": ["none", "Identifying a spell as it is cast takes no action; identifying an item takes 3 rounds."],
    "Stealth": ["move", "Part of a move: half speed without penalty, full speed at −5."],
    "Survival": ["full", "Tracking is part of moving at half speed; getting along in the wild takes a day."],
    "Swim": ["move", "A move action swims a quarter of her speed (half speed as a full-round action)."],
    "Use Magic Device": ["std", "Standard action to use a wand or scroll."]
  };

  /* spell casting time text → act */
  function castAct(ct) {
    ct = String(ct || "").toLowerCase();
    if (/swift/.test(ct)) return "swift";
    if (/immediate/.test(ct)) return "imm";
    if (/full-round|^rounds? \(1\)|^1 round/.test(ct)) return "full";
    if (/minute|hour|rounds? \([2-9]/.test(ct)) return "long";
    return "std";
  }

  var MV = { moves: true }; /* actions that move her through space: no 5-ft step with them */

  function catalog(who, ctx) {
    var d = ctx.d, a = d.atk, sp = d.sp, p = d.pet, groups = [];
    var G = function (label, items) { groups.push({ label: label, items: items.filter(Boolean) }); };
    var I = function (id, name, act, note, extra) { var o = { id: id, name: name, act: act, note: note || "" }; for (var k in extra || {}) o[k] = extra[k]; return o; };
    if (who === "pet") {
      G("Attacks", [
        I("p-bite", "Bite " + sg(p.bite) + " (1d6" + sg(p.biteD) + ", free trip)", "std"),
        I("p-full", "Full attack: " + (p.haste ? "bite " + sg(p.bite) + "/" + sg(p.bite) + " (hasted)" : "bite " + sg(p.bite)) + ", claws " + sg(p.claw) + "/" + sg(p.claw), "full"),
        I("p-charge", "Charge: bite " + sg(p.bite + 2) + ", −2 AC", "full", "", MV),
        I("p-sprint", "Sprint: charge " + p.speed * 10 + " ft (once an hour)", "full", "", MV),
        I("p-aoo", "Attack of opportunity: bite " + sg(p.bite), "react", "A reaction on an enemy's turn, when a foe in his reach provokes. Uses none of his actions; one a round."),
        I("p-trip", "Trip (free on a bite hit), CMB " + sg(p.cmb), "free"),
        I("p-aid", "Aid another", "std"),
        I("p-totdef", "Total defense", "std")
      ]);
      G("Movement", [
        I("p-move", "Move (" + p.speed + " ft)", "move", "", MV), I("p-step", "5-ft step", "step"), I("p-run", "Run (" + p.speed * 4 + " ft)", "full", "", MV),
        I("p-stealth", "Move with Stealth " + sg(p.stealth), "move", "", MV), I("p-withdraw", "Withdraw", "full", "", MV), I("p-stand", "Stand up from prone", "move")
      ]);
      G("Senses and tricks", [
        I("p-perc", "Search: Perception " + sg(p.perc), "move"), I("p-track", "Track by scent (trick)", "move"),
        I("p-guard", "Guard (trick)", "none"), I("p-delay", "Delay", "none"), I("p-ready", "Ready an action", "std")
      ]);
      return groups;
    }
    var tw = [], q;
    for (q = 0; q < Math.max(a.twMains.length, a.offs.length); q++) { if (q < a.twMains.length) tw.push(a.twMains[q]); if (q < a.offs.length) tw.push(a.offs[q]); }
    var dm = a.die + sg(a.dmgM), hst = a.haste ? " (hasted)" : "";
    if (a.haste) { tw.splice(2, 0, a.twMains[0]); } /* haste: one extra main-hand strike at her highest bonus */
    var one = a.haste ? [a.mains[0]].concat(a.mains) : a.mains;
    G("Attacks", [
      I("h-single", "Unarmed strike " + sg(a.single) + " (" + dm + ")", "std"),
      I("h-full2", "Full attack, two weapons " + tw.map(sg).join("/") + hst + " (" + dm + ")", "full"),
      I("h-full1", "Full attack, one weapon " + one.map(sg).join("/") + hst + " (" + dm + ")", "full"),
      I("h-charge", "Charge " + sg(a.charge) + " (" + dm + "), −2 AC", "full", "", MV),
      I("h-aoo", "Attack of opportunity " + sg(a.single) + (a.reach > 5 ? " (reach " + a.reach + " ft)" : ""), "react", "A reaction on an enemy's turn, when a foe in her reach provokes. Uses none of her actions; " + (a.aoo > 1 ? a.aoo + " a round with Combat Reflexes." : "one a round.")),
      I("h-art", "Arcane artillery " + sg(d.rtouch) + " touch (" + sp.artDice + "d6" + sg(sp.artFlat) + ")", "std"),
      I("h-sniper", "Arcane artillery, sniper (120 ft)", "std"),
      I("h-burst", "Arcane artillery, burst (15 ft, Reflex DC " + sp.secretDc + ")", "std"),
      I("h-man", "Combat maneuver (trip, disarm, grapple...) CMB " + sg(d.cmb), "std", "Or in place of one attack in a full attack."),
      I("h-feint", "Feint (Bluff)", "std"), I("h-demo", "Demoralize (Intimidate)", "std"),
      I("h-defend", "Fight defensively (with attacks)", "none", "−4 attacks, +3 dodge AC."),
      I("h-totdef", "Total defense", "std"), I("h-aid", "Aid another", "std")
    ]);
    G("Spells", (ctx.spells || []).map(function (s) {
      var act = s.calc === "bm" ? "swift" : castAct(ctx.ct(s.name));
      return I("s-" + s.id, "Cast " + s.name + (s.exp ? " (experimental)" : ""), act, "", { spell: s.id });
    }).concat([
      I("h-wa", "Wild Arcana: cast a spell she doesn't know (1 mythic power)", "std"),
      I("h-light", "Racial light or dancing lights (spell-like)", "std"),
      I("h-dismiss", "Dismiss a spell", "std"), I("h-conc", "Concentrate on a spell", "std")
    ]));
    G("Mythic and overdrive", [
      I("h-surge", "Mythic Surge: +1d6 on a d20 roll (1 mythic power)", "imm"),
      I("h-ai", "Amazing Initiative: extra standard action (1 mythic power)", "free", "Gives one more standard action this turn (no spells or artillery).", { grants: "std" }),
      I("h-od", "Spend 1 overdrive (ignore burnout)", "free"), I("h-odd8", "Artillery overdrive: d8s (1 overdrive)", "free")
    ]);
    G("Movement", [
      I("h-move", "Move (" + d.speed + " ft)", "move", "", MV), I("h-step", "5-ft step", "step"), I("h-run", "Run (" + d.speed * 4 + " ft)", "full", "", MV),
      I("h-withdraw", "Withdraw", "full", "", MV), I("h-stand", "Stand up from prone", "move"), I("h-prone", "Drop prone", "free")
    ]);
    G("Skills", d.skills.map(function (s) {
      var sa = SKILL_ACT[s.name] || ["std", ""];
      return s.usable ? I("k-" + s.name, s.name + " " + sg(s.total), sa[0], sa[1]) : null;
    }));
    G("Gwathfaron and items", [
      I("h-handle", "Handle Gwathfaron (Link)", "free"), I("h-push", "Push Gwathfaron (a trick he doesn't know)", "move"),
      I("h-bonded", "Bonded Mind message to Gwathfaron", "free"),
      I("h-draw", "Retrieve an item (handy haversack, no attack of opportunity)", "move"),
      I("h-potion", "Drink a potion", "std"), I("h-throw", "Throw a splash weapon (alchemist's fire, tanglefoot...)", "std"),
      I("h-wand", "Use a wand", "std")
    ]);
    G("Other", [
      I("h-speak", "Speak", "free"), I("h-drop", "Drop an item", "free"), I("h-ready", "Ready an action", "std"), I("h-delay", "Delay", "none"),
      I("h-cdg", "Coup de grace", "full")
    ]);
    return groups;
  }

  /* budget: what a creature has used this round, what is left and what is over the limit.
     A standard action can be traded down for a second move action; a full-round action takes both. */
  function budget(list, aooCap) {
    aooCap = aooCap || 1;
    var n = { std: 0, move: 0, swift: 0, imm: 0, free: 0, react: 0, full: 0, step: 0, none: 0, long: 0 }, extra = 0, moved = false;
    (list || []).forEach(function (e) {
      n[e.act] = (n[e.act] || 0) + 1;
      if (e.grants === "std") extra++;
      if (e.moves || /^(Move|Run|Charge|Withdraw|Sprint)/.test(e.name)) moved = true;
    });
    var stdCap = 1 + extra, warn = [];
    var stdUsed = n.std + Math.max(0, n.move - 1); /* a second move uses up the standard action */
    if (n.full > 1) warn.push("only one full-round action a round");
    if (n.full && (n.std || n.move)) warn.push("a full-round action uses both the standard and the move action");
    if (stdUsed > stdCap) warn.push(n.move > 1 ? "only " + (1 + stdCap - n.std) + " move action" + (stdCap - n.std ? "s" : "") + " (a move can replace the standard)" : "only " + stdCap + " standard action" + (stdCap > 1 ? "s" : "") + " this round");
    if (n.swift + n.imm > 1) warn.push("one swift or immediate action a round");
    if (n.step > 1) warn.push("only one 5-ft step");
    if (n.react > aooCap) warn.push("only " + aooCap + " attack" + (aooCap > 1 ? "s" : "") + " of opportunity a round");
    if (n.step && moved) warn.push("no 5-ft step in a round she moves");
    if (n.long) warn.push("something here takes a minute or more: not a combat round");
    var std = n.full ? 0 : Math.max(0, stdCap - stdUsed);
    var move = n.full ? 0 : Math.max(0, 1 - n.move) + std;
    return {
      n: n, warn: warn, moved: moved, react: Math.max(0, aooCap - n.react),
      std: std, move: move, full: !n.full && !n.std && !n.move,
      swift: Math.max(0, 1 - n.swift - n.imm), step: n.step || moved ? 0 : 1
    };
  }

  /* can this still be done this round, given budget b? */
  function fits(act, b, moves) {
    if (moves && b.n.step) return false; /* after a 5-ft step she can't move */
    if (act === "std") return b.std > 0;
    if (act === "move") return b.move > 0;
    if (act === "full") return b.full;
    if (act === "swift" || act === "imm") return b.swift > 0;
    if (act === "step") return b.step > 0;
    if (act === "react") return b.react > 0;
    return true; /* free, no action, out of combat */
  }

  root.Actions = { ACT: ACT, SKILL_ACT: SKILL_ACT, castAct: castAct, catalog: catalog, budget: budget, fits: fits };
})(typeof window !== "undefined" ? window : this);
