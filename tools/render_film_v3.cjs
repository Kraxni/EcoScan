'use strict';
/*
 * Rend le film explicatif v3 (motion design 1080p) à partir de la scène animée du site.
 * Aucune dépendance payante : Playwright + Chromium, puis ffmpeg pour l'encodage.
 *
 *   node tools/render_film_v3.cjs --lang fr --out /tmp/film-fr            # toutes les images (30 i/s)
 *   node tools/render_film_v3.cjs --lang fr --at 5,12,44 --out /tmp/test  # quelques images pour vérifier
 *
 * Puis (voir tools/build_film_v3.sh) :
 *   ffmpeg -framerate 30 -i /tmp/film-fr/%05d.jpg -i <audio.m4a> -c:v libx264 -crf 23 ... film.mp4
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const lang = args.lang || 'fr';
const fps = +(args.fps || 30);
const duration = +(args.duration || 92);
const workers = +(args.workers || 4);
const out = path.resolve(args.out || path.join(os.tmpdir(), `film-${lang}`));
const root = path.resolve(__dirname, '..');
const url = p => 'file://' + path.join(root, p);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const svg = index.match(/<svg id="story-svg".*?<\/svg>/s)[0];
  const html = fs.readFileSync(path.join(__dirname, 'film_v3', 'scene.html'), 'utf8')
    .replace('__FONT__', url('assets/fonts/inter-latin-wght-normal.woff2'))
    .replace('__LEAVES__', url('assets/leaves.svg'))
    .replace('__GSAP__', url('assets/vendor/gsap.min.js'))
    .replace('__SVG__', svg);
  const page0 = path.join(os.tmpdir(), `film_v3_${lang}.html`);
  fs.writeFileSync(page0, html);

  const times = args.at ? args.at.split(',').map(Number) : null;
  const frames = times ? times.map(t => ({ n: Math.round(t * 1000), t })) : Array.from({ length: Math.round(duration * fps) }, (_, i) => ({ n: i, t: i / fps }));
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--force-device-scale-factor=1'] });
  const chunk = Math.ceil(frames.length / workers);
  let done = 0;
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const mine = frames.slice(w * chunk, (w + 1) * chunk);
    if (!mine.length) return;
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto('file://' + page0 + '?lang=' + lang);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => window.ready === true);
    await page.evaluate(() => window.seek(0));
    for (const f of mine) {
      await page.evaluate(t => window.seek(t), f.t);
      const file = path.join(out, times ? `t${String(f.t).replace('.', '_')}.jpg` : String(f.n).padStart(5, '0') + '.jpg');
      await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
      if (!times && ++done % 300 === 0) console.log(`${done}/${frames.length}`);
    }
    await page.close();
  }));
  await browser.close();
  console.log('terminé :', frames.length, 'images →', out);
})().catch(e => { console.error(e); process.exit(1); });
