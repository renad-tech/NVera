"""Source: Smithsonian 3D - museum objects (history, art, science). Public API, no key, no login.

Files are GLB (often Draco-compressed; the viewer decodes them). The search API has no preview
images or per-item license, so the judges treat these cautiously and the app links to
Smithsonian Open Access for terms.
"""

import requests

from backend.utils.llm import Usage

API = "https://3d-api.si.edu/api/v1.0/content/file/search"
QUALITY_ORDER = ["Medium", "Low", "High", "Thumb"]  # good detail without huge files


def search(query: str, usage: Usage, limit: int = 2) -> list[dict]:
    r = requests.get(API, params={"q": query, "file_type": "glb", "rows": 40}, timeout=12)
    r.raise_for_status()

    packages: dict[str, dict] = {}
    for row in r.json().get("rows", []):
        c = row.get("content") or {}
        if c.get("usage") != "Web3D" or not c.get("uri"):
            continue
        pkg = packages.setdefault(c["model_url"], {"title": row.get("title"), "files": {}})
        pkg["files"][c.get("quality")] = c["uri"]

    out = []
    for model_url, pkg in list(packages.items())[:limit]:
        uri = next((pkg["files"][q] for q in QUALITY_ORDER if q in pkg["files"]), None)
        if not uri:
            continue
        key = model_url.split(":")[-1]
        out.append({
            "id": f"smithsonian:{key}",
            "source": "smithsonian",
            "name": pkg["title"] or "Smithsonian object",
            "author": "Smithsonian Institution",
            "author_url": "https://3d.si.edu",
            "license": "Smithsonian Open Access (see si.edu/openaccess)",
            "url": "https://3d.si.edu",
            "thumbnail": None,
            "tags": ["museum", "smithsonian"],
            "description": pkg["title"] or "",
            "faces": None,
            "likes": None,
            "views": None,
            "file": f"smithsonian_{key}.glb",
            "download_url": uri,
            "size": None,
        })
    return out
