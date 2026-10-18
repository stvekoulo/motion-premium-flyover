# Rebuilding a reference video shot for shot

Use this when the user sends a video and asks for "the same, with my texts". The fly-over scripts are not used here: the film is rebuilt with the **motion-designer** engine (`~/.claude/skills/motion-designer`). Never use HyperFrames for this; the user rejected it.

## 1. Read the reference

- Contact sheets at 4 fps (`ffmpeg -i ref.mp4 -vf fps=4,scale=480:-1,tile=6x5 sheet%d.png`), plus full-size frames at each scene change (`select='gt(scene,0.25)'`).
- Sound events: onsets per band, so every cut and every SFX has a time.
- Measure, don't guess: the height of a text band in pixels on a full-size frame gives the font size (cap height ≈ 0.7 × size). In practice the first build always comes out 20–30 % too small.
- Give the user a scene table (time, what moves, transition, sound) and the new texts mapped onto the same moments. Wait for their go.

## 2. Build with motion-designer

```bash
bash ~/.claude/skills/motion-designer/scripts/new_film.sh <film-dir> story
```

- `src/scenes.js` line 1: `film({ W: 1920, H: 1080, FPS: 60, BPM: 120, BEATS: <duration × 2> })`. Duration = BEATS × 60 / BPM.
- The page must define globals `build(stage)` (create one canvas of W×H, append it to `stage`) and `apply(t)` (draw frame `t`). Everything is drawn on that canvas from `t` only.
- **Wrap the film in its own scope** and export the two globals: `(() => { … window.build = build; window.apply = apply; })();`. `core.js` already declares `T`, `lerp`, `prog`, `clamp`, `measure`; redeclaring one at top level kills the whole script, and the check then reports `build is not defined`.
- Fonts: put them in `src/assets.js` as `window.ASSETS = { fonts: [{ family, weight, src: "data:font/woff2;base64,…" }], img: {}, sym: {} }`. `main.js` loads them with `FontFace` before the first frame. Canvas `font` strings then name the family, e.g. `600 92px Poppins`.
- Audio: if the user owns the reference's sound and wants it, extract it to `audio/edit.m4a` (`ffmpeg -i ref.mp4 -vn -c:a aac audio/edit.m4a`). Otherwise use ElevenLabs SFX or the editor route (see SKILL.md, "Sound: three ways").

## 3. Compare in pairs

The engine has no built-in comparison. Make pairs at the same instants:

```bash
node ~/.claude/skills/motion-designer/scripts/render.mjs stills <film-dir>/src/index.html cmp 0.8,2.2,3.0
ffmpeg -ss 2.2 -i ref.mp4 -frames:v 1 -vf scale=800:450 r.png
ffmpeg -i r.png -i cmp/t2.200.png -filter_complex "[1]scale=800:450[b];[0][b]hstack" pair.png
```

Stack six pairs per sheet (`vstack=6`) and look at every one: sizes, positions, words overlapping, timing of each entrance. Fix, re-render only those stills, repeat until a pass finds nothing.

## 4. Check and render

```bash
node ~/.claude/skills/motion-designer/scripts/check.mjs <film-dir>/src/index.html
node ~/.claude/skills/motion-designer/scripts/render.mjs video <film-dir>/src/index.html <short-path>/film.mp4 --audio <film-dir>/audio/edit.m4a
```

- The "loop closes" check fails for a film that ends on a card; that is expected, the rest must pass.
- Run the render in the background. Then `ffprobe` (60 fps, duration, audio stream), extract three or four frames from the file and compare them with the stills.

## Windows

- `cdp.mjs` does not find Chrome on its own: `export CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"` before `check.mjs` and `render.mjs` (doctor then reports Chrome missing; nothing needs installing).
- Long output paths fail with ENAMETOOLONG: render to a short folder (`%LOCALAPPDATA%/Temp/hfr/`) and copy the file afterwards.
- `render.mjs sheet` runs a Python step that can fail on long scratch paths (`IndexError`); use `stills` plus ffmpeg tiles instead.

## Traps met on real rebuilds

- **NaN smear.** A per-letter offset `smear * (i / (n - 1) - 0.5)` is NaN when `n = 1`: the letter is drawn nowhere, and words vanish. Guard `n > 1`.
- **Held frames read as slowness.** Count identical consecutive frames in both files at the reference's frame rate (`-vf fps=25,mpdecimate`; at 60 fps a slow move changes too little per frame and is counted as held), then bucket them per second to find the pauses. A pause with nothing moving looks slow even if the timing is right: add micro-motion during holds (a slow push-in, a light running along an outline, a drift of a few pixels) and render at 60 fps.
- **Scattered words that later form a line.** Check their scattered positions on a still: two words at the same height closer than their widths overlap.
- Rights: rebuild the style and the timing, never the reference's logo, watermark or text, and ask the user to confirm they may reuse its sound.
