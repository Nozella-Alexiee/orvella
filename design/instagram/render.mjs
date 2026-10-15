// Render aset Instagram Orvella gaya "Stiker pop" dengan Chrome sistem (playwright-core) dan ffmpeg.
//   node design/instagram/render.mjs            semua
//   node design/instagram/render.mjs grid       9 kotak grid puzzle (+ pratinjau profil)
//   node design/instagram/render.mjs quiz       carousel kuis (semua di quizzes.js)
//   node design/instagram/render.mjs reel       Reels MP4 1080×1920 (butuh ffmpeg: FFMPEG=/path/ke/ffmpeg)
//   node design/instagram/render.mjs pp og      foto profil / gambar Open Graph
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../frontend/package.json'));
const { chromium } = require('playwright-core');
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const chrome = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(existsSync);
if (!chrome) throw new Error('Chrome tidak ditemukan. Set CHROME=/path/ke/chrome');
const want = new Set(process.argv.slice(2));
const all = !want.size;
const browser = await chromium.launch({ executablePath: chrome, args: ['--font-render-hinting=none', '--disable-lcd-text'] });
const errors = [];

async function open(file, width, height, query = '') {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', m => m.type() === 'error' && errors.push(`${file}: ${m.text()}`));
  page.on('pageerror', e => errors.push(`${file}: ${e.message}`));
  await page.goto(pathToFileURL(join(here, file)).href + query);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  return page;
}
const done = p => console.log('✓', p.replace(here + '/', ''));

if (all || want.has('grid')) {
  const page = await open('grid.html', 3240, 4320);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const path = join(out, `grid-r${r + 1}c${c + 1}.png`);
    await page.screenshot({ path, clip: { x: c * 1080, y: r * 1440, width: 1080, height: 1440 } });
    done(path);
  }
  await page.screenshot({ path: join(out, 'grid-full.png') });
  await page.close();
  // pratinjau seperti di profil: 9 kotak dengan celah tipis
  const prev = await browser.newPage({ viewport: { width: 1086, height: 1446 } });
  const tiles = [];
  for (let r = 1; r <= 3; r++) for (let c = 1; c <= 3; c++) tiles.push(`grid-r${r}c${c}.png`);
  const html = join(out, '_profil.html');
  writeFileSync(html, `<body style="margin:0;background:#fff;display:grid;grid-template-columns:repeat(3,360px);gap:3px">${tiles.map(u => `<img src="${u}" style="width:360px;height:480px;display:block">`).join('')}</body>`);
  await prev.goto(pathToFileURL(html).href);
  await prev.waitForLoadState('load');
  await prev.screenshot({ path: join(out, 'grid-profil.png') });
  await prev.close();
  rmSync(html);
  done(join(out, 'grid-profil.png'));
}

if (all || want.has('quiz')) {
  const page = await open('quiz.html', 1080, 1440, '?list=1');
  const ids = await page.evaluate(() => Object.keys(window.QUIZZES));
  await page.close();
  for (const id of ids) {
    const p = await open('quiz.html', 5400, 1440, `?q=${id}`);
    for (let i = 0; i < 5; i++) {
      const path = join(out, `kuis-${id}-${i + 1}.png`);
      await p.screenshot({ path, clip: { x: i * 1080, y: 0, width: 1080, height: 1440 } });
      done(path);
    }
    await p.close();
  }
}

if (all || want.has('pp')) {
  for (const v of ['marigold', 'krem']) {
    const page = await open('pp.html', 1080, 1080, `?v=${v}`);
    const path = join(out, `pp-${v}.png`);
    await page.screenshot({ path });
    done(path);
    await page.close();
  }
}

if (all || want.has('og')) {
  const page = await open('og.html', 1200, 630);
  const path = join(here, '../../frontend/public/og.png');
  await page.screenshot({ path });
  done(path);
  await page.close();
}

if (all || want.has('reel')) {
  const ffmpeg = process.env.FFMPEG || 'ffmpeg';
  const fps = 30;
  const page = await open('reel.html', 1080, 1920);
  const dur = await page.evaluate(() => window.REEL.duration);
  const frames = join(out, 'reel-frames');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const n = Math.round(dur * fps);
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.REEL.seek(t), i / fps);
    await page.screenshot({ path: join(frames, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 95 });
    if (i % 60 === 0) process.stdout.write(`  frame ${i}/${n}\r`);
  }
  await page.close();
  const mp4 = join(out, 'reel.mp4');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, 'f%04d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  done(mp4);
  // beberapa frame kunci untuk dicek
  const keys = [1.2, 4.5, 8.5, 11.5, 15, 19];
  keys.forEach(t => execFileSync('cp', [join(frames, `f${String(Math.round(t * fps)).padStart(4, '0')}.jpg`), join(out, `reel-t${String(t).replace('.', '_')}.jpg`)]));
  writeFileSync(join(out, 'reel-frames.txt'), `${readdirSync(frames).length} frame, ${fps} fps\n`);
  rmSync(frames, { recursive: true, force: true });
}

await browser.close();
if (errors.length) { console.error('\nError di halaman:\n' + errors.join('\n')); process.exit(1); }
