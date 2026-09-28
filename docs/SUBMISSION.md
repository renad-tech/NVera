# NVera: submission notes

Text for the Devpost form. Fill in the links in angle brackets before submitting.

- Project: NVera
- Tagline: Describe a scene, get a 3D model you can actually use.
- Track: Best Apps and Agents (also entering the Tavily prize)
- Demo: https://nvera.onrender.com (open to everyone, no sign-up; the first load can take up to a minute while the free server wakes up, and a search takes about a minute)
- Code: https://github.com/renad-tech/NVera (MIT)
- Video: <YouTube URL>
- New project: yes, started during the submission period (September 2026)

## Inspiration

Anyone who has made a small game or a quick prototype knows this: you need a 3D model of something
ordinary, a café, a desert fort, an office, and you spend an hour going through five sites. Half of
the good-looking results turn out to be empty shells, some can't be downloaded, and the license is
somewhere you have to go looking for. The models exist. Finding the right one is the slow part.

Text-to-3D generation is getting better, but for a game or a prototype you usually still want a real,
finished model. So I built something that finds instead of generating.

The name: NV for NVIDIA, N for Nebius, era for the new era of open models, and vera from the Latin
verus, "true". The model you get should really be what you asked for, not just something with a
matching title.

## What it does

You describe a scene in English or Arabic and check three settings: scene size, colored or
monochrome, and optional reference pictures. Then NVera:

1. Splits the request into what to find (the shape) and how it should look (material, colors, light).
   "A city made of cardboard" becomes: find a city, apply cardboard.
2. Uses Tavily to look up what the real thing looks like, photos and a short description.
3. Searches Poly Haven, Sketchfab (downloaded through Objaverse), Poly Pizza, the Smithsonian,
   three.js examples and the open web in parallel.
4. Has a vision model compare every candidate's preview with the real photos.
5. Picks the best one and shows an honest score, a checklist of what it has and what's missing, and a
   "How NVera decided" panel with every agent, model, time and cost.
6. Lets you restyle it with presets or by asking ("cardboard at sunset"), then download a GLB with
   the creator and license written into the file.

It remembers 👍/👎 ratings and uses them on similar searches later, and it searches again with broader
words when the first results are weak.

## Who it's for

Indie game developers and game-jam teams, students working on game design, architecture or interior
projects, teachers and anyone prototyping who needs a decent 3D model in a minute instead of an hour.
It also works for people who'd rather search in Arabic.

## How we built it

Everything AI runs on Nebius Token Factory through its OpenAI-compatible API, and all of the text
reasoning uses the NVIDIA Nemotron 3 family:

- Nemotron 3 Ultra analyzes the request. It's the step that needs the most reasoning, and the rest of
  the pipeline depends on its search terms and checklist.
- Nemotron 3 Super makes the final pick from the vision judge's shortlist (Hermes 4 as fallback).
- Nemotron 3 Nano handles look edits. It's about 16x cheaper than Ultra, so an edit costs around
  $0.0001, with Ultra as fallback.
- Kimi K2.6 is the vision judge, since that step needs to see images. It compares all candidates in
  one call.

Tavily is used three ways: research with images and an answer to ground the judge, one natural-language
search across Sketchfab, Poly Pizza, Poly Haven and OpenGameArt, and Search plus Extract on the open web
to pull direct .glb links out of pages.

The backend is FastAPI and streams progress to the UI. The frontend is React, Vite and Tailwind (the
design started in Figma Make) with a react-three-fiber viewer: isometric camera, studio lighting,
contact shadows, bloom, and procedural materials drawn in the browser. Edited models are exported with
three.js's GLTFExporter. Each agent's instructions are a markdown file in backend/prompts.

