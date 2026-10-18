// Step 1 — capture the landing page: page without its lifting pieces (tiles),
// every piece alone on transparent (28px padding), and capture/capture.json.
// Usage: node capture.mjs [--url https://...]   (url defaults to flyover.config.json)
import fs from 'node:fs';
import path from 'node:path';
import { readConfig, args, launch, serve, ensureDir, ROOT } from './lib.mjs';

const cfg = readConfig();
const a = args();
let url = a.url || cfg.url;
if (!url) throw new Error('No url: set "url" in flyover.config.json');
let local = null;                                     // a local folder (e.g. the demo page) is served on 127.0.0.1
if (!/^https?:\/\//.test(url)) { local = await serve(path.resolve(ROOT, url), 'index.html'); url = local.url; }
const OUT = ensureDir(path.join(ROOT, 'capture'));
for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f));

const PAD = 28, TILE_H = 2048, TILE_OVERLAP = 160, TILE_STRIDE = TILE_H - 2 * TILE_OVERLAP;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
console.log('opening', url);
try { await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }); }
catch { await page.goto(url, { waitUntil: 'load', timeout: 90000 }); }
await page.waitForTimeout(800);

// Scroll to the bottom once so lazy images load and scroll animations finish.
await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let y = 0;
  for (let guard = 0; guard < 400; guard++) {
    y += 500; window.scrollTo(0, y); await sleep(110);
    if (y >= document.documentElement.scrollHeight - innerHeight) break;
  }
  await sleep(1200); window.scrollTo(0, 0); await sleep(900);
});
await page.evaluate(() => Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; }))));
await page.evaluate(() => document.fonts && document.fonts.ready);

// Lock the page: no transitions, no running animations, no fixed overlays, no scrollbars.
await page.addStyleTag({ content: `*,*::before,*::after{transition:none!important;animation-play-state:paused!important;caret-color:transparent!important}
  html{scroll-behavior:auto!important} ::-webkit-scrollbar{display:none}` });
await page.evaluate(() => {
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'sticky') {
      const r = el.getBoundingClientRect();
      if (r.top < 4 && r.height < 160) el.style.setProperty('position', 'absolute', 'important');   // top nav stays at the top
      else if (cs.position === 'fixed') el.style.setProperty('display', 'none', 'important');      // chat bubbles, cookie bars
      else el.style.setProperty('position', 'relative', 'important');
    }
  }
});
await page.waitForTimeout(300);

const H1 = await page.evaluate(() => document.documentElement.scrollHeight);
await page.waitForTimeout(700);
const H2 = await page.evaluate(() => document.documentElement.scrollHeight);
if (H1 !== H2) console.warn(`WARNING: page height still moving (${H1} → ${H2}). Lock it (disable the animation) before timing anything.`);

