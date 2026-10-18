# The brief (source of truth)

Every number in `scripts/film.js` comes from this brief. When a user asks for a change, find the line here first, then the matching code.

## Inputs
Ask for: the landing page link, the brand name and logo mark, a two-part closing line (a statement, then a short italic tail), and a 15-second track (optional).

## Direction
A 14.5 second 3D fly-over of the landing page, 1440×1152 at 60 fps. The page lies flat on a bright studio floor (#f9fbfb in the middle, #f2f3f6 in the corners) with a soft wide shadow around it and 24 px rounded corners. One continuous camera, never a cut: it starts low over the hero and glides backwards down the page at one steady speed while looking up it, rises straight overhead to show the whole page as one strip, dives into the hero and lands it as a card under a two-line title. Focus is razor thin in front of the subject and almost none behind it, so everything near the lens melts. Cards float a little above the page with soft shadows; photos, chips and the testimonial lift off and stand up toward the lens as the camera passes them. Four small tiles of the logo lift off beside the hero button and stay with the film until the end card. The title is Geist 500, the italic tail Instrument Serif.

**Banned:** cuts, crossfades, stops or surges in the glide, the camera turning or swinging sideways, zooming in and back out, glows, any text laid over the page before the end card.

## Structure (seconds)
Flight 0–8.2 · rise 7.75–9.25 · overhead 9.25–9.47 · dive 9.47–9.97 · title card 9.97–14.5.

| time | what happens | in code |
|---|---|---|
| 0 | camera 56° off straight-down, 1360 px from its look-at point, centred on the top half of the hero; mockup sharp; four 32 px logo tiles beside the button | `TILT`, `Dflight`, `buildTimeline` (start clamp), `buildTiles` rest |
| 0–0.6 | the glide eases in from rest | `share` |
| 0.1–1.35 | tiles lift, grow (140–200 px high) and hang toward the top corners; hero chips rise to 60–80 px and stand up 30° | `buildTiles` hang, `choreoFor` chip in hero |
| 1.25–1.6 | the glide doubles to cruising speed as the hero falls behind | `share` |
| 1.6 | the 2nd section's title passes the centre; its photos blurred near the lens | `buildTimeline` calibration |
| 1.35–2.7 | that section's photos lift to 100–130 px and stand up 46°; its two outer chips fly to ~200 px, stand up 54°, pass the edges at 2.5 | `choreoFor` inSecond |
| 1.2–2.4 | tiles trail the camera 300 px down the page, then drift out of the top | `buildTiles` (+300) |
| 3.0–7.3 | every section passes at the same steady speed, sharp in the middle, soft below; a logo tile drifts past the left edge close and blurred at 5.4 | `share` = 1, tile 3 `pass` |
| 5.45–6.3 | the testimonial rises 22 → 112 px, stands up 30°, shows a 34 px white edge | `choreoFor` testimonial, slab |
| 7.3–8.2 | the glide eases off as the footer arrives; footer title sharp at 8.0 | `share`, calibration |
| 7.75–9.25 | the rise: zoom out at an even rate while the tilt flattens (8.15–8.95); the page's bottom edge settles 42 px above the frame bottom | `riseT`, edge-hold camera |
| 9.25–9.47 | the whole page as one centred strip, creeping 3.5 % closer | `camRaw` overhead |
| 9.47–9.97 | the dive: top edge pinned to the frame top while it grows, everything below the hero fades out, then the top drops to y 283 so the hero lands as a 1018 px card with 38 px corners and a soft shadow; two tiles on its top corners, one crisp at the right edge, two huge soft blurs drift in at the bottom corners | `camRaw` dive, `maskAt`, end tiles |
| 10.02 | white badge pill (logo + brand, 21 px) fades in at y 44 | `updateTitle` |
| 10.12 | line 1 at 74 px, one word every 0.06 s | `updateTitle` |
| 10.36 | italic tail at 82 px in grey #8b8b92, one word every 0.05 s; each word rises 16 px out of a 12 px blur in 0.34 s | `updateTitle` |
| 10.6–14.5 | hold, the card creeping 2 % closer, tiles drifting a few px | `camRaw` hold, `drift` |

## Build
1. Open the link in headless Chromium (Playwright) at 1440 px wide, device scale 2, scroll to the bottom once so lazy images and scroll animations finish. Mark the pieces that lift (cards, phone or product mockups, chips, feature photos, the testimonial, the hero button) with `data-layer`. Screenshot the full page with them hidden, then each piece alone on a transparent background with 28 px padding, and save every piece's page position to a JSON. → `capture.mjs`
2. One WebGL2 film page, 1440×1152, every frame computed from time inside `seek(t)`: no timers, no CSS transitions. The page is a textured quad on the floor and each piece its own quad at its height, drawn lowest first with no depth buffer. Use mipmaps and 16× anisotropic filtering or the far text shimmers. → `film.js`
3. Drive the camera from one speed curve, never from a position key every half second. Focal length 1880 px, 56° tilt, distance easing out from 1360 to 1700 px and never back in, no turning. Speed as a share of cruise (about 770 page px/s): 0 at 0 s, 0.5 by 0.6 s, held at 0.5 to 1.25 s, 1.0 by 1.6 s, held between 0.94 and 1.1 to 7.3 s, then easing to 0.12 by 8.3 s. Integrate it into the page position.
4. Depth of field per pixel: blur radius = 75 × (focus − depth)/depth in front of the focus and 6 × (depth − focus)/depth behind it, capped at 120 px, 40 taps on a golden-angle disc, each tap read from a mip level matched to the blur. Keep the focus on whatever crosses the middle of the frame.
5. A lifted piece stands up by turning about its own middle, top edge rising toward the lens. Each casts a shadow on whatever is under it: the same picture in flat #1a2133, offset (0.10z, 4 + 0.36z), blurred 7 + 0.5z, 26 % opacity.
6. Rise: zoom out in log scale with a smooth trapezoid speed (speeding up 7.75–8.35, even 8.35–8.95, slowing to a stop at 9.25) and hand the glide over to a camera that holds the page's bottom edge at the 42 px line from 8.3 to 8.65. Dive: log scale on a quadratic ease in-out, then solve the look-at point from the pinned edge. A rounded-rect mask morphs from the full page to the hero, 24 → 38 px corners.
7. Render with Playwright on the real GPU (`--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`): 60 fps, 16 subframes across 0.7 of a frame for motion blur, H.264 MP4. The track's hit goes on 9.97 s, whooshes on 8.66 and 9.80. → `render.mjs`, `audio.mjs`

## Gotchas
- If you cannot run code on the user's computer, say straight away that you can only make a live preview and that the MP4 needs Claude Code.
- Phones or cards that fade out with transparency show whatever is behind them: fade them into the haze colour first and only cut to transparent at the very end.
- Keep most lifts tiny (20–40 px) and lock the page before timing anything: any change in a section's height shifts everything after it.
- Before the final render, measure a quick 30 fps preview with optical flow: the speed down the page must never dip and the zoom must never turn into a zoom-in during the flight. → `check.mjs`

## Start
Ask for the inputs, capture the page, then show stills at 0, 1.6, 2.5, 5, 6.5, 9.3 and 11 seconds before rendering.
