// Shared helpers: config, browser launch on the real GPU, a tiny static server.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

export const ROOT = process.cwd();
export const W = 1440, H = 1152, DURATION = 14.5;

export function readConfig() {
  const p = path.join(ROOT, 'flyover.config.json');
  if (!fs.existsSync(p)) throw new Error('flyover.config.json missing in ' + ROOT + ' (copy flyover.config.example.json)');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function args() {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2), v = a[i + 1];
    if (v === undefined || v.startsWith('--')) out[k] = true; else { out[k] = v; i++; }
  }
  return out;
}

const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];

// Real Chrome first (best GPU path on Windows), Playwright's Chromium otherwise.
export async function launch() {
  const extra = process.platform === 'win32' ? GPU_ARGS : ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'];
  for (const opts of [{ channel: 'chrome' }, {}]) {
    try { return await chromium.launch({ headless: true, args: extra, ...opts }); } catch (e) { /* try next */ }
  }
  throw new Error('No Chromium found. Run: npx playwright install chromium');
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.css': 'text/css' };

export function serve(dir = ROOT, index = 'film.html') {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || index;
      const file = path.resolve(dir, rel);
      if (!file.startsWith(path.resolve(dir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}/`, close: () => srv.close() }));
  });
}

// Opens film.html and waits until every texture and font is loaded.
export async function openFilm(browser, server) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); else if (m.text().startsWith('[film]')) console.log(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(server.url + 'film.html', { waitUntil: 'load' });
  try { await page.waitForFunction(() => window.film && window.film.isReady, null, { timeout: 180000 }); }
  catch (e) { throw new Error('film did not get ready:\n' + errors.join('\n')); }
  const info = await page.evaluate(() => window.film.info);
  if (/swiftshader|llvmpipe|software/i.test(info.renderer)) console.warn('WARNING: software WebGL (' + info.renderer + '). Renders will be slow.');
  return { page, errors, info };
}

export async function frame(page, t, opts = {}) {
  await page.evaluate(([t, o]) => window.film.seek(t, o), [t, opts]);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
}

export function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); return d; }
