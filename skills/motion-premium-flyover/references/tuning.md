# Tuning and troubleshooting

## Overrides (flyover.config.json)

```json
{
  "layers": {
    "auto": true,
    "include": [{ "selector": ".hero .device", "kind": "mockup" }],
    "exclude": [".cookie-banner", "nav .chip"],
    "max": 48
  },
  "choreo": {
    "7":  { "z1": 30, "tilt": 20 },
    "12": { "t0": 3.1, "t1": 3.9 },
    "5":  { "edge": 26 }
  },
  "timing": { "cruise": 760, "start": 260 }
}
```
- Piece ids are the numbers on `capture/layers-debug.png` and in the capture log. They change when you re-capture, so check them again.
- `choreo` fields: `z0`, `z1` (height in page px at the start and end of the lift), `tilt` (degrees at the end), `t0`, `t1` (seconds), `edge` (white edge depth, testimonial only).
- `timing` overrides the calibration. Prefer fixing the capture (hero, sections) over forcing it.

## Symptoms → causes

| symptom | cause | fix |
|---|---|---|
| far text shimmers or crawls | no mipmaps / anisotropy, or the capture was at scale 1 | keep `deviceScaleFactor: 2`; check `EXT_texture_filter_anisotropic` in the info |
| grey rectangles around pieces | blur reading a mip level coarser than the texture | `lodFor` caps the level; keep it |
| a section jumps when its piece lifts | the page height changed after capture (animation, font swap, lazy block) | kill that animation in the capture CSS, re-capture, re-time |
| a piece flashes when it fades | it fades with alpha over the page | fade toward `floorCol` first (the `uFade` path), cut at the end |
| "GL_OUT_OF_MEMORY", black frames, context lost | integrated GPU, huge textures or a long shader (Windows TDR ≈ 2 s) | per-tile textures (already); fewer pieces (`max`); close other GPU apps |
| renderer says SwiftShader / llvmpipe | no GPU in headless | use real Chrome (`channel: 'chrome'`) and the ANGLE flags; on Linux try `--use-angle=vulkan` |
| optical flow FAIL "dip or surge" | a real speed bend, or a lifted piece measured instead of the page | the flow pass already lays pieces flat; if it still fails, look at `out/flow.csv` around the time and at `share()` |
| optical flow FAIL "zoom-in" for a few frames | measurement noise on textureless frames | sustained zoom-ins only count (±5 frames); if it persists, check `D(t)` with `node check.mjs --no-flow` |
| 2nd title WARN | the page cannot satisfy both anchors (short hero, short page) | accept if the stills read well, or set `timing.start` |
| the title overflows | line 1 > ~42 characters, tail > ~28 | shorten; do not shrink the type |
| tile 3 warning | the left pass tile is on screen when it jumps or leaves | move its pass point in `buildTiles` (screen 70, 600 at z 560) |
| audio shorter than the film | lavfi inputs end early | `audio.mjs` pads to 14.5 s and cuts with `-t` |

## Render times

Integrated GPU (Intel UHD 620): ~0.6 s per frame without motion blur, ~2–3 s with 16 subframes → about 35–45 min for the final. A discrete GPU is 5–10× faster. Always run the final in the background and check a few extracted frames afterwards:

```bash
ffmpeg -ss 9.9 -i out/film.mp4 -frames:v 1 out/check-9.9.png
```
