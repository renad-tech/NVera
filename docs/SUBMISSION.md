# NVera: Devpost submission

- Project: NVera
- Tagline: Describe a scene, get a 3D model you can actually use.
- Track: Best Apps and Agents (also entering the Tavily prize)
- Demo: https://nvera.onrender.com (open to everyone, no sign-up)
- Code: https://github.com/renad-tech/NVera (MIT)
- Video: https://youtu.be/JvEnHQdBEJI
- New project: yes, started during the submission period (September 2026)

## Inspiration
I love video games and I watch a lot of videos about how the games I like are made and it's so fun and inspiring. I noticed that designing the game environments takes a really long time so I researched why there's no AI that can generate a full 3D environment and I found that the tools today only make one object at a time and it usually needs a lot of fixing. So I thought if I can't generate it yet I can at least make the job easier because there are already millions of free high quality 3D models out there and the hard part is finding the right one and that's what NVera does

## What it does
You just type what you need in English or Arabic like "a cozy café with wooden tables and plants" and NVera looks up what the real thing looks like then searches free 3D libraries like Poly Haven, Sketchfab, Poly Pizza and the Smithsonian at once and compares every model with real photos and gives you an honest score. You can also change the style like "make it cardboard at sunset" and download it for free with the creator and license inside the file.
NVera never trusts a model's title. every pick is checked against real photos, and you can see exactly why it won.

And with NVera Studio you can build a whole scene from one sentence. Nemotron plans every object with its real size and place, NVera finds a free model for each one, you can move, turn and resize everything and give the whole scene one look, then download it with one credits file for every creator.

## How I built it
All the AI runs on Nebius Token Factory with NVIDIA Nemotron, where 3 Ultra understands the request and plans the Studio scenes, 3.5 Super VL is the judge that looks at the images, 3 Super makes the final pick and 3 Nano does the style edits. Tavily finds real photos and searches the libraries, and a full search costs about half a cent.
tavily is used three ways: real photos to judge every model, one search across the 3D libraries, and pulling direct .glb links from the web.

## How each model works:
- nemotron 3 ultra reads the request and splits it into what to find (the shape) and how it should look (the style). "a city made of cardboard" becomes: find a city, then make it cardboard.
- tavily searches the web for real photos and facts about it.
- the free 3D libraries are searched at the same time: poly haven, sketchfab, poly pizza, the smithsonian.
- nemotron 3.5 super vl looks at all the model previews in one numbered grid next to the real photos, and scores how well each one matches.
- nemotron 3 super makes the final pick from the judge's shortlist and writes the honest score and checklist.
- nemotron 3 nano edits the look when you ask, for about a hundredth of a cent.
- in the studio, nemotron 3 ultra plans the scene: which objects, their real size in meters, where they stand and which way they face.

## Challenges I ran into
At first it gave an empty room 9/10 just because the name matched so I added real photos and a vision judge to fix it. Also "a cardboard city" doesn't exist as a model so I made it find a city first and then turn it into cardboard. And Sketchfab doesn't let apps download with my account so I added other free sources and put Sketchfab last and if the best model is on Sketchfab NVera shows it with a button that takes you to Sketchfab so you can log in and download it from there.
When I moved the judge to Nemotron VL I found it only accepts 8 images at once and NVera sends up to 12, so now NVera puts all the previews in one numbered grid image and the judge reads every tile.

## Accomplishments that I'm proud of
I'm really proud that my idea turned out exactly how I imagined it and when it finally worked I showed it to my whole family haha. I'm also proud that it's honest and tells you what's missing instead of pretending the result is perfect and it works in Arabic and anyone can try it for free with limits so nobody can use up my credits.
I also tested it for real: 30 requests where I marked the results without knowing which method picked what. a plain title search picked the right model 63% of the time, NVera 83%.

Then I asked students at my university to try it. the 3 who tried it all rated it 5/5 for usefulness, 2 found exactly what they asked for and 1 found something close, and ease of use was 4.7/5. 2 of them said that without NVera they wouldn't even know where to look for a 3D model.
- "A beautiful and important idea for people who own 3D printers or are into 3D printing." — Bandar, Business Administration
- "A promising idea that helps move smart search tools forward and boosts creativity." — Rayan, Health major
- "Really beautiful, mashallah!" — Rahaf, Health major

Rahaf said the dark look was too heavy on the eyes, so I changed NVera to a softer, calmer theme.

## What I learned
Good results come from the system around the AI not just from a bigger model and being new to coding doesn't have to limit your ideas

## Small things i'm proud of:
- shape and style are separate. there's no "cardboard city" model online, so NVera finds a city and makes it cardboard itself, right in the browser, without generating anything.
- the creator and license are written inside every downloaded file, so the credit never gets lost.
- your ratings teach it. a liked or disliked result is shown to the models next time someone asks for something similar.
- if the best result scores under 6/10, it searches again with broader words before giving up.
- every step has a backup model, so one model being down never breaks a search.
- turning "thinking" off for the judge cut a search from $0.037 to under 1 cent, with the same quality.
- you can type in arabic, and nemotron turns it into english search words.
- you can open "how NVera decided" and see every model, how long it took and what it cost.
- 15 offline tests check the search, the judge's backup, the ratings and the rate limits.

## What's next for NVera
next i want NVera to go where game developers already work. a blender or unity plugin where you describe a scene and the model drops straight into your project, no downloading and importing.
i also want the studio to grow: bigger worlds like whole villages and levels, and saving scenes to share with your team.
and sketchfab login so sketchfab downloads work for everyone, and a light mode for people who prefer it.

## Feedback on Token Factory and NVIDIA models

what worked well:
- one openai-compatible endpoint for many open models made it easy to give every step the right model and switch it in .env
- the nemotron family covered every job: ultra for planning and analysis, super for the final pick, nano for quick edits, and 3.5 super vl for judging images
- moving the image judge to nemotron 3.5 super vl cut its cost about 3x with the same quality in my tests
- /v1/models?verbose=true with prices per model is great, i built all my cost tracking on it
- json mode was reliable with nemotron
- nemotron 3 ultra understood arabic requests and returned clean english search words without extra prompting

what could be better:
- nemotron 3.5 super vl accepts at most 8 images per request, and i only found out from a 400 error during a real search. putting limits like this in /v1/models (max images, context size, vision yes/no) would save time
- turning "thinking" off works differently between models (thinking vs enable_thinking). one documented switch for all models would help
- there's no endpoint for remaining credit or spend, so i had to estimate it from my own logs
- deepseek-r1-0528 started returning 404 without notice. deprecation dates or aliases in /v1/models would help
- a cost header on each response would make cost tracking exact
