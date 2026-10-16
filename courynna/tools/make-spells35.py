#!/usr/bin/env python3
"""Build courynna/data/spells35.json: every D&D 3.5 sorcerer/wizard spell from the System Reference Document
(www.d20srd.org, Open Game License), with level, school, summary, stat block and full text.

    python3 -I courynna/tools/make-spells35.py [cache dir]

Pages are saved in the cache dir (default: a "d20srd-cache" folder next to this script, not committed), so a
second run reads them from disk instead of the site. The tracker loads the JSON on demand for the Arcane
Dilettante picker and the spell text dialog."""
import html
import json
import os
import re
import ssl
import sys
import time
import urllib.request
from html.parser import HTMLParser

BASE = "https://www.d20srd.org"
LIST = "/srd/spellLists/sorcererWizardSpells.htm"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "data", "spells35.json")
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "d20srd-cache")
LEVEL_IDS = ["zero", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"]


def ctx():
    ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    if not ca and os.path.exists("/root/.ccr/ca-bundle.crt"):
        ca = "/root/.ccr/ca-bundle.crt"
    return ssl.create_default_context(cafile=ca) if ca else ssl.create_default_context()


SSL = ctx()


def fetch(path):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9._-]+", "_", path.strip("/")))
    if os.path.exists(fn):
        return open(fn, encoding="utf-8").read()
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "character-tracker spell list builder"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, context=SSL, timeout=40) as r:
                body = r.read().decode("utf-8", "replace")
            break
        except Exception as e:  # network hiccup: back off and retry
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))
    open(fn, "w", encoding="utf-8").write(body)
    time.sleep(0.4)  # be gentle with the site
    return body