I built NVera with help from Claude Code (Anthropic's AI coding assistant) for writing and debugging
code and docs. The idea, the product decisions and the testing are mine.

## Making it reliable

Nebius's Agents Blueprint argues that most agent failures are system failures: reliability, cost and
observability. I ran into all three while building it, and this is what I did about them:

- Reliability: every step has a fallback. Nano falls back to Ultra, Super to Hermes, a failed download
  to the next model, a weak first round (under 6/10) to a second search, and a view-only Sketchfab
  result to the best editable one.
- Cost: every call is priced per model and logged. The UI shows roughly how many searches are left,
  and a public deployment has a daily budget cap and a per-visitor limit. A search is usually $0.01 to
  $0.03. Models over 50 MB ask before downloading, and picking a smaller one doesn't re-run any AI.
- Observability: the "How NVera decided" panel shows what happened in each search, and everything is
  logged.

## Challenges

- The first version gave an empty room 9/10 because its name matched. Adding a vision judge, and later
  real photos from Tavily, fixed that.
- Kimi K2.6 thinks by default and once spent its whole token budget without answering. Turning thinking
  off for ranking took a search from $0.037 to about $0.008.
- "A cardboard city" isn't a model anyone has uploaded. Separating shape from look turned a 4/10 result
  into a real answer.
- Sketchfab's API terms require downloads to go through the user's own login, so I switched to
  Objaverse (Allen AI's public copy of CC-licensed Sketchfab models) and Sketchfab's own embed viewer.

## What we learned

Most of the quality came from the system around the models, not from swapping models: what the judge
gets to see, what counts as a failure, and when to try again.

## What's next

Sketchfab login (OAuth) so Sketchfab downloads work for everyone, combining several found models into
one scene, and moving the deployment to Nebius Serverless Endpoints.

## Feedback on Token Factory and NVIDIA models

What worked well:
- One OpenAI-compatible endpoint for several open models made it easy to give each agent the right
  model and change it from .env.
- The Nemotron 3 lineup covered every text job: Ultra for the analysis, Super for the decision, Nano
  for quick edits.
- /v1/models?verbose=true with per-model prices is great. I built the cost tracking on it.
- JSON mode was reliable with Nemotron and Hermes.
- Nemotron 3 Ultra handled Arabic requests and returned clean English search terms without extra prompting.

What could be better:
- deepseek-ai/DeepSeek-R1-0528 started returning 404 "model does not exist" without notice. Deprecation
  dates in /v1/models, or aliases to newer models, would help.
- There's no endpoint for remaining credit or spend, so I estimate it from my own logs.
- Turning "thinking" off differs between models. A documented switch, and capability flags in
  /v1/models (thinking, vision, JSON mode), would save time.
- A per-request cost header would make cost tracking exact.

## Video script (about 2:50, must stay under 3:00)

No copyrighted music and no third-party logos. Start with the result.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00 | A cardboard city rotating, click Night so it glows | "This city is made of cardboard. AI found it, judged it and restyled it in under a minute." |
| 0:10 | Several library tabs, an empty-room model, a license page | "Finding the right free 3D model takes hours: five sites, empty shells, unclear licenses. NVera finds it for you." |
| 0:30 | Settings strip, type "a city made of cardboard and paper" | "Describe the scene in any language and check three settings." |
| 0:45 | Live progress | "Nemotron 3 Ultra splits it into a city to find and cardboard to apply. Tavily looks up the real thing, and NVera searches six sources at once." |
| 1:15 | Result card, score, checklist, Tavily panel | "Kimi compares every preview with real photos, and Nemotron 3 Super picks the winner and scores it honestly." |
| 1:40 | Open "How NVera decided" | "You can see every step, which model, how long and how much. This search cost about two cents." |
| 2:00 | Cardboard, Sunset, then type "warm colors and fog" | "Restyle with one click or just ask. Nemotron 3 Nano does it for a hundredth of a cent." |
| 2:20 | Download the GLB, open it in Blender or three.js | "Download a GLB with the creator's credit inside, ready for any engine." |
| 2:35 | 👎 "no furniture inside", then the searches-left chip | "Ratings teach it for next time. NVera runs on Nebius Token Factory and NVIDIA Nemotron. Describe it, and NVera will find it." |

Open the demo a minute before recording (free hosting may be asleep) and do one practice search so the
models are cached.
