const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ECOSCAN_TEST_URL || 'http://127.0.0.1:8000';
const url=base+'/app/';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'allow'});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(url,{waitUntil:'networkidle'});

 // Structure et accessibilité de base
 assert.match(await page.title(),/Accueil · EcoScan/);
 assert.equal(await page.locator('.screen:not([hidden])').count(),1,'one screen at a time');
 assert.equal(await page.locator('h1:visible').count(),1,'one visible h1');
 assert.equal(await page.locator('.tabbar button').count(),5);
 assert.equal(await page.locator('.tabbar button[aria-current="page"]').getAttribute('data-go'),'home');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow at 390');
 assert.ok(await page.evaluate(()=>document.fonts.check('16px Inter')),'self-hosted font loads');
 assert.equal(await page.locator('#home-points').textContent(),'0');
 assert.ok((await page.locator('.badge').textContent()).includes('Concept simulé'),'concept disclosed on home');
 const tooSmall=await page.evaluate(()=>[...document.querySelectorAll('button,.chip,.tile input,.link')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height<40&&!e.closest('[hidden]')).map(e=>e.textContent.trim().slice(0,24)));
 assert.deepEqual(tooSmall,[],'touch targets are at least 40px tall');

 // Scanner : identifiant manuel invalide puis valide
 await page.click('#home-scan');
 assert.equal(await page.locator('[data-view="scan"]').isVisible(),true);
 await page.click('#scan-manual');await page.fill('#station-id','xyz');await page.click('#manual button[type=submit]');
 assert.match(await page.locator('#manual-status').textContent(),/inconnu/);
 await page.fill('#station-id','eco-001');await page.click('#manual button[type=submit]');
 assert.equal(await page.locator('[data-view="session"]').isVisible(),true,'session opened with the manual id');

 // Dépôts : PET (+10), mélange (+30), gobelet (0, incertain)
 const deposit=async(value)=>{await page.locator(`#objects input[value="${value}"]`).check({force:true});await page.click('#deposit');await page.waitForSelector('[data-view="result"]:not([hidden])');};
 await deposit('pet');
 assert.equal(await page.locator('[data-view="result"]').getAttribute('data-state'),'confirmed');
 assert.match(await page.locator('#result-gain').textContent(),/\+10 EcoPoints fictifs/);
 await page.click('#again');await deposit('mix');
 assert.match(await page.locator('#result-gain').textContent(),/\+30/);
 await page.click('#again');await deposit('cup');
 assert.equal(await page.locator('[data-view="result"]').getAttribute('data-state'),'uncertain');
 assert.match(await page.locator('#result-gain').textContent(),/^0 EcoPoint/);
 assert.match(await page.locator('#result-note').textContent(),/Aucun point/);

 // Portefeuille et partage du solde avec le site
 await page.click('.tabbar [data-go="wallet"]');
 assert.equal(await page.locator('#wallet-points').textContent(),'40');
 assert.equal(await page.locator('#history li').count(),3);
 assert.match(await page.locator('#wallet-count').textContent(),/2 dépôts simulés/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('ecoscan-demo-points')),'40','same key as the website');
 const site=await context.newPage();await site.goto(base+'/',{waitUntil:'domcontentloaded'});
 assert.equal((await site.locator('#points').textContent()).trim(),'40','the website shows the app balance');
 await site.close();

 // Boutique : échange insuffisant puis possible
 await page.click('.tabbar [data-go="shop"]');
 assert.equal(await page.locator('.product').count(),3);
 await page.click('.filters [data-filter="daily"]');assert.equal(await page.locator('.product').count(),1);
 await page.click('.filters [data-filter="all"]');
 await page.click('.product:nth-child(3) button');
 assert.equal(await page.locator('#shop-dialog').evaluate(d=>d.open),true);
 assert.equal(await page.locator('#dialog-confirm').isEnabled(),true,'40 points buy the 40-point bag');
 await page.click('#dialog-confirm');
 assert.match(await page.locator('#dialog-status').textContent(),/Aucun bon ni objet réel/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('ecoscan-demo-points')),'0');
 assert.equal(await page.locator('#dialog-confirm').isEnabled(),false,'balance too low afterwards');
 assert.match(await page.locator('#dialog-status').textContent(),/Solde insuffisant|Aucun bon/);
 await page.keyboard.press('Escape');
 await page.click('.product:nth-child(1) button');
 assert.equal(await page.locator('#dialog-confirm').isDisabled(),true);
 assert.match(await page.locator('#dialog-status').textContent(),/il manque 20 points/);
 await page.keyboard.press('Escape');

 // Compartiment plein : bloque tout crédit, puis la collecte simulée le vide
 await page.click('.tabbar [data-go="station"]');
 assert.equal(await page.locator('[data-view="session"]').isVisible(),true,'session is resumed');
 // la jauge PET part de 45 % puis monte de 10 % par dépôt crédité (65 % ici) : le blocage arrive à 100 %
 let credited=0;
 for(let i=0;i<10;i++){await deposit('pet');
  if(await page.locator('[data-view="result"]').getAttribute('data-state')==='blocked')break;
  credited++;await page.click('#again');}
 assert.equal(await page.locator('[data-view="result"]').getAttribute('data-state'),'blocked');
 assert.match(await page.locator('#result-gain').textContent(),/^0 EcoPoint/);
 assert.equal(credited,4,'PET bin goes 65 -> 100 in four credited deposits');
 assert.equal(await page.evaluate(()=>localStorage.getItem('ecoscan-demo-points')),String(credited*10),'the blocked deposit credits nothing');
 await page.click('#again');await page.click('#collect');
 await deposit('pet');assert.equal(await page.locator('[data-view="result"]').getAttribute('data-state'),'confirmed','collection empties the bins');
 await page.click('[data-view="result"] [data-go="wallet"]');

 // Remise à zéro en deux temps
 await page.click('#reset');assert.match(await page.locator('#reset').textContent(),/Confirmer/);
 await page.click('#reset');assert.equal(await page.locator('#wallet-points').textContent(),'0');
 assert.equal(await page.locator('#history li .empty').count(),1);

 // Quiz
 await page.click('.tabbar [data-go="learn"]');
 for(let i=0;i<5;i++){
  assert.match(await page.locator('#quiz-progress').textContent(),new RegExp(`Question ${i+1} / 5`));
  await page.locator('#quiz-answers .answer').first().click();
  assert.ok((await page.locator('#quiz-feedback').textContent()).length>20);
  if(i<4)await page.click('#quiz-next');
 }
 assert.match(await page.locator('#quiz-feedback').textContent(),/Score : \d \/ 5/);
 await page.click('#quiz-restart');assert.match(await page.locator('#quiz-progress').textContent(),/Question 1 \/ 5/);

 // Accessibilité : noms accessibles et textes alternatifs
 const unnamed=await page.evaluate(()=>[...document.querySelectorAll('button,a,input,[role=meter]')].filter(e=>!e.closest('[hidden]')&&!(e.getAttribute('aria-label')||e.textContent.trim()||(e.labels&&e.labels.length)||e.getAttribute('placeholder'))).map(e=>e.outerHTML.slice(0,80)));
 assert.deepEqual(unnamed,[],'every control has an accessible name');
 assert.equal(await page.evaluate(()=>[...document.images].filter(i=>!i.alt).length),0,'every image has alt text');

 // Hors connexion : le service worker garde l'app disponible
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.reload({waitUntil:'networkidle'});
 assert.ok(await page.evaluate(()=>!!navigator.serviceWorker.controller),'service worker controls the page');
 assert.ok(await page.evaluate(async()=>(await caches.keys()).some(k=>k.startsWith('ecoscan-app-'))),'app shell cached');
 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('h1:visible').count(),1,'app opens offline');
 assert.ok(await page.evaluate(()=>document.fonts.check('16px Inter')),'font available offline');
 await context.setOffline(false);

 // Petits écrans et manifeste
 for(const w of [360,320]){await page.setViewportSize({width:w,height:700});
  for(const s of ['home','station','wallet','shop','learn']){await page.evaluate(x=>{location.hash=x},s);await page.waitForTimeout(80);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no overflow on ${s} at ${w}`);}}
 const manifest=await (await context.request.get(url+'manifest.webmanifest')).json();
 assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./');assert.ok(manifest.icons.length>=2);
 assert.deepEqual(errors,[],'no console or page errors');
 await browser.close();
 console.log('EcoScan app test passed');
})().catch(e=>{console.error(e);process.exit(1)});
