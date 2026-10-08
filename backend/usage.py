"""How much budget is left - shown in the app as "≈ N searches left".

Nebius: Token Factory has no balance API, so NVera keeps its own ledger (Upstash, or memory/usage.json),
seeded once from logs/nvera.log. It is an estimate - the Nebius console has the exact number.
Tavily: read live from Tavily's /usage endpoint (free).
"""

import json
import re
import threading
import time

import requests

from backend import config, kv
from backend.utils.llm import Usage

LEDGER = config.ROOT / "memory" / "usage.json"
LOG = config.ROOT / "logs" / "nvera.log"
PRE_LOG_SPEND = 0.01  # API tests before logging existed (check_apis, first prototype runs)
DEFAULT_SEARCH_COST = 0.015
TAVILY_CREDITS_PER_SEARCH = 2.3  # research 1 + library search 1 + occasional second round / web

_lock = threading.Lock()
_tavily_cache: dict = {"at": 0.0, "data": None}


def _seed_from_log() -> dict:
    spent, searches, restyles = PRE_LOG_SPEND, 0, 0
    if LOG.exists():
        for line in LOG.read_text(encoding="utf-8", errors="ignore").splitlines():
            m = re.search(r"cost=\$([0-9.]+)", line)
            if not m:
                continue
            spent += float(m.group(1))
            if " prompt=" in line:
                searches += 1
            elif " restyle " in line:
                restyles += 1
    return {"nebius_usd": round(spent, 4), "searches": searches, "restyles": restyles, "since": time.time()}


KV_KEY = "nvera:usage"


def _save(data: dict) -> None:
    if kv.enabled:
        kv.cmd("SET", KV_KEY, json.dumps(data))
        return
    LEDGER.parent.mkdir(exist_ok=True)
    LEDGER.write_text(json.dumps(data), encoding="utf-8")


def _load() -> dict:
    if kv.enabled:
        raw = kv.cmd("GET", KV_KEY)
        if raw:
            return json.loads(raw)
    elif LEDGER.exists():
        return json.loads(LEDGER.read_text(encoding="utf-8"))
    data = _seed_from_log()
    _save(data)
    return data


def add(usage: Usage, kind: str) -> None:
    """Record one search or restyle (no-op in mock mode)."""
    if config.MOCK:
        return
    with _lock:
        data = _load()
        data["nebius_usd"] = round(data["nebius_usd"] + usage.nebius_usd, 5)
        data["searches" if kind == "search" else "restyles"] += 1
        days = data.setdefault("days", {})
        today = time.strftime("%Y-%m-%d")
        days[today] = round(days.get(today, 0) + usage.nebius_usd, 5)
        data["days"] = dict(sorted(days.items())[-30:])  # keep a month
        if kind == "search":
            counts = data.setdefault("day_searches", {})
            counts[today] = counts.get(today, 0) + 1
            data["day_searches"] = dict(sorted(counts.items())[-30:])
        _save(data)


def spent_today() -> float:
    with _lock:
        return _load().get("days", {}).get(time.strftime("%Y-%m-%d"), 0.0)


def searches_today() -> int:
    with _lock:
        return _load().get("day_searches", {}).get(time.strftime("%Y-%m-%d"), 0)


def _tavily() -> dict | None:
    if time.time() - _tavily_cache["at"] < 60:
        return _tavily_cache["data"]
    try:
        r = requests.get(
            "https://api.tavily.com/usage",
            headers={"Authorization": f"Bearer {config.TAVILY_API_KEY}"},
            timeout=10,
        )
        r.raise_for_status()
        account = r.json().get("account") or {}
        data = {"used": account.get("plan_usage", 0), "limit": account.get("plan_limit") or 1000,
                "plan": account.get("current_plan")}
    except Exception:
        data = None
    _tavily_cache.update(at=time.time(), data=data)
    return data


def status() -> dict:
    with _lock:
        data = _load()
    spent = data["nebius_usd"]
    remaining = max(config.NEBIUS_BUDGET_USD - spent, 0)
    avg = spent / data["searches"] if data["searches"] >= 3 else DEFAULT_SEARCH_COST
    nebius_left = int(remaining / max(avg, 0.001))

    tavily = _tavily()
    tavily_left = int((tavily["limit"] - tavily["used"]) / TAVILY_CREDITS_PER_SEARCH) if tavily else None

    return {
        "searches_left": min(x for x in (nebius_left, tavily_left) if x is not None),
        "nebius": {
            "spent_usd": round(spent, 3), "budget_usd": config.NEBIUS_BUDGET_USD,
            "remaining_usd": round(remaining, 3), "avg_search_usd": round(avg, 4),
            "searches_left": nebius_left, "searches_done": data["searches"], "estimate": True,
        },
        "tavily": (tavily | {"remaining": tavily["limit"] - tavily["used"], "searches_left": tavily_left})
        if tavily else None,
    }
