// Screenshot satu halaman aplikasi + laporan error JS (untuk QA tampilan).
// Pakai: node scripts/shot-app.mjs <path> [light|dark] [lebar]
// env: BASE (bawaan http://localhost:8399), LOGIN=email (kata sandi PASSWORD, bawaan orvella123),
//      FULL=1, WAIT=ms, CLICK="sel;sel", Y=px, TAG=nama, OUT_DIR, PW_PATH
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const pw = require(process.env.PW_PATH || '/home/alexie/project-alex/sigchat/frontend/node_modules/playwright');
const [route = '/', theme = 'light', width = '1440'] = process.argv.slice(2);
const base = process.env.BASE || 'http://localhost:8399';
const w = +width, h = w < 600 ? 844 : 900;
const outDir = process.env.OUT_DIR || path.join(process.cwd(), 'shots');
fs.mkdirSync(outDir, { recursive: true });
const name = (route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root') + (process.env.TAG ? '-' + process.env.TAG : '');
const out = path.join(outDir, `${name}-${theme}-${w}.png`);
const browser = await pw.chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h } });
await ctx.addInitScript(t => { try { localStorage.setItem('orvella-theme', t); } catch (e) { /* */ } }, theme === 'dark' ? 'ink' : 'paper');
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
if (process.env.LOGIN) {
  const r = await p.request.post(base + '/api/auth/login', { data: { email: process.env.LOGIN, password: process.env.PASSWORD || 'orvella123' } });
  if (!r.ok()) errors.push('login gagal: ' + r.status());
}
await p.goto(base + route, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(+(process.env.WAIT || 1500));
if (process.env.Y) { await p.evaluate(v => scrollTo(0, v), +process.env.Y); await p.waitForTimeout(900); }
for (const sel of (process.env.CLICK || '').split(';').filter(Boolean)) {
  try { await p.click(sel, { timeout: 4000 }); await p.waitForTimeout(800); } catch (e) { errors.push('klik gagal: ' + sel); }
}
const overflowX = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
await p.screenshot({ path: out, fullPage: !!process.env.FULL });
console.log(JSON.stringify({ out, url: p.url(), overflowX, errors }, null, 1));
await browser.close();
