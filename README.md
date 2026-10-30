# NVera

Describe a scene, get a 3D model you can actually use.

**Live demo: [nvera.onrender.com](https://nvera.onrender.com)** (open to everyone, no sign-up)

**Demo video: [youtu.be/JvEnHQdBEJI](https://youtu.be/JvEnHQdBEJI)**

NVera doesn't generate 3D models. There are already millions of good free ones out there, the hard
part is finding the right one. You type what you need ("a cozy café with wooden tables and plants"),
and an agentic AI workflow built from several models searches Poly Haven, Sketchfab, Poly Pizza, the Smithsonian and the
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
- Searches Poly Haven, Sketchfab (via Objaverse), Poly Pizza, the Smithsonian, three.js examples and the open web
  at once, and has a vision model compare the previews side by side
- Uses Tavily to look up what the real thing looks like, so models are judged against real photos
- An honest score plus a checklist of what the model has and what it's missing
- A "How NVera decided" panel: every step, model, time and cost for that search
- Restyle with presets or by asking ("make it cardboard at sunset"): 10 materials, grounds, day/sunset/night, fog
- Download the edited GLB (creator and license are written into the file) or save a PNG of the view
- Learns from 👍/👎: past ratings are fed back into similar searches
- Searches again with broader words when the first round is weak
- NVera Studio: one sentence becomes a whole scene you can edit and download, with credits for every creator

## Does the vision judge help? A small evaluation

30 requests (objects, rooms, landscapes, two in Arabic). For each one, two picks from the same
candidates: a plain **title search** (the model whose name matches the request best, no AI) and
**NVera** (Tavily photos + Nemotron 3.5 Super VL + Nemotron 3 Super). A person then marked which picks
really match the request, without knowing which method chose which (random A/B order).

| Method | Right picks |
|---|---|
| Title search | 19 / 30 (63%) |
| **NVera** | **25 / 30 (83%)** |

NVera was right where the title search was wrong 9 times (a "medieval castle on a hill" title search
returned a castle *door*); the reverse happened 3 times, and both missed 2. Total cost of the run:
$0.13 and 60 Tavily credits. Code: [scripts/evaluate.py](scripts/evaluate.py), data and marks:
[eval/](eval/).

## What testers said

Students at my university tried the live site through a short survey. All 3 who tried it rated it
5/5 for usefulness, 2 found exactly what they asked for and 1 found something close, and ease of use
averaged 4.7/5. Two said that without NVera they wouldn't know where to look for a 3D model.

> "A beautiful and important idea for people who own 3D printers or are into 3D printing."
> Bandar, Business Administration

> "A promising idea that helps move smart search tools forward and boosts creativity."
> Rayan, Health major

> "Really beautiful, mashallah!"
> Rahaf, Health major

One tester found the dark look too heavy on the eyes, so the site now uses a softer, calmer theme.

## NVera Studio: a whole scene from one sentence

Open **Studio** in the finder and describe a scene ("a small park with benches, trees and a fountain"):

1. Nemotron 3 Ultra plans it: 3-6 objects, each object's real size in meters, where it stands, which
   way it faces, and one shared look.
2. NVera finds a free model for each object (free libraries only, judged by Nemotron 3.5 Super VL),
   three at a time.
3. The browser places them on one ground, scales each to its real size and paints them all with the
   same look, so models from different creators still look like one world.
4. Click any object to move, turn, resize, copy or delete it, or "Try another" model for it.
5. Download a ZIP with the whole scene as one GLB and a CREDITS.txt listing every model, its creator
   and what its license asks of you.

A search result can also be sent to the Studio with "Add to Studio". A scene costs about 1 cent.

## How it works

```
request -> Nemotron 3 Ultra   split into what to find (shape) and how it should look (restyle)
        -> Tavily             real-world photos and facts about the subject
        -> sources            Poly Haven, Sketchfab/Objaverse, Poly Pizza, Smithsonian, three.js, web
        -> Nemotron 3.5 Super VL  the judge: compares every preview (one numbered grid) with the real photos
        -> Nemotron 3 Super   final pick and score
        -> download           GLB cached in models/, falls back to the next model if it fails
```

NVera is an agentic workflow: the steps run in a fixed order, each on the model that fits it, and
the workflow makes a few decisions on its own. It searches again with broader words when the best
score is under 6/10, moves to the next model when a download fails, and uses past 👍/👎 on similar searches.

"A city made of cardboard" doesn't exist as a model, so NVera finds a city and applies the cardboard
look itself. The judges are told about the look, so they only score the shape.

Each AI step's instructions live in [backend/prompts/](backend/prompts/). They're plain markdown,
so changing how a step behaves doesn't need a code change.

### NVIDIA Nemotron on Nebius Token Factory

Every AI call goes through Nebius Token Factory's OpenAI-compatible API, and every step runs on an NVIDIA
Nemotron model, picked by how hard each job is:

| Job | Model | Why |
|---|---|---|
| Scene analysis | `nvidia/Nemotron-3-Ultra-550b-a55b` | The one step that needs real reasoning, and everything after it depends on it |
| Final pick | `nvidia/nemotron-3-super-120b-a12b` (Hermes 4 as fallback) | Short decision over the judge's shortlist, about 3x cheaper than Ultra |
| Look edits | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` (Ultra as fallback) | Quick structured edits, about 16x cheaper than Ultra |
| Vision judge | `nvidia/Nemotron-3.5-Super-VL` | Sees the images and scores every candidate |

Each step also has a backup that only runs if its main model is down or returns an unreadable answer.
For the judge that backup is Kimi K2.6, the only non-NVIDIA model in NVera. It never judges when
Nemotron VL answers, and "How NVera decided" shows which model judged each search.

Swapping a model is one line in `.env`. Prices come from `/v1/models?verbose=true`, which is how
the app tracks cost per search (about half a cent) and shows how many searches are left.

### Tavily

Tavily is used in three places, about 2 to 3 credits per search:

1. Research: search with `include_images` and `include_answer` to get real photos and a short
   description of what was asked. The vision judge compares the candidates against those photos.
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

Tests run offline and free (mock mode, no API keys needed):

```bash
.venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m pytest
```

They cover a full mock search, ratings being remembered, which models reach the judge, the vision
judge falling back to its backup, and the public demo's rate limits.

Other useful scripts:

```bash
.venv/Scripts/python scripts/check_apis.py                 # checks every key, costs < $0.001
.venv/Scripts/python scripts/try_pipeline.py "a medieval castle"   # full search from the terminal
```

## Deploying

The backend serves the built frontend too, so it's one Docker container and one URL. The live
demo runs on Render, built straight from this repo. Steps are in [docs/DEPLOY.md](docs/DEPLOY.md).

Keys only go in the host's environment variables. The demo is open to everyone; a per-visitor
hourly limit and a daily cap on spend and searches keep anyone from draining the credits.

## Project layout

```
backend/
  prompts/      instructions for each AI step
  agents/       scene analyzer, finder, vision judge, quality inspector, restyler, downloader
  sources/      polyhaven, sketchfab, objaverse, polypizza, smithsonian, threejs, web
  pipeline.py   runs the workflow and streams progress to the UI
  scene_builder.py  Studio: plans a scene and finds a model for each object
  main.py       FastAPI app
frontend/src/
  components/Finder.tsx       search page
  components/ModelViewer.tsx  react-three-fiber viewer
  components/Studio.tsx       scene builder
  lib/restyle.ts              procedural materials
scripts/        check_apis.py, try_pipeline.py, build_objaverse_index.py
tests/          offline tests (pytest)
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

Built with Claude Code (Anthropic): I designed, planned and tested NVera; Claude wrote most of the
code, especially the backend, and helped with the GitHub files. UI started from a Figma design.

## License

MIT, see [LICENSE](LICENSE). The 3D models belong to their creators under their own licenses.
