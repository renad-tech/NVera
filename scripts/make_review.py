"""Builds eval/review.html from eval/results.json: for each request, the two picks side by side in
random order (A/B), so the person marking them can't tell which one NVera chose.

    .venv/Scripts/python scripts/make_review.py
"""

import html
import json
import random
from pathlib import Path

EVAL = Path(__file__).resolve().parents[1] / "eval"


def card(side: str, pick: dict) -> str:
    img = (f'<img src="{html.escape(pick["thumbnail"])}" alt="">' if pick.get("thumbnail")
           else '<div class="noimg">no preview</div>')
    link = f'<a href="{html.escape(pick["url"])}" target="_blank" rel="noreferrer">open</a>' if pick.get("url") else ""
    return f'<div class="pick"><b>{side}</b>{img}<span>{html.escape(pick["name"])}</span>{link}</div>'


def main() -> None:
    results = [r for r in json.loads((EVAL / "results.json").read_text(encoding="utf-8")) if "error" not in r]
    rng = random.Random(7)
    rows, key = [], {}
    for i, r in enumerate(results):
        same = r["title"]["id"] == r["nvera"]["id"]
        order = ["title", "nvera"]
        rng.shuffle(order)
        key[i] = {"A": order[0], "B": order[1], "same": same}
        picks = card("A", r[order[0]]) + ("" if same else card("B", r[order[1]]))
        note = '<p class="same">Both methods picked the same model.</p>' if same else ""
        buttons = ("".join(f'<button data-v="{v}">{label}</button>' for v, label in
                           [("A", "A is right"), ("none", "Wrong")]) if same else
                   "".join(f'<button data-v="{v}">{label}</button>' for v, label in
                           [("A", "Only A"), ("B", "Only B"), ("both", "Both"), ("none", "Neither")]))
        rows.append(f'<section data-i="{i}"><h2>{i + 1}. {html.escape(r["prompt"])}</h2>{note}'
                    f'<div class="picks">{picks}</div><div class="btns">{buttons}</div></section>')

    page = (Path(__file__).with_name("review_template.html").read_text(encoding="utf-8")
            .replace("{{ROWS}}", "\n".join(rows))
            .replace("{{KEY}}", json.dumps(key)))
    (EVAL / "review.html").write_text(page, encoding="utf-8")
    print(EVAL / "review.html")


if __name__ == "__main__":
    main()
