"""The "look" NVera applies on top of a found model (the viewer renders it, the GLB export keeps it).

Shape comes from the search; material, colors, ground, sky and light come from here -
so "a city made of cardboard" = find a city + apply the cardboard material.
"""

import re

MATERIALS = ["original", "cardboard", "paper", "clay", "wood", "metal", "toon", "neon", "hologram", "lowpoly"]
GROUNDS = ["none", "sand", "grass", "water", "snow", "asphalt", "paper", "cardboard"]
LIGHTING = ["day", "sunset", "night"]
VIEWS = ["interior", "exterior"]

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

DEFAULT = {
    "material": "original",
    "palette": [],
    "ground": "none",
    "sky": "#0b0f0c",
    "lighting": "day",
    "fog": False,
    "bloom": False,
    "view": "exterior",
}


def _pick(value, allowed: list[str], default: str) -> str:
    v = str(value or "").strip().lower()
    return v if v in allowed else default


def normalize(raw: dict | None, *, monochrome: bool = False) -> dict:
    """Coerce anything an AI returned into a valid restyle the viewer can trust."""
    raw = raw or {}
    palette = [c for c in (raw.get("palette") or []) if isinstance(c, str) and HEX.match(c)][:4]
    out = {
        "material": _pick(raw.get("material"), MATERIALS, DEFAULT["material"]),
        "palette": palette,
        "ground": _pick(raw.get("ground"), GROUNDS, DEFAULT["ground"]),
        "sky": raw.get("sky") if isinstance(raw.get("sky"), str) and HEX.match(raw["sky"]) else DEFAULT["sky"],
        "lighting": _pick(raw.get("lighting"), LIGHTING, DEFAULT["lighting"]),
        "fog": bool(raw.get("fog", False)),
        "bloom": bool(raw.get("bloom", False)),
        "view": _pick(raw.get("view"), VIEWS, DEFAULT["view"]),
    }
    if out["material"] in ("neon", "hologram"):
        out["bloom"] = True
    if monochrome:  # the user's "Monochrome" setting always wins
        if out["material"] in ("original", "neon", "hologram"):
            out["material"] = "clay"
        out["palette"] = ["#d9d9d9", "#bdbdbd", "#9e9e9e"]
    return out


def mock_edit(restyle: dict, instruction: str) -> tuple[dict, str]:
    """Free keyword-based edit used in mock mode (no AI call)."""
    text = instruction.lower()
    new = dict(restyle)
    changed = []
    for m in MATERIALS:
        if m in text or (m == "cardboard" and "كرتون" in text) or (m == "paper" and "ورق" in text):
            new["material"] = m
            changed.append(f"material -> {m}")
            break
    for g in GROUNDS[1:]:
        if f"{g} ground" in text or f"on {g}" in text:
            new["ground"] = g
            changed.append(f"ground -> {g}")
            break
    for word, light in [("night", "night"), ("ليل", "night"), ("sunset", "sunset"), ("غروب", "sunset"), ("day", "day"), ("نهار", "day")]:
        if word in text:
            new["lighting"] = light
            changed.append(f"lighting -> {light}")
            break
    if "fog" in text or "ضباب" in text:
        new["fog"] = True
        changed.append("fog on")
    new = normalize(new)
    return new, ("Mock edit: " + ", ".join(changed)) if changed else "Mock edit: no keywords recognized"
