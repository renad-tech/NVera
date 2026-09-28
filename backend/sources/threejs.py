"""Source: three.js example models - a small curated offline index (free, instant)."""

import json
import re
from pathlib import Path

from backend.utils.llm import Usage

INDEX = json.loads((Path(__file__).resolve().parent.parent / "data" / "threejs_models.json").read_text("utf-8"))
BASE = "https://threejs.org/examples/models/gltf"


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", text.lower()) if len(w) > 2}


def search(query: str, usage: Usage, limit: int = 3) -> list[dict]:
    q = _words(query)
    scored = []
    for m in INDEX:
        hits = len(q & (_words(" ".join(m["tags"])) | _words(m["title"])))
        if hits:
            scored.append((hits, m))
    scored.sort(key=lambda x: -x[0])
    return [
        {
            "id": f"threejs:{m['name']}",
            "source": "threejs",
            "name": m["title"],
            "author": "three.js examples",
            "author_url": "https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf",
            "license": "See three.js repo",
            "url": f"{BASE}/{m['name']}.glb",
            "thumbnail": None,
            "tags": m["tags"],
            "description": m["description"],
            "faces": None,
            "likes": None,
            "views": None,
            "file": f"threejs_{m['name']}.glb",
            "download_url": f"{BASE}/{m['name']}.glb",
            "size": None,
        }
        for _, m in scored[:limit]
    ]
