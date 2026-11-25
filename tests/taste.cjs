/* Vérifie les règles de goût de DESIGN.md qu'un navigateur peut contrôler.
   Lancer : python3 tools/serve_local.py --port 8000 &  puis  node tests/taste.cjs
   (ECOSCAN_TEST_URL pour changer l'adresse.) */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ECOSCAN_TEST_URL||'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];

 /* Surfaces : aucune image n'est recadrée (DESIGN.md › Surfaces).
    Une image est recadrée si son rapport affiché diffère de son rapport natif de plus de 2 %
    et que `object-fit` n'est pas `fill`. */
 for(const [width,height] of [[1440,900],[390,844]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/index.html',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{for(const i of document.images)i.loading='eager';await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
  const cropped=await page.evaluate(()=>[...document.querySelectorAll('main img')]
   .filter(i=>i.naturalWidth&&i.getBoundingClientRect().width>40)
   .map(i=>{const r=i.getBoundingClientRect(),fit=getComputedStyle(i).objectFit;
    return{src:i.getAttribute('src'),fit,gap:Math.abs((r.width/r.height)/(i.naturalWidth/i.naturalHeight)-1)};})
   .filter(x=>x.gap>0.02&&x.fit!=='fill'));
  assert.deepEqual(cropped,[],`images recadrées à ${width}px : `+JSON.stringify(cropped));
  await page.close();
 }

 /* Mouvement : fenêtre de révélation des mots de titre (DESIGN.md › Mouvement).
    Mot 0 : cover 8 % → cover 27 % ; chaque mot décale de 1,3 %. */
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/index.html',{waitUntil:'networkidle'});await page.waitForTimeout(1200);
 await page.evaluate(()=>document.querySelector('main h2')?.scrollIntoView({block:'center'}));await page.waitForTimeout(600);
 const rows=await page.evaluate(()=>[0,3].map(k=>{const e=[...document.querySelectorAll('.split-css .wi')].find(w=>w.style.getPropertyValue('--k')==k);
  if(!e)return null;const c=getComputedStyle(e);return[c.animationRangeStart,c.animationRangeEnd,c.animationTimeline];}));
 assert.ok(rows[0]&&rows[1],'mots de titre en chronologie CSS (.split-css .wi) introuvables');
 assert.deepEqual(rows[0],['cover 8%','cover 27%','view()'],'fenêtre du mot 0');
 assert.deepEqual(rows[1],['cover 11.9%','cover 30.9%','view()'],'décalage de 1,3 % par mot');
 await page.close();

 /* Typographie : aucun texte HTML sous 12 px, sur les 5 parcours, à 390 px (DESIGN.md › Typographie).
    Le texte des illustrations SVG est exclu : sa taille réelle dépend de l'échelle du dessin. */
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const m=await mobile.newPage();m.on('pageerror',e=>errors.push(e.message));
 let tiny=[];
 for(const hash of ['#accueil','#demo','#faisabilite','#mission','#ressources']){
  await m.goto(base+'/index.html'+hash,{waitUntil:'networkidle'});await m.waitForTimeout(400);
  tiny=tiny.concat(await m.evaluate(()=>[...document.querySelectorAll('main *, footer *')]
   .filter(e=>!(e instanceof SVGElement)&&!e.closest('svg,.sr-only,[hidden]')&&e.getBoundingClientRect().width>0&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1)&&parseFloat(getComputedStyle(e).fontSize)<12)
   .map(e=>e.tagName+'.'+(e.className||'')+' '+parseFloat(getComputedStyle(e).fontSize)+'px « '+e.textContent.trim().slice(0,30)+' »')));
 }
 assert.deepEqual(tiny,[],'textes sous 12 px : '+tiny.slice(0,5).join(' | '));
 await mobile.close();

 /* Typographie française : pas d'espace simple avant ; : ! ? dans le texte visible (DESIGN.md › Typographie). */
 const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
 const text=html.slice(html.indexOf('<body')).replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/g,'').replace(/<[^>]+>/g,'\u0000');
 const plain=text.split('\u0000').flatMap(t=>[...t.matchAll(/(?<=\S) ([;:!?])(?=\s|$)/g)].map(x=>t.slice(Math.max(0,x.index-20),x.index+3)));
 assert.deepEqual(plain,[],'espaces simples avant ponctuation haute : '+plain.slice(0,4).join(' | '));

 assert.deepEqual(errors,[],'erreurs de page : '+errors.join(' | '));
 console.log('PASS taste: 0 image recadrée à 1440 et 390 px, fenêtre de révélation des titres cover 8 % → 27 % (+1,3 % par mot), aucun texte sous 12 px, typographie française insécable');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
