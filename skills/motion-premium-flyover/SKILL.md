---
name: motion-premium-flyover
description: Premium 3D motion-design fly-over of a landing page — a 14.5 s, 1440×1152, 60 fps film where one continuous camera glides down the real page lying on a bright studio floor, pieces lift off toward the lens with razor-thin depth of field, the camera rises overhead and dives into the hero, which lands as a card under a two-line title (Geist + Instrument Serif). Built in WebGL2, rendered with Playwright on the real GPU, checked with optical flow. Use this skill whenever the user wants a launch film, promo, teaser, "Apple-style" or "Linear-style" video, motion design, 3D fly-over, scroll-through or showcase video of a website or landing page, or asks for a "vidéo motion design premium", "vidéo de présentation de mon site", "survol 3D de ma landing page", even if they don't say "fly-over". Also use it when the user sends a reference video to recreate shot for shot with their own texts ("refais exactement cette vidéo"); that rebuild is rendered with the motion-designer engine, never HyperFrames.
---

# Premium landing-page fly-over

One camera, never a cut. It starts low over the hero, glides backwards down the page at one steady speed while looking up it, rises straight overhead to show the whole page as one strip, dives into the hero and lands it as a card under a two-line title. Everything near the lens melts; whatever crosses the middle of the frame is sharp.

The full brief (direction, structure to the hundredth of a second, build, gotchas) is in `references/brief.md`. The maths behind every number is in `references/math.md`. Read both before changing any timing or formula: the numbers are tied together, and moving one silently breaks another.

## 0. Can you run code?

The film is rendered by scripts on the user's machine (Node 18+, ffmpeg, Chrome or Playwright Chromium, a real GPU). If you cannot run commands (claude.ai chat, no shell), say so in your first reply: here you can only build a live preview page; the MP4 needs Claude Code. Do not pretend to render.

## 1. Ask for the inputs (one message)

- the landing page link (or a local folder with an `index.html`)
- the brand name and the logo mark (SVG or PNG, square works best)
- a two-part closing line: a statement, then a short italic tail — e.g. "Ton premier poste de dev commence ici." / "Rentrée en janvier."
- a 15-second track (optional). If given, ask where its hit is, or let `audio.mjs` detect it.

Keep line 1 under ~42 characters and the tail under ~28 at these sizes (74 px and 82 px); longer lines overflow the 1440 px frame.

## 2. Set up the project

```bash
mkdir flyover && cp -r <this skill>/scripts/* flyover/ && cd flyover && npm install
```
Copy the logo next to the scripts. Write `flyover.config.json` from `flyover.config.example.json` (url, brand, logo, line1, tail, track, trackHit). Everything else has working defaults.

## 3. Capture and lock the page

