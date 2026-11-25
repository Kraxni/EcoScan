/* Plancher de performance (DESIGN.md › Mouvement) : le score Lighthouse mobile ne passe pas sous 95,
   et le poids transféré au chargement ne dépasse pas 256 Ko (233 Ko mesurés le 2026-11-25, + 10 %).
   Lancer : python3 tools/serve_local.py --port 8000 &  puis  node tools/perf_floor.cjs
   (serve_local.py compresse le texte en gzip comme GitHub Pages ; sans compression le score tombe à 88.)
   Variables : ECOSCAN_TEST_URL (adresse), ECOSCAN_PERF_FLOOR (95 par défaut), ECOSCAN_WEIGHT_BUDGET_KB (256 par défaut).
   Lighthouse est téléchargé à la demande par npx (aucune dépendance dans le dépôt). */
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const url=(process.env.ECOSCAN_TEST_URL||'http://127.0.0.1:8000')+'/index.html';
const floor=Number(process.env.ECOSCAN_PERF_FLOOR||95);
const budgetKb=Number(process.env.ECOSCAN_WEIGHT_BUDGET_KB||256);
const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'ecoscan-lh-')),'report.json');
execFileSync('npx',['--yes','lighthouse@12.6.1',url,'--only-categories=performance','--output=json','--output-path='+out,'--quiet',
 '--chrome-path=/usr/bin/chromium','--chrome-flags=--headless=new --no-sandbox'],{stdio:['ignore','ignore','inherit'],timeout:300000});
const lhr=JSON.parse(fs.readFileSync(out,'utf8'));
const score=Math.round(lhr.categories.performance.score*100);
const a=lhr.audits,ms=k=>Math.round(a[k].numericValue);
const kb=Math.round(a['total-byte-weight'].numericValue/1024);
console.log(`performance ${score}/100 (plancher ${floor}) · LCP ${ms('largest-contentful-paint')} ms · TBT ${ms('total-blocking-time')} ms · CLS ${a['cumulative-layout-shift'].numericValue.toFixed(3)} · ${kb} Ko transférés (budget ${budgetKb})`);
if(score<floor){console.error(`ÉCHEC : score ${score} < ${floor}`);process.exit(1);}
if(kb>budgetKb){console.error(`ÉCHEC : ${kb} Ko > budget de ${budgetKb} Ko`);process.exit(1);}
console.log('PASS perf_floor');
