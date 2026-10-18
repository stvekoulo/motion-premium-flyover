// Stills for approval before any render. Default times: 0, 1.6, 2.5, 5, 6.5, 9.3, 11.
// Usage: node stills.mjs [--times 0,1.6,2.5] [--mb]   (--mb = with 16-subframe motion blur, as in the final)
import fs from 'node:fs';
import path from 'node:path';
import { launch, serve, openFilm, frame, args, ensureDir, ROOT } from './lib.mjs';

const a = args();
const times = (a.times ? String(a.times) : '0,1.6,2.5,5,6.5,9.3,11').split(',').map(Number);
const OUT = ensureDir(path.join(ROOT, 'stills'));
const server = await serve();
const browser = await launch();
const { page, info, errors } = await openFilm(browser, server);
console.log('renderer:', info.renderer);
console.log(`cruise ${info.cruise} px/s · start y ${info.start} · 2nd title crosses centre at ${info.secondTitleAt}s · footer title at ${info.footerTitleAt}s`);
for (const n of info.notes) console.log('note:', n);
const files = [];
for (const t of times) {
  const png = await frame(page, t, a.mb ? { subframes: 16, fps: 60, shutter: 0.7 } : { subframes: 1 });
  const f = path.join(OUT, `still-${t.toFixed(2).replace('.', '_')}s.png`);
  fs.writeFileSync(f, png); files.push({ f, t }); console.log('wrote', path.relative(ROOT, f));
}
// contact sheet
const sheet = await browser.newPage({ viewport: { width: 1920, height: 100 }, deviceScaleFactor: 1 });
const cells = files.map(({ f, t }) => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${t.toFixed(2)} s</figcaption></figure>`).join('');
await sheet.setContent(`<style>body{margin:0;padding:24px;background:#e9ebee;font:600 18px system-ui;display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
figure{margin:0}img{width:100%;display:block;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.12)}figcaption{padding:8px 2px;color:#333}</style>${cells}`);
await sheet.screenshot({ path: path.join(OUT, 'contact-sheet.png'), fullPage: true });
console.log('wrote stills/contact-sheet.png');
if (errors.length) console.log('console:\n' + errors.join('\n'));
await browser.close(); server.close();
