"""Scene Mode: one sentence -> a small 3D scene built from several free models.

    Nemotron 3 Ultra (plan: objects, real sizes, positions, one shared look)
    -> for each object, in the browser's own pace:
       free libraries (no Tavily) -> Nemotron 3.5 Super VL (vision judge) -> download

The browser places the models, applies the shared look and exports one GLB plus a credits file.
A plan costs about $0.003 and each object about $0.0015 (no Tavily credits).
"""

import logging

from backend import config, restyle
from backend.agents import downloader, env_finder, vision_judge
from backend.settings import SearchSettings
from backend.utils.llm import Usage, ask_json
from backend.utils.prompts import load

log = logging.getLogger("nvera")

MAX_ITEMS = 6
MAX_PLACEMENTS = 12
MIN_SCORE = 5
MAX_ITEM_BYTES = 25_000_000  # scenes load several models at once; skip the heavy ones

SOURCE_LABELS = {
    "sketchfab": "Sketchfab", "polyhaven": "Poly Haven", "smithsonian": "Smithsonian 3D",
    "polypizza": "Poly Pizza", "threejs": "three.js examples", "web": "Web",
}


def _num(value, default: float, lo: float, hi: float) -> float:
    try:
        return min(max(float(value), lo), hi)
    except (TypeError, ValueError):
        return default


def normalize_plan(raw: dict, prompt: str) -> dict:
    """Clamp everything the model returned, so the browser can trust the plan."""
    area = _num(raw.get("area_m"), 12, 6, 40)
    half = area / 2
    items, placements_left = [], MAX_PLACEMENTS
    for it in (raw.get("items") or [])[:MAX_ITEMS]:
        if not isinstance(it, dict):
            continue
        name = str(it.get("name") or it.get("query") or "").strip()[:60]
        query = str(it.get("query") or name).strip()[:60]
        if not name or not query:
            continue
        size = _num(it.get("size_m"), 1.5, 0.1, area * 0.9)
        room = max(half - size / 2, 0)
        spots = []
        for p in (it.get("placements") or [{"x": 0, "z": 0, "rot": 0}])[:placements_left]:
            if isinstance(p, dict):
                spots.append({"x": _num(p.get("x"), 0, -room, room), "z": _num(p.get("z"), 0, -room, room),
                              "rot": _num(p.get("rot"), 0, -360, 360)})
        if not spots:
            continue
        placements_left -= len(spots)
        items.append({"name": name, "query": query, "size_m": round(size, 2), "placements": spots})
        if placements_left <= 0:
            break
    look = restyle.normalize(raw.get("restyle"))
    look["view"] = "exterior"
    return {"title": str(raw.get("title") or prompt)[:80], "area_m": area, "restyle": look, "items": items}


def plan(prompt: str, usage: Usage) -> dict:
    raw = ask_json(config.NEMOTRON_MODEL, load("scene_planner"), f"Scene request: {prompt}", usage)
    result = normalize_plan(raw, prompt)
    if not result["items"]:
        raise ValueError("The planner didn't return any objects - try describing the scene differently.")
    return result


def _item_payload(name: str, model: dict, path) -> dict:
    return {
        "name": name,
        "model": {k: model.get(k) for k in ("id", "name", "author", "author_url", "license", "url")}
        | {"source_label": SOURCE_LABELS.get(model["source"], model["source"]),
           "size_mb": round(path.stat().st_size / 1e6, 1)},
        "glb_path": f"/models/{model['file']}",
        "score": (model.get("judge") or {}).get("score"),
        "reason": (model.get("judge") or {}).get("reason", ""),
    }


def find_item(name: str, query: str, usage: Usage, exclude: frozenset[str] = frozenset()) -> dict:
    """Best downloadable model for one object of a scene. Raises ValueError when nothing fits."""
    scene = {"search_query": query, "alt_queries": [name] if name.lower() != query.lower() else [], "subject": name}
    candidates = [
        c for c in env_finder.find(scene, usage, lambda _msg: None, exclude=exclude, use_tavily=False)
        if (c["source"] != "sketchfab" or env_finder.mark_editable(c)["editable"])
        and (c.get("size") or 0) <= MAX_ITEM_BYTES
    ]
    if not candidates:
        raise ValueError(f"No free downloadable model found for '{name}'.")

    try:
        ranked = vision_judge.rank(
            f"a single {name}, to place in a 3D scene", SearchSettings(space_size="small"), [name],
            "NVera repaints all objects of the scene with one shared look afterwards - judge the shape only.",
            candidates, usage,
        )
    except Exception:
        log.warning("scene item judge failed for %r - using library order", name, exc_info=True)
        ranked = candidates
    good = [c for c in ranked if (c.get("judge") or {}).get("score", MIN_SCORE) >= MIN_SCORE] or ranked[:1]

    last_error = ""
    for pick in good[:3]:
        try:
            path = downloader.download(pick)
        except Exception as e:
            last_error = str(e)
            log.warning("scene item download failed for %s", pick["id"], exc_info=True)
            continue
        return _item_payload(name, pick, path)
    raise ValueError(f"Found models for '{name}', but none could be downloaded ({last_error}).")


# Mock mode: no API calls, for UI work

MOCK_PLAN = {
    "title": "Cozy café (mock)",
    "area_m": 10,
    "restyle": {"material": "original", "palette": [], "ground": "grass", "sky": "#ffd2a1",
                "lighting": "sunset", "fog": False, "bloom": False, "view": "exterior"},
    "items": [
        {"name": "small building", "query": "small building", "size_m": 4,
         "placements": [{"x": 0, "z": -2, "rot": 0}]},
        {"name": "tree", "query": "tree", "size_m": 3,
         "placements": [{"x": -3.2, "z": 2.5, "rot": 0}, {"x": 3.2, "z": 2.5, "rot": 90}]},
    ],
}


def mock_item(name: str) -> dict:
    from backend.pipeline import MOCK_MODEL  # the sample model that mock mode always returns
    path = downloader.glb_path(MOCK_MODEL["file"])
    if not path.exists():
        raise ValueError("Mock mode needs the sample model in models/ - run one real search first.")
    return _item_payload(name, MOCK_MODEL | {"judge": {"score": 7, "reason": "mock"}}, path)
