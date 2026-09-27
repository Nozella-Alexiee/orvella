// Screenshot satu halaman mockup per run (hemat RAM) + laporan error JS.
// Pakai: node scripts/shot.mjs <halaman> [light|dark] [lebar] [query]
// env: FULL=1 (seluruh halaman), SCROLL=1 (gulir dulu agar ScrollTrigger jalan),
//      CLICK="sel;sel", WAIT=ms, TAG=nama, Y=px (gulir ke posisi), SHOT_DIR,
//      OFFLINE=1 (blokir internet, uji cadangan vendor/)
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const pw = require(process.env.PW_PATH || '/home/alexie/project-alex/sigchat/frontend/node_modules/playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const [page = 'index', theme = 'light', width = '1440', extra = ''] = process.argv.slice(2);
const w = +width, h = w < 600 ? 844 : 900;
const url = `file://${path.join(here, '..', 'mockups', page + '.html')}?theme=${theme}&clean=1${extra ? '&' + extra : ''}`;
const tag = (extra ? '-' + extra.replace(/[^a-z0-9]+/gi, '_') : '') + (process.env.TAG ? '-' + process.env.TAG : '');
const out = path.join(process.env.SHOT_DIR || path.join(here, '..', 'shots'), `${page}${tag}-${theme}-${w}.png`);
const browser = await pw.chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const errors = [];
p.on('pageerror', e => errors.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
if (process.env.OFFLINE) await p.route(/^https?:/, r => r.abort());
await p.goto(url, { waitUntil: 'load', timeout: 60000 });
await p.waitForTimeout(+(process.env.WAIT || 1200));
if (process.env.SCROLL) {
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 500) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(120); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(600);
}
if (process.env.Y) { await p.evaluate(v => scrollTo(0, v), +process.env.Y); await p.waitForTimeout(900); }
for (const sel of (process.env.CLICK || '').split(';').filter(Boolean)) {
  try { await p.click(sel, { timeout: 3000 }); await p.waitForTimeout(700); } catch (e) { errors.push('click gagal: ' + sel); }
}
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
await p.screenshot({ path: out, fullPage: !!process.env.FULL });
console.log(JSON.stringify({ out, overflowX: overflow, errors }, null, 1));
await browser.close();
