// The film. Every frame is a pure function of time: window.film.seek(t). No timers, no CSS transitions.
// One continuous camera driven by a speed curve, the page as a textured quad on a studio floor,
// each lifted piece its own quad (lowest first, no depth buffer), per-pixel depth of field.

const F = 1880, W = 1440, H = 1152, DUR = 14.5, DEG = Math.PI / 180, TILT = 56 * DEG;
const CARD_W = 1018, CARD_TOP = 283, EDGE_LINE = 42;

// ---------- easing ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const ss = (a, b, t) => { const u = clamp((t - a) / (b - a)); return u * u * (3 - 2 * u); };
const sms = (a, b, t) => { const u = clamp((t - a) / (b - a)); return u * u * u * (u * (u * 6 - 15) + 10); };
const ssInt = (a, b, t) => { if (t <= a) return 0; const L = b - a; if (t >= b) return L / 2 + (t - b); const u = (t - a) / L; return L * (u * u * u - u * u * u * u / 2); };
const easeOutCubic = u => 1 - Math.pow(1 - clamp(u), 3);
const easeInOutQuad = u => (u = clamp(u), u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const rand = i => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

// ---------- speed curve (share of cruise) and its integral ----------
// 0 at 0s, 0.5 by 0.6s, 0.5 to 1.25s, 1.0 by 1.6s, 1.0 to 7.3s, 0.12 by 8.3s.
const share = t => 0.5 * ss(0, 0.6, t) + 0.5 * ss(1.25, 1.6, t) - 0.88 * ss(7.3, 8.3, t);
const S = t => 0.5 * ssInt(0, 0.6, t) + 0.5 * ssInt(1.25, 1.6, t) - 0.88 * ssInt(7.3, 8.3, t);
// Rise: log-zoom speed is a smooth trapezoid 7.75→8.35 up, even to 8.95, down to 0 at 9.25.
const RISE_AREA = ssInt(7.75, 8.35, 9.25) - ssInt(8.95, 9.25, 9.25);
const riseT = t => (ssInt(7.75, 8.35, t) - ssInt(8.95, 9.25, t)) / RISE_AREA;
const Dflight = t => 1360 + 340 * easeOutCubic(t / 8.2);           // eases out, never back in

let CAP, CFG, TL, gl, P = {}, ITEMS = [], TILES = [], dom = {};

// ---------- timeline built from the capture ----------
function buildTimeline(cap, cfg) {
  const pageH = cap.pageH, hero = cap.hero, heroB = hero.y + hero.h;
  const Y2 = cap.second ? cap.second.titleY : heroB + 220;
  const Yf = cap.footer ? cap.footer.titleY : pageH - 200;
  const notes = [];
  let C = (Yf - Y2) / (S(8.0) - S(1.6)), p0 = Y2 - C * S(1.6);
  const p0min = hero.y + 0.12 * hero.h, p0max = hero.y + 0.45 * hero.h;
  if (p0 < p0min || p0 > p0max) {
    p0 = clamp(p0, p0min, p0max); C = (Yf - p0) / S(8.0);
    notes.push('start clamped to the top half of the hero; the 2nd title will not cross the centre exactly at 1.6s');
  }
  if (C < 520 || C > 1150) { notes.push(`cruise ${Math.round(C)} px/s is outside 520–1150: page is very ${C < 520 ? 'short' : 'long'}`); C = clamp(C, 520, 1150); }
  if (cfg.timing && cfg.timing.cruise) C = cfg.timing.cruise;
  if (cfg.timing && cfg.timing.start != null) p0 = cfg.timing.start;
  const glide = t => p0 + C * S(t);
  const passTime = Y => { let a = -4, b = 8.3; if (glide(b) < Y) return 99; for (let i = 0; i < 50; i++) { const m = (a + b) / 2; (m < 0 ? p0 + C * share(0) * m : glide(m)) < Y ? a = m : b = m; } return (a + b) / 2; };
  const Dend = F * pageH / (H - 2 * EDGE_LINE);
  const Dcard = F * 1440 / CARD_W;
  const tl = { pageH, heroB, p0, C, glide, passTime, Dend, Dcard, notes };
  tl.D47 = camRaw(tl, 9.47).D;
  tl.t2 = passTime(Y2); tl.tf = passTime(Yf);
  return tl;
}

function camRaw(tl, t) {
  let D, th, Ly;
  if (t <= 9.25) {
    D = Dflight(t) * Math.exp(Math.log(tl.Dend / 1700) * riseT(t));
    th = TILT * (1 - ss(8.15, 8.95, t));
    const d = (H / 2 - EDGE_LINE) * D / (F * Math.cos(th) + (H / 2 - EDGE_LINE) * Math.sin(th));
    Ly = lerp(tl.glide(t), tl.pageH - d, ss(8.3, 8.65, t));         // hand the glide to the edge-holding camera
  } else {
    th = 0;
    if (t <= 9.97) {
      const lc = Math.log(0.965) * ss(9.25, 9.62, t);                // overhead: creep 3.5% closer
      const ld = Math.log(tl.Dcard / (tl.Dend * 0.965)) * easeInOutQuad((t - 9.47) / 0.5);   // dive: log scale, quadratic in-out
      D = tl.Dend * Math.exp(lc + ld);
    } else D = tl.Dcard * (1 - 0.02 * ss(9.97, 14.5, t));             // title card: creep 2% closer
    const yTop47 = H / 2 - (tl.pageH / 2) * F / (tl.D47 || D);
    const yTop = lerp(yTop47, CARD_TOP, ss(9.70, 9.97, t));          // top edge pinned, then drops to 283
    Ly = lerp(tl.pageH / 2, (H / 2 - yTop) * D / F, ss(9.40, 9.56, t));
  }
  return { Lx: 720, Ly, D, th };
}

function cameraAt(t) {
  const c = camRaw(TL, t), s = Math.sin(c.th), co = Math.cos(c.th);
  c.pos = [c.Lx, c.Ly + c.D * s, c.D * co];
  c.f = [0, -s, -co]; c.r = [1, 0, 0]; c.u = [0, -co, s];
  return c;
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
function project(c, p) { const v = sub(p, c.pos), z = dot(v, c.f); return [W / 2 + F * dot(v, c.r) / z, H / 2 - F * dot(v, c.u) / z, z]; }
function unproject(c, sx, sy, z) {
  const a = (sx - W / 2) / F, b = -(sy - H / 2) / F;
  const d = [c.f[0] + a * c.r[0] + b * c.u[0], c.f[1] + a * c.r[1] + b * c.u[1], c.f[2] + a * c.r[2] + b * c.u[2]];
  const k = (z - c.pos[2]) / d[2];
  return [c.pos[0] + k * d[0], c.pos[1] + k * d[1], z];
}
function coc(depth, focus) { const r = depth < focus ? 75 * (focus - depth) / depth : 6 * (depth - focus) / depth; return Math.min(r, 120); }

function viewProj(c) {
  const sx = F / (W / 2), sy = F / (H / 2), n = 2, fa = 1e7, A = (fa + n) / (fa - n), B = -2 * fa * n / (fa - n);
  const rows = [
    [sx * c.r[0], sx * c.r[1], sx * c.r[2], -sx * dot(c.r, c.pos)],
    [sy * c.u[0], sy * c.u[1], sy * c.u[2], -sy * dot(c.u, c.pos)],
    [A * c.f[0], A * c.f[1], A * c.f[2], -A * dot(c.f, c.pos) + B],
    [c.f[0], c.f[1], c.f[2], -dot(c.f, c.pos)]];
  const m = new Float32Array(16);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) m[col * 4 + row] = rows[row][col];
  return m;
}

// ---------- page mask, fades ----------
function maskAt(t) {
  const m = sms(9.55, 9.95, t);
  return { rect: [0, 0, CAP.pageW, lerp(TL.pageH, TL.heroB, m)], radius: lerp(24, 38 * TL.Dcard / F, m), fade: ss(9.47, 9.80, t) };
}

// ---------- choreography of the lifted pieces ----------
function choreoFor(l, i, all) {
  const cy = l.y + l.h / 2, inHero = cy < TL.heroB;
  const sec = CAP.second, inSecond = sec && cy >= sec.y && cy < sec.y + sec.h;
  const tp = TL.passTime(cy), r = rand(i + 1);
  const passing = (z1, tilt) => ({ z0: 4, z1, tilt, t0: Math.max(0.05, tp - 1.0), t1: Math.max(0.6, tp - 0.12) });
  let c;
  switch (l.kind) {
    case 'button': c = { z0: 14, z1: 14, tilt: 0, t0: 0, t1: 1 }; break;
    case 'mockup': c = inHero ? { z0: 30, z1: 30, tilt: 0, t0: 0, t1: 1 } : passing(34, 18); break;
    case 'card': c = { z0: 18 + 6 * r, z1: 18 + 6 * r, tilt: 0, t0: 0, t1: 1 }; break;
    case 'testimonial': c = { z0: 22, z1: 112, tilt: 30, edge: 34, t0: Math.max(0.1, tp - 0.85), t1: Math.max(0.9, tp) }; break;
    case 'photo': c = inSecond ? { z0: 6, z1: 100 + 30 * r, tilt: 46, t0: 1.35, t1: 2.7 } : inHero ? { z0: 26, z1: 26, tilt: 0, t0: 0, t1: 1 } : passing(26 + 14 * r, 28); break;
    case 'chip': c = inHero ? { z0: 4, z1: 60 + 20 * r, tilt: 30, t0: 0.1 + 0.07 * (i % 4), t1: 1.35 } : passing(22 + 18 * r, 24); break;
    default: c = passing(24, 20);
  }
  if (l.kind === 'chip' && inSecond) {   // the two outermost chips of section 2 fly up and pass the edges at 2.5s
    const chips = all.filter(m => m.kind === 'chip' && (m.y + m.h / 2) >= sec.y && (m.y + m.h / 2) < sec.y + sec.h);
    const sorted = chips.slice().sort((a, b) => a.x - b.x);
    if (sorted.length && (l === sorted[0] || l === sorted[sorted.length - 1])) c = { z0: 4, z1: 200, tilt: 54, t0: 1.35, t1: 2.5 };
  }
  return Object.assign(c, (CFG.choreo || {})[l.id] || {});
}

function itemState(it, t) {
  const c = it.chore, u = sms(c.t0, c.t1, t);
  let z = lerp(c.z0, c.z1, u), tilt = (c.tilt || 0) * DEG * u;
  const settle = ss(7.9, 9.0, t);                       // pieces settle back before the page becomes a card
  z = lerp(z, Math.min(z, 24), settle); tilt *= 1 - settle;
  return { z, tilt };
}

// ---------- logo tiles ----------
function buildTiles() {
  const b = CAP.button || { x: 200, y: CAP.hero.y + CAP.hero.h * 0.6, w: 220, h: 52 };
  const right = b.x + b.w + 54 + 4 * 42 < CAP.pageW;
  const rest = i => [right ? b.x + b.w + 38 + i * 42 : b.x - 38 - i * 42, b.y + b.h / 2];
  const c135 = cameraAt(1.35), c54 = cameraAt(5.4);
  const hang = [[150, 160, 190, 84], [318, 70, 150, 64], [1300, 140, 175, 80], [1140, 62, 142, 60]]
    .map(([sx, sy, z, s]) => { const p = unproject(c135, sx, sy, z); return { x: p[0], y: p[1], z, s }; });
  const pass = (() => { const p = unproject(c54, 70, 600, 560); return { x: p[0], y: p[1], z: 560, s: 92 }; })();
  const hb = TL.heroB, hh = CAP.hero.h;
  const end = [{ x: 34, y: 26, z: 64, s: 70 }, { x: 1406, y: 40, z: 92, s: 62 }, { x: 1448, y: hh * 0.56, z: 18, s: 56 }];
  // the two huge soft blurs are anchored to the frame, so they drift in from the bottom corners whatever the camera does
  const blurs = [{ from: [-260, 1330], to: [86, 1080], z: 900, s: 150 }, { from: [1700, 1340], to: [1368, 1096], z: 820, s: 136 }];
  const drift = (i, t) => { const k = ss(9.97, 11, t); return [k * 3.5 * Math.sin(0.8 * t + i * 1.7), k * 2.5 * Math.cos(0.6 * t + i * 2.3)]; };

  const tiles = [];
  for (let i = 0; i < 4; i++) tiles.push({ i, state(t) {
    const [rx, ry] = rest(i), h = hang[i];
    const uxy = sms(0.1 + 0.06 * i, 1.35, t), uz = easeOutCubic((t - 0.1 - 0.06 * i) / (1.25 - 0.06 * i));
    let x = lerp(rx, h.x, uxy), y = lerp(ry, h.y, uxy) + 300 * sms(1.2, 2.4, t), z = lerp(2, h.z, uz), s = lerp(32, h.s, uxy), a = 1;
    if (i === 3) { if (t >= 4.6) { x = pass.x + 24 * (t - 5.4); y = pass.y; z = pass.z; s = pass.s; } if (t >= tiles.tOff3) a = 0; }
    else { const v = sms(8.7, 9.95, t), e = end[i], [dx, dy] = drift(i, t); x = lerp(x, e.x, v) + dx; y = lerp(y, e.y, v) + dy; z = lerp(z, e.z, v); s = lerp(s, e.s, v); }
    return { x, y, z, s, a };
  } });
  blurs.forEach((bl, j) => tiles.push({ i: 4 + j, state(t) {
    if (t < 9.45) return { x: 0, y: 0, z: 0, s: 0, a: 0 };
    const v = sms(9.5, 11.2, t), [dx, dy] = drift(4 + j, t);
    const p = unproject(cameraAt(t), lerp(bl.from[0], bl.to[0], v) + dx, lerp(bl.from[1], bl.to[1], v) + dy, bl.z);
    return { x: p[0], y: p[1], z: bl.z, s: bl.s, a: 1 };
  } }));
  // the teleport of tile 3 must happen off screen
  const s46 = tiles[3].state(4.6), p46 = project(cameraAt(4.6), [s46.x, s46.y, s46.z]);
  const onScreen = (t, st) => { const p = project(cameraAt(t), [st.x, st.y, st.z]); return p[2] > 0 && p[0] > -150 && p[0] < W + 150 && p[1] > -150 && p[1] < H + 150; };
  if (onScreen(4.6, s46)) console.warn('[film] tile 3 is visible when it jumps at 4.6s');
  tiles.tOff3 = 99;                                   // tile 3 leaves once it is out of the frame after its pass
  for (let t = 5.6; t < 7.7; t += 0.02) if (!onScreen(t, tiles[3].state(t))) { tiles.tOff3 = t; break; }
  if (tiles.tOff3 > 7.7) { tiles.tOff3 = 7.7; console.warn('[film] tile 3 never leaves the frame before the rise; it is removed at 7.7s'); }
  return tiles;
}

// ---------- GL ----------
const HEAD = `#version 300 es
precision highp float;
uniform vec3 uCam; uniform vec3 uFwd; uniform float uFocus; uniform vec2 uRes;
vec3 floorCol(vec2 fc){ vec2 q=(fc/uRes-0.5)*2.; float d=clamp(length(q)/1.41421,0.,1.); d=d*d*(3.-2.*d); return mix(vec3(0.9765,0.9843,0.9843), vec3(0.9490,0.9529,0.9647), d); }
float coc(float depth){ float r = depth<uFocus ? 75.*(uFocus-depth)/depth : 6.*(depth-uFocus)/depth; return min(r,120.); }
float sdRR(vec2 p, vec4 m, float r){ vec2 c=(m.xy+m.zw)*.5, h=(m.zw-m.xy)*.5; vec2 q=abs(p-c)-h+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
const float GA = 2.39996323;
int taps(float r){ return r<3. ? 12 : r<8. ? 24 : 40; }   // 40 taps on a golden-angle disc once the blur is wide
float inside(vec2 uv){ vec2 a=step(vec2(0.),uv)*step(uv,vec2(1.)); return a.x*a.y; }
float lodFor(sampler2D t, vec2 gx, vec2 gy, float k){ vec2 ts=vec2(textureSize(t,0)); return min(log2(max(1.,k*max(length(gx*ts),length(gy*ts)))), log2(min(ts.x,ts.y))-3.); }
`;
const VS_FULL = `#version 300 es
out vec2 vUV; void main(){ vec2 p=vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUV=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;
const FS_FLOOR = HEAD + `out vec4 o; void main(){ o=vec4(floorCol(gl_FragCoord.xy),1.); }`;
const FS_COPY = `#version 300 es
precision highp float; uniform sampler2D uSrc; uniform float uWeight; in vec2 vUV; out vec4 o; void main(){ o=texture(uSrc,vUV)*uWeight; }`;
const FS_FINAL = `#version 300 es
precision highp float; uniform sampler2D uSrc; in vec2 vUV; out vec4 o;
float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){ vec3 c=texture(uSrc,vUV).rgb; c += (h(gl_FragCoord.xy)+h(gl_FragCoord.yx+17.)-1.)/255.; o=vec4(c,1.); }`;

const VS_PAGE = `#version 300 es
uniform mat4 uVP; uniform vec4 uQuad; out vec2 vP; out vec3 vW;
void main(){ vec2 c=vec2(gl_VertexID&1, gl_VertexID>>1); vec2 p=mix(uQuad.xy,uQuad.zw,c); vP=p; vW=vec3(p,0.); gl_Position=uVP*vec4(p,0.,1.); }`;
const FS_PAGE = HEAD + `
uniform sampler2D uTex; uniform float uTileTop, uTileH, uPageW; uniform vec4 uMask; uniform float uRad, uFade, uFadeY;
in vec2 vP; in vec3 vW; out vec4 o;
vec2 tuv(vec2 p){ return vec2(p.x/uPageW, (p.y-uTileTop)/uTileH); }
vec3 tapLod(vec2 p, float lod){ return textureLod(uTex, tuv(p), lod).rgb; }
void main(){
  vec2 gx=dFdx(vP), gy=dFdy(vP); float fw=max(length(gx),length(gy));
  float r=coc(dot(vW-uCam,uFwd)); vec4 acc=vec4(0.);
  if(r<1.){ float cov=clamp(.5-sdRR(vP,uMask,uRad)/fw,0.,1.); vec2 s=vec2(1./uPageW,1./uTileH); acc=vec4(textureGrad(uTex,tuv(vP),gx*s,gy*s).rgb,1.)*cov; }
  else { int N=taps(r); float fn=float(N), k=max(1.,1.77*r/sqrt(fn)); vec2 ts=vec2(textureSize(uTex,0)); vec2 s=ts/vec2(uPageW,uTileH);
    float lod=log2(max(1.,k*max(length(gx*s),length(gy*s))));
    bool deep = sdRR(vP,uMask,uRad) < -(r+2.)*fw;              // whole disc inside the page: no per-tap mask
    for(int i=0;i<N;i++){ float fi=float(i), a=fi*GA, rr=r*sqrt((fi+.5)/fn); vec2 off=rr*vec2(cos(a),sin(a)); vec2 p=vP+off.x*gx+off.y*gy;
      float cov=deep ? 1. : clamp(.5-sdRR(p,uMask,uRad)/(fw*k),0.,1.); acc+=vec4(tapLod(p,lod),1.)*cov; }
    acc/=fn; }
  float f=uFade*smoothstep(uFadeY-40.,uFadeY+80.,vP.y);
  acc.rgb=mix(acc.rgb, floorCol(gl_FragCoord.xy)*acc.a, f);
  o=acc; }`;
const FS_PAGESHADOW = HEAD + `uniform vec4 uMask; uniform float uRad; in vec2 vP; in vec3 vW; out vec4 o;
void main(){ float sd=sdRR(vP-vec2(0.,16.),uMask,uRad); float a=.075*(1.-smoothstep(-80.,210.,sd))+.05*(1.-smoothstep(-8.,26.,sd)); o=vec4(vec3(.102,.129,.2)*a,a); }`;

const VS_ITEM = `#version 300 es
uniform mat4 uVP; uniform vec3 uC; uniform vec2 uHalf; uniform float uTilt; uniform vec4 uUV; out vec2 vUV; out vec3 vW;
void main(){ vec2 c=vec2(gl_VertexID&1, gl_VertexID>>1); vec2 uv=mix(uUV.xy,uUV.zw,c); vUV=uv; vec2 d=(uv-.5)*2.*uHalf;
  vec3 w=uC+vec3(d.x, d.y*cos(uTilt), -d.y*sin(uTilt)); vW=w; gl_Position=uVP*vec4(w,1.); }`;
const FS_ITEM = HEAD + `uniform sampler2D uTex; uniform float uAlpha, uFade, uShade; in vec2 vUV; in vec3 vW; out vec4 o;
void main(){ vec2 gx=dFdx(vUV), gy=dFdy(vUV); float r=coc(dot(vW-uCam,uFwd)); vec4 c;
  if(r<1.) c=textureGrad(uTex,vUV,gx,gy)*inside(vUV);
  else { int N=taps(r); float fn=float(N), k=max(1.,1.77*r/sqrt(fn)), lod=lodFor(uTex,gx,gy,k);
    c=vec4(0.); for(int i=0;i<N;i++){ float fi=float(i), a=fi*GA, rr=r*sqrt((fi+.5)/fn); vec2 off=rr*vec2(cos(a),sin(a)); vec2 uv=vUV+off.x*gx+off.y*gy;
    c+=textureLod(uTex,uv,lod)*inside(uv); } c/=fn; }
  c*=uAlpha; c.rgb*=uShade; c.rgb=mix(c.rgb, floorCol(gl_FragCoord.xy)*c.a, uFade); o=c; }`;
const VS_SHADOW = `#version 300 es
uniform mat4 uVP; uniform vec2 uCenter; uniform vec2 uHalf; uniform float uZ; uniform vec4 uUV; out vec2 vUV; out vec3 vW;
void main(){ vec2 c=vec2(gl_VertexID&1, gl_VertexID>>1); vec2 uv=mix(uUV.xy,uUV.zw,c); vUV=uv; vec3 w=vec3(uCenter+(uv-.5)*2.*uHalf,uZ); vW=w; gl_Position=uVP*vec4(w,1.); }`;
const FS_SHADOW = HEAD + `uniform sampler2D uTex; uniform float uBlur, uOpacity, uF; in vec2 vUV; in vec3 vW; out vec4 o;
void main(){ vec2 gx=dFdx(vUV), gy=dFdy(vUV); float depth=dot(vW-uCam,uFwd); float r=coc(depth); float bs=uBlur*uF/depth; float R=sqrt(bs*bs+r*r);
  float k=max(1.,.36*R), a=0., lod=lodFor(uTex,gx,gy,k);
  for(int i=0;i<24;i++){ float fi=float(i), an=fi*GA, rr=R*sqrt((fi+.5)/24.); vec2 off=rr*vec2(cos(an),sin(an)); vec2 uv=vUV+off.x*gx+off.y*gy;
    a+=textureLod(uTex,uv,lod).a*inside(uv); } a=a/24.*uOpacity; o=vec4(vec3(.102,.129,.2)*a,a); }`;

function compile(vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}
function texParams(target, mip = true) {
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (mip && P.aniso) gl.texParameterf(target, P.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(16, gl.getParameter(P.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
}
function texFrom(src) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D); texParams(gl.TEXTURE_2D); return t;
}
function fbo(w, h, fmt) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h); texParams(gl.TEXTURE_2D, false);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  return { t, f };
}
const loadBitmap = async (url, premul) => createImageBitmap(await (await fetch(url)).blob(), { premultiplyAlpha: premul ? 'premultiply' : 'none', colorSpaceConversion: 'none' });
const loadImg = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

// One texture per tile (a single huge array texture runs out of memory on integrated GPUs).
async function uploadPage() {
  const out = [];
  for (const tile of CAP.tiles) {
    const bmp = await loadBitmap('capture/' + tile.file, false);
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    gl.generateMipmap(gl.TEXTURE_2D); texParams(gl.TEXTURE_2D);
    out.push({ tex: t, top: tile.y0, h: tile.h }); bmp.close();
  }
  return out;
}

function tileTexture(logo) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 320; const c = cv.getContext('2d');
  const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  rr(32, 32, 256, 256, 60); const g = c.createLinearGradient(0, 32, 0, 288); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#f5f6f8'); c.fillStyle = g; c.fill();
  c.lineWidth = 2; c.strokeStyle = 'rgba(16,24,40,0.07)'; c.stroke();
  if (logo) { const k = Math.min(150 / logo.width, 150 / logo.height); c.drawImage(logo, 160 - logo.width * k / 2, 160 - logo.height * k / 2, logo.width * k, logo.height * k); }
  else { c.fillStyle = '#121317'; c.font = '600 130px Geist, system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText((CFG.brand || '•')[0], 160, 168); }
  return texFrom(cv);
}
function slabTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64; const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 8, 0, 56); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#eceef2');
  c.beginPath(); c.roundRect(8, 8, 496, 48, 10); c.fillStyle = g; c.fill(); return texFrom(cv);
}

// ---------- drawing ----------
function setCommon(prog, cam) {
  gl.useProgram(prog.p);
  if (prog.u.uVP) gl.uniformMatrix4fv(prog.u.uVP, false, P.vp);
  if (prog.u.uCam) gl.uniform3fv(prog.u.uCam, cam.pos);
  if (prog.u.uFwd) gl.uniform3fv(prog.u.uFwd, cam.f);
  if (prog.u.uFocus) gl.uniform1f(prog.u.uFocus, cam.D);
  if (prog.u.uRes) gl.uniform2f(prog.u.uRes, W, H);
}
function quadMargin(cam, pts) { let m = 0; for (const p of pts) { const z = dot(sub(p, cam.pos), cam.f); if (z > 1) m = Math.max(m, coc(z, cam.D) * z / F); } return m + 2; }

function drawItem(cam, tex, cx, cy, cz, w, h, tilt, alpha, fade, shade) {
  const hw = w / 2, hh = h / 2, ct = Math.cos(tilt), st = Math.sin(tilt);
  const pts = [[cx - hw, cy - hh * ct, cz + hh * st], [cx + hw, cy + hh * ct, cz - hh * st]];
  const m = quadMargin(cam, pts), mu = m / w, mv = m / h;
  const pr = P.item; setCommon(pr, cam);
  gl.uniform3f(pr.u.uC, cx, cy, cz); gl.uniform2f(pr.u.uHalf, hw * (1 + 2 * mu), hh * (1 + 2 * mv)); gl.uniform1f(pr.u.uTilt, tilt);
  gl.uniform4f(pr.u.uUV, -mu, -mv, 1 + mu, 1 + mv);
  gl.uniform1f(pr.u.uAlpha, alpha); gl.uniform1f(pr.u.uFade, fade); gl.uniform1f(pr.u.uShade, shade);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(pr.u.uTex, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
function drawShadow(cam, tex, cx, cy, zBase, w, h, height, tilt, alpha) {
  if (alpha <= 0.001) return;
  const blur = 7 + 0.5 * height, ox = 0.10 * height, oy = 4 + 0.36 * height;
  const hw = w / 2, hh = h / 2 * Math.cos(tilt);
  const m = blur + quadMargin(cam, [[cx, cy, zBase]]), mu = m / w, mv = m / (2 * hh);
  const pr = P.shadow; setCommon(pr, cam);
  gl.uniform2f(pr.u.uCenter, cx + ox, cy + oy); gl.uniform2f(pr.u.uHalf, hw * (1 + 2 * mu), hh * (1 + 2 * mv)); gl.uniform1f(pr.u.uZ, zBase);
  gl.uniform4f(pr.u.uUV, -mu, -mv, 1 + mu, 1 + mv); gl.uniform1f(pr.u.uBlur, blur); gl.uniform1f(pr.u.uF, F); gl.uniform1f(pr.u.uOpacity, 0.26 * alpha);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(pr.u.uTex, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function renderScene(t, flat) {
  const cam = cameraAt(t); P.vp = viewProj(cam);
  const mk = maskAt(t), [mx0, my0, mx1, my1] = mk.rect;
  gl.disable(gl.BLEND);
  gl.useProgram(P.floor.p); gl.uniform2f(P.floor.u.uRes, W, H); gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  setCommon(P.pageShadow, cam);
  gl.uniform4f(P.pageShadow.u.uQuad, mx0 - 260, my0 - 260, mx1 + 260, my1 + 300);
  gl.uniform4f(P.pageShadow.u.uMask, mx0, my0, mx1, my1); gl.uniform1f(P.pageShadow.u.uRad, mk.radius);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  const pg = P.page; setCommon(pg, cam);
  const pm = quadMargin(cam, [[mx0, my1, 0], [mx1, my1, 0]]), S = CAP.tileStride, nT = P.pageTex.length;
  gl.uniform4f(pg.u.uMask, mx0, my0, mx1, my1); gl.uniform1f(pg.u.uRad, mk.radius); gl.uniform1f(pg.u.uPageW, CAP.pageW);
  gl.uniform1f(pg.u.uFade, mk.fade); gl.uniform1f(pg.u.uFadeY, TL.heroB);
  gl.activeTexture(gl.TEXTURE0); gl.uniform1i(pg.u.uTex, 0);
  P.pageTex.forEach((tile, i) => {                                   // each tile draws its own band; blur taps reach into the overlap
    const y0 = i === 0 ? my0 - pm : i * S, y1 = i === nT - 1 ? my1 + pm : Math.min((i + 1) * S, my1 + pm);
    if (y1 <= y0) return;
    gl.uniform4f(pg.u.uQuad, mx0 - pm, y0, mx1 + pm, y1);
    gl.uniform1f(pg.u.uTileTop, tile.top); gl.uniform1f(pg.u.uTileH, tile.h);
    gl.bindTexture(gl.TEXTURE_2D, tile.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  });

  // pieces + tiles, lowest first
  const draws = [];
  // measurement pass (flat): every piece lies at rest in its place, no tiles, so only the camera moves the picture
  const states = ITEMS.map(it => flat ? { z: 0, tilt: 0 } : itemState(it, t));
  ITEMS.forEach((it, i) => {
    const s = states[i], base = it.parent >= 0 ? states[it.parent].z : 0, cy = it.y + it.h / 2;
    const below = cy > TL.heroB;
    const fade = below ? mk.fade * ss(TL.heroB - 40, TL.heroB + 80, cy) : 0;
    const alpha = cy < my1 + 1 ? 1 : 0;
    draws.push({ h: base + s.z, run: () => {
      if (!flat) drawShadow(cam, it.tex, it.x + it.w / 2, cy, base, it.w, it.h, s.z, s.tilt, alpha * (1 - fade));
      if (it.chore.edge && s.tilt > 0.01) {
        const T = it.chore.edge * ss(0, 6 * DEG, s.tilt), hh = it.h / 2 - CAP.pad, ct = Math.cos(s.tilt), st = Math.sin(s.tilt);
        const bx = it.x + it.w / 2, by = cy + hh * ct, bz = base + s.z - hh * st;                  // bottom edge of the card face
        const n = [0, st, ct];                                                                     // face normal
        drawItem(cam, P.slab, bx, by - n[1] * T / 2, bz - n[2] * T / 2, it.inner.w - 8, T * 64 / 48, s.tilt + Math.PI / 2, alpha, fade, 1);
      }
      drawItem(cam, it.tex, it.x + it.w / 2, cy, base + s.z, it.w, it.h, s.tilt, alpha, fade, 1 - 0.035 * Math.sin(s.tilt));
    } });
  });
  for (const tile of flat ? [] : TILES) {
    const s = tile.state(t); if (s.a <= 0) continue; const q = s.s * 320 / 256;
    draws.push({ h: s.z, run: () => { drawShadow(cam, P.tileTex, s.x, s.y, 0, q, q, s.z, 0, s.a); drawItem(cam, P.tileTex, s.x, s.y, s.z, q, q, 0, s.a, 0, 1); } });
  }
  draws.sort((a, b) => a.h - b.h).forEach(d => d.run());
}

function updateTitle(t) {
  const u = clamp((t - 10.02) / 0.42), e = easeOutCubic(u);
  dom.badge.style.opacity = e; dom.badge.style.transform = `translate(-50%, ${8 * (1 - e)}px)`;
  const word = (el, t0) => { const k = easeOutCubic((t - t0) / 0.34); el.style.opacity = k; el.style.transform = `translateY(${16 * (1 - k)}px)`; el.style.filter = k >= 1 ? 'none' : `blur(${12 * (1 - k)}px)`; };
  dom.w1.forEach((el, i) => word(el, 10.12 + 0.06 * i));
  dom.w2.forEach((el, i) => word(el, 10.36 + 0.05 * i));
}

function seek(t, opts = {}) {
  t = clamp(t, 0, DUR);
  const n = opts.subframes || 1, fps = opts.fps || 60, shutter = opts.shutter == null ? 0.7 : opts.shutter;
  gl.bindFramebuffer(gl.FRAMEBUFFER, P.acc.f); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  for (let i = 0; i < n; i++) {
    const ts = n === 1 ? t : clamp(t + ((i + 0.5) / n - 0.5) * shutter / fps, 0, DUR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, P.scene.f); renderScene(ts, opts.flat);
    gl.bindFramebuffer(gl.FRAMEBUFFER, P.acc.f); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P.copy.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, P.scene.t); gl.uniform1i(P.copy.u.uSrc, 0); gl.uniform1f(P.copy.u.uWeight, 1 / n);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.BLEND);
  gl.useProgram(P.final.p); gl.bindTexture(gl.TEXTURE_2D, P.acc.t); gl.uniform1i(P.final.u.uSrc, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
  updateTitle(t);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, P.px || (P.px = new Uint8Array(4)));   // waits for the GPU
  return t;
}

async function init() {
  CFG = await (await fetch('flyover.config.json')).json();
  CAP = await (await fetch('capture/capture.json')).json();
  TL = buildTimeline(CAP, CFG);
  const cv = document.getElementById('c');
  gl = cv.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 unavailable');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
  P.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  P.floor = compile(VS_FULL, FS_FLOOR); P.copy = compile(VS_FULL, FS_COPY); P.final = compile(VS_FULL, FS_FINAL);
  P.page = compile(VS_PAGE, FS_PAGE); P.pageShadow = compile(VS_PAGE, FS_PAGESHADOW);
  P.item = compile(VS_ITEM, FS_ITEM); P.shadow = compile(VS_SHADOW, FS_SHADOW);
  gl.bindVertexArray(gl.createVertexArray());
  P.scene = fbo(W, H, gl.RGBA16F); P.acc = fbo(W, H, gl.RGBA16F);

  // title DOM
  dom.badge = document.getElementById('badge');
  const logoUrl = CFG.logo || null;
  let logoImg = null; if (logoUrl) { try { logoImg = await loadImg(logoUrl); } catch { console.warn('[film] logo not found: ' + logoUrl); } }
  dom.badge.innerHTML = (logoImg ? `<img src="${logoUrl}" alt="">` : '') + `<span>${(CFG.brand || '').replace(/</g, '&lt;')}</span>`;
  const words = (id, text) => { const el = document.getElementById(id); el.innerHTML = ''; return (text || '').split(/\s+/).filter(Boolean).map((w, i, a) => { const s = document.createElement('span'); s.className = 'w'; s.textContent = w + (i < a.length - 1 ? ' ' : ''); el.appendChild(s); return s; }); };
  dom.w1 = words('l1', CFG.line1); dom.w2 = words('l2', CFG.tail);
  await document.fonts.ready;
  await Promise.all([document.fonts.load('500 74px Geist'), document.fonts.load('600 21px Geist'), document.fonts.load('italic 82px "Instrument Serif"')]).catch(() => {});

  P.pageTex = await uploadPage();
  ITEMS = [];
  for (const l of CAP.layers) {
    const bmp = await loadBitmap('capture/' + l.file, true);
    ITEMS.push({ ...l, tex: texFrom(bmp) }); bmp.close();
  }
  ITEMS.forEach((it, i) => { it.chore = choreoFor(it, i, ITEMS); });
  P.tileTex = tileTexture(logoImg); P.slab = slabTexture();
  TILES = buildTiles();

  const info = { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown', duration: DUR,
    cruise: Math.round(TL.C), start: Math.round(TL.p0), secondTitleAt: +TL.t2.toFixed(2), footerTitleAt: +TL.tf.toFixed(2), notes: TL.notes,
    pieces: ITEMS.map(it => ({ id: it.id, kind: it.kind, ...it.chore })) };
  window.film.info = info;
  console.log('[film] ready', JSON.stringify({ renderer: info.renderer, cruise: info.cruise, secondTitleAt: info.secondTitleAt, footerTitleAt: info.footerTitleAt, notes: info.notes }));
  seek(0);
  window.film.isReady = true;
}

window.film = {
  isReady: false, duration: DUR, seek,
  camera: t => { const c = cameraAt(t); return { Lx: c.Lx, Ly: c.Ly, D: c.D, tilt: c.th / DEG }; },
  project: (x, y, z, t) => project(cameraAt(t), [x, y, z]),
  share,
};
init().catch(e => { console.error('[film] ' + (e.stack || e)); window.film.error = String(e); });
