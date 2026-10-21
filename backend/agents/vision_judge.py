"""Agent 3a - Vision Judge (NVIDIA Nemotron 3.5 Super VL on Nebius, Kimi K2.6 as backup): sees every
candidate's preview side by side and ranks them against the request, settings and must-have list,
in ONE call.
Soul & instructions: backend/prompts/vision_judge.md

Swappable: set JUDGE_MODEL / JUDGE_FALLBACK_MODEL (and optionally JUDGE_BASE_URL / JUDGE_API_KEY
for another OpenAI-compatible provider) in .env.
"""

import base64
import io
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor

import requests
from openai import OpenAI
from PIL import Image, ImageDraw, ImageFont

from backend import config
from backend.settings import SearchSettings
from backend.utils.llm import Usage
from backend.utils.prompts import load

log = logging.getLogger("nvera")

judge_client = OpenAI(
    base_url=config.JUDGE_BASE_URL or config.NEBIUS_API_URL,
    api_key=config.JUDGE_API_KEY or config.NEBIUS_API_KEY or "unset",
)

THUMB_PX = 384  # small previews keep image tokens (and cost) low
# Some vision models accept only a few images per request. Above the limit, the previews go in as one
# labeled grid and the real photos as one strip, so the judge still sees every candidate.
MAX_IMAGES = {"nvidia/Nemotron-3.5-Super-VL": 8}
TILE_PX = 320

def _fetch(url: str) -> Image.Image | None:
    """Download any preview (webp/png/jpg) as a small RGB image."""
    try:
        if url.startswith("data:image/"):
            raw = base64.b64decode(url.split(",", 1)[1])
        else:
            r = requests.get(url, timeout=15)
            r.raise_for_status()
            raw = r.content
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((THUMB_PX, THUMB_PX))
        return img
    except Exception as e:
        log.warning("thumbnail failed: %s (%s)", url[:80], type(e).__name__)
        return None


