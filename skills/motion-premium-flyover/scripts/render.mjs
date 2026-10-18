// Render frames on the real GPU and pipe them to ffmpeg (H.264 MP4).
// Final:   node render.mjs                      → out/film.mp4   (60 fps, 16 subframes over 0.7 frame)
// Preview: node render.mjs --preview            → out/preview.mp4 (30 fps, no motion blur) for check.mjs
// Flow:    node render.mjs --preview --flat     → out/preview-flat.mp4 (page only) for check.mjs
// Range:   node render.mjs --from 9 --to 11     (seconds, for spot checks)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { launch, serve, openFilm, frame, args, ensureDir, ROOT, DURATION } from './lib.mjs';

const a = args();
const preview = !!a.preview;
const fps = +(a.fps || (preview ? 30 : 60));
const subframes = +(a.subframes || (preview ? 1 : 16));
const from = +(a.from || 0), to = Math.min(DURATION, +(a.to || DURATION));
ensureDir(path.join(ROOT, 'out'));
const flat = !!a.flat;   // pieces hidden: only for the optical-flow measurement
const out = path.join(ROOT, a.out || (flat ? 'out/preview-flat.mp4' : preview ? 'out/preview.mp4' : 'out/film.mp4'));

const server = await serve();
const browser = await launch();
const { page, info, errors } = await openFilm(browser, server);
console.log(`renderer: ${info.renderer}\n${fps} fps · ${subframes} subframes · ${from}–${to}s → ${path.relative(ROOT, out)}`);

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'slow', '-crf', preview ? '20' : '14', '-pix_fmt', 'yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));

const n = Math.round((to - from) * fps), t0 = Date.now();
for (let i = 0; i < n; i++) {
  const t = from + i / fps;
  const png = await frame(page, t, { subframes, fps, shutter: 0.7, flat });
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 30 === 0 || i === n - 1) {
    const el = (Date.now() - t0) / 1000, eta = el / (i + 1) * (n - i - 1);
    process.stdout.write(`\rframe ${i + 1}/${n}  ${el.toFixed(0)}s elapsed  ~${eta.toFixed(0)}s left   `);
  }
}
ff.stdin.end(); await done;
console.log(`\nwrote ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
if (errors.length) console.log('console:\n' + errors.join('\n'));
await browser.close(); server.close();
