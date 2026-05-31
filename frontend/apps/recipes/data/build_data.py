#!/usr/bin/env python3
"""Build the baked recipe snapshot from the family "Recipes to try" Google Sheet.

The app ships a *snapshot* of the sheet (see CLAUDE.md — "baked snapshot"), so
there are no extra Google scopes to grant and nothing to fetch at runtime. This
script turns a plain-text export of the sheet into the JSON the app bundles.

Refreshing the data
-------------------
1. Re-export the "Recipes to try" sheet to ``data/source.md`` (a markdown-table
   dump of every tab, one table per tab — the format produced by the Drive
   reader, or by copy-pasting each tab). Tables are separated by blank lines;
   the first row of each table is its header.
2. Run::

       python frontend/apps/recipes/data/build_data.py

   It rewrites ``frontend/apps/recipes/src/data/recipes.json``.
3. Rebuild the frontend (``npm --prefix frontend run build:recipes``).

The sheet's tabs, as of this writing:
  * three running "to try" lists (name / link / notes)  -> flat ``recipes``
  * a couple of tiny extra lists                        -> flat ``recipes``
  * a "meal nights" tab (theme + 3 photo recipes each)  -> ``mealNights``
  * a sides gallery (name / image / link)               -> ``sides``
"""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "source.md"
OUT = HERE.parent / "src" / "data" / "recipes.json"

# Light keyword tagging so the browse screen can offer filter chips. Order
# matters only for readability; a recipe can match several tags.
TAG_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("Breakfast", ("pancake", "waffle", "oatmeal", "egg", "breakfast", "french toast",
                   "granola", "smoothie", "muffin", "scramble", "frittata", "toast")),
    ("Seafood", ("salmon", "shrimp", "tuna", "fish", "cod", "tilapia", "scallop",
                 "halibut", "crab", "trout", "mahi", "snapper", "seafood")),
    ("Chicken", ("chicken", "turkey")),
    ("Soup", ("soup", "stew", "chili", "pho", "chowder", "bisque")),
    ("Salad", ("salad", "slaw")),
    ("Pasta", ("pasta", "noodle", "spaghetti", "mac and cheese", "gnocchi", "lasagna")),
    ("Pizza", ("pizza", "flatbread", "focaccia")),
    ("Taco/Mexican", ("taco", "enchilada", "burrito", "quesadilla", "fajita",
                      "tostada", "nacho")),
    ("Vegetarian", ("vegan", "vegetarian", "tofu", "tempeh", "chickpea", "lentil",
                    "veggie burger", "bean")),
    ("Dessert", ("cake", "cookie", "pie", "brownie", "dessert", "ice cream",
                 "pudding", "tart", "cheesecake", "bar")),
]


def unescape(s: str) -> str:
    """Drop the backslash-escapes a markdown export adds before punctuation."""
    s = re.sub(r"\\([^A-Za-z0-9\s])", r"\1", s)
    return s.strip()


def cells(line: str) -> list[str]:
    return [unescape(c) for c in line.strip().strip("|").split("|")]


def is_separator(line: str) -> bool:
    s = line.strip()
    return bool(s) and set(s) <= set("|:- ")


def parse_tables(text: str) -> list[list[list[str]]]:
    """Split the export into tables of cell-rows, separated by blank lines."""
    tables: list[list[list[str]]] = []
    current: list[list[str]] = []
    for raw in text.splitlines():
        if not raw.strip():
            if current:
                tables.append(current)
                current = []
            continue
        if is_separator(raw):
            continue
        current.append(cells(raw))
    if current:
        tables.append(current)
    return tables


def tags_for(title: str) -> list[str]:
    low = title.lower()
    return [tag for tag, words in TAG_RULES if any(w in low for w in words)]


def looks_like(header: list[str], *needles: str) -> bool:
    joined = " | ".join(header).lower()
    return all(n in joined for n in needles)


def main() -> None:
    text = SOURCE.read_text()
    tables = parse_tables(text)

    flat: dict[str, dict] = {}  # keyed by lowercased title to de-dupe
    meal_nights: list[dict] = []
    sides: list[dict] = []

    def add_flat(title: str, url: str, notes: str) -> None:
        title, url, notes = title.strip(), url.strip(), notes.strip()
        if not title:
            return
        # A few rows tuck an inline recipe into the "link" column instead of a
        # URL — fold that into the notes and leave the link empty (untappable).
        if url and not url.lower().startswith("http"):
            notes = f"{url} — {notes}".strip(" —") if notes else url
            url = ""
        key = title.lower()
        if key in flat:
            # keep first link, but fill in details if we didn't have any
            if url and not flat[key]["url"]:
                flat[key]["url"] = url
            if notes and not flat[key]["notes"]:
                flat[key]["notes"] = notes
            return
        flat[key] = {"title": title, "url": url, "notes": notes,
                     "tags": tags_for(title)}

    for table in tables:
        header = table[0]
        rows = table[1:]

        if looks_like(header, "recipe 1 title", "recipe 1 url"):
            # Meal-nights tab: Title, Description, then (Title, Image, Url) x3
            for r in rows:
                r = (r + [""] * 11)[:11]
                title, desc = r[0], r[1]
                if not title:
                    continue
                recipes = []
                for base in (2, 5, 8):
                    rt, ri, ru = r[base], r[base + 1], r[base + 2]
                    if rt and ru:
                        recipes.append({"title": rt, "image": ri, "url": ru})
                if recipes:
                    meal_nights.append({"title": title, "description": desc,
                                        "recipes": recipes})
            continue

        # The sides gallery lost its header row in export (3 cols: name/img/url
        # where col 2 is an image URL and col 3 a recipe URL). Detect by shape.
        looks_side = len(header) == 3 and header[1].startswith("http") and header[2].startswith("http")
        if looks_side:
            for r in [header] + rows:  # the "header" is really the first side
                r = (r + ["", "", ""])[:3]
                name, img, url = r
                if name and url:
                    sides.append({"title": name, "image": img, "url": url})
            continue

        # Otherwise a flat list: <name> | <link> | <notes>
        for r in rows:
            r = (r + ["", "", ""])[:3]
            add_flat(r[0], r[1], r[2])

    recipes = sorted(flat.values(), key=lambda x: x["title"].lower())
    data = {
        "generatedAt": dt.date.today().isoformat(),
        "source": "Google Sheet: “Recipes to try” (family favorites)",
        "mealNights": meal_nights,
        "sides": sides,
        "recipes": recipes,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT.relative_to(HERE.parent.parent)}:")
    print(f"  {len(meal_nights)} meal nights, {len(sides)} sides, "
          f"{len(recipes)} recipes")


if __name__ == "__main__":
    main()
