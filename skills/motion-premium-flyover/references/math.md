# The maths

Coordinates are page pixels: X to the right (0–1440), Y down the page (0–page height), Z up from the floor toward the camera. The page lies at Z = 0.

## Camera

Look-at point L = (720, Ly, 0). Distance D, tilt θ (0 = straight down).

```
camera C = (720, Ly + D·sinθ, D·cosθ)
forward f = (0, −sinθ, −cosθ)    right r = (1, 0, 0)    up u = (0, −cosθ, sinθ)
screen x = 720 + F·(v·r)/(v·f)    screen y = 576 − F·(v·u)/(v·f)    with v = P − C, F = 1880
```
The camera sits further down the page than the point it looks at, so it looks *up* the page: content enters at the bottom (near, blurred), sharpens in the middle, recedes to the top (far, almost sharp).

At θ = 56° and D = 1360 the frame shows the floor from about Ly − 1360 (top) to Ly + 510 (bottom), and ~1040 page px of width at the centre: the page overflows the sides, which is what makes the photos pass the edges.

## Speed curve, integrated

`share(t) = 0.5·ss(0, 0.6) + 0.5·ss(1.25, 1.6) − 0.88·ss(7.3, 8.3)` where `ss` is smoothstep. It is 0 at rest, 0.5 on the first plateau, 1.0 at cruise, 0.12 at 8.3 s. The position is its integral, in closed form (∫smoothstep over [a, b] is (b − a)·(u³ − u⁴/2)):

```
Ly(t) = start + cruise · S(t),   S(t) = ∫₀ᵗ share
```
Integrating one curve guarantees continuous speed and acceleration; keyframing positions every half second never does (each key bends the speed a little, and the eye reads every bend as a surge).

**Calibration.** Two anchors: the 2nd section title at the centre at 1.6 s, the footer title at 8.0 s. Two unknowns: start and cruise.
```
cruise = (Yfooter − Ysecond) / (S(8.0) − S(1.6))      start = Ysecond − cruise · S(1.6)
```
`start` must stay in the top half of the hero (12–45 % of its height). If it does not, it is clamped and cruise is re-solved from the footer alone; the 2nd title then crosses at another time (reported as a WARN). Cruise is kept between 520 and 1150 px/s. About 770 px/s for a typical 7–9 000 px page.

## Distance

Flight: `D = 1360 + 340·(1 − (1 − t/8.2)³)` — eases out, never back in.

Rise (7.75–9.25): zoom in log space. Its speed is a smooth trapezoid `ss(7.75, 8.35) − ss(8.95, 9.25)`, area 1.05 s:
```
D(t) = Dflight(t) · exp( ln(Dend/1700) · R(t)/1.05 )      Dend = F · pageH / (1152 − 2·42)
```
`Dend` makes the whole page exactly 1068 px tall overhead: 42 px above and below.

**Edge-holding camera.** For a point at distance d below the look-at point, screen y = 576 + F·cosθ·d / (D − sinθ·d). Solving for screen y = 1110 (42 px above the bottom):
```
d = 534·D / (F·cosθ + 534·sinθ)        Ly_edge = pageH − d
```
From 8.3 to 8.65 s the glide hands over to this camera with a smoothstep blend, so the bottom edge settles on its line while the zoom keeps running.

## Overhead and dive

Overhead creep: `ln D += ln(0.965)·ss(9.25, 9.62)`. Dive: `ln D += ln(Dcard / (0.965·Dend))·easeInOutQuad((t − 9.47)/0.5)`, with `Dcard = F·1440/1018` (the page width becomes 1018 px).

Look-at from the pinned top edge: overhead, screen y of page Y = 0 is 576 − F·Ly/D, so
```
Ly = (576 − yTop) · D / F,      yTop: pinned at its 9.47 s value, then eased to 283 by 9.97 s
```
The centred rule (Ly = pageH/2) and the pinned rule are blended over 9.40–9.56 s.

Mask: rounded rect from (0, 0, 1440, pageH) to (0, 0, 1440, heroBottom), radius 24 → 38·Dcard/F page px (= 38 screen px on the card), `smootherstep(9.55, 9.95)`. Below the hero, colour fades to the floor colour over 9.47–9.80 s first; the mask cuts after.

## Depth of field

Depth = (P − C)·f. Focus = D (the look-at point).
```
r = 75·(focus − depth)/depth   (in front)        r = 6·(depth − focus)/depth   (behind)        r ≤ 120 px
```
Each object blurs itself in its own shader: the page, every piece, every shadow. Taps on a golden-angle disc (angle i·2.39996, radius r·√((i + 0.5)/N)), N = 12 / 24 / 40 for r < 3 / < 8 / ≥ 8 px. Screen offsets become texture offsets through the pixel's derivatives (dFdx, dFdy), and each tap reads one trilinear sample at the mip level matched to the tap spacing (`lod = log2(spacing in texels)`, capped so a small texture never collapses to its average). Sharp pixels (r < 1) take one anisotropic sample. Taps outside a piece's texture count as transparent, so blurred silhouettes stay soft.

Blurring per object instead of in a post pass keeps the soft edges of near pieces correct: there is no hard silhouette against a sharp background behind them.

## Lifted pieces

Stand-up: rotate about the piece's own horizontal middle. A local offset (dx, dy) becomes (dx, dy·cosα, −dy·sinα): the top edge (dy < 0) rises toward the lens. Height and angle follow `smootherstep(t0, t1)`.

Shadow on the surface underneath (page or parent card): the piece's alpha, offset (0.10z, 4 + 0.36z), disc blur 7 + 0.5z page px (combined in quadrature with the depth-of-field blur), #1a2133 at 26 %, footprint shortened by cosα.

The testimonial's white edge is a second quad at α + 90°, hanging from the bottom edge of the face along −normal, 34 px deep.

Draw order: floor, page shadow, page tiles, then pieces and tiles sorted by height (lowest first), each as shadow → edge → face. No depth buffer.

## Motion blur

16 subframes at t + ((i + 0.5)/16 − 0.5)·0.7/60, each rendered into an RGBA16F target and added at 1/16. The final pass dithers by ±1/255 so the floor gradient never bands.
