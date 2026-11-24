// test: schedule.html ทะเบียนเรือ on tablets (641–1000px): nothing cut; phone cards + desktop unchanged — usage: node ships_tablet.test.js <root> <outprefix> [before]
const {chromium}=require('playwright');const {setup}=require('./mock.js');
const R=process.argv[2], OUT=process.argv[3], BEFORE=process.argv[4]==='before'; let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++;};
(async()=>{
 const b=await chromium.launch();
 for(const w of [390,700,768,900,1000,1280]){
  const p=await b.newPage({viewport:{width:w,height:1024},hasTouch:w<1100,isMobile:w<500});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  const {log}=await setup(p);
  await p.goto('file://'+R+'/schedule.html');await p.waitForTimeout(1800);
  await p.click('#tab-ships');await p.waitForTimeout(500);
  if([390,768,1280].includes(w)) await p.screenshot({path:`${OUT}_${w}.png`});
  if(BEFORE){ await p.close(); continue; }
  const clip=await p.$$eval('#shipBody input',a=>a.filter(i=>i.value && i.scrollWidth>i.clientWidth+1).map(i=>i.dataset.sf+':'+i.value));
  ok(clip.length===0, `${w}: no clipped field ${JSON.stringify(clip)}`);
  const th=await p.$$eval('#view-ships thead th',a=>a.filter(t=>t.offsetParent&&t.scrollWidth>t.clientWidth+1).map(t=>t.textContent));
  ok(th.length===0, `${w}: no clipped header ${JSON.stringify(th)}`);
  const fs=await p.$$eval('#shipBody input[data-sf="name"]',a=>a.map(i=>parseFloat(getComputedStyle(i).fontSize)));
  ok(fs.length===5 && Math.min(...fs)>=12 && fs.filter(f=>f>=15).length>=4, `${w}: name fonts ${fs}`);
  const docW=await p.evaluate(()=>document.documentElement.scrollWidth);
  ok(docW<=w, `${w}: no page side-scroll (${docW})`);
  // edit LOA still saves; renaming to a long name keeps it fitting
  const n0=log.filter(x=>x==='updateShip').length;
  const loa=p.locator('#shipBody input[data-sf="loa"]').nth(1);
  await loa.click();await loa.fill('101');await loa.press('Enter');await p.waitForTimeout(500);
  ok(log.filter(x=>x==='updateShip').length===n0+1, `${w}: LOA edit saved`);
  // search → re-render still fits
  await p.fill('#shipQ','MAERSK');await p.waitForTimeout(300);
  const c2=await p.$$eval('#shipBody input',a=>a.filter(i=>i.value && i.scrollWidth>i.clientWidth+1).length);
  ok(c2===0, `${w}: after search nothing cut`);
  await p.fill('#shipQ','');await p.waitForTimeout(300);
  // rotate / resize keeps it fitting
  await p.setViewportSize({width:w===768?1000:768,height:1024});await p.waitForTimeout(400);
  const c3=await p.$$eval('#shipBody input',a=>a.filter(i=>i.value && i.scrollWidth>i.clientWidth+1).length);
  ok(c3===0, `${w}: after resize nothing cut`);
  for(const t of ['tab-line','tab-work','tab-pilots']){ await p.click('#'+t);await p.waitForTimeout(300); }
  ok(errs.length===0, `${w}: no page errors ${errs}`);
  await p.close();
 }
 await b.close(); console.log(fail?`${fail} FAILED`:'ALL PASS'); process.exit(fail?1:0);
})();
