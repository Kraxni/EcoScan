// Parcours complet en mode connecté : app (Chromium) <-> serveur de référence <-> simulateur de station.
// La caméra est simulée par une vidéo contenant le vrai QR code de la station (tests/fixtures/qr-eco-001.mjpeg).
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {createServer}=require('../server/server');
const {createStation}=require('../tools/station_simulator');
const base=process.env.ECOSCAN_TEST_URL || 'http://127.0.0.1:8000';
const SECRET='live-test-secret';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const server=createServer({stations:{'ECO-001':{label:'Station de test',secret:SECRET}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const api=`http://127.0.0.1:${server.address().port}`;
 const sim=createStation({api,id:'ECO-001',secret:SECRET,intervalMs:60000,stepMs:30});
 const fixture=path.join(__dirname,'fixtures','qr-eco-001.mjpeg');
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-video-capture=${fixture}`]});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',permissions:['camera']});
 const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR/.test(m.text()))errors.push(m.text())});
 await page.goto(base+'/app/',{waitUntil:'networkidle'});
 await page.evaluate(()=>localStorage.setItem('ecoscan-demo-points','7'));

 // 1. Connexion au serveur depuis l'app
 await page.click('.tabbar [data-go="station"]');
 await page.click('#mode-change');
 await page.fill('#api-url','ftp://exemple.test');await page.click('#api-save');
 assert.match(await page.locator('#api-status').textContent(),/https:\/\//,'non-https address refused');
 await page.fill('#api-url','http://127.0.0.1:9');await page.click('#api-save');
 await page.waitForFunction(()=>/ne répond pas|impossible/.test(document.getElementById('api-status').textContent));
 assert.equal(await page.evaluate(()=>EcoLive.enabled()),false,'a dead server is not saved');
 await page.fill('#api-url',api);await page.click('#api-save');
 await page.waitForFunction(()=>/Connecté : /.test(document.getElementById('api-status').textContent));
 assert.match(await page.locator('#api-status').textContent(),/0 station\(s\) en ligne sur 1/);
 await page.keyboard.press('Escape');
 assert.match(await page.locator('#mode-badge').textContent(),/Connecté à un serveur/);
 assert.equal(await page.locator('#scan-sim').isHidden(),true);assert.equal(await page.locator('#scan-cam').isVisible(),true);

 // 2. Station hors ligne, puis en ligne
 await page.click('#scan-manual');await page.fill('#station-id','ECO-001');await page.click('#manual button[type=submit]');
 await page.waitForFunction(()=>/ne répond pas/.test(document.getElementById('scan-status').textContent));
 await sim.heartbeat();
 await page.click('#manual button[type=submit]');
 await page.waitForSelector('[data-view="session"]:not([hidden])');
 assert.equal(await page.locator('#t-session').textContent(),'Station ECO-001');
 assert.equal(await page.locator('#objects').isHidden(),true,'no object chooser: the station detects objects');
 assert.equal(await page.locator('#deposit').isHidden(),true);assert.equal(await page.locator('#live-panel').isVisible(),true);
 await page.waitForFunction(()=>/Connecté à la station/.test(document.getElementById('live-status').textContent));

 // 3. Une autre personne ne peut pas prendre la station
 const other=await (await fetch(api+'/v1/devices',{method:'POST'})).json();
 const busy=await fetch(api+'/v1/sessions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+other.deviceToken},body:JSON.stringify({stationId:'ECO-001'})});
 assert.equal(busy.status,409);

 // 4. Dépôt réel : la station signale, le serveur crédite, l'app affiche
 const dep=await sim.deposit(['pet','can']);assert.equal(dep.ok,true);
 await page.waitForSelector('[data-view="result"]:not([hidden])');
 assert.equal(await page.locator('#t-result').textContent(),'Dépôt confirmé');
 assert.equal((await page.locator('#result-gain').textContent()).trim(),'+20 EcoPoints','connected mode never says fictitious points');
 assert.match(await page.locator('#result-route').textContent(),/PET \+ aluminium → station ECO-001/);
 assert.match(await page.locator('#result-note').textContent(),/une seule fois/);
 await page.click('[data-view="result"] [data-go="wallet"]');
 await page.waitForFunction(()=>document.getElementById('wallet-points').textContent==='20');
 assert.match(await page.locator('#history li').first().textContent(),/Dépôt · station ECO-001/);
 assert.match(await page.locator('#wallet-count').textContent(),/^1 dépôt$/);
 assert.equal(await page.locator('#reset').isHidden(),true,'the server balance cannot be reset from the phone');
 assert.equal(await page.evaluate(()=>localStorage.getItem('ecoscan-demo-points')),'7','demo balance untouched by connected mode');

 // 5. Doute, compartiment plein, plafond
 await page.click('.tabbar [data-go="station"]');
 await sim.deposit(['uncertain']);
 await page.waitForFunction(()=>document.getElementById('t-result').textContent==='Objet incertain');
 await page.click('#again');
 sim.setFill({pet:100});await sim.heartbeat();
 await page.waitForFunction(()=>[...document.querySelectorAll('#bins .bin')].some(b=>b.classList.contains('full')),null,{timeout:5000});
 assert.equal((await sim.deposit(['pet'])).error,'bin_full');
 await page.waitForFunction(()=>document.getElementById('t-result').textContent==='Dépôt non crédité');
 assert.match(await page.locator('#result-note').textContent(),/refusé/);
 sim.setFill({pet:45});await sim.heartbeat();
 await page.click('#again');

 // 6. Boutique : l'échange est enregistré par le serveur
 await page.click('.tabbar [data-go="shop"]');
 await page.click('.product:nth-child(1) button');
 await page.waitForFunction(()=>!document.getElementById('dialog-confirm').disabled);
 assert.doesNotMatch(await page.locator('#dialog-cost').textContent(),/fictifs/);
 await page.click('#dialog-confirm');
 await page.waitForFunction(()=>/Échange enregistré/.test(document.getElementById('dialog-status').textContent));
 assert.match(await page.locator('#dialog-status').textContent(),/reste à remettre/,'fulfilment is not promised');
 await page.keyboard.press('Escape');
 await page.click('.tabbar [data-go="wallet"]');
 await page.waitForFunction(()=>document.getElementById('wallet-points').textContent==='0');
 assert.match(await page.locator('#history li').first().textContent(),/Échange : Pochette seconde vie/);

 // 7. Fermer la session libère la station
 await page.click('.tabbar [data-go="station"]');await page.click('#close-session');
 await page.waitForSelector('[data-view="scan"]:not([hidden])');
 await sim.heartbeat();
 const free=await fetch(api+'/v1/sessions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+other.deviceToken},body:JSON.stringify({stationId:'ECO-001'})});
 assert.equal(free.status,201,'station free after the owner closes the session');
 await fetch(api+`/v1/sessions/${(await free.json()).sessionId}/close`,{method:'POST',headers:{Authorization:'Bearer '+other.deviceToken,'Content-Type':'application/json'},body:'{}'});

 // 8. Vraie caméra : le QR de la station est lu et la session s'ouvre toute seule
 await sim.heartbeat();
 await page.click('#scan-cam');
 await page.waitForSelector('[data-view="session"]:not([hidden])',{timeout:15000});
 assert.equal(await page.locator('#t-session').textContent(),'Station ECO-001','camera decoded the QR (jsQR path)');
 assert.equal(await page.locator('#cam').isHidden(),true,'camera stopped after the scan');
 await page.click('#close-session');

 // 9. Le QR ouvert avec l'appareil photo du téléphone : adresse ?s=ECO-001
 await sim.heartbeat();
 await page.goto(base+'/app/?s=ECO-001',{waitUntil:'networkidle'});
 await page.waitForSelector('[data-view="session"]:not([hidden])',{timeout:8000});
 assert.equal(await page.evaluate(()=>location.search),'','deep link parameters removed from the address');
 await page.click('#close-session');
 await page.goto(base+'/app/?s=ECO-999',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>/inconnue/.test(document.getElementById('scan-status').textContent));

 // 10. Retour à la démonstration : le solde de démonstration est intact
 await page.click('#mode-change');await page.fill('#api-url','');await page.click('#api-save');
 await page.keyboard.press('Escape');
 assert.match(await page.locator('#mode-badge').textContent(),/Concept simulé/);
 assert.equal(await page.locator('#home-points').textContent(),'7');
 assert.equal(await page.locator('#scan-sim').isVisible(),true);

 // 11. Caméra refusée ou absente : message clair et saisie manuelle toujours possible
 const ctx2=await (await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']})).newContext({viewport:{width:390,height:844},isMobile:true,reducedMotion:'reduce'});
 const p2=await ctx2.newPage();await p2.goto(base+'/app/',{waitUntil:'networkidle'});
 await p2.evaluate(a=>{localStorage.setItem('ecoscan-api',a)},api);await p2.reload({waitUntil:'networkidle'});
 await p2.click('.tabbar [data-go="station"]');await p2.click('#scan-cam');
 await p2.waitForFunction(()=>/caméra/.test(document.getElementById('scan-status').textContent)&&document.getElementById('cam').hidden);
 assert.match(await p2.locator('#scan-status').textContent(),/saisissez l’identifiant/i);
 assert.equal(await p2.locator('#scan-manual').isEnabled(),true);

 assert.deepEqual(errors,[],'no console or page errors');
 await browser.close();console.log('EcoScan connected-mode test passed');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
