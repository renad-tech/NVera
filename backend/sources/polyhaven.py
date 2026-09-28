"""Source: Poly Haven - ~500 photoscanned models, all CC0. Public API, no key, no login.

Search runs on the full asset list (fetched once a day). Models ship as multi-file glTF,
so downloads are packed into one GLB (backend/utils/glb.py).
"""

import logging
import re
import tempfile
import threading
import time
from pathlib import Path

import requests

from backend.utils import glb
from backend.utils.llm import Usage

log = logging.getLogger("nvera")

API = "https://api.polyhaven.com"
RESOLUTION = "1k"  # light textures: fast to download and to view
_cache: dict = {"at": 0.0, "assets": {}}
_lock = threading.Lock()


def _assets() -> dict:
    with _lock:
        if time.time() - _cache["at"] > 24 * 3600 or not _cache["assets"]:
            r = requests.get(f"{API}/assets", params={"t": "models"}, timeout=30)
            r.raise_for_status()
            _cache.update(at=time.time(), assets=r.json())
        return _cache["assets"]


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", text.lower()) if len(w) > 2}


def candidate(asset_id: str) -> dict | None:
    a = _assets().get(asset_id)
    if not a:
        return None
    thumb = (a.get("thumbnail_url") or "").replace("width=256", "width=512").replace("height=256", "height=512")
    return {
        "id": f"polyhaven:{asset_id}",
        "source": "polyhaven",
        "asset_id": asset_id,
        "name": a.get("name") or asset_id,
        "author": ", ".join((a.get("authors") or {}).keys()) or "Poly Haven",
        "author_url": f"https://polyhaven.com/a/{asset_id}",
        "license": "CC0",
        "url": f"https://polyhaven.com/a/{asset_id}",
        "thumbnail": thumb or None,
        "tags": ((a.get("categories") or []) + (a.get("tags") or []))[:15],
        "description": (a.get("description") or "")[:400],
        "faces": a.get("polycount"),
        "likes": a.get("download_count"),
        "views": None,
        "file": f"polyhaven_{asset_id}.glb",
        "download_url": None,  # multi-file glTF - see fetch()
        "size": None,
    }


def search(query: str, usage: Usage, limit: int = 4) -> list[dict]:
    q = _words(query)
    scored = []
    for asset_id, a in _assets().items():
        text = " ".join([a.get("name", ""), *a.get("categories", []), *a.get("tags", [])])
        hits = len(q & _words(text))
        if hits:
            scored.append((hits, a.get("download_count", 0), asset_id))
    scored.sort(reverse=True)
    return [c for _, _, asset_id in scored[:limit] if (c := candidate(asset_id))]


def fetch(asset_id: str, dest: Path) -> Path:
    """Download the glTF + its bin/textures and pack them into `dest` (one GLB)."""
    files = requests.get(f"{API}/files/{asset_id}", timeout=30).json()
    entry = files["gltf"][RESOLUTION]["gltf"]
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        main = tmp / Path(entry["url"]).name
        main.write_bytes(requests.get(entry["url"], timeout=60).content)
        for rel, info in (entry.get("include") or {}).items():
            path = tmp / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(requests.get(info["url"], timeout=120).content)
        return glb.pack(main, dest)