// Detect sections, hero, button and lifting pieces; mark pieces with data-layer.
const scan = await page.evaluate(({ PAD, layerCfg }) => {
  const sx = scrollX, sy = scrollY;
  const R = el => { const r = el.getBoundingClientRect(); return { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height }; };
  const visible = el => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
  };
  const inNav = el => !!el.closest('nav, header nav, [role=navigation]');
  const pageW = document.documentElement.clientWidth;
  const pageH = document.documentElement.scrollHeight;
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };

  // Sections: full-width blocks, top to bottom, not overlapping.
  const blocks = [...document.querySelectorAll('body > *, main > *, body > div > *, section, footer, header')]
    .filter(visible).map(el => ({ el, r: R(el) }))
    .filter(b => b.r.w >= pageW * 0.7 && b.r.h >= 160 && !['SCRIPT', 'STYLE', 'NAV'].includes(b.el.tagName))
    .sort((a, b) => a.r.y - b.r.y || b.r.h - a.r.h);
  const sections = [];
  for (const b of blocks) {
    const last = sections[sections.length - 1];
    if (last && b.r.y < last.y + last.h - 8) continue;
    const head = [...b.el.querySelectorAll('h1,h2,h3')].filter(visible)[0];
    sections.push({ tag: b.el.tagName.toLowerCase(), y: b.r.y, h: b.r.h, titleY: head ? R(head).y + R(head).h / 2 : b.r.y + Math.min(140, b.r.h / 2), title: head ? head.textContent.trim().slice(0, 60) : '' });
  }
  // Hero: the tallest ancestor of the h1 that still fits in ~1.6 viewports; the nav above it belongs to the hero card.
  let hero = sections.find(s => s.h >= 380) || sections[0] || { y: 0, h: 900, titleY: 300 };
  const h1 = [...document.querySelectorAll('h1')].filter(visible)[0];
  if (h1) {
    let el = h1, best = h1;
    while (el.parentElement && el.parentElement !== document.body && el.parentElement.tagName !== 'MAIN' && R(el.parentElement).h <= innerHeight * 1.6) { el = el.parentElement; best = el; }
    const r = R(best); hero = { y: r.y, h: r.h, titleY: R(h1).y + R(h1).h / 2 };
  }
  if (hero.y < 240) hero = { ...hero, h: hero.h + hero.y, y: 0 };
  const second = sections.find(s => s.y >= hero.y + hero.h - 12) || null;
  const footerEl = [...document.querySelectorAll('footer')].filter(visible).pop();
  const footer = footerEl ? (() => { const r = R(footerEl); const head = [...footerEl.querySelectorAll('h1,h2,h3,h4,strong')].filter(visible)[0]; return { y: r.y, h: r.h, titleY: head ? R(head).y + R(head).h / 2 : r.y + Math.min(90, r.h / 2) }; })() : sections[sections.length - 1];

  // Hero button: first filled link/button inside the hero.
  const btn = [...document.querySelectorAll('a, button')].filter(visible).filter(el => !inNav(el)).find(el => {
    const r = R(el), cs = getComputedStyle(el);
    return r.y >= hero.y && r.y + r.h <= hero.y + hero.h && r.w >= 90 && r.h >= 32 && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor);
  });

  // Candidate pieces.
  const cands = [];
  const add = (el, kind) => { if (!el || cands.some(c => c.el === el) || inNav(el)) return; const r = R(el); if (r.w < 24 || r.h < 16 || r.w > pageW * 0.92) return; cands.push({ el, kind, r }); };
  for (const sel of layerCfg.exclude || []) document.querySelectorAll(sel).forEach(el => { el.dataset.noLayer = '1'; });
  const excluded = el => !!el.closest('[data-no-layer]');
  for (const inc of layerCfg.include || []) document.querySelectorAll(inc.selector).forEach(el => visible(el) && add(el, inc.kind || 'card'));
  if (layerCfg.auto !== false) {
    if (btn) add(btn, 'button');
    for (const el of document.querySelectorAll('img, picture, video, canvas, svg, [style*="background-image"], [class*=phone i], [class*=mockup i], [class*=device i]')) {
      if (!visible(el) || excluded(el) || el.closest('picture') && el.tagName === 'IMG') continue;
      const r = R(el);
      const named = /phone|mockup|device|iphone|screen/i.test((el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) + ' ' + (el.alt || ''));
      if (named && r.h >= 260) { if (!el.querySelector('[class*=phone i], [class*=mockup i], [class*=device i]')) add(el, 'mockup'); continue; }
      if (r.w >= 150 && r.h >= 110 && r.w * r.h >= 30000) add(el, r.h / r.w >= 1.55 && r.h >= 300 ? 'mockup' : 'photo');
    }
    for (const el of document.querySelectorAll('blockquote, [class*=testimon i], [class*=review i], [class*=quote i], [class*=avis i]')) {
      if (!visible(el) || excluded(el)) continue;
      let card = el; // climb to the card around the quote
      for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if ((cs.boxShadow !== 'none' || cs.borderStyle !== 'none' || bgOf(e) !== bgOf(e.parentElement || e)) && R(e).w < pageW * 0.9) { card = e; break; } }
      add(card, 'testimonial'); break;
    }
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || excluded(el) || el.closest('[data-layer]')) continue;
      const r = R(el), cs = getComputedStyle(el);
      const radius = parseFloat(cs.borderTopLeftRadius) || 0;
      const filled = !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || (cs.borderStyle !== 'none' && parseFloat(cs.borderWidth) > 0);
      const text = (el.textContent || '').trim();
      if (r.h >= 18 && r.h <= 58 && r.w >= 34 && r.w <= 380 && radius >= r.h / 2 - 3 && filled && text.length && text.length <= 42 && el !== btn) add(el, 'chip');
      else if (r.w >= 180 && r.w <= 940 && r.h >= 110 && r.h <= 820 && radius >= 8 && filled && (cs.boxShadow !== 'none' || bgOf(el) !== bgOf(el.parentElement)) && text.length) add(el, 'card');
    }
  }
  // Dedupe: drop a piece inside another piece of the same kind; drop a photo filling a card.
  const inside = (a, b) => a.r.x >= b.r.x - 1 && a.r.y >= b.r.y - 1 && a.r.x + a.r.w <= b.r.x + b.r.w + 1 && a.r.y + a.r.h <= b.r.y + b.r.h + 1;
  let keep = cands.filter((c, i) => !cands.some((d, j) => j !== i && d.kind === c.kind && inside(c, d) && (d.r.w * d.r.h > c.r.w * c.r.h || j < i)));
  keep = keep.filter(c => !(c.kind === 'photo' && keep.some(d => d !== c && (d.kind === 'card' || d.kind === 'testimonial') && inside(c, d) && c.r.w * c.r.h > 0.6 * d.r.w * d.r.h)));
  keep = keep.filter(c => !(c.kind === 'card' && keep.some(d => d !== c && d.kind === 'card' && inside(d, c))));        // keep inner cards, not wrappers
  keep = keep.slice(0, layerCfg.max || 48);
  const layers = keep.map((c, i) => {
    c.el.dataset.layer = String(i);
    const parent = keep.filter(d => d !== c && inside(c, d)).sort((a, b) => a.r.w * a.r.h - b.r.w * b.r.h)[0];
    return { id: i, kind: c.kind, parent: parent ? keep.indexOf(parent) : -1, x: c.r.x - PAD, y: c.r.y - PAD, w: c.r.w + 2 * PAD, h: c.r.h + 2 * PAD,
      inner: c.r, radius: parseFloat(getComputedStyle(c.el).borderTopLeftRadius) || 0, label: (c.el.alt || c.el.textContent || c.el.tagName).trim().slice(0, 40) };
  });
  return { pageW, pageH, hero: { y: hero.y, h: hero.h, titleY: hero.titleY }, second, footer, sections,
    button: btn ? R(btn) : null, layers, bg: getComputedStyle(document.body).backgroundColor };
}, { PAD, layerCfg: cfg.layers || {} });

