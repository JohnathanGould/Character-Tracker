"""Build the spell data from The Spell Codex spreadsheet.

    python3 -I tools/make-codex.py <The_Spell_Codex.xlsx>

Writes:
  data/codex.json       every spell (all classes): the full text the app loads on demand
  data/spell-bank.json  the wizard list, levels 1 to 9, with school, duration and flags filled in
and rewrites the inline BANK array in index.html from the new spell bank.
"""
import json
import os
import re
import sys

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = "The Spell Codex"
CLASSES = ["Arcanist", "Wizard", "Sorcerer", "Witch", "Magus", "Bard", "Skald", "Summoner", "UnSummoner", "Bloodrager",
           "Shaman", "Druid", "Hunter", "Ranger", "Cleric", "Oracle", "Warpriest", "Inquisitor", "Antipaladin", "Paladin",
           "Alchemist", "Investigator", "Psychic", "Mesmerist", "Occultist", "Spiritualist", "Medium"]
SCHOOL = {"abjuration": "A", "conjuration": "C", "divination": "D", "enchantment": "E", "evocation": "V",
          "illusion": "I", "necromancy": "N", "transmutation": "T", "universal": "U"}
FAST_CAST = ("standard action", "swift action", "immediate action", "move action", "free action")


def txt(v):
    if v is None or v == "—":
        return ""
    if isinstance(v, float):
        v = int(v) if v == int(v) else v
    return re.sub(r"[ \t]+", " ", str(v)).strip()


def num(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def dur_code(d):
    """The app's duration codes (see bankDur in index.html)."""
    d = d.lower()
    if not d or d.startswith("see text"):
        return "?"
    if d.startswith("concentration"):
        return "o"
    if d.startswith(("instantaneous", "permanent")):
        return "n"
    m = re.match(r"(rounds|minutes|hours|days)(/level)? \((\d+)\)", d)
    if not m:
        return "?"
    per = {"rounds": 1, "minutes": 10, "hours": 600, "days": 14400}[m.group(1)] * int(m.group(3))
    if not m.group(2):
        return "f%d" % per
    return {1: "r", 10: "m", 100: "t", 600: "h"}.get(per, "p%d" % per)


def first_sentence(s, cap=150):
    s = re.sub(r"\s+", " ", s).strip()
    m = re.match(r"(.+?[.!?])(\s|$)", s)
    out = m.group(1) if m else s
    return out if len(out) <= cap else out[:cap - 1].rstrip() + "…"


def main(path):
    wb = openpyxl.load_workbook(path)
    ws = wb[SHEET]
    rows = ws.iter_rows()
    head = [txt(c.value).replace("\n", " ") for c in next(rows)]
    ix = {h: i for i, h in enumerate(head)}
    tags = [h for h in head if h.startswith("[") and h.endswith("]")]
    codex = []
    for row in rows:
        name = txt(row[0].value)
        if not name:
            continue
        g = lambda k: txt(row[ix[k]].value)
        comps = [k for k, col in (("V", "Verbal"), ("S", "Somatic"), ("M", "Material"), ("F", "Focus"), ("DF", "Divine Focus")) if g(col)]
        if g("Component Costs"):
            comps.append(g("Component Costs") + " gp")
        lv = {c: num(row[ix[c]].value) for c in CLASSES if num(row[ix[c]].value) is not None}
        e = {
            "n": name,
            "s": g("School"), "ss": g("Subschool"),
            "ds": [t[1:-1] for t in tags if g(t)],
            "lv": lv,
            "ct": g("Casting Time"), "c": ", ".join(comps),
            "rg": g("Range"), "ar": g("Area"), "ef": g("Effect"), "tg": g("Targets"),
            "du": g("Duration"), "dm": bool(g("Dismissible")),
            "sv": g("Saving Throw"), "sr": g("Spell Resistance"),
            "src": g("Sourcebook"),
            "d": (row[ix["Description"]].value or "").strip(),
            "m": txt(row[ix["Mythic Text"]].value),
        }
        link = row[0].hyperlink.target if row[0].hyperlink else ""
        if link and link != "https://aonprd.com/SpellDisplay.aspx?ItemName=" + name.replace(" ", "%20"):
            e["u"] = link
        codex.append({k: v for k, v in e.items() if v not in ("", [], {}, False)})
    codex.sort(key=lambda e: e["n"].lower())

    old = {}
    try:
        for s in json.load(open(os.path.join(ROOT, "data/spell-bank.json")))["spells"]:
            old[s["name"].lower()] = s.get("summary", "")
    except (OSError, ValueError, KeyError):
        pass
    bank = []
    for e in codex:
        lvl = e.get("lv", {}).get("Wizard")
        if not lvl or lvl < 1:
            continue
        ct = e.get("ct", "").lower()
        flags = ("F" if "Fire" in e.get("ds", []) else "") + ("" if ct.startswith(FAST_CAST) else "L")
        bank.append({"name": e["n"], "level": lvl, "school": SCHOOL.get(e.get("s", "").lower(), "?"),
                     "duration": dur_code(e.get("du", "")), "flags": flags,
                     "summary": old.get(e["n"].lower()) or first_sentence(e.get("d", ""))})
    bank.sort(key=lambda b: (b["level"], b["name"].lower()))

    with open(os.path.join(ROOT, "data/codex.json"), "w") as f:
        json.dump(codex, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(ROOT, "data/spell-bank.json"), "w") as f:
        json.dump({"source": "The Spell Codex (community spreadsheet built from the Spell DB and Archives of Nethys), wizard list, levels 1-9. "
                             "schools: A Abjuration, C Conjuration, D Divination, E Enchantment, V Evocation, I Illusion, N Necromancy, T Transmutation, U Universal. "
                             "duration: n instant/permanent, o concentration or open-ended, r round/lvl, m min/lvl, t 10 min/lvl, h hour/lvl, pN rounds per level, fN fixed rounds, ? see text. "
                             "flags: F fire descriptor, L casting time over 1 standard action.",
                   "spells": bank}, f, ensure_ascii=False, indent=1)

    clean = lambda s: s.replace("|", "/").replace("\n", " ")
    lines = ["%s|%d|%s|%s|%s|%s" % (clean(b["name"]), b["level"], b["school"], b["duration"], b["flags"], clean(b["summary"])) for b in bank]
    html = open(os.path.join(ROOT, "index.html")).read()
    new, n = re.subn(r"  var BANK = \[.*?\]\.map\(", lambda m: "  var BANK = " + json.dumps(lines, ensure_ascii=False) + ".map(", html, count=1, flags=re.S)
    if n != 1:
        sys.exit("BANK array not found in index.html")
    open(os.path.join(ROOT, "index.html"), "w").write(new)
    print("codex: %d spells, bank: %d wizard spells" % (len(codex), len(bank)), file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1])
