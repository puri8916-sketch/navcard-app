// test: pilot_log.html dark mode — table text (default black ink), form field titles, แจ้งเรืออย. titles/rows readable; light mode unchanged — usage: node log_dark_mode.test.js <root> <outprefix>
const {chromium}=require('playwright');const R=process.argv[2],OUT=process.argv[3];
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
const seed=()=>{SyncStore.put('calls','c1',{date:curDate,t:1,vessel:'MAERSK ALPHA',job:'SGZ1/70',eta:'0130',pilotIn:'12',berth:'PRATEEP',agent:'ABC',atd:'1430',pilotOut:'7',shifts:[{order:'0900',pilot:'5',fromBerth:'PRATEEP',berth:'SAWAT'}]})};
const lum=c=>{const m=c.match(/[\d.]+/g).map(Number);return (m[0]*299+m[1]*587+m[2]*114)/1000};
(async()=>{const b=await chromium.launch();
 for(const scheme of ['dark','light']){const dark=scheme==='dark';
  for(const w of [390,1280]){
   const p=await b.newPage({viewport:{width:w,height:w<500?844:800},colorScheme:scheme,isMobile:w<500,hasTouch:w<500});const errs=[];p.on('pageerror',e=>errs.push(e.message));
   await p.addInitScript({path:R+'/sync_client.js'});await p.goto('file://'+R+'/pilot_log.html');await p.waitForTimeout(700);await p.evaluate(seed);await p.waitForTimeout(400);
   if(w<500)await p.locator('#lvSeg button[data-v="table"]').click().catch(()=>{});await p.waitForTimeout(200);
   const cells=await p.$$eval('#logBody tr.main td',a=>a.filter(td=>td.textContent.trim()&&!td.querySelector('.dash')).map(td=>getComputedStyle(td).color));
   ok(cells.length>5&&cells.every(c=>dark?lum(c)>150:lum(c)<60), `${scheme} ${w}: table text ${dark?'light':'black (unchanged)'} ${[...new Set(cells)]}`);
   const job=await p.$eval('#logBody .jobno',x=>getComputedStyle(x).color);ok(dark?lum(job)>150:lum(job)<60, `${scheme} ${w}: card No. ${job}`);
   const tg=await p.$eval('#toolsTgl',x=>getComputedStyle(x).color);ok(dark?lum(tg)>110:lum(tg)<90, `${scheme} ${w}: ซ่อน button text ${tg}`);
   await p.evaluate(()=>openEditor(allCalls[0]));await p.waitForTimeout(300);
   const labs=await p.$$eval('#sheet label.f,#sheet .stbox',a=>a.filter(x=>x.offsetParent).map(x=>getComputedStyle(x).color));
   ok(labs.length>10&&labs.every(c=>dark?lum(c)>110:lum(c)<80), `${scheme} ${w}: form field titles readable ${[...new Set(labs)]}`);
   if(w===1280||dark)await p.screenshot({path:`${OUT}_${scheme}_${w}_form.png`});await p.click('#edClose');
   if(dark)await p.screenshot({path:`${OUT}_${scheme}_${w}_table.png`});
   ok(errs.length===0, `${scheme} ${w}: no page errors ${errs}`);await p.close()}
  // แจ้งเรืออย.
  const p=await b.newPage({viewport:{width:1280,height:800},colorScheme:scheme});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript({path:R+'/sync_client.js'});await p.addInitScript(()=>{window.__ONLY__='ay'});await p.goto('file://'+R+'/pilot_log.html');await p.waitForTimeout(700);await p.evaluate(seed);await p.waitForTimeout(500);
  ok(await p.locator('#ayRows .ay-row').count()>0, `ay ${scheme}: legs listed`);
  await p.locator('#ayRows .ay-row').first().click();await p.waitForTimeout(200);
  const ay=await p.$$eval('.ay-h,.ay-row',a=>a.map(x=>getComputedStyle(x).color));ok(ay.every(c=>dark?lum(c)>150:lum(c)<60), `ay ${scheme}: titles + rows ${dark?'light':'black'} ${[...new Set(ay)]}`);
  const on=await p.$eval('.ay-row.on',x=>getComputedStyle(x).backgroundColor);ok(dark?lum(on)<90:on==='rgb(234, 247, 228)', `ay ${scheme}: ticked row background ${on}`);
  ok((await p.textContent('#ayText')).length>5, `ay ${scheme}: text built`);
  await p.screenshot({path:`${OUT}_${scheme}_ay.png`});ok(errs.length===0, `ay ${scheme}: no page errors ${errs}`);await p.close()}
 // explicit theme attribute: data-theme=light on a dark device stays light
 const p=await b.newPage({viewport:{width:1280,height:800},colorScheme:'dark'});await p.addInitScript({path:R+'/sync_client.js'});await p.addInitScript(()=>{window.__THEME__='light'});
 await p.goto('file://'+R+'/pilot_log.html');await p.waitForTimeout(700);await p.evaluate(seed);await p.waitForTimeout(400);
 ok(lum(await p.$eval('#logBody tr.main td.ship',x=>getComputedStyle(x).color))<60, `app theme light (window.__THEME__) on a dark device: table text stays black`);await p.close();
 await b.close();console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0)})();
