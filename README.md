# NVera

Describe a scene, get a 3D model you can actually use.

**Live demo: [nvera.onrender.com](https://nvera.onrender.com)** (open to everyone, no sign-up. It runs on
Render's free plan, so the first visit can take up to a minute while the server wakes up.)

NVera doesn't generate 3D models. There are already millions of good free ones out there, the hard
part is finding the right one. You type what you need ("a cozy café with wooden tables and plants"),
and a small team of AI agents searches Poly Haven, Sketchfab, Poly Pizza, the Smithsonian and the
open web, looks at every candidate, and gives you the best match with an honest score. Then you can
restyle it (cardboard, paper, clay, neon...) and download it as a GLB.

Built for the Nebius x NVIDIA Global AI Hackathon, Best Apps and Agents track.

### About the name

**NV** for NVIDIA, **N** for Nebius, **era** for the new era of open models they're building, and
**vera**, from the Latin *verus*: true, real. That last part is the point of the project: the model
you get should really be what you asked for, not just something with a matching title.

## Features

- Search in plain language, English or Arabic
- Settings you check before every search: scene size (object / room / environment), colored or
  monochrome, and up to two reference pictures
- Searches six sources at once and has a vision model compare the previews side by side
- Uses Tavily to look up what the real thing looks like, so models are judged against real photos
- An honest score plus a checklist of what the model has and what it's missing
- A "How NVera decided" panel: every agent, model, time and cost for that search
- Restyle with presets or by asking ("make it cardboard at sunset"): 10 materials, grounds, day/sunset/night, fog
- Download the edited GLB (creator and license are written into the file) or save a PNG of the view
- Learns from 👍/👎: past ratings are fed back into similar searches
- Searches again with broader words when the first round is weak

## How it works

```
request -> Nemotron 3 Ultra   split into what to find (shape) and how it should look (restyle)
        -> Tavily             real-world photos and facts about the subject
        -> sources            Poly Haven, Sketchfab/Objaverse, Poly Pizza, Smithsonian, three.js, web
        -> Kimi K2.6          compares up to 9 previews with the real photos
        -> Nemotron 3 Super   final pick and score
        -> download           GLB cached in models/, falls back to the next model if it fails
```

"A city made of cardboard" doesn't exist as a model, so NVera finds a city and applies the cardboard
look itself. The judges are told about the look, so they only score the shape.

Each agent's instructions live in [backend/prompts/](backend/prompts/). They're plain markdown,
so changing how an agent behaves doesn't need a code change.

### NVIDIA Nemotron on Nebius Token Factory

Every AI call goes through Nebius Token Factory's OpenAI-compatible API. All the text reasoning
runs on the Nemotron 3 family, picked by how hard each job is:

| Job | Model | Why |
|---|---|---|
| Scene analysis | `nvidia/Nemotron-3-Ultra-550b-a55b` | The one step that needs real reasoning, and everything after it depends on it |
| Final pick | `nvidia/nemotron-3-super-120b-a12b` (Hermes 4 as fallback) | Short decision over the judge's shortlist, about 3x cheaper than Ultra |
| Look edits | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` (Ultra as fallback) | Quick structured edits, about 16x cheaper than Ultra |
| Vision judge | `moonshotai/Kimi-K2.6` | Needs to see images |

Swapping a model is one line in `.env`. Prices come from `/v1/models?verbose=true`, which is how
the app tracks cost per search (usually $0.01 to $0.03) and shows how many searches are left.

### Tavily

Tavily is used in three places, about 2 to 3 credits per search:

1. Research: search with `include_images` and `include_answer` to get real photos and a short
   description of what was asked. Kimi compares the candidates against those photos.
2. Library search: one natural-language query across Sketchfab, Poly Pizza, Poly Haven and
   OpenGameArt (`include_domains`). Hits are turned into real downloadable models.
3. Open web fallback: Search plus Extract, which reads whole pages to find direct `.glb` links.

## Running it locally

You need Python 3.12+, Node 22+ and API keys for Nebius Token Factory, Tavily, Sketchfab and Poly Pizza.

```bash
cp .env.example .env          # fill in your keys
python -m venv .venv
.venv/Scripts/python -m pip install -r backend/requirements.txt
npm --prefix frontend install
```

Then start both parts:

```bash
.venv/Scripts/python -m uvicorn backend.main:app --port 8000
npm --prefix frontend run dev          # http://localhost:5173
```

On Windows you can just double-click `start.bat`.

To work on the UI without spending credits, run the backend with `NVERA_MOCK=1` (or use
`start-mock.bat`). It replays the pipeline and always returns the same sample model.

Other useful scripts:

```bash
.venv/Scripts/python scripts/check_apis.py                 # checks every key, costs < $0.001
.venv/Scripts/python scripts/try_pipeline.py "a medieval castle"   # full search from the terminal
```

## Deploying

The backend serves the built frontend too, so it's one Docker container and one URL. The live
demo runs on Render (free plan, built straight from this repo). Steps are in [docs/DEPLOY.md](docs/DEPLOY.md).

Keys only go in the host's environment variables. The demo is open to everyone; a per-visitor
hourly limit and a daily cap on spend and searches keep anyone from draining the credits.

## Project layout

```
backend/
  prompts/      instructions for each agent
  agents/       scene analyzer, finder, vision judge, quality inspector, restyler, downloader
  sources/      polyhaven, sketchfab, objaverse, polypizza, smithsonian, threejs, web
  pipeline.py   runs the agents and streams progress to the UI
  main.py       FastAPI app
frontend/src/
  components/Finder.tsx       search page
  components/ModelViewer.tsx  react-three-fiber viewer
  lib/restyle.ts              procedural materials
scripts/        check_apis.py, try_pipeline.py, build_objaverse_index.py
docs/           DEPLOY.md, SUBMISSION.md
```

## Where the models come from

| Source | License | Notes |
|---|---|---|
| Poly Haven | CC0 | glTF files are packed into a single GLB |
| Sketchfab | per model, mostly CC-BY | search only; downloads need the user's own Sketchfab login (API terms 4.6) |
| Objaverse (Allen AI) | original model's license, dataset ODC-By | public copy of ~800K Sketchfab models on Hugging Face, used to download Sketchfab results |
| Poly Pizza | CC0 / CC-BY | |
| Smithsonian 3D | Smithsonian Open Access | museum objects, no preview images |
| three.js examples | see the three.js repo | small offline index |

If Objaverse doesn't have a Sketchfab result, it's shown in Sketchfab's own viewer with a link to
download it there, and NVera offers the best editable alternative instead. Every result shows its
author and license, and exported GLBs carry the same info in their glTF `extras`.

## Acknowledgments

Built with help from Claude Code (Anthropic) for debugging code and docs. UI started from
a Figma design.

## License

MIT, see [LICENSE](LICENSE). The 3D models belong to their creators under their own licenses.
