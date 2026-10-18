// Renders the README visuals: hero.svg preview (900 px and 360 px) and proof.jpg from proof.html.
import { createRequire } from 'node:module'; import path from 'node:path';
const require = createRequire(path.resolve(process.argv[2] ?? '.', 'package.json'));
const { chromium } = require('playwright');
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const url = f => 'file:///' + path.resolve(here, f).split(path.sep).join('/');
const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const p = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 4 / 3 });
await p.goto(url('proof.html')); await p.waitForLoadState('networkidle');
await (await p.$('.board')).screenshot({ path: path.resolve(here, '../proof.jpg'), type: 'jpeg', quality: 86 });
for (const w of [900, 360]) {
  const q = await b.newPage({ viewport: { width: w, height: 400 } });
  await q.goto(url('preview.html') + '?w=' + w); await q.waitForLoadState('networkidle');
  await q.waitForTimeout(300); await (await q.$('img')).screenshot({ path: path.resolve(here, `../../../../hero-${w}.png`) });
}
await b.close();
