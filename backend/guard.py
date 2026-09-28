"""Protects the API credits once NVera is public.

- Per-visitor rate limit (NVERA_SEARCHES_PER_HOUR, default 10).
- Daily caps for everyone together: spend (NVERA_DAILY_BUDGET_USD, default 0.50) and number
  of searches (NVERA_DAILY_SEARCHES, default 30, which also protects the Tavily credits).
- Optional access code (NVERA_ACCESS_CODE): if set, every paid call needs the X-Access-Code
  header. Off by default so anyone can try the demo.

Keys never reach the browser: they live only in the server's environment.
"""

import hmac
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from backend import config
from backend import usage as budget

_hits: dict[str, deque] = defaultdict(deque)
DAILY_LIMIT = ("The demo has reached today's limit (it keeps the API credits safe). "
               "It resets at midnight UTC - please try again tomorrow.")


def _client_ip(request: Request) -> str:
    # Behind a host's proxy (Render, Railway...) the real IP is the first X-Forwarded-For entry.
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def require_access(request: Request) -> None:
    """Access code only (for cheap calls like feedback or large-model confirmation)."""
    code = config.ACCESS_CODE
    if code and not hmac.compare_digest(request.headers.get("x-access-code", ""), code):
        raise HTTPException(status_code=401, detail="Access code required.")


def guard_paid(request: Request) -> None:
    """Rate limit + daily caps for calls that spend credits (+ access code if one is set).

    The per-visitor and daily search limits only count searches. Restyles cost about $0.0001,
    so they're only stopped by the daily dollar cap.
    """
    require_access(request)
    if config.MOCK:
        return

    if budget.spent_today() >= config.DAILY_BUDGET_USD:
        raise HTTPException(status_code=503, detail=DAILY_LIMIT)
    if not request.url.path.endswith("/find"):
        return

    ip, now = _client_ip(request), time.time()
    window = _hits[ip]
    while window and now - window[0] > 3600:
        window.popleft()
    if len(window) >= config.SEARCHES_PER_HOUR:
        wait = int((3600 - (now - window[0])) / 60) + 1
        raise HTTPException(
            status_code=429,
            detail=f"You've used this hour's {config.SEARCHES_PER_HOUR} free searches - try again in about {wait} min.",
        )
    if budget.searches_today() >= config.DAILY_SEARCHES:
        raise HTTPException(status_code=503, detail=DAILY_LIMIT + " Restyling a result still works.")

    window.append(now)
