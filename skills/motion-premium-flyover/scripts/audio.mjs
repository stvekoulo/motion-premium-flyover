// Sound: the track's hit on 9.97s, whooshes peaking on 8.66s and 9.80s, loudness -14 LUFS, muxed into the film.
// Usage: node audio.mjs [--video out/film.mp4] [--out out/film-sound.mp4]
// Config: "track": "music.mp3" (optional), "trackHit": seconds into the track where its hit is (optional, auto-detected otherwise)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readConfig, args, ROOT, DURATION } from './lib.mjs';

const cfg = readConfig(), a = args();
const video = path.join(ROOT, a.video || 'out/film.mp4');
const out = path.join(ROOT, a.out || video.replace(/\.mp4$/, '-sound.mp4'));
const HIT = 9.97, WHOOSH = [8.66, 9.80];
const run = (argv, capture) => new Promise((res, rej) => {
  const p = spawn('ffmpeg', argv); const err = [], o = [];
  p.stderr.on('data', d => err.push(d)); if (capture) p.stdout.on('data', d => o.push(d));
  p.on('close', c => c ? rej(new Error(Buffer.concat(err).toString().slice(-2000))) : res({ out: Buffer.concat(o), err: Buffer.concat(err).toString() }));
});

// Strongest onset of the track (rise of 20 ms RMS above the previous 200 ms), away from the edges.
async function detectHit(file) {
  const sr = 11025, { out: pcm } = await run(['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 's16le', '-'], true);
  const s = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1), win = Math.round(sr * 0.02), rms = [];
  for (let i = 0; i + win <= s.length; i += win) { let e = 0; for (let j = 0; j < win; j++) e += (s[i + j] / 32768) ** 2; rms.push(Math.sqrt(e / win)); }
  let best = -1, at = 0;
  for (let i = 10; i < rms.length; i++) {
    const t = i * 0.02; if (t < HIT + 0.2 || t > rms.length * 0.02 - (DURATION - HIT)) continue;   // enough music before and after
    let m = 0; for (let k = i - 10; k < i; k++) m += rms[k]; m /= 10;
    const o = rms[i] - m; if (o > best) { best = o; at = t; }
  }
  return at;
}

const inputs = [], filters = [], mix = [];
let nIn = 0;
if (cfg.track) {
  const track = path.join(ROOT, cfg.track);
  const hit = cfg.trackHit != null ? +cfg.trackHit : await detectHit(track);
  const offset = hit - HIT;
  console.log(`track hit at ${hit.toFixed(2)}s in the file → starts at ${offset.toFixed(2)}s so it lands on ${HIT}s`);
  inputs.push('-i', track); nIn++;
  const pre = offset < 0 ? `adelay=${Math.round(-offset * 1000)}:all=1,` : `atrim=start=${offset.toFixed(3)},asetpts=PTS-STARTPTS,`;
  filters.push(`[0:a]${pre}atrim=0:${DURATION},afade=t=in:st=0:d=0.6,afade=t=out:st=${DURATION - 1.2}:d=1.2[m]`); mix.push('[m]');
}
// Whooshes: pink noise, band-limited, swelling to a peak at the event time.
WHOOSH.forEach((tw, k) => {
  const idx = nIn++;
  inputs.push('-f', 'lavfi', '-t', '1.4', '-i', `anoisesrc=c=pink:a=0.6:r=48000:s=${7 + k}`);
  filters.push(`[${idx}:a]highpass=f=${300 + 200 * k},lowpass=f=${4200 - 800 * k},volume='0.9*exp(-pow((t-0.9)/0.28,2))':eval=frame,aformat=channel_layouts=stereo,adelay=${Math.round((tw - 0.9) * 1000)}:all=1[w${k}]`);
  mix.push(`[w${k}]`);
});
filters.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0[mx];[mx]apad=pad_dur=${DURATION}[mix]`);
const tmp = path.join(ROOT, 'out/_mix.wav');
await run(['-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[mix]', '-t', String(DURATION), '-ar', '48000', '-ac', '2', tmp]);

// Two-pass loudnorm to -14 LUFS (only with a track: normalising lone whooshes would just raise noise).
let final = tmp;
if (cfg.track) {
  const { err } = await run(['-i', tmp, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']);
  const m = JSON.parse(err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1));
  final = path.join(ROOT, 'out/_mix-norm.wav');
  await run(['-y', '-i', tmp, '-af', `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`, '-ar', '48000', final]);
  console.log(`loudness ${m.input_i} → -14 LUFS`);
}
await run(['-y', '-i', video, '-i', final, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-t', String(DURATION), '-movflags', '+faststart', out]);
for (const f of [tmp, path.join(ROOT, 'out/_mix-norm.wav')]) if (fs.existsSync(f)) fs.rmSync(f);
console.log('wrote', path.relative(ROOT, out));
