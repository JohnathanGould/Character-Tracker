/* Rules text for the tap/hover info buttons on the sheets: skills, Gwathfaron's tricks and special abilities.
   Each entry is [type, one-line summary (hover), full text (tap)]. Keys are "skill:<name>", "trick:<name>", "pet:<name>"
   in lower case. Her class and mythic abilities are built in sheet.js (classSecs) because their numbers follow her level. */
(function (root) {
  var I = {};
  var add = function (prefix, list) { list.forEach(function (e) { I[prefix + e[0].toLowerCase()] = [e[1], e[2], e[3]]; }); };

  add("skill:", [
    ["Acrobatics", "Skill (Dex, armor check penalty)", "Balance, tumble past foes, jump.",
      "Balance on narrow or slippery surfaces (DC 5 to 20+; failing by 5 means a fall). Tumble through a threatened square at half speed without provoking an attack of opportunity (DC = the foe's CMD, +2 for each extra foe; through an enemy's square DC = CMD + 5). Long jump: DC = distance in feet; high jump: DC = 4 × height. Speed above 30 ft gives +4 per 10 ft to jump. With 3 ranks, fighting defensively gives +3 AC instead of +2 and total defense +6 instead of +4."],
    ["Appraise", "Skill (Int)", "Estimate an item's value.",
      "DC 20 to find the value of a common item (fail by 5 or more and the estimate is off by up to 50%). Rare or exotic items DC 25+. A standard action per item; can also spot the most valuable item in a hoard (DC 20, full-round action)."],
    ["Artistry", "Background skill (Int)", "Create art; knowledge of artistic works.",
      "Covers works of art such as painting, poetry or sculpture: creating them, judging them and recalling facts about them. Background skill (optional rules), so it uses background ranks."],
    ["Bluff", "Skill (Cha)", "Lie, feint in combat, pass secret messages.",
      "Opposed by the listener's Sense Motive, with modifiers for how believable the lie is (+0 to −20). Feint (standard action): Bluff against 10 + the target's BAB + Wis modifier (or its Sense Motive, if higher); on success it is denied its Dex bonus to AC against her next melee attack. A denied-Dex target also triggers her stealth attack. Secret messages: DC 15, or 20 for complex ones. Silver-Tongued Diplomacy gives her +2."],
    ["Climb", "Skill (Str, armor check penalty)", "Climb walls, slopes and ropes.",
      "Moves at a quarter of her speed (half speed at −5). DC 0 for a slope, 5 for a knotted rope against a wall, 10 for a rope or rough wall, 15 to 20 for most walls, 25 for a near-smooth surface. Fail by 4 or less: no progress; by 5 or more: she falls. She loses her Dex bonus to AC while climbing."],
    ["Craft", "Background skill (Int)", "Make items: armor, weapons, alchemy and so on.",
      "Each Craft is separate (alchemy, armor, bows, traps, weapons...). The check's result × the DC, in silver pieces, is the progress made per week. Background skill (optional rules)."],
    ["Diplomacy", "Skill (Cha)", "Change attitudes, make requests, gather information.",
      "Improve an NPC's attitude by one step (two if she beats the DC by 5) with 1 minute of talk; DC 15 + the creature's Cha modifier for indifferent, +5 per step worse. Make a request of a friendly or helpful creature. Gather information: 1d4 hours in a settlement, DC 10 for common knowledge, 20+ for obscure. Her racial and trait bonuses apply."],
    ["Disable Device", "Skill (Dex, trained only, armor check penalty)", "Disarm traps, open locks.",
      "Simple devices take 1 round (DC 10), tricky ones 1d4 rounds (DC 15), difficult ones 2d4 rounds (DC 20), and wicked ones 2d4 rounds (DC 25+). Locks: simple DC 20, average 25, good 30, superior 40. Failing by 5 or more on a trap sets it off. Without thieves' tools −2. Only characters with trapfinding can disarm magical traps."],
    ["Disguise", "Skill (Cha)", "Change her appearance.",
      "Takes 1d3 × 10 minutes. The result is opposed by observers' Perception when they look closely (or when she draws attention). −2 for a different gender, race or age category, −10 to impersonate a specific person someone knows well (with modifiers for familiarity)."],
    ["Escape Artist", "Skill (Dex, armor check penalty)", "Slip bonds, escape grapples, squeeze through.",
      "Ropes: DC = the binder's CMB + 20. Manacles DC 30 (masterwork 35). A grapple: DC = the grappler's CMD (standard action). Tight space (fits the head but not the shoulders) DC 30. Net or entangle DC 20."],
    ["Fly", "Skill (Dex, armor check penalty)", "Manoeuvre in flight.",
      "Only needed when she has a fly speed (a fly spell, for example). Checks for hovering (DC 15), turning sharply (DC 15), flying up steeply (DC 20) and avoiding a fall when hit while flying. Good manoeuvrability +4 (fly spell). Size and conditions modify it."],
    ["Handle Animal", "Skill (Cha, trained only)", "Command, push and train animals.",
      "Handle (move action, DC 10): make an animal perform a trick it knows. Push (full-round action, DC 25): perform a trick it doesn't know. Teach a trick: 1 week, DC 15 to 20 per trick. With her animal companion (Link) handling is a free action and pushing a move action, and she has +4. Gwathfaron's tricks are on his tab."],
    ["Heal", "Skill (Wis)", "First aid, long-term care, treat wounds, poison and disease.",
      "First aid (standard action, DC 15): stabilize a dying creature. Long-term care (8 hours, DC 15): double natural healing. Treat caltrop or spike-growth wounds (DC 15). Treat deadly wounds (1 hour, DC 20, uses a healer's kit): heals 1 hp per level. Treat poison or disease (DC = the poison or disease DC): the patient uses her result if it is higher. Nature's Healing adds +2 in her favored terrain and improves these in forest."],
    ["Intimidate", "Skill (Cha)", "Demoralize foes or bully someone into cooperating.",
      "Demoralize (standard action): DC 10 + the target's Hit Dice + Wis modifier; on success it is shaken for 1 round, +1 round for every 5 by which she beats the DC. The target must be within 30 ft and able to see and hear her. Influence attitude (1 minute): DC 10 + HD + Wis; the creature is friendly toward her for 1d6 × 10 minutes, then unfriendly. A shaken foe sets up Shatter Defenses."],
    ["Knowledge (arcana)", "Skill (Int, trained only above DC 10)", "Magic, spells, constructs, dragons, magical beasts.",
      "Ancient mysteries, magic traditions, arcane symbols, constructs, dragons and magical beasts. Identify a creature: DC 10 + its CR (5 + CR for very common ones); success tells one useful fact, plus one more per 5 over. Also identifies spells already in effect (DC 20 + spell level) and recalls magical lore."],
    ["Knowledge (dungeoneering)", "Skill (Int, trained only above DC 10)", "Underground, aberrations and oozes.",
      "Caverns, the underground world, aberrations and oozes. Identify a creature: DC 10 + its CR. Also underground navigation and hazards. Her drow favored enemy bonus applies when the check concerns drow."],
    ["Knowledge (history)", "Background skill (Int, trained only above DC 10)", "Wars, colonies, migrations, founding of cities.",
      "Royalty, wars, colonies, migrations and the founding of cities; recalling historic events and their dates. Background skill (optional rules)."],
    ["Knowledge (nature)", "Skill (Int, trained only above DC 10)", "Animals, fey, monstrous humanoids, plants, vermin, weather.",
      "Animals, fey, monstrous humanoids, plants and vermin; seasons and cycles, weather. Identify a creature: DC 10 + its CR. Identify a natural hazard (DC 15 + its CR)."],
    ["Knowledge (religion)", "Skill (Int, trained only above DC 10)", "Gods, mythic history, holy symbols, undead.",
      "Gods and goddesses, mythic history, ecclesiastic tradition, holy symbols and undead. Identify an undead creature: DC 10 + its CR, then her undead favored enemy bonus applies. Recognize a deity's symbol or clergy (DC 10)."],
    ["Linguistics", "Background skill (Int, trained only)", "Languages, decipher writing, spot and make forgeries.",
      "Each rank gives one more language. Decipher an unfamiliar script or archaic text: DC 20 for simple messages, 25 standard, 30 intricate (1 minute per page). Create or detect forgeries (opposed checks)."],
    ["Lore", "Background skill (Int)", "Specialised knowledge of one narrow subject.",
      "A narrow field of knowledge (a single city, a deity, a kind of creature). It works like a Knowledge check for that field. Background skill (optional rules)."],
    ["Perception", "Skill (Wis)", "Notice things: hear, see, smell, search.",
      "Opposed by Stealth, or against a DC: DC 0 to hear a battle, 10 to hear a quiet conversation, 15 to notice a well-hidden object, 20 to hear an owl, 25 to hear a creature walking. +1 DC per 10 ft of distance, +2 through a door, +10 through a wall, +5 if she is distracted, +10 if asleep. A move action to actively search. Keen Senses +2, forest and favored enemy bonuses apply."],
    ["Perform", "Background skill (Cha)", "Entertain: song, dance, oratory, instruments.",
      "Each Perform category is separate. DC 10 routine performance (earns 1d10 cp a day), 15 enjoyable, 20 great, 25 memorable, 30 extraordinary. Background skill (optional rules)."],
    ["Profession", "Background skill (Wis, trained only)", "Earn a living from a trade.",
      "Earn half the check result in gold pieces per week of work. Also answers questions about the profession (DC 10 easy, 15+ harder). Background skill (optional rules)."],
    ["Ride", "Skill (Dex, armor check penalty)", "Ride and fight on a mount.",
      "Routine riding needs no check. Guide with knees (DC 5), stay in the saddle (DC 5), fight with a combat-trained mount (DC 10), cover (DC 15), soft fall (DC 15), leap (DC 15), spur (DC 15), control an untrained mount in combat (DC 20), fast mount or dismount (DC 20)."],
    ["Sense Motive", "Skill (Wis)", "Detect lies, get a hunch, notice enchantment.",
      "Opposed by Bluff to see through a lie or feint. Hunch (1 minute, DC 20): tell whether someone is trustworthy or something is off. Sense enchantment (DC 25, or 15 if the person is dominated): notice that someone is under a compulsion. Discern a secret message (opposed). Favored enemy bonus applies against them."],
    ["Sleight of Hand", "Background skill (Dex, trained only, armor check penalty)", "Palm objects, pick pockets, hide items on her.",
      "DC 10 to palm a coin-sized object; DC 20 to lift something from a person (opposed by their Perception to notice). Hide a small weapon on her: opposed by Perception of anyone frisking her. A standard action normally."],
    ["Spellcraft", "Skill (Int, trained only)", "Identify spells and magic items; learn spells.",
      "Identify a spell as it is cast (no action, DC 15 + spell level). Identify the properties of a magic item with detect magic (DC 15 + item caster level, 3 rounds). Learn a spell from a spellbook or scroll (DC 15 + spell level). Decipher a scroll (DC 20 + spell level)."],
    ["Stealth", "Skill (Dex, armor check penalty)", "Move unseen and unheard.",
      "Opposed by Perception of anyone who might notice her. Moving at half speed has no penalty; at full speed −5, and running or charging −20. She needs cover or concealment to start (or a distraction: a Bluff check lets her hide at −10). Sniping: after a ranged attack she can hide again at −20. Size: Medium +0. Forest bonus applies. A foe who doesn't notice her is denied its Dex bonus, which turns on her stealth attack."],
    ["Survival", "Skill (Wis)", "Live off the land, track, avoid getting lost.",
      "Get along in the wild and feed others (DC 10, +1 person per 2 over). Fort save bonus against weather (DC 15). Keep from getting lost (DC 15). Predict the weather (DC 15 for a day). Follow tracks (moving at half speed): DC 5 very soft ground, 10 soft, 15 firm, 20 hard; +1 per day since the trail was made, +1 per hour of rain, −1 for every three creatures in the group. Track adds half her level. Forest and favored enemy bonuses apply."],
    ["Swim", "Skill (Str, armor check penalty, double for weight)", "Swim through water.",
      "Swim a quarter of her speed as a move action (half speed as a full-round action). DC 10 calm water, 15 rough, 20 stormy. Fail by 4 or less: no progress; by 5 or more: she goes under and must hold her breath. Each hour of swimming: DC 20 Swim or 1d6 nonlethal damage from fatigue."],
    ["Use Magic Device", "Skill (Cha, trained only)", "Use wands, scrolls and items not made for her.",
      "Activate blindly (DC 25), decipher a written spell (DC 25 + spell level), emulate an ability score (DC 15), emulate a class feature (DC 20), emulate an alignment (DC 30), emulate a race (DC 25), use a scroll (DC 20 + caster level), use a wand (DC 20). A natural 1 on activating means she can't try that item again for 24 hours."]
  ]);

  add("trick:", [
    ["Attack", "Trick (counts as 2 when it covers any creature)", "Attack a target she points out.",
      "He attacks apparently hostile creatures she points to. Normally only humanoids, monstrous humanoids, giants and animals; taught twice (as Gwathfaron was) it covers any creature, including undead and aberrations."],
    ["Come", "Trick", "Come to her.", "He comes to her, even if he normally would not do so."],
    ["Down", "Trick", "Break off combat.", "He breaks off from combat or otherwise backs down. An animal that doesn't know this trick keeps fighting until it must flee or its opponent is defeated."],
    ["Guard", "Trick", "Stay and prevent others from approaching.", "He stays in place and prevents others from approaching."],
    ["Heel", "Trick", "Follow closely.", "He follows her closely, even to places where he normally wouldn't go."],
    ["Seek", "Trick", "Move into an area and look around.", "He moves into an area and looks around for anything obviously alive or animate."],
    ["Stay", "Trick", "Stay in place.", "He stays in place, waiting for her to return. He does not challenge other creatures that come by, though he still defends himself if he needs to."],
    ["Track", "Trick", "Track the scent presented.", "He tracks the scent she presents to him (he has the scent ability)."]
  ]);

  add("pet:", [
    ["Link", "Companion ability", "She handles him as a free action and pushes as a move action, +4.", "She can handle him as a free action, or push him as a move action, even with no ranks in Handle Animal. She gets +4 on wild empathy and Handle Animal checks with him."],
    ["Share spells", "Companion ability", "Her \"you\" spells can target him instead, as touch spells.", "She may cast a spell with a target of \"you\" on him (as a touch spell) instead of on herself. She may also cast spells on him even if they normally don't affect animals. Only spells that affect creatures of his type."],
    ["Evasion", "Companion ability (Ex)", "No damage on a successful Reflex save for half.", "If he makes a successful Reflex save against an attack that normally deals half damage on a successful save, he takes no damage instead."],
    ["Improved evasion", "Companion ability (Ex)", "Half damage even on a failed Reflex save.", "As evasion, and he takes only half damage even when he fails the Reflex save."],
    ["Devotion", "Companion ability (Ex)", "+4 morale on Will saves against enchantment.", "He gains a +4 morale bonus on Will saves against enchantment spells and effects."],
    ["Multiattack", "Companion ability", "Claws at −2 instead of −5.", "He gains Multiattack as a bonus feat (or, if he has 3+ natural attacks and already had it, a second attack with his primary natural weapon at −5). His secondary natural attacks take −2 instead of −5."],
    ["Scent", "Special quality (Ex)", "Notice and pinpoint creatures by smell.", "He detects opponents within 30 ft by smell (60 ft upwind, 15 ft downwind; strong scents at double, overpowering at triple). He notes the direction but not the exact location unless the source is within 5 ft. He can follow tracks by smell (Survival DC 10, harder as the trail ages)."],
    ["Low-light vision", "Special quality (Ex)", "Sees twice as far as a human in dim light.", "He sees twice as far as a human in starlight, moonlight, torchlight and similar dim light."],
    ["Sprint", "Special ability (Ex)", "Once an hour, a charge at ten times his speed.", "Once per hour, he can move at ten times his normal speed when he makes a charge (500 ft)."],
    ["Trip", "Special attack (Ex)", "Free trip attempt when his bite hits.", "When he hits with his bite, he can attempt to trip the target as a free action without provoking an attack of opportunity (CMB as shown on his sheet). If it fails, he isn't tripped in return. A prone foe takes −4 AC against melee attacks."],
    ["Shared bonuses", "Companion-Bound", "Her favored enemy and forest bonuses apply to him too.", "Through Companion-Bound he shares her favored enemy bonuses (attack, damage and skills against them) and her favored terrain bonus (forest: initiative, Perception, Stealth, Survival). The toggles under Conditions apply them to both sheets."]
  ]);

  root.RulesInfo = I;
})(typeof window !== "undefined" ? window : this);
