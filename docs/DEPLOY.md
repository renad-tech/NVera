# Deploying NVera

NVera runs as one service: FastAPI serves the API *and* the website, so there is a single URL
that works on any device.

## Where the API keys live

| Place | Keys? |
|---|---|
| Your computer - `.env` | ✅ yes (git-ignored, never pushed) |
| GitHub | ❌ never - only `.env.example` with empty values |
| Docker image | ❌ never - `.dockerignore` excludes `.env` |
| The host (Render…) | ✅ as environment variables in its dashboard |
| The browser | ❌ never - the browser only talks to `/api`; the server calls Nebius/Tavily |

## Protecting your credits

The demo is open to everyone, no sign-up. These limits keep anyone from draining the credits:

| Variable | Default | What it does |
|---|---|---|
| `NVERA_SEARCHES_PER_HOUR` | `10` | Per visitor (IP). |
| `NVERA_DAILY_BUDGET_USD` | `0.5` | Stops searches for the day after this much Nebius spend. |
| `NVERA_DAILY_SEARCHES` | `30` | Stops searches for the day after this many (also protects the Tavily credits). |
| `NVERA_ACCESS_CODE` | *(empty = open)* | Optional. If set, searching needs this code. |

Restyling a result costs almost nothing and keeps working after the daily limit.

## Third-party terms (Sketchfab)

Sketchfab's Developer Terms (4.6) require downloads to use the end user's own Sketchfab login.
So the public site runs with `NVERA_SKETCHFAB_DOWNLOAD=0` (set in `render.yaml`):

- Sketchfab winners are shown in Sketchfab's official embed viewer with a "Download on Sketchfab" link
  and the credit "model provided by Sketchfab" (terms 4.5, 4.7).
- If Objaverse (Allen AI's open, CC-licensed copy of ~800K Sketchfab models on Hugging Face) has the
  same model, NVera downloads it from there instead - credited "originally published on Sketchfab · via
  Objaverse". The Docker build creates the lookup index (`scripts/build_objaverse_index.py`).
- Otherwise NVera offers the best editable alternative (Poly Haven, Poly Pizza, Smithsonian, three.js, web).
- Locally you are the account owner, so `.env` can use `NVERA_SKETCHFAB_DOWNLOAD=1`.
- Every exported GLB carries the creator, license and source link in its glTF `extras`.

## Deploy on Render

1. Sign in at [render.com](https://render.com) with GitHub.
2. New -> Blueprint -> pick the `NVera` repo. Render reads `render.yaml`.
3. Fill in the secret values it asks for:
   `NEBIUS_API_KEY`, `TAVILY_API_KEY`, `SKETCHFAB_API_TOKEN`, `POLY_PIZZA_API_KEY`.
4. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (Upstash Redis) so ratings and the
   usage ledger are kept across restarts.
5. Apply. You get a link like `https://nvera.onrender.com`.

## Updating the live site

Commit and `git push` - Render rebuilds automatically.
