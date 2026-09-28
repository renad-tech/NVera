"""Source: Sketchfab - its own search API (free) and the authenticated Download API.
(Tavily also finds Sketchfab pages: see tavily_libraries.py.)"""

import logging

import requests

from backend import config
from backend.utils.llm import Usage

log = logging.getLogger("nvera")

def model_info(uid: str) -> dict | None:
    """Public Sketchfab metadata (free, no token). None if not downloadable."""
    r = requests.get(f"https://api.sketchfab.com/v3/models/{uid}", timeout=15)
    r.raise_for_status()
    d = r.json()
    return _candidate(d) if d.get("isDownloadable") else None


def search_api(query: str, usage: Usage, limit: int = 12) -> list[dict]:
    """Sketchfab's own search (free, no credits): downloadable models, most-liked first.
    The GLB size comes with each result, so no extra calls are needed."""
    r = requests.get(
        "https://api.sketchfab.com/v3/search",
        params={"type": "models", "q": query, "downloadable": "true", "sort_by": "-likeCount", "count": limit},
        timeout=30,
    )
    r.raise_for_status()
    out = []
    for d in r.json().get("results", []):
        glb = (d.get("archives") or {}).get("glb") or {}
        if d.get("isDownloadable") and glb:
            out.append(_candidate(d) | {"size": glb.get("size") or 0})
    return out


def _candidate(d: dict) -> dict:
    uid = d["uid"]
    thumbs = sorted((d.get("thumbnails") or {}).get("images", []), key=lambda i: i.get("width", 0))
    thumb = next((i["url"] for i in thumbs if i.get("width", 0) >= 400), thumbs[-1]["url"] if thumbs else None)
    user = d.get("user") or {}
    return {
        "id": f"sketchfab:{uid}",
        "source": "sketchfab",
        "uid": uid,
        "name": d.get("name"),
        "author": user.get("displayName"),
        "author_url": user.get("profileUrl"),
        "license": (d.get("license") or {}).get("label"),
        "url": d.get("viewerUrl"),
        "thumbnail": thumb,
        "tags": [t["name"] for t in d.get("tags", [])][:15],
        "description": (d.get("description") or "")[:400],
        "faces": d.get("faceCount"),
        "likes": d.get("likeCount"),
        "views": d.get("viewCount"),
        "file": f"{uid}.glb",
        "download_url": None,  # needs the authenticated Download API - see download_url()
    }


def _glb(uid: str) -> dict:
    """{'url', 'size'} of the GLB (free API call; the URL expires in minutes)."""
    r = requests.get(
        f"https://api.sketchfab.com/v3/models/{uid}/download",
        headers={"Authorization": f"Token {config.SKETCHFAB_API_TOKEN}"},
        timeout=30,
    )
    r.raise_for_status()
    glb = r.json().get("glb")
    if not glb:
        raise ValueError("This Sketchfab model has no GLB version")
    return glb


def verified(uid: str) -> dict | None:
    """Metadata + GLB size, only if the GLB really downloads (no size limit)."""
    try:
        info = model_info(uid)
        if not info:
            return None
        return info | {"size": _glb(uid).get("size") or 0}
    except Exception as e:
        log.info("skip sketchfab %s: %s", uid, e)
        return None


def download_url(uid: str) -> str:
    """Fresh GLB link - fetched right before downloading because it expires."""
    return _glb(uid)["url"]
