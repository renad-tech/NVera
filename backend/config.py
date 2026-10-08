"""Settings loaded from the repo-root .env."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

NEBIUS_API_URL = os.getenv("NEBIUS_API_URL", "https://api.tokenfactory.nebius.com/v1/")
NEBIUS_API_KEY = os.getenv("NEBIUS_API_KEY", "")
# Nemotron 3 Ultra for the reasoning-heavy step (scene analysis);
# Nemotron 3 Nano for fast everyday calls (look edits) - ~16x cheaper, falls back to Ultra on error.
NEMOTRON_MODEL = os.getenv("NEMOTRON_MODEL", "nvidia/Nemotron-3-Ultra-550b-a55b")
RESTYLER_MODEL = os.getenv("RESTYLER_MODEL", "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B")
# Quality Inspector: Nemotron 3 Super (NVIDIA) makes the final pick; Hermes 4 takes over if it fails.
INSPECTOR_MODEL = os.getenv("INSPECTOR_MODEL", "nvidia/nemotron-3-super-120b-a12b")
HERMES_MODEL = os.getenv("HERMES_MODEL", "NousResearch/Hermes-4-405B")
# Vision judge: compares all candidate previews in one call. Any OpenAI-compatible
# provider works - leave JUDGE_BASE_URL / JUDGE_API_KEY empty to use Nebius.
JUDGE_MODEL = os.getenv("JUDGE_MODEL", "moonshotai/Kimi-K2.6")
JUDGE_BASE_URL = os.getenv("JUDGE_BASE_URL", "")
JUDGE_API_KEY = os.getenv("JUDGE_API_KEY", "")
POLY_PIZZA_API_KEY = os.getenv("POLY_PIZZA_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
TAVILY_API_URL = os.getenv("TAVILY_API_URL", "https://api.tavily.com/search")
SKETCHFAB_API_TOKEN = os.getenv("SKETCHFAB_API_TOKEN", "")
# Optional Upstash Redis: keeps memory and the usage ledger across restarts (see backend/kv.py).
UPSTASH_URL = os.getenv("UPSTASH_REDIS_REST_URL", "").strip().strip('"')
UPSTASH_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "").strip().strip('"')

# NVERA_MOCK=1 -> no paid API calls; returns a model already in models/.
MOCK = os.getenv("NVERA_MOCK", "0") == "1"

MODELS_DIR = ROOT / "models"
MODELS_DIR.mkdir(exist_ok=True)

# Pricing per 1M tokens (Nebius Token Factory, Sept 2026) - for cost logging.
PRICES = {
    "nvidia/Nemotron-3-Ultra-550b-a55b": (1.0, 3.0),
    "nvidia/nemotron-3-super-120b-a12b": (0.30, 0.90),
    "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": (0.06, 0.24),
    "NousResearch/Hermes-4-405B": (1.0, 3.0),
}
JUDGE_PRICE_IN, JUDGE_PRICE_OUT = 0.95, 4.0  # Kimi K2.6


def price(model: str) -> tuple[float, float]:
    """(input, output) USD per 1M tokens; unknown models are priced like Ultra (safe overestimate)."""
    return PRICES.get(model, (1.0, 3.0))

# If the judge's best score is below this, NVera searches once more with broader queries.
MIN_SCORE = 6

# Nebius credit for the "searches left" estimate (Token Factory has no balance API).
NEBIUS_BUDGET_USD = float(os.getenv("NEBIUS_BUDGET_USD", "25"))

# Public-deployment protection (see backend/guard.py). Empty access code = open to everyone.
ACCESS_CODE = os.getenv("NVERA_ACCESS_CODE", "")
SEARCHES_PER_HOUR = int(os.getenv("NVERA_SEARCHES_PER_HOUR", "10"))
DAILY_BUDGET_USD = float(os.getenv("NVERA_DAILY_BUDGET_USD", "0.5"))
# Also caps Tavily credits (~2 per search), since the dollar cap only sees Nebius spend.
DAILY_SEARCHES = int(os.getenv("NVERA_DAILY_SEARCHES", "30"))

# Sketchfab API terms (4.6): downloads must use the END USER's own Sketchfab login.
# On your own machine you ARE the end user, so downloading with your token is fine -> set 1 in .env.
# On a public deployment keep 0: Sketchfab winners are shown in Sketchfab's official embed viewer
# with a "Download on Sketchfab" link, and NVera offers the best editable alternative instead.
SKETCHFAB_DOWNLOAD = os.getenv("NVERA_SKETCHFAB_DOWNLOAD", "0") == "1"

# Built frontend (npm run build) - served by FastAPI in production, so one URL runs everything.
FRONTEND_DIST = ROOT / "frontend" / "dist"

# No size limit - the best model always wins. Above this size the user is asked to
# confirm the download (or take the best smaller one instead).
LARGE_MODEL_MB = 50

FRONTEND_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
