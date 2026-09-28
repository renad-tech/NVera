"""NVera API (and, in production, the website too - one URL runs everything).

Run from the repo root:
    .venv\\Scripts\\python -m uvicorn backend.main:app --reload --port 8000

Set NVERA_MOCK=1 to work on the UI without spending API credits.
Interactive docs: http://localhost:8000/docs
Deploying publicly: see docs/DEPLOY.md (access code, rate limit, daily budget cap).
"""

import json
import logging
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend import config, memory, pipeline, restyle
from backend import usage as budget
from backend.agents import restyler
from backend.sources import objaverse
from backend.guard import guard_paid, require_access
from backend.settings import SearchSettings
from backend.utils.llm import Usage

LOG_FILE = config.ROOT / "logs" / "nvera.log"
LOG_FILE.parent.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler(LOG_FILE, encoding="utf-8")],
)

app = FastAPI(title="NVera API", version="0.3.0", description="Find the best ready-made 3D model for a scene.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.FRONTEND_ORIGINS,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",  # any local dev port
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/models", StaticFiles(directory=config.MODELS_DIR), name="models")


@app.on_event("startup")
def _warm_up() -> None:
    objaverse.warm_up()  # load (or build) the Sketchfab -> Objaverse index in the background


def _stream(events):
    return StreamingResponse(
        (json.dumps(e, ensure_ascii=False) + "\n" for e in events),
        media_type="application/x-ndjson",
    )


# Public


@app.get("/api/health")
def health():
    return {"ok": True, "mock": config.MOCK, "access_code_required": bool(config.ACCESS_CODE)}


@app.get("/api/usage")
def usage_status():
    """Estimated searches left (Nebius ledger + live Tavily credits)."""
    return budget.status() | {"memory": memory.stats()}


# Spends credits: access code + rate limit + daily cap


class FindRequest(BaseModel):
    prompt: str = Field(min_length=2, max_length=500)
    settings: SearchSettings = Field(default_factory=SearchSettings)


@app.post("/api/find", dependencies=[Depends(guard_paid)])
def find(req: FindRequest):
    """Streams NDJSON: step events, then one result / confirm / error event."""
    return _stream(pipeline.run(req.prompt.strip(), req.settings))


class RestyleRequest(BaseModel):
    prompt: str = Field(max_length=500)       # the original search, for context
    subject: str = Field(max_length=200)      # what the found model is
    restyle: dict                              # the current look
    instruction: str = Field(min_length=2, max_length=300)


@app.post("/api/restyle", dependencies=[Depends(guard_paid)])
def restyle_model(req: RestyleRequest):
    """Chat edit of the look (material, colors, ground, sky, light). ~$0.001, free in mock mode."""
    usage = Usage()
    try:
        new, message = restyler.edit(
            req.prompt, req.subject, restyle.normalize(req.restyle), req.instruction, usage,
        )
    except Exception as e:
        logging.getLogger("nvera").exception("restyle failed")
        raise HTTPException(status_code=502, detail=f"Restyle failed: {e}") from e
    finally:
        logging.getLogger("nvera").info(
            "restyle %r cost=$%.4f tokens=%d/%d", req.instruction, usage.nebius_usd, usage.tokens_in, usage.tokens_out,
        )
    budget.add(usage, "restyle")
    return {"restyle": new, "message": message}


# Free but private: access code only


class ConfirmRequest(BaseModel):
    job_id: str
    # "large" = download the big best model · "smaller" = best smaller one ·
    # "editable" = best model NVera may download (e.g. instead of a Sketchfab view-only winner)
    choice: Literal["large", "smaller", "editable"]


@app.post("/api/confirm", dependencies=[Depends(require_access)])
def confirm(req: ConfirmRequest):
    """Follow-up on a remembered ranking (no AI calls). Streams download steps, then the result."""
    return _stream(pipeline.resume(req.job_id, req.choice))


class FeedbackRequest(BaseModel):
    search_id: str = Field(min_length=4, max_length=40)
    rating: Literal["up", "down"]
    note: str = Field(default="", max_length=300)


@app.post("/api/feedback", dependencies=[Depends(require_access)])
def feedback(req: FeedbackRequest):
    """👍/👎 on a result - remembered and fed to the AI team on similar future searches."""
    memory.record_feedback(req.search_id, req.rating, req.note)
    return {"ok": True, "memory": memory.stats()}


# The website (production build) - mounted last so /api and /models win

if config.FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=config.FRONTEND_DIST, html=True), name="site")