console.log(`page ${scan.pageW}×${scan.pageH}, ${scan.sections.length} sections, ${scan.layers.length} pieces`);
for (const l of scan.layers) console.log(`  #${l.id} ${l.kind.padEnd(11)} y=${Math.round(l.inner.y)} ${Math.round(l.inner.w)}×${Math.round(l.inner.h)}  ${l.label.replace(/\s+/g, ' ')}`);

// Debug sheet: every piece boxed and numbered (review it before going further).
await page.evaluate(layers => {
  const colors = { photo: '#e5484d', chip: '#3e63dd', card: '#30a46c', testimonial: '#f76b15', mockup: '#8e4ec6', button: '#d6409f' };
  for (const l of layers) {
    const d = document.createElement('div');
    d.className = '__dbg';
    Object.assign(d.style, { position: 'absolute', left: l.inner.x + 'px', top: l.inner.y + 'px', width: l.inner.w + 'px', height: l.inner.h + 'px',
      outline: `3px solid ${colors[l.kind]}`, zIndex: 2147483647, pointerEvents: 'none', font: '600 14px system-ui', color: '#fff' });
    d.innerHTML = `<span style="background:${colors[l.kind]};padding:2px 6px;position:absolute;top:-22px;left:-3px;white-space:nowrap">#${l.id} ${l.kind}</span>`;
    document.body.appendChild(d);
  }
}, scan.layers);
await page.screenshot({ path: path.join(OUT, 'layers-debug.png'), fullPage: true, scale: 'css', type: 'png' });
await page.evaluate(() => document.querySelectorAll('.__dbg').forEach(d => d.remove()));

// Page with the pieces hidden (visibility keeps the layout), in overlapping tiles.
await page.addStyleTag({ content: '[data-layer]{visibility:hidden!important}' });
const tiles = [];
for (let i = 0; i * TILE_STRIDE < scan.pageH; i++) {
  const top = i * TILE_STRIDE - TILE_OVERLAP;
  const y0 = Math.max(0, top), y1 = Math.min(scan.pageH, top + TILE_H);
  const file = `tile-${i}.png`;
  await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: y0, width: 1440, height: y1 - y0 }, fullPage: true, type: 'png' });
  tiles.push({ file, top, y0, h: y1 - y0 });
}
console.log(`page tiles: ${tiles.length}`);

// Each piece alone on a transparent background.
await page.addStyleTag({ content: `html.__iso, html.__iso body{background:transparent!important}
  html.__iso body{visibility:hidden!important}
  html.__iso [data-iso]{visibility:visible!important;box-shadow:none!important}
  html.__iso [data-iso] [data-layer]{visibility:hidden!important}` });
await page.evaluate(() => document.documentElement.classList.add('__iso'));
for (const l of scan.layers) {
  await page.evaluate(id => { document.querySelectorAll('[data-iso]').forEach(e => e.removeAttribute('data-iso')); document.querySelector(`[data-layer="${id}"]`).setAttribute('data-iso', ''); }, String(l.id));
  l.file = `layer-${l.id}.png`;
  if (l.x < 0) { l.w += l.x; l.x = 0; }                 // padding cannot go past the page edge
  if (l.y < 0) { l.h += l.y; l.y = 0; }
  l.w = Math.min(l.w, scan.pageW - l.x); l.h = Math.min(l.h, scan.pageH - l.y);
  await page.screenshot({ path: path.join(OUT, l.file), clip: { x: l.x, y: l.y, width: l.w, height: l.h }, fullPage: true, omitBackground: true, type: 'png' });
}

const out = { url, capturedAt: new Date().toISOString(), scale: 2, pad: PAD, tileH: TILE_H, tileStride: TILE_STRIDE, tileOverlap: TILE_OVERLAP, tiles, ...scan, pageHeightStable: H1 === H2 };
fs.writeFileSync(path.join(OUT, 'capture.json'), JSON.stringify(out, null, 2));
console.log('hero', Math.round(scan.hero.y), '→', Math.round(scan.hero.y + scan.hero.h), '| 2nd title y', scan.second && Math.round(scan.second.titleY), '| footer title y', Math.round(scan.footer.titleY));
console.log('wrote capture/capture.json and capture/layers-debug.png — review the debug sheet before timing.');
await browser.close();
if (local) local.close();