class Text(HTMLParser):
    """HTML fragment to plain text: paragraphs split by blank lines, list items as "- ", table rows as cells joined
    by " | ", headings on their own line."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.cell = [], []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        elif tag in ("p", "h1", "h2", "h3", "h4", "h5", "h6", "table", "ul", "ol"):
            self.out.append("\n\n")
        elif tag == "li":
            self.out.append("\n- ")
        elif tag == "tr":
            self.out.append("\n")
            self.cell = []
        elif tag in ("td", "th"):
            self.out.append(" | " if self.cell else "")
            self.cell.append(1)
        elif tag == "br":
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip -= 1
        elif tag in ("p", "table", "ul", "ol") or re.match(r"h\d", tag):
            self.out.append("\n\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(re.sub(r"\s+", " ", data))

    def text(self):
        t = "".join(self.out)
        t = re.sub(r"[ \t]+\n", "\n", t)
        t = re.sub(r"\n[ \t]+", "\n", t)
        t = re.sub(r"\n{3,}", "\n\n", t)
        return t.strip()


def to_text(fragment):
    p = Text()
    p.feed(fragment)
    return p.text()


def parse_list(page):
    """[(name, path, level, summary, flags)] in the list's order; flags are the list's superscript markers:
    M costly material component, F costly focus, X XP cost"""
    out = []
    parts = re.split(r'<h3 id="(\w+?)LevelSorcererWizardSpells">', page)
    for i in range(1, len(parts), 2):
        lvl = LEVEL_IDS.index(parts[i])
        body = parts[i + 1].split("<h3", 1)[0]
        for m in re.finditer(r"<li><strong>(.*?)</strong>(.*?)</li>", body, re.S):
            head, summ = m.groups()
            sup = re.search(r"<sup>(.*?)</sup>", head, re.S)
            flags = to_text(sup.group(1)).replace(" ", "") if sup else ""
            links = re.findall(r'<a class="spell" href="([^"]+)">(.*?)</a>', head, re.S)
            if not links:
                continue
            first = to_text(links[0][1]).strip()
            for k, (href, name) in enumerate(links):
                name = to_text(name).rstrip(":").strip()
                if k and " " not in name:  # "Protection from Chaos/Evil": the later links give only the last word
                    name = first.rsplit(" ", 1)[0] + " " + name
                out.append((name, href.split("#")[0], lvl, to_text(summ).lstrip(": ").strip(), flags))
    return out


def parse_spell(page, name):
    """the stat block and text of one spell; a page may hold several (e.g. Summon Monster I-IX), so find this one's
    <h1>/<h2> heading when there is more than one"""
    heads = [m for m in re.finditer(r"<h([12])[^>]*>(.*?)</h\1>", page, re.S)]
    start = 0
    for m in heads:
        if to_text(m.group(2)).lower() == name.lower():
            start = m.start()
            break
    seg = page[start:]
    end = seg.find('<div class="footer">')
    seg = seg[: end if end > 0 else None]
    nxt = [m.start() for m in re.finditer(r"<h[12][^>]*>", seg)][1:2]  # stop at the next spell on a shared page
    if nxt:
        seg = seg[: nxt[0]]
    tb0 = seg.find('class="statBlock"')
    school = re.search(r"<h4>(.*?)</h4>", seg[: tb0 if tb0 > 0 else None], re.S)
    stat = {}
    tb = re.search(r'<table class="statBlock".*?</table>', seg, re.S)
    if tb:
        for th, td in re.findall(r"<th>(.*?)</th>\s*<td>(.*?)</td>", tb.group(0), re.S):
            stat[to_text(th).rstrip(":")] = to_text(td)
        body = seg[tb.end():]
    else:
        body = seg
    base = None
    fm = re.search(r"(?:functions|works) (?:like|similarly to|as)\b(.{0,160})", body, re.S | re.I)
    if fm:
        bl = re.search(r'<a class="spell" href="([^"#]+)', fm.group(1))
        base = bl.group(1) if bl else None
    return {"school": to_text(school.group(1)) if school else "", "stat": stat, "text": to_text(body), "base": base}


STAT_KEYS = ["s", "c", "ct", "r", "a", "d", "sv", "sr"]


def inherit(spells):
    """A spell written as "functions like X, except..." gives only the lines that change; take the rest from X
    (marked "b" with the base spell's name), as the SRD intends. X may be off the sorcerer/wizard list (then its page
    is read too) and may itself build on another spell."""
    by_path = {sp["_path"]: sp for sp in spells}
    def base(sp):
        p = sp.get("_base")
        if not p or p == sp["_path"]:
            return None
        if p not in by_path:
            pg = parse_spell(fetch(p), "")
            st = pg["stat"]
            area = [(k, v) for k, v in st.items() if k.split(" ")[0] in ("Target", "Targets", "Area", "Effect")]
            name = re.search(r"<h1>(.*?)</h1>", fetch(p), re.S)
            by_path[p] = {"n": to_text(name.group(1)) if name else p, "s": pg["school"], "c": st.get("Components", ""),
                          "ct": st.get("Casting Time", ""), "r": st.get("Range", ""), "a": "; ".join(k + ": " + v for k, v in area),
                          "d": st.get("Duration", ""), "sv": st.get("Saving Throw", ""), "sr": st.get("Spell Resistance", ""),
                          "_base": pg["base"], "_path": p}
        return by_path[p]
    for _ in range(3):  # chains such as greater -> normal -> lesser
        for sp in spells:
            b = base(sp)
            if not b:
                continue
            for k in STAT_KEYS:
                if not sp[k] and b[k]:
                    sp[k] = b[k]
            sp["b"] = b["n"]
    for sp in spells:
        sp.pop("_base", None)
        sp.pop("_path", None)


def main():
    entries = parse_list(fetch(LIST))
    print(len(entries), "sorcerer/wizard spells on the list")
    spells = []
    for i, (name, path, lvl, summ, flags) in enumerate(entries):
        sp = parse_spell(fetch(path), name)
        st = sp["stat"]
        area = [(k, v) for k, v in st.items() if k.split(" ")[0].rstrip(",") in ("Target", "Targets", "Area", "Effect")]
        spells.append({
            "n": name, "l": lvl, "s": sp["school"], "sum": summ,
            "lv": st.get("Level", ""), "c": st.get("Components", ""), "ct": st.get("Casting Time", ""),
            "r": st.get("Range", ""), "a": "; ".join(k + ": " + v for k, v in area),
            "d": st.get("Duration", ""), "sv": st.get("Saving Throw", ""), "sr": st.get("Spell Resistance", ""),
            "t": sp["text"], "u": BASE + path, "f": flags, "_base": sp["base"], "_path": path,
        })
        if (i + 1) % 50 == 0:
            print(i + 1, "done")
    inherit(spells)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"source": "System Reference Document 3.5 (www.d20srd.org), Open Game License v1.0a", "spells": spells}, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote", OUT, len(spells), "spells")


if __name__ == "__main__":
    main()
