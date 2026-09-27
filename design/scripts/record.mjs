// Rekam klip interaksi (webm) untuk pratinjau. Pakai: node scripts/record.mjs <hero|orvi>
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const pw = require(process.env.PW_PATH || '/home/alexie/project-alex/sigchat/frontend/node_modules/playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const clip = process.argv[2] || 'hero';
const dir = path.join(here, '..', 'shots', 'rec-' + clip);
fs.rmSync(dir, { recursive: true, force: true });
const browser = await pw.chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, recordVideo: { dir, size: { width: 1280, height: 760 } } });
const p = await ctx.newPage();
const base = 'file://' + path.join(here, '..', 'mockups');
const glide = async (pts, steps = 18) => { for (const [x, y] of pts) { await p.mouse.move(x, y, { steps }); await p.waitForTimeout(120); } };

if (clip === 'hero') {
  await p.goto(`${base}/landing.html?clean=1&theme=light`, { waitUntil: 'load' });
  await p.waitForTimeout(1800);
  await glide([[300, 200], [900, 250], [1150, 520], [700, 600]]);
  const rust = p.locator('.orb-chip', { hasText: 'Rust' });
  const box = await rust.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
  await p.waitForTimeout(1200);
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await p.waitForTimeout(2600);
  await p.click('#hcRun');
  await p.waitForTimeout(1800);
  await glide([[500, 300], [1000, 150]]);
  await p.waitForTimeout(600);
} else {
  await p.goto(`${base}/brand.html?clean=1&theme=light#orvi`, { waitUntil: 'load' });
  await p.evaluate(() => document.querySelector('#orvi').scrollIntoView());
  await p.waitForTimeout(1500);
  await glide([[300, 300], [700, 250], [520, 520]]);
  for (const m of ['happy', 'think', 'oops', 'cheer']) { await p.click(`#labMood [data-m="${m}"]`); await p.waitForTimeout(1300); }
  await p.click('#labTint [data-t="rust"]'); await p.waitForTimeout(900);
  await p.click('#labMood [data-m="sleep"]'); await p.waitForTimeout(1800);
  await p.click('#labMood [data-m="idle"]'); await p.waitForTimeout(500);
  await p.click('#labSayForm button'); await p.waitForTimeout(2400);
}
await ctx.close();
await browser.close();
const f = fs.readdirSync(dir).find(x => x.endsWith('.webm'));
console.log(path.join(dir, f));