```bash
node capture.mjs
```
It opens the page at 1440 px, device scale 2, scrolls to the bottom once (lazy images, scroll animations), freezes transitions and animations, turns fixed overlays off, marks the pieces that lift with `data-layer`, screenshots the page with them hidden (overlapping tiles), then each piece alone on transparent with 28 px padding, and writes `capture/capture.json` (page size, hero, sections, button, every piece's position).

Then **look at `capture/layers-debug.png`** (every piece boxed and numbered by kind). Fix the selection in the config, not in the scripts:
```json
"layers": { "include": [{ "selector": ".hero-mockup", "kind": "mockup" }], "exclude": [".cookie", "footer .chip"] }
```
Kinds: `mockup` (phone or product), `card`, `chip`, `photo`, `testimonial`, `button`. Re-run the capture after every change. If it warns that the page height is still moving, kill that animation first: any change in a section's height shifts every time after it. Lock the page before timing anything.

## 4. Stills before anything else

```bash
node stills.mjs              # 0, 1.6, 2.5, 5, 6.5, 9.3 and 11 s → stills/contact-sheet.png
```
It prints the calibration: cruise speed, start point, when the 2nd section's title and the footer title cross the centre. Show the user the contact sheet and the seven stills, say what each moment is, and wait for their go. Tune with `choreo` overrides per piece id (`{"7": {"z1": 30, "tilt": 20}}`) or `timing` (`cruise`, `start`) — see `references/tuning.md`.

What each still must show:
| t | must show |
|---|---|
| 0 | low over the hero, mockup sharp, the four 32 px logo tiles beside the button |
| 1.6 | 2nd section title in the centre, its photos blurred near the lens, tiles hanging high |
| 2.5 | two chips of section 2 flying out past the left and right edges |
| 5 | a middle section sharp in the centre, soft below, a logo tile close and blurred on the left around 5.4 |
| 6.5 | the testimonial stood up 30° with its white edge |
| 9.3 | the whole page as one centred strip, bottom edge 42 px above the frame |
| 11 | the hero as a 1018 px card at y 283, badge, line 1 and the grey italic tail |

## 5. Measure the motion

```bash
node render.mjs --preview --flat   # 30 fps, pieces at rest, only the camera moves the picture
node check.mjs
```
Analytic checks on the camera curve plus optical flow on the preview: the speed down the page must never dip or reverse, the zoom must never turn into a zoom-in during the flight, the dive only moves in. Fix every FAIL before the final render. A WARN about the 2nd title at 1.6 s means the page layout cannot satisfy both anchors; it is acceptable if the stills read well.

For a visual review at speed: `node render.mjs --preview` (30 fps, all pieces).

## 6. Final render and sound

```bash
node render.mjs          # 60 fps, 16 subframes across 0.7 of a frame → out/film.mp4
node audio.mjs           # track hit on 9.97 s, whooshes on 8.66 and 9.80 s, -14 LUFS → out/film-sound.mp4
```
Run the render in the background; on an integrated GPU expect 2–3 s per frame (30–45 min). Afterwards extract a few frames with ffmpeg and look at them before saying it is done. If the file is over ~30 MB and must reach a phone, also make a lighter copy (`-crf 22`).

## When the user sends a reference video

A reference video is the most precise brief there is. Before building anything: extract frames (4 fps contact sheets plus full-size key frames), detect scene changes and the sound events (onsets per band), measure text sizes in pixels, and give the user a scene table with times, animations, transitions and sounds. Map their text onto the same moments, confirm, then build. Compare render and reference at the same instants side by side (pairs), fix sizes, positions and timing, and repeat until they match. Never reuse the reference's logo, watermark or text, and remind the user to check they may draw on it.

**Render engine: motion-designer, never HyperFrames.** A reference rebuild is not a fly-over: build it with the `motion-designer` skill (`new_film.sh <dir> story`, one canvas drawn from `t` in `scenes.js`, `check.mjs`, `render.mjs stills` and `video`). The full procedure, the Windows settings (`CHROME` path, short output folder) and the traps met on real rebuilds are in `references/reference-rebuild.md`. Read it before starting.

## Sound: three ways

- **ElevenLabs connector** (if connected): generate each SFX as its own short generation (one sound per prompt, concrete words, no visual words), one variation each; generate a voice-over with TTS if asked. SFX come back short (≈1–3 s), so synthesize any continuous bed. Align each effect on its measured peak.
- **Built in**: `audio.mjs` synthesizes the whooshes, aligns the track's hit on 9.97 s and normalizes to -14 LUFS.
- **Video editor afterwards**: deliver the MP4 with and without sound so the user can swap music or add a voice in CapCut, DaVinci Resolve or Premiere.

## Talk to the user without code

The user never writes code or edits config. Translate every adjustment they describe ("the Python chip is too big at 2.5 s") into the config change yourself, re-render only the affected still, and show it.

## Design rules (why the film looks expensive)

- **One continuous camera.** No cuts, no crossfades, no stops or surges in the glide, no turning or sideways swing, no zoom in and back out. The camera is integrated from one speed curve, never keyed every half second — keys make micro-surges the eye reads as cheap.
- **Focus is the lighting.** Razor thin in front (75 × (focus − depth)/depth), almost none behind (6 ×). Whatever crosses the middle is sharp; the lens melts the rest. Never use glows.
- **Depth, not effects.** Pieces float 20–40 px with soft shadows that grow with height (offset 0.10z, 4 + 0.36z; blur 7 + 0.5z; 26 %). Only a few earn big lifts (hero chips, section 2, the testimonial).
- **No text over the page before the end card.** The page is the content. Type arrives only on the title card, word by word, rising out of a blur.
- **Fade into haze, cut at the end.** A card that fades with transparency shows what is behind it. Fade to the floor colour first, cut to transparent only at the very end.
- **Quiet palette.** Floor #f9fbfb → #f2f3f6, shadows #1a2133, title #121317, tail #8b8b92.

## Files

- `scripts/capture.mjs` — capture and lock the page
- `scripts/film.html`, `scripts/film.js` — the film; every frame from `window.film.seek(t)`
- `scripts/stills.mjs`, `scripts/render.mjs`, `scripts/check.mjs`, `scripts/audio.mjs`
- `assets/demo/` — a demo landing page (Kora) to rehearse on: set `"url"` to that folder
- `references/reference-rebuild.md` — rebuilding a reference video with the motion-designer engine
- `references/brief.md` — the full brief · `references/math.md` — camera, focus, lifts · `references/tuning.md` — overrides and troubleshooting
