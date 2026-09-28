"""Agent 4 - Model Downloader: candidate -> local GLB file in models/ (cached)."""

from pathlib import Path

import requests

from backend import config
from backend.sources import objaverse, polyhaven, sketchfab


def glb_path(filename: str) -> Path:
    return config.MODELS_DIR / filename


def _url(candidate: dict) -> str:
    if candidate["source"] != "sketchfab":
        return candidate["download_url"]
    if config.SKETCHFAB_DOWNLOAD:  # you are the account owner (local use)
        return sketchfab.download_url(candidate["uid"])  # expires in minutes
    if url := objaverse.url(candidate["uid"]):  # same model, CC-licensed copy on Hugging Face
        return url
    raise ValueError("This Sketchfab model can only be viewed on Sketchfab")


def download(candidate: dict) -> Path:
    """Download once; later requests for the same model reuse the file. No size limit."""
    dest = glb_path(candidate["file"])
    if dest.exists():
        return dest

    tmp = dest.with_suffix(".part")
    try:
        if candidate["source"] == "polyhaven":  # multi-file glTF -> packed into one GLB
            polyhaven.fetch(candidate["asset_id"], tmp)
        else:
            with requests.get(_url(candidate), stream=True, timeout=300) as f:
                f.raise_for_status()
                with open(tmp, "wb") as out:
                    for chunk in f.iter_content(1 << 16):
                        out.write(chunk)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    tmp.replace(dest)
    return dest
