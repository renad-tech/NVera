"""Build backend/data/objaverse_index.bin (~13 MB) from Objaverse's public path list.

Run once (the Dockerfile does it at build time; the backend also builds it on first use):
    .venv\\Scripts\\python scripts/build_objaverse_index.py
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
logging.basicConfig(level=logging.INFO, format="%(message)s")

from backend.sources import objaverse  # noqa: E402

objaverse.build()
print(f"OK -> {objaverse.INDEX} ({objaverse.INDEX.stat().st_size / 1e6:.1f} MB)")
