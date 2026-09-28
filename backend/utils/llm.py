"""Nebius Token Factory client shared by every text model (Nemotron Ultra/Super/Nano, Hermes)."""

import json
import logging
import re
from dataclasses import dataclass

from openai import OpenAI

from backend import config

log = logging.getLogger("nvera")

client = OpenAI(base_url=config.NEBIUS_API_URL, api_key=config.NEBIUS_API_KEY or "unset")

# Small/fast models: skip "thinking" for quick structured edits. Unknown kwargs are ignored by others.
NO_THINKING = {"chat_template_kwargs": {"enable_thinking": False, "thinking": False}}


@dataclass
class Usage:
    tokens_in: int = 0
    tokens_out: int = 0
    llm_usd: float = 0.0  # priced per model (config.PRICES)
    judge_in: int = 0
    judge_out: int = 0
    tavily_credits: int = 0

    def add(self, model: str, tokens_in: int, tokens_out: int) -> None:
        price_in, price_out = config.price(model)
        self.tokens_in += tokens_in
        self.tokens_out += tokens_out
        self.llm_usd += (tokens_in * price_in + tokens_out * price_out) / 1e6

    @property
    def nebius_usd(self) -> float:
        judge = self.judge_in * config.JUDGE_PRICE_IN + self.judge_out * config.JUDGE_PRICE_OUT
        return self.llm_usd + judge / 1e6


def _ask_once(model: str, system: str, user: str, usage: Usage, fast: bool) -> dict:
    """JSON-mode call with one retry on bad JSON."""
    text = ""
    for _ in range(2):
        r = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"},
            max_tokens=2000,
            temperature=0.2,
            extra_body=NO_THINKING if fast else None,
        )
        usage.add(model, r.usage.prompt_tokens, r.usage.completion_tokens)
        text = r.choices[0].message.content or ""
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
        match = re.search(r"\{.*\}", text, flags=re.S)
        try:
            return json.loads(match.group(0) if match else text)
        except json.JSONDecodeError:
            continue
    raise ValueError(f"{model} did not return valid JSON")


def ask_json(model: str, system: str, user: str, usage: Usage,
             fast: bool = False, fallback_model: str | None = None) -> dict:
    """Call `model` in JSON mode. If it fails and a fallback is given, try the fallback once."""
    try:
        return _ask_once(model, system, user, usage, fast)
    except Exception:
        if not fallback_model or fallback_model == model:
            raise
        log.warning("%s failed - falling back to %s", model, fallback_model, exc_info=True)
        return _ask_once(fallback_model, system, user, usage, fast=False)
