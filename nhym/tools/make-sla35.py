#!/usr/bin/env python3
"""Build nhym/data/sla35.json: the SRD 3.5 text of Nhym's racial spell-like abilities (silence, ghost sound, mage hand,
message), from www.d20srd.org (Open Game License), with the same fields as courynna/data/spells35.json.

    python3 -I nhym/tools/make-sla35.py

Reuses the page parser in courynna/tools/make-spells35.py and its page cache."""
import importlib.util
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
spec = importlib.util.spec_from_file_location("m35", os.path.join(ROOT, "courynna", "tools", "make-spells35.py"))
m35 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m35)

SPELLS = [("Silence", "/srd/spells/silence.htm"), ("Ghost Sound", "/srd/spells/ghostSound.htm"),
          ("Mage Hand", "/srd/spells/mageHand.htm"), ("Message", "/srd/spells/message.htm")]


def main():
    out = []
    for name, path in SPELLS:
        sp = m35.parse_spell(m35.fetch(path), name)
        st = sp["stat"]
        area = [(k, v) for k, v in st.items() if k.split(" ")[0].rstrip(",") in ("Target", "Targets", "Area", "Effect")]
        lv = st.get("Level", "")
        out.append({"n": name, "s": sp["school"], "lv": lv, "c": st.get("Components", ""), "ct": st.get("Casting Time", ""),
                    "r": st.get("Range", ""), "a": "; ".join(k + ": " + v for k, v in area), "d": st.get("Duration", ""),
                    "sv": st.get("Saving Throw", ""), "sr": st.get("Spell Resistance", ""), "t": sp["text"], "u": m35.BASE + path})
    fn = os.path.join(os.path.dirname(HERE), "data", "sla35.json")
    with open(fn, "w", encoding="utf-8") as f:
        json.dump({"source": "System Reference Document 3.5 (www.d20srd.org), Open Game License v1.0a", "spells": out}, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote", fn, [(s["n"], s["lv"]) for s in out])


if __name__ == "__main__":
    main()
