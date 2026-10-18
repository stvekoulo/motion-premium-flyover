// Motion checks before the final render.
// 1) analytic: the camera curve itself (glide never stops/reverses/surges, zoom never turns into a zoom-in during the flight)
// 2) optical flow on out/preview-flat.mp4 (node render.mjs --preview --flat): the real pixels of the page agree.
//    Pieces are hidden in that pass: their parallax would read as a surge that the camera never made.
// Usage: node check.mjs [--no-flow]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch, serve, openFilm, args, ROOT } from './lib.mjs';

const a = args();
const F = 1880;
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failed++; };

const server = await serve();
const browser = await launch();
const { page, info } = await openFilm(browser, server);
const cams = await page.evaluate(() => { const o = []; for (let i = 0; i <= 14.5 * 240; i++) o.push(window.film.camera(i / 240)); return o; });
await browser.close(); server.close();

// ---------- analytic ----------
const dt = 1 / 240, at = t => cams[Math.round(t * 240)];
const speed = i => (cams[i + 1].Ly - cams[i - 1].Ly) / (2 * dt);
let minFlight = Infinity, cruiseLo = Infinity, cruiseHi = -Infinity, zoomIn = 0, diveOut = 0;
for (let i = 1; i < cams.length - 1; i++) {
  const t = i * dt, v = speed(i);
  if (t > 0.05 && t < 8.2) minFlight = Math.min(minFlight, v);
  if (t >= 1.6 && t <= 7.3) { cruiseLo = Math.min(cruiseLo, v / info.cruise); cruiseHi = Math.max(cruiseHi, v / info.cruise); }
  if (t < 9.25 - dt && cams[i + 1].D < cams[i].D - 1e-6) zoomIn++;
  if (t > 9.25 && t < 9.97 && cams[i + 1].D > cams[i].D + 1e-6) diveOut++;
}
console.log(`cruise ${info.cruise} px/s, start y ${info.start}, 2nd title at ${info.secondTitleAt}s (target 1.6), footer title at ${info.footerTitleAt}s (target 8.0)`);
for (const n of info.notes) console.log('note:', n);
ok(minFlight > 0, `glide always moves down the page during the flight (min ${minFlight.toFixed(1)} px/s)`);
ok(cruiseLo >= 0.94 && cruiseHi <= 1.1, `cruise held between 0.94 and 1.1 from 1.6 to 7.3s (${cruiseLo.toFixed(3)}–${cruiseHi.toFixed(3)})`);
ok(zoomIn === 0, `distance never comes back in from 0 to 9.25s`);
ok(diveOut === 0, `the dive only moves in (9.25–9.97s)`);
const warn = (cond, msg) => console.log(`${cond ? 'PASS' : 'WARN'}  ${msg}`);
warn(Math.abs(info.secondTitleAt - 1.6) < 0.25, `second section title crosses the centre near 1.6s (${info.secondTitleAt}s) — depends on the page layout`);
ok(Math.abs(info.footerTitleAt - 8.0) < 0.15, `footer title crosses the centre near 8.0s (${info.footerTitleAt}s)`);

