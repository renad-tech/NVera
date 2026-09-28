"""Run the real NVera pipeline from the terminal - no server, no UI.

Usage (from the repo root):
    .venv\\Scripts\\python scripts/try_pipeline.py "modern office with wooden desks and plants"
    .venv\\Scripts\\python scripts/try_pipeline.py --size large --look monochrome "cyberpunk city"

Costs the same as a search in the app (~$0.01-0.04 + 1-3 Tavily credits).
Set NVERA_MOCK=1 to try it for free.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8")

from backend import config, pipeline  # noqa: E402
from backend.settings import SearchSettings  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Find a 3D model for a scene.")
    parser.add_argument("prompt", nargs="+")
    parser.add_argument("--size", choices=["small", "medium", "large"], default="medium")
    parser.add_argument("--look", choices=["colored", "monochrome"], default="colored")
    parser.add_argument("--yes", action="store_true", help="auto-accept large downloads")
    args = parser.parse_args()

    settings = SearchSettings(space_size=args.size, color_mode=args.look)
    events = pipeline.run(" ".join(args.prompt), settings)

    while True:
        for event in events:
            if event["type"] == "step":
                print(f"  • {event['message']}")
            elif event["type"] == "error":
                print(f"\n❌ {event['message']}")
                return 1
            elif event["type"] == "confirm":
                m = event["data"]["model"]
                print(f"\n⚠️  Best match {m['name']} is {m['size_mb']} MB ({m['score']}/10).")
                accept = args.yes or input("Download it anyway? [y/N] ").strip().lower() == "y"
                events = pipeline.resume(event["data"]["job_id"], accept)
                break
            elif event["type"] == "result":
                r = event["data"]
                q = r["quality"]
                print(f"\n⭐ {q['score']}/10 - {r['model']['name']} from {r['model']['source_label']}")
                print(f"   {q['reason']}")
                if q["has"] or q["missing"]:
                    print("   " + "  ".join([f"✓ {h}" for h in q["has"]] + [f"✗ {m}" for m in q["missing"]]))
                print(f"📦 {config.ROOT / r['glb_path'].lstrip('/')}")
                print(f"💰 ~${r['cost']['nebius_usd']} Nebius + {r['cost']['tavily_credits']} Tavily credit(s)")
                return 0
        else:
            return 1


if __name__ == "__main__":
    sys.exit(main())
