// test: schedule.html แก้ไข zoom buttons (− % + พอดีจอ) on phones/tablets; hidden on desktop; smoke of other tabs — usage: node board_zoom.test.js <root> <outprefix>
const {chromium}=require('playwright');const R=process.argv[2],OUT=process.argv[3];const {setup}=require(R+'/.auto/tests/mock.js');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
(async()=>{const b=await chromium.launch();
 for(const w of [390,768,1280]){const small=w<=900;
  const p=await b.newPage({viewport:{width:w,height:w<500?844:1000},hasTouch:w<1000,isMobile:w<500});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));const {log}=await setup(p);
  await p.goto('file://'+R+'/schedule.html');await p.waitForTimeout(1500);
  const z=()=>p.$eval('#board',x=>parseFloat(x.style.zoom)||1), val=()=>p.textContent('#bzVal');
  ok(await p.locator('#bzGrp').isVisible()===small, `${w}: zoom buttons ${small?'shown':'hidden'}`);
  ok(await p.evaluate(()=>document.documentElement.scrollWidth)<=w, `${w}: no page side-scroll`);
  if(small){
   const z0=await z();ok(z0<1&&await val()===Math.round(z0*100)+'%', `${w}: opens fitted to width (${await val()})`);
   ok(await p.locator('#bzFit.on').count()===1, `${w}: พอดีจอ marked as active`);
   const bxs=await p.$$eval('#bzGrp .btn',a=>a.map(x=>x.getBoundingClientRect()).map(r=>[r.right<=innerWidth,r.height]));ok(bxs.every(([i,h])=>i&&h>=30), `${w}: buttons on screen and tappable ${JSON.stringify(bxs)}`);
   await p.screenshot({path:`${OUT}_${w}.png`});
   for(let i=0;i<5;i++)await p.click('#bzIn');await p.waitForTimeout(200);
   const z1=await z();ok(Math.abs(z1-(Math.round(z0*10)/10+0.5))<0.051&&await val()===Math.round(z1*100)+'%', `${w}: + five times → ${await val()}`);
   ok(await p.locator('#bzFit.on').count()===0, `${w}: พอดีจอ no longer active after zooming`);
   const sc=await p.$eval('#board',x=>{const W=x.closest('.scrollx');return [W.scrollWidth>W.clientWidth,W.scrollLeft]});ok(sc[0]&&sc[1]>0, `${w}: board scrolls sideways, view kept near the middle (${sc})`);
   await p.screenshot({path:`${OUT}_${w}_zoomed.png`});
   await p.click('#bzOut');await p.waitForTimeout(100);ok(Math.abs(await z()-(z1-0.1))<0.051, `${w}: − zooms out`);
   for(let i=0;i<40;i++)await p.click('#bzIn');ok(await z()===2.5, `${w}: max 250%`);
   for(let i=0;i<40;i++)await p.click('#bzOut');ok(await z()===0.2, `${w}: min 20%`);
   await p.click('#bzFit');await p.waitForTimeout(200);ok(Math.abs(await z()-z0)<0.01&&await p.locator('#bzFit.on').count()===1, `${w}: พอดีจอ returns to fit`);
   // zoom kept while editing a cell; day change refits
   await p.click('#bzIn');await p.click('#bzIn');const zk=await z();
   const cell=p.locator('#board td[contenteditable], #board input').first();if(await cell.count()){await cell.click({force:true});await p.keyboard.press('Escape')}
   await p.waitForTimeout(300);ok(Math.abs(await z()-zk)<0.01, `${w}: zoom kept after tapping a cell`);
   const tabs=p.locator('#dstrip button, #dstrip .tab, #dstrip [data-d]');if(await tabs.count()>1){await tabs.nth(0).click();await p.waitForTimeout(500);ok(await p.locator('#bzFit.on').count()===1&&await val()===Math.round(await z()*100)+'%', `${w}: another day → fits again, % updated`)}
  }else{ok(await z()===1, `${w}: desktop board unchanged at 100%`)}
  // smoke other tabs
  await p.click('#tab-work');await p.waitForTimeout(400);ok(await p.locator('#bzGrp').isHidden(), `${w}: zoom buttons only on แก้ไข`);
  if(await p.locator('#tab-print').isVisible()){await p.click('#tab-print');await p.waitForTimeout(400);const pv=await p.textContent('#pzVal');await p.click('#pzIn');ok(await p.textContent('#pzVal')!==pv, `${w}: พิมพ์ zoom still works`)}
  for(const t of ['#tab-ships','#tab-pilots'])if(await p.locator(t).isVisible()){await p.click(t);await p.waitForTimeout(300)}await p.waitForTimeout(300);await p.click('#tab-line');await p.waitForTimeout(300);
  ok(await p.locator('#board table').count()>0, `${w}: back on แก้ไข, board rendered`);
  ok(errs.length===0, `${w}: no page errors ${errs}`);await p.close()}
 await b.close();console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0)})();