// ---------- optical flow ----------
const prev = path.join(ROOT, 'out/preview-flat.mp4');
if (!a['no-flow']) {
  if (!fs.existsSync(prev)) { console.log('SKIP  optical flow: run `node render.mjs --preview --flat` first'); failed++; }
  else {
    const w = 360, h = 288, K = 1440 / w;
    const raw = await new Promise((res, rej) => {
      const ff = spawn('ffmpeg', ['-loglevel', 'error', '-i', prev, '-vf', `scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
      const chunks = []; ff.stdout.on('data', c => chunks.push(c)); ff.on('close', c => c ? rej(new Error('ffmpeg ' + c)) : res(Buffer.concat(chunks)));
    });
    const fps = 30, nf = Math.floor(raw.length / (w * h));
    const fr = i => raw.subarray(i * w * h, (i + 1) * w * h);
    // 32×32 blocks along the centre row of the frame (where the focus is); each search is centred on the previous
    // frame's motion, so repeated text lines cannot alias, yet a real dip still shows (it changes a pixel at most per frame).
    const B = 32, rows = [], csv = ['t,dy_px,page_speed,zoom'], y0 = (h >> 1) - B / 2;
    let guess = 0;
    for (let i = 0; i < nf - 1; i++) {
      const A = fr(i), N = fr(i + 1), dys = [], pts = [];
      for (let bx = 12; bx + B <= w - 12; bx += 24) {
        let mean = 0, varr = 0; for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) mean += A[(y0 + y) * w + bx + x]; mean /= B * B;
        for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) { const d = A[(y0 + y) * w + bx + x] - mean; varr += d * d; }
        if (varr / (B * B) < 6) continue;                                    // no texture, no measurement
        let best = Infinity, bdx = 0, bdy = 0; const sad = {}, g = Math.round(guess);
        for (let dy = g - 5; dy <= g + 5; dy++) for (let dx = -5; dx <= 5; dx++) {
          const yy = y0 + dy, xx = bx + dx; if (yy < 0 || yy + B > h || xx < 0 || xx + B > w) continue;
          let s = 0; for (let y = 0; y < B; y++) { const o1 = (y0 + y) * w + bx, o2 = (yy + y) * w + xx; for (let x = 0; x < B; x++) s += Math.abs(A[o1 + x] - N[o2 + x]); }
          sad[dy + ',' + dx] = s; if (s < best) { best = s; bdx = dx; bdy = dy; }
        }
        const s0 = sad[(bdy - 1) + ',' + bdx], s2 = sad[(bdy + 1) + ',' + bdx];
        const sub = s0 != null && s2 != null && s0 + s2 - 2 * best > 0 ? 0.5 * (s0 - s2) / (s0 + s2 - 2 * best) : 0;
        const l0 = sad[bdy + ',' + (bdx - 1)], l2 = sad[bdy + ',' + (bdx + 1)];
        const subx = l0 != null && l2 != null && l0 + l2 - 2 * best > 0 ? 0.5 * (l0 - l2) / (l0 + l2 - 2 * best) : 0;
        dys.push(bdy + sub); pts.push([bx + B / 2 - w / 2, bdx + subx]);
      }
      const t = (i + 0.5) / fps;
      if (dys.length < 4) { rows.push({ t, v: NaN, z: NaN }); csv.push(`${t.toFixed(3)},,,`); continue; }
      dys.sort((p, q) => p - q); const dy = dys[dys.length >> 1]; guess = dy;
      const mdx = pts.map(p => p[1]).sort((p, q) => p - q)[pts.length >> 1];
      let sxx = 0, sxy = 0; for (const [x, d] of pts) { sxx += x * x; sxy += x * (d - mdx); }
      const zoom = 1 + sxy / sxx;                                            // <1 means the picture shrinks (zoom out)
      const c = at(t), page_speed = -dy * K * fps * c.D / (F * Math.cos(c.tilt * Math.PI / 180));
      rows.push({ t, v: page_speed, z: zoom }); csv.push(`${t.toFixed(3)},${dy.toFixed(3)},${page_speed.toFixed(1)},${zoom.toFixed(5)}`);
    }
    fs.writeFileSync(path.join(ROOT, 'out/flow.csv'), csv.join('\n'));
    const smooth = (arr, key, k = 2) => arr.map((r, i) => { const s = arr.slice(Math.max(0, i - k), i + k + 1).map(q => q[key]).filter(Number.isFinite); return s.length ? s.sort((p, q) => p - q)[s.length >> 1] : NaN; });
    const sv = smooth(rows, 'v'), sz = smooth(rows, 'z', 5);   // a zoom-in has to last ~1/3 s to count; single frames are measurement noise
    const cruise = rows.map((r, i) => [r.t, sv[i]]).filter(([t, v]) => t >= 1.7 && t <= 7.2 && Number.isFinite(v));
    const med = cruise.map(c => c[1]).sort((p, q) => p - q)[cruise.length >> 1];
    const dip = cruise.reduce((m, c) => Math.min(m, c[1] / med), Infinity), surge = cruise.reduce((m, c) => Math.max(m, c[1] / med), 0);
    const back = rows.filter((r, i) => r.t > 0.4 && r.t < 8.1 && sv[i] < 0).length;
    const zin = rows.filter((r, i) => r.t < 8.2 && sz[i] > 1.004).length;
    console.log(`flow: ${rows.length} frame pairs, cruise ≈ ${Math.round(med)} page px/s measured (curve says ${info.cruise})`);
    ok(back === 0, `optical flow: the page never moves backwards during the flight (${back} frames)`);
    ok(dip >= 0.85 && surge <= 1.18, `optical flow: no dip or surge in the cruise (${dip.toFixed(2)}–${surge.toFixed(2)} of median)`);
    ok(zin === 0, `optical flow: no zoom-in during the flight (${zin} frames)`);
    console.log('wrote out/flow.csv');
  }
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
