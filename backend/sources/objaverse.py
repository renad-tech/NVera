"""Source bridge: Objaverse (Allen AI) - ~800K CC-licensed Sketchfab models, public on Hugging Face.

Objaverse keeps each model's Sketchfab UID, so a Sketchfab search result can be downloaded from
Objaverse without the Sketchfab Download API (whose terms need each user's own login).
Every model keeps its original license and creator; the app credits
"originally published on Sketchfab by <creator> · via Objaverse".

The UID -> folder index is ~13 MB (17 bytes per model: 16-byte UID + folder number), built once by
scripts/build_objaverse_index.py (the Dockerfile runs it; locally it is built on first use).
"""

import bisect
import logging
import threading

from backend import config

log = logging.getLogger("nvera")

INDEX = config.ROOT / "backend" / "data" / "objaverse_index.bin"
PATHS_URL = "https://huggingface.co/datasets/allenai/objaverse/resolve/main/object-paths.json.gz"
FILE_URL = "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-{shard:03d}/{uid}.glb"
RECORD = 17

_data: bytes | None = None
_lock = threading.Lock()


class _Keys:
    """Sequence view over the sorted UIDs, so `bisect` can search the packed records."""

    def __init__(self, data: bytes):
        self.data = data

    def __len__(self) -> int:
        return len(self.data) // RECORD

    def __getitem__(self, i: int) -> bytes:
        return self.data[i * RECORD: i * RECORD + 16]


def build(target=INDEX) -> None:
    """Download Objaverse's path list (~20 MB) and write the compact sorted index."""
    import gzip
    import io
    import json

    import requests

    r = requests.get(PATHS_URL, timeout=300)
    r.raise_for_status()
    paths = json.load(gzip.open(io.BytesIO(r.content)))
    records = []
    for uid, path in paths.items():
        if len(uid) != 32:
            continue  # the few non-Sketchfab ids can't match a Sketchfab search result
        shard = int(path.split("/")[1].split("-")[1])
        records.append(bytes.fromhex(uid) + bytes([shard]))
    records.sort()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(b"".join(records))
    log.info("Objaverse index built: %d models", len(records))


def _load() -> bytes | None:
    global _data
    with _lock:
        if _data is None:
            try:
                if not INDEX.exists():
                    build()
                _data = INDEX.read_bytes()
            except Exception:
                log.warning("Objaverse index unavailable - Sketchfab models stay view-only", exc_info=True)
                _data = b""
        return _data or None


def url(uid: str) -> str | None:
    """Objaverse download URL for a Sketchfab UID, or None if it isn't in Objaverse."""
    data = _load()
    if not data or len(uid) != 32:
        return None
    key = bytes.fromhex(uid)
    keys = _Keys(data)
    i = bisect.bisect_left(keys, key)
    if i < len(keys) and keys[i] == key:
        return FILE_URL.format(shard=data[i * RECORD + 16], uid=uid)
    return None


def warm_up() -> None:
    """Load (or build) the index in the background so the first search isn't slow."""
    threading.Thread(target=_load, daemon=True).start()
