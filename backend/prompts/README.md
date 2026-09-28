# NVera AI team

NVera **finds** ready-made 3D models and **restyles** their look - it never creates or reshapes them.
Each AI has exactly one job. Its file here is its system prompt: **Soul** (who it is),
**Job** (the one thing it does), **Not your job** (what the others do), **Rules**, **Output**.

| File | Model | Job | Sees images? |
|---|---|---|---|
| [scene_analyzer.md](scene_analyzer.md) | Nemotron 3 Ultra | Splits the request into **shape** (search terms, must-haves) and **look** (restyle) | No |
| [vision_judge.md](vision_judge.md) | Kimi K2.6 | Looks at every candidate's preview and ranks them | Yes |
| [quality_inspector.md](quality_inspector.md) | Nemotron 3 **Super** (Hermes 4 fallback) | Makes the final pick and explains it honestly to the user | No |
| [restyler.md](restyler.md) | Nemotron 3 **Nano** (Ultra fallback) | Edits the look from chat (“make it cardboard at night”) | No |

**Tavily** is the team's window on the real world (no prompt file - it's a search API):
- `agents/researcher.py` - researches what the requested thing really looks like (photos + facts) -> Kimi and the Quality Inspector
- `sources/tavily_libraries.py` - natural-language search across Sketchfab, Poly Pizza and OpenGameArt at once
- `sources/web.py` - Tavily Search + **Extract** read whole pages to find direct `.glb` downloads

Non-AI steps (search, download) live in `backend/sources/` and `backend/agents/downloader.py`.

Edit these files to change behavior - no code changes needed. The backend reads them on startup.
Keep the **Output** section in sync with the code that parses it.
