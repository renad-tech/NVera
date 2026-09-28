"""Smoke-test every external API NVera depends on.

Usage (from the repo root):
    .venv\\Scripts\\python scripts/check_apis.py

Reads keys from .env. Costs almost nothing: a few tokens per model (< $0.001 total)
and 1 Tavily credit. Sketchfab and Poly Pizza checks are free.
"""

import os
import sys

import requests
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

NEBIUS_URL = os.getenv("NEBIUS_API_URL", "https://api.tokenfactory.nebius.com/v1/")
TAVILY_URL = os.getenv("TAVILY_API_URL", "https://api.tavily.com/search")
MODELS = {
    "Nemotron": os.getenv("NEMOTRON_MODEL", "nvidia/Nemotron-3-Ultra-550b-a55b"),
    "Nano": os.getenv("RESTYLER_MODEL", "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"),
    "Super": os.getenv("INSPECTOR_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
    "Hermes": os.getenv("HERMES_MODEL", "NousResearch/Hermes-4-405B"),
    "Kimi": os.getenv("JUDGE_MODEL", "moonshotai/Kimi-K2.6"),
}
# Same switch the vision judge uses - if Kimi still "thinks", the OK never arrives.
NO_THINKING = {"chat_template_kwargs": {"thinking": False, "enable_thinking": False}}


def check_model(client: OpenAI, label: str, model: str) -> bool:
    try:
        r = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Reply with exactly: OK"}],
            max_tokens=200,
            extra_body=NO_THINKING if label in ("Kimi", "Nano", "Super") else None,
        )
        reply = (r.choices[0].message.content or "").strip()
        print(f"  ✅ {label:<9} {model}  ->  {reply[:60]!r}  ({r.usage.total_tokens} tokens)")
        return True
    except Exception as e:
        print(f"  ❌ {label:<9} {model}  ->  {e}")
        return False


def check_tavily(key: str) -> bool:
    try:
        r = requests.post(
            TAVILY_URL,
            headers={"Authorization": f"Bearer {key}"},
            json={
                "query": "desert castle 3D model downloadable",
                "include_domains": ["sketchfab.com"],
                "max_results": 3,
            },
            timeout=30,
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        print(f"  ✅ Tavily    {len(results)} results")
        for res in results:
            print(f"       - {res['url']}")
        return True
    except Exception as e:
        print(f"  ❌ Tavily    ->  {e}")
        return False


def check_sketchfab(token: str) -> bool:
    # A known downloadable model (Mountaintop Desert Castle, CC-BY).
    uid = "8c7e0cb5e5ae4789865294e53aaaee3e"
    try:
        r = requests.get(
            f"https://api.sketchfab.com/v3/models/{uid}/download",
            headers={"Authorization": f"Token {token}"},
            timeout=30,
        )
        r.raise_for_status()
        glb = r.json().get("glb", {})
        print(f"  ✅ Sketchfab GLB download link ready ({glb.get('size', 0) / 1e6:.1f} MB)")
        return True
    except Exception as e:
        print(f"  ❌ Sketchfab ->  {e}")
        return False


def check_polypizza(key: str) -> bool:
    try:
        r = requests.get(
            "https://api.poly.pizza/v1.1/search/castle",
            params={"Limit": 3},
            headers={"x-auth-token": key},
            timeout=20,
        )
        r.raise_for_status()
        print(f"  ✅ Poly Pizza {r.json().get('total', 0)} castle models")
        return True
    except Exception as e:
        print(f"  ❌ Poly Pizza ->  {e}")
        return False


def main() -> int:
    nebius_key = os.getenv("NEBIUS_API_KEY")
    tavily_key = os.getenv("TAVILY_API_KEY")
    sketchfab_token = os.getenv("SKETCHFAB_API_TOKEN")
    polypizza_key = os.getenv("POLY_PIZZA_API_KEY")
    required = [
        ("NEBIUS_API_KEY", nebius_key),
        ("TAVILY_API_KEY", tavily_key),
        ("SKETCHFAB_API_TOKEN", sketchfab_token),
        ("POLY_PIZZA_API_KEY", polypizza_key),
    ]
    missing = [n for n, v in required if not v]
    if missing:
        print(f"❌ Missing in .env: {', '.join(missing)}")
        return 1

    print("🧪 Checking NVera APIs...\n")
    client = OpenAI(base_url=NEBIUS_URL, api_key=nebius_key)
    ok = [check_model(client, label, model) for label, model in MODELS.items()]
    ok.append(check_tavily(tavily_key))
    ok.append(check_sketchfab(sketchfab_token))
    ok.append(check_polypizza(polypizza_key))

    print("\n✅ All good!" if all(ok) else "\n⚠️  Some checks failed.")
    return 0 if all(ok) else 1


if __name__ == "__main__":
    sys.exit(main())
