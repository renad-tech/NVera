"""Agent 3a - Vision Judge (Kimi K2.6 on Nebius): sees every candidate's preview side by side
and ranks them against the request, settings and must-have list, in ONE call.
Soul & instructions: backend/prompts/vision_judge.md

Swappable: set JUDGE_MODEL (and optionally JUDGE_BASE_URL / JUDGE_API_KEY for another
OpenAI-compatible provider) in .env.
"""

import base64
import io
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor

import requests
from openai import OpenAI
from PIL import Image

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

def _thumb_data_url(url: str) -> str | None:
    """Fetch, shrink and re-encode as JPEG (handles webp/png from any source)."""
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        img.thumbnail((THUMB_PX, THUMB_PX))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=80)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        log.warning("thumbnail failed: %s (%s)", url, type(e).__name__)
        return None


def _meta(c: dict) -> dict:
    return {
        "source": c["source"],
        "name": c["name"],
        "tags": c["tags"][:10],
        "description": c["description"][:160],
        "faces": c.get("faces"),
        "license": c.get("license"),
    } | ({"past_feedback": c["past_feedback"]} if c.get("past_feedback") else {})


def rank(
    prompt: str, settings: SearchSettings, must_have: list[str], look: str, candidates: list[dict], usage: Usage,
    real_photos: list[str] = (),
) -> list[dict]:
    """Returns candidates sorted best-first, each with a `judge` dict (score/has/missing/reason)."""
    labels = {f"C{i + 1}": c for i, c in enumerate(candidates)}
    # Tavily's real-world photos: 3 when the user gave no reference, otherwise 2 next to theirs.
    photo_urls = list(real_photos)[: 2 if settings.reference_images else 3]
    with ThreadPoolExecutor(max_workers=8) as pool:
        thumbs = list(pool.map(lambda c: c.get("thumbnail") and _thumb_data_url(c["thumbnail"]), candidates))
        photos = [p for p in pool.map(_thumb_data_url, photo_urls) if p]

    content: list[dict] = [{
        "type": "text",
        "text": (
            f"User request: {prompt}\nSearch settings: {settings.describe()}\n"
            f"Must-have: {json.dumps(must_have, ensure_ascii=False)}\nLook note: {look}"
        ),
    }]
    for i, ref in enumerate(settings.reference_images, 1):
        content.append({"type": "text", "text": f"\nUser's reference image {i} (what they have in mind):"})
        content.append({"type": "image_url", "image_url": {"url": ref}})
    for i, photo in enumerate(photos, 1):
        content.append({"type": "text", "text": f"\nReal-world photo {i} found by Tavily (what the real thing looks like):"})
        content.append({"type": "image_url", "image_url": {"url": photo}})
    content.append({"type": "text", "text": "\n\nCandidates:"})
    for (label, c), thumb in zip(labels.items(), thumbs):
        content.append({"type": "text", "text": f"\n{label}: {json.dumps(_meta(c), ensure_ascii=False)}"})
        if thumb:
            content.append({"type": "image_url", "image_url": {"url": thumb}})
        else:
            content.append({"type": "text", "text": "(no preview image)"})

    text, ranking = "", None
    for _ in range(2):
        r = judge_client.chat.completions.create(
            model=config.JUDGE_MODEL,
            messages=[{"role": "system", "content": load("vision_judge")}, {"role": "user", "content": content}],
            max_tokens=2500,
            temperature=0.1,
            # Kimi K2.x "thinks" by default and can burn the whole budget before answering.
            # Ranking previews doesn't need it. Unknown template kwargs are ignored by other models.
            extra_body={"chat_template_kwargs": {"thinking": False}},
        )
        usage.judge_in += r.usage.prompt_tokens
        usage.judge_out += r.usage.completion_tokens
        choice = r.choices[0]
        text = re.sub(r"<think>.*?</think>", "", choice.message.content or "", flags=re.S)
        match = re.search(r"\{.*\}", text, flags=re.S)
        try:
            ranking = json.loads(match.group(0))["ranking"]
            break
        except (AttributeError, KeyError, TypeError, json.JSONDecodeError):
            reasoning = getattr(choice.message, "reasoning_content", None) or ""
            log.warning(
                "judge bad reply: finish=%s content=%d chars reasoning=%d chars",
                choice.finish_reason, len(text), len(reasoning),
            )
            if choice.finish_reason == "length":
                break  # ran out of tokens - retrying would just double the cost
    if ranking is None:
        raise ValueError(f"judge returned no valid ranking: {text[:300]!r}")

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
