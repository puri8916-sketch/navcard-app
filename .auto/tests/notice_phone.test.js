// แจ้งเรือขาดย้ายท่า: phone/tablet/desktop layout + behaviour unchanged. Run: node .auto/tests/notice_phone.test.js [outDir]
const {chromium}=require('playwright');const path=require('path');const {setup}=require('./mock.js');
const ROOT=path.resolve(__dirname,'../..');const OUT=process.argv[2]||'';let fail=0;
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
(async()=>{const b=await chromium.launch();
for(const w of [390,768,1280]){
 const p=await b.newPage({viewport:{width:w,height:w<500?844:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{window.__ONLY__='notice'});await setup(p);
 await p.goto('file://'+ROOT+'/schedule.html');await p.waitForTimeout(700);
 await p.fill('.nt-ship','MAERSK ALPHA');await p.press('.nt-ship','Tab');await p.fill('.nt-ref','ricm123');await p.press('.nt-ref','Tab');
 await p.fill('.nt-n','2');await p.press('.nt-n','Tab');await p.waitForTimeout(150);
 await p.fill('.nt-dt >> nth=0','300800');await p.fill('.nt-b[data-k=f] >> nth=0','sawat');await p.press('.nt-b[data-k=f] >> nth=0','Tab');
 await p.fill('.nt-b[data-k=to] >> nth=0','prateep');await p.press('.nt-b[data-k=to] >> nth=0','Tab');
 ok(await p.inputValue('.nt-b[data-k=f] >> nth=1')==='PRATEEP',`${w}: next leg's จากท่า auto-filled`);
 await p.click('#ntAdd');await p.fill('.nt-ship >> nth=1','OCEAN BETA');await p.press('.nt-ship >> nth=1','Tab');await p.waitForTimeout(100);
 const txt=await p.textContent('#ntText');
 ok(txt.startsWith('MAERSK ALPHA / RICM123 ขาดย้าย 2 ขา\n\nย้าย 30-0800 SAWAT<>PRATEEP\n\nย้าย PRATEEP<>')&&txt.includes('OCEAN BETA'),`${w}: LINE text unchanged format`);
 ok(await p.$$eval('.nt-del',x=>x.length)===2,`${w}: delete buttons shown with 2 ships`);
 const lay=await p.evaluate(()=>{const r=[];document.querySelectorAll('.nt-card').forEach(c=>{const cb=c.getBoundingClientRect();
   c.querySelectorAll('input,button,span').forEach(e=>{const b=e.getBoundingClientRect();if(b.width&&(b.left<cb.left-1||b.right>cb.right+1))r.push(e.className||e.textContent)})});
   const leg=document.querySelector('.nt-leg');const f=leg.querySelector('[data-k=f]').getBoundingClientRect(),to=leg.querySelector('[data-k=to]').getBoundingClientRect(),dt=leg.querySelector('.nt-dt').getBoundingClientRect();
   return {over:r,sw:document.documentElement.scrollWidth,iw:innerWidth,fTo:Math.abs(f.top-to.top),fw:f.width,tw:to.width,dtTop:dt.top,fTop:f.top,
     del:document.querySelector('.nt-del').getBoundingClientRect().height,minFont:Math.min(...[...document.querySelectorAll('.nt-card input')].map(i=>parseFloat(getComputedStyle(i).fontSize)))}});
 ok(lay.over.length===0,`${w}: nothing sticks out of the cards ${lay.over.join(',')}`);
 ok(lay.sw<=lay.iw,`${w}: no sideways scroll (${lay.sw}/${lay.iw})`);
 ok(lay.fTo<2,`${w}: จากท่า and ไปท่า on one line`);
 ok(lay.minFont>=16,`${w}: input font >=16px (no iOS zoom) ${lay.minFont}`);
 if(w<=640){ok(lay.fw>=100&&lay.tw>=100&&Math.abs(lay.fw-lay.tw)<2,`${w}: berth boxes equal & wide (${lay.fw|0}/${lay.tw|0})`);
   ok(lay.fTop>lay.dtTop+20,`${w}: berths on the line under the time`);ok(lay.del>=44,`${w}: ✕ is a 44px tap target`);}
 else ok(Math.abs(lay.fTop-lay.dtTop)<2,`${w}: leg stays on one line (tablet/desktop)`);
 // remove 2nd ship (empty legs) -> back to one ship, no ✕
 p.once('dialog',d=>d.accept());await p.click('.nt-del >> nth=1');await p.waitForTimeout(100);
 ok(await p.$$eval('.nt-card',x=>x.length)===1&&await p.$$eval('.nt-del',x=>x.length)===0,`${w}: delete works, ✕ gone with one ship`);
 if(OUT)await p.screenshot({path:`${OUT}/test-${w}.png`,fullPage:true});
 ok(errs.length===0,`${w}: no page errors ${errs}`);await p.close();
 // smoke: normal schedule page still renders
 const q=await b.newPage({viewport:{width:w,height:900}});const e2=[];q.on('pageerror',e=>e2.push(e.message));await setup(q);
 await q.goto('file://'+ROOT+'/schedule.html');await q.waitForTimeout(900);
 ok(await q.isHidden('#view-notice')&&e2.length===0,`${w}: schedule.html (no notice mode) loads, notice hidden ${e2}`);await q.close();
}
await b.close();console.log(fail?`${fail} FAILED`:'ALL PASS');process.exit(fail?1:0)})();
