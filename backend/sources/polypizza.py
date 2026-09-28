"""Source: Poly Pizza - low-poly GLB models (CC0 / CC-BY) with a free search API."""

from urllib.parse import quote

import requests

from backend import config
from backend.utils.llm import Usage

API = "https://api.poly.pizza/v1.1"


def _get(path: str, **params) -> dict:
    r = requests.get(f"{API}/{path}", params=params, headers={"x-auth-token": config.POLY_PIZZA_API_KEY}, timeout=10)
    r.raise_for_status()
    return r.json()


def _candidate(m: dict) -> dict | None:
    if not m.get("Download"):
        return None
    creator = m.get("Creator") or {}
    return {
        "id": f"polypizza:{m['ID']}",
        "source": "polypizza",
        "name": m.get("Title"),
        "author": creator.get("Username"),
        "author_url": f"https://poly.pizza/u/{quote(creator.get('Username', ''))}",
        "license": m.get("Licence"),
        "url": f"https://poly.pizza/m/{m['ID']}",
        "thumbnail": m.get("Thumbnail"),
        "tags": (m.get("Tags") or [])[:15],
        "description": (m.get("Description") or "").strip()[:400],
        "faces": m.get("Tri Count"),
        "likes": None,
        "views": None,
        "file": f"polypizza_{m['ID']}.glb",
        "download_url": m["Download"],
        "size": None,  # low-poly, typically well under 1 MB
    }


def search(query: str, usage: Usage, limit: int = 8) -> list[dict]:
    if not config.POLY_PIZZA_API_KEY:
        return []
    results = _get(f"search/{quote(query)}", Limit=limit).get("results", [])[:limit]
    return [c for c in map(_candidate, results) if c]


def model(model_id: str) -> dict | None:
    """One model by ID (e.g. from a poly.pizza/m/<id> link Tavily found)."""
    if not config.POLY_PIZZA_API_KEY:
        return None
    return _candidate(_get(f"model/{quote(model_id)}"))
