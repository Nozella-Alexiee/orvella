// Render aset Instagram Orvella ke PNG dengan Chrome yang terpasang di sistem (playwright-core, tanpa unduh browser).
//   node design/instagram/render.mjs            semua: 8 slide + 2 foto profil + og.png
//   node design/instagram/render.mjs slides     hanya carousel
//   CHROME=/path/ke/chrome node ...             kalau Chrome ada di tempat lain
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../frontend/package.json'));
const { chromium } = require('playwright-core');

const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const chrome = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(existsSync);
if (!chrome) throw new Error('Chrome tidak ditemukan. Set CHROME=/path/ke/chrome');

const what = process.argv[2] || 'all';
const browser = await chromium.launch({ executablePath: chrome, args: ['--font-render-hinting=none', '--disable-lcd-text'] });
const errors = [];

async function open(file, width, height, query = '') {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', m => m.type() === 'error' && errors.push(`${file}: ${m.text()}`));
  page.on('pageerror', e => errors.push(`${file}: ${e.message}`));
  await page.goto(pathToFileURL(join(here, file)).href + query);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  return page;
}

if (what === 'all' || what === 'slides') {
  const page = await open('slides.html', 8640, 1350);
  for (let i = 0; i < 8; i++) {
    const path = join(out, `slide-${String(i + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path, clip: { x: i * 1080, y: 0, width: 1080, height: 1350 } });
    console.log('✓', path);
  }
  await page.screenshot({ path: join(out, 'panorama.png') });
  await page.close();
}

if (what === 'all' || what === 'pp') {
  for (const v of ['a', 'b']) {
    const page = await open('pp.html', 1080, 1080, `?v=${v}`);
    const path = join(out, `pp-${v === 'a' ? 'orvi' : 'logo'}.png`);
    await page.screenshot({ path });
    console.log('✓', path);
    await page.close();
  }
}

if (what === 'all' || what === 'og') {
  const page = await open('og.html', 1200, 630);
  const path = join(here, '../../frontend/public/og.png');
  await page.screenshot({ path });
  console.log('✓', path);
  await page.close();
}

await browser.close();
if (errors.length) {
  console.error('\nError di halaman:\n' + errors.join('\n'));
  process.exit(1);
}