def _data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def _grid(images: list[Image.Image | None], labels: list[str], cols: int) -> Image.Image:
    """Tiles with a big label in the corner (C1, C2...), so the judge can refer to each one."""
    rows = -(-len(images) // cols)
    sheet = Image.new("RGB", (cols * TILE_PX, rows * TILE_PX), (24, 24, 24))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=36)
    for i, (img, label) in enumerate(zip(images, labels)):
        x, y = (i % cols) * TILE_PX, (i // cols) * TILE_PX
        if img:
            tile = img.copy()
            tile.thumbnail((TILE_PX - 8, TILE_PX - 8))
            sheet.paste(tile, (x + (TILE_PX - tile.width) // 2, y + (TILE_PX - tile.height) // 2))
        else:
            draw.text((x + TILE_PX // 2, y + TILE_PX // 2), "no preview", fill=(160, 160, 160), anchor="mm", font=font)
        draw.rectangle([x, y, x + TILE_PX - 1, y + TILE_PX - 1], outline=(70, 70, 70), width=2)
        if label:
            draw.rectangle([x + 4, y + 4, x + 84, y + 50], fill=(0, 0, 0))
            draw.text((x + 44, y + 27), label, fill=(255, 255, 0), anchor="mm", font=font)
    return sheet


def _meta(c: dict) -> dict:
    return {
        "source": c["source"],
        "name": c["name"],
        "tags": c["tags"][:10],
        "description": c["description"][:160],
        "faces": c.get("faces"),
        "license": c.get("license"),
    } | ({"past_feedback": c["past_feedback"]} if c.get("past_feedback") else {})


def _ask(model: str, content: list[dict], usage: Usage) -> list | None:
    """One judge model, one retry on a bad reply. Returns the ranking list or None."""
    text = ""
    for _ in range(2):
        r = judge_client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": load("vision_judge")}, {"role": "user", "content": content}],
            max_tokens=2500,
            temperature=0.1,
            # Reasoning models (Kimi K2.x, Nemotron) "think" by default and can burn the whole budget
            # before answering. Ranking previews doesn't need it. Unknown kwargs are ignored.
            extra_body={"chat_template_kwargs": {"thinking": False, "enable_thinking": False}},
        )
        usage.add_judge(model, r.usage.prompt_tokens, r.usage.completion_tokens)
        choice = r.choices[0]
        text = re.sub(r"<think>.*?</think>", "", choice.message.content or "", flags=re.S)
        match = re.search(r"\{.*\}", text, flags=re.S)
        try:
            return json.loads(match.group(0))["ranking"]
        except (AttributeError, KeyError, TypeError, json.JSONDecodeError):
            log.warning("judge %s bad reply: finish=%s content=%d chars", model, choice.finish_reason, len(text))
            if choice.finish_reason == "length":
                return None  # ran out of tokens - retrying would just double the cost
    return None


def rank(
    prompt: str, settings: SearchSettings, must_have: list[str], look: str, candidates: list[dict], usage: Usage,
    real_photos: list[str] = (),
) -> list[dict]:
    """Returns candidates sorted best-first, each with a `judge` dict (score/has/missing/reason)."""
    labels = {f"C{i + 1}": c for i, c in enumerate(candidates)}
    # Tavily's real-world photos: 3 when the user gave no reference, otherwise 2 next to theirs.
    photo_urls = list(real_photos)[: 2 if settings.reference_images else 3]
    with ThreadPoolExecutor(max_workers=8) as pool:
        thumbs = list(pool.map(lambda c: c.get("thumbnail") and _fetch(c["thumbnail"]), candidates))
        photos = [p for p in pool.map(_fetch, photo_urls) if p]
    refs = list(settings.reference_images)
    header = {
        "type": "text",
        "text": (
            f"User request: {prompt}\nSearch settings: {settings.describe()}\n"
            f"Must-have: {json.dumps(must_have, ensure_ascii=False)}\nLook note: {look}"
        ),
    }

    def one_by_one() -> list[dict]:
        content = [header]
        for i, ref in enumerate(refs, 1):
            content.append({"type": "text", "text": f"\nUser's reference image {i} (what they have in mind):"})
            content.append({"type": "image_url", "image_url": {"url": ref}})
        for i, photo in enumerate(photos, 1):
            content.append({"type": "text", "text": f"\nReal-world photo {i} found by Tavily (what the real thing looks like):"})
            content.append({"type": "image_url", "image_url": {"url": _data_url(photo)}})
        content.append({"type": "text", "text": "\n\nCandidates:"})
        for (label, c), thumb in zip(labels.items(), thumbs):
            content.append({"type": "text", "text": f"\n{label}: {json.dumps(_meta(c), ensure_ascii=False)}"})
            if thumb:
                content.append({"type": "image_url", "image_url": {"url": _data_url(thumb)}})
            else:
                content.append({"type": "text", "text": "(no preview image)"})
        return content

    def grids() -> list[dict]:
        content = [header]
        for i, ref in enumerate(refs, 1):
            content.append({"type": "text", "text": f"\nUser's reference image {i} (what they have in mind):"})
            content.append({"type": "image_url", "image_url": {"url": ref}})
        if photos:
            content.append({"type": "text", "text": "\nReal-world photos found by Tavily (what the real thing looks like):"})
            content.append({"type": "image_url", "image_url": {"url": _data_url(_grid(photos, [""] * len(photos), len(photos)))}})
        content.append({"type": "text", "text": (
            "\n\nCandidates (their previews are in the grid image below, each tile labeled in its "
            "top-left corner; 'no preview' means there is no image for that one):"
        )})
        for label, c in labels.items():
            content.append({"type": "text", "text": f"\n{label}: {json.dumps(_meta(c), ensure_ascii=False)}"})
        sheet = _grid(thumbs, list(labels), cols=3)
        content.append({"type": "image_url", "image_url": {"url": _data_url(sheet)}})
        return content

    images = len(refs) + len(photos) + sum(1 for t in thumbs if t)

    models = [config.JUDGE_MODEL] + [m for m in [config.JUDGE_FALLBACK_MODEL] if m and m != config.JUDGE_MODEL]
    ranking, used = None, None
    for model in models:
        limit = MAX_IMAGES.get(model)
        content = grids() if limit and images > limit else one_by_one()
        try:
            ranking = _ask(model, content, usage)
        except Exception:
            log.warning("vision judge %s failed", model, exc_info=True)
        if ranking is not None:
            used = model
            break
    if ranking is None:
        raise ValueError("no vision judge returned a valid ranking")
    if used != models[0]:
        log.info("vision judge fell back to %s", used)
    usage.judge_model = used

    judged = []
    for item in ranking:
        c = labels.get(str(item.get("id", "")).strip())
        if c and c not in judged:
            c["judge"] = {
                "label": item["id"],
                "score": int(item.get("score", 0)),
                "has": [h for h in item.get("has", []) if isinstance(h, str)],
                "missing": [m for m in item.get("missing", []) if isinstance(m, str)],
                "reason": item.get("reason", ""),
            }
            judged.append(c)
    judged.sort(key=lambda c: -c["judge"]["score"])
    return judged
