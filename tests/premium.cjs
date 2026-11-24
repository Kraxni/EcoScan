const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ECOSCAN_TEST_URL || 'http://127.0.0.1:8000';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];
 // Desktop: living hero + pinned scroll story
 let page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'networkidle'});await page.waitForTimeout(1800);
 assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('fx')),'fx enabled');
 assert.equal(await page.locator('#hero-canvas').count(),0,'decorative canvas removed');
 assert.equal(await page.locator('img[src*="assets/illustrations/"]').count(),4,'four optimised illustrations');
 assert.ok(await page.locator('.hero-product-frame img').evaluate(e=>getComputedStyle(e).opacity==='1'),'LCP image never hidden');
 assert.ok(await page.locator('.h1-line>span').first().evaluate(e=>getComputedStyle(e).opacity==='1'));
 assert.equal(await page.locator('#accueil h1').getAttribute('aria-label'),'Un seul geste. Un nouveau cycle.');
 assert.equal(await page.locator('h1').count(),5,'one h1 per reading path');
 assert.ok(!(await page.evaluate(()=>typeof Lenis!=='undefined')),'native scrolling: no smooth-scroll overlay');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('header')).backdropFilter),'none','no backdrop blur on the header');
 const fonts=await page.evaluate(()=>document.fonts.check('16px Inter'));
 assert.ok(fonts,'self-hosted fonts load');
 assert.equal(await page.evaluate(()=>typeof ScrollTrigger),'undefined','no scroll-measuring plugin loaded');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.story-stage')).position),'sticky','story pinned in CSS (sticky)');
 const [start,end]=await page.evaluate(()=>{const p=document.getElementById('story-pin'),s=document.querySelector('.story-stage'),h=document.querySelector('header').offsetHeight;const top=p.getBoundingClientRect().top+scrollY-h;return [top,top+p.offsetHeight-s.offsetHeight];});
 assert.ok(end-start>1500,'story is pinned over several screens');
 const go=async f=>{await page.evaluate(y=>window.scrollTo(0,y),start+(end-start)*f);await page.waitForTimeout(900);};
 await go(.1);assert.match(await page.locator('#story-steps .is-active strong').textContent(),/connecter/i);
 await go(.5);assert.match(await page.locator('#story-steps .is-active strong').textContent(),/Observer/);
 await go(.95);assert.match(await page.locator('#story-steps .is-active strong').textContent(),/Confirmer/);
 assert.equal(await page.locator('#sg-points').textContent(),'10','PET credits 10 fictitious points');
 // uncertain object: control route, zero points, honest message
 await page.click('.story-picker [data-kind=cup]');await go(.95);
 assert.equal(await page.locator('#sg-points').textContent(),'0');
 assert.match(await page.locator('#story-confirm-text').textContent(),/Aucun point/);
 assert.match(await page.locator('#story-route-text').textContent(),/contrôle isolée/);
 assert.equal(await page.locator('.story-picker [aria-checked=true]').count(),1);
 // keyboard on the radiogroup
 await page.locator('.story-picker [data-kind=cup]').focus();await page.keyboard.press('ArrowRight');
 assert.equal(await page.locator('.story-picker [aria-checked=true]').getAttribute('data-kind'),'pet');
 // step buttons scroll the story
 await page.locator('#story-steps li[data-step="2"] button').click();await page.waitForTimeout(1800);
 assert.match(await page.locator('#story-steps .is-active strong').textContent(),/Observer/);
 // view-change curtain does not block navigation
 await page.evaluate(()=>{location.hash='demo';});await page.locator('#demo').waitFor({state:'visible'});await page.waitForTimeout(1300);
 assert.equal(await page.locator('.curtain').evaluate(e=>getComputedStyle(e).display),'none');
 await page.close();
 // Reduced motion: no smooth scroll, no split words, readable static story
 page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'networkidle'});
 assert.ok(!(await page.evaluate(()=>document.documentElement.classList.contains('fx'))));
 assert.equal(await page.locator('.w').count(),0);
 assert.ok(await page.locator('#story-pin.is-static').count()===1);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.story-stage')).position),'static','no pinning with reduced motion');
 assert.ok(await page.locator('#story-steps li small').first().isVisible());
 await page.close();
 // Mobile (touch): no overflow, story fits one screen, content reachable
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'networkidle'});await page.waitForTimeout(1800);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  const box=await page.locator('.story-stage').boundingBox();assert.ok(box.height<=844,'story stage fits the viewport on phones: '+box.height);
 await page.close();
 // No JavaScript: every story step stays readable
 const nojs=await browser.newContext({javaScriptEnabled:false});page=await nojs.newPage();
 await page.goto(base);
 assert.ok(await page.locator('#story-steps li small').first().isVisible());
 assert.equal(await page.locator('.story-picker').isVisible(),false);
 assert.match(await page.locator('#accueil h1').textContent(),/Un seul/);
 await browser.close();
 assert.deepEqual(errors,[]);
 console.log('PASS premium: self-hosted fonts, hero canvas, pinned scroll story with 4 objects/PET credit/uncertain no-credit, keyboard radiogroup, step buttons, curtain, reduced motion static, mobile fit/no overflow, no-JS readable, zero JS errors.');
})().catch(e=>{console.error(e);process.exit(1);});
