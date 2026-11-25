// test: schedule.html ทะเบียนเรือ on tablets (641–1000px): nothing cut; phone cards + desktop unchanged — usage: node ships_tablet.test.js <root> <outprefix> [before]
const {chromium}=require('playwright');const {setup}=require('./mock.js');
const R=process.argv[2], OUT=process.argv[3], BEFORE=process.argv[4]==='before'; let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++;};
(async()=>{
 const b=await chromium.launch();
 for(const w of [390,641,700,768,900,1000,1024,1280]){
  const p=await b.newPage({viewport:{width:w,height:1024},hasTouch:w<1100,isMobile:w<500});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  const {log}=await setup(p);
  await p.goto('file://'+R+'/schedule.html');await p.waitForTimeout(1800);
  await p.click('#tab-ships');await p.waitForTimeout(500);
  if([390,768,1280].includes(w)) await p.screenshot({path:`${OUT}_${w}.png`});
  if(BEFORE){ await p.close(); continue; }
  const clip=await p.$$eval('#shipBody input',a=>a.filter(i=>i.value && i.scrollWidth>i.clientWidth+1 && !(innerWidth<=640 && i.dataset.sf==='name' && i.title)).map(i=>i.dataset.sf+':'+i.value));
  ok(clip.length===0, `${w}: no clipped field ${JSON.stringify(clip)}`);
  const th=await p.$$eval('#view-ships thead th',a=>a.filter(t=>t.offsetParent&&t.scrollWidth>t.clientWidth+1).map(t=>t.textContent));
  ok(th.length===0, `${w}: no clipped header ${JSON.stringify(th)}`);
  const fs=await p.$$eval('#shipBody input[data-sf="name"]',a=>a.map(i=>parseFloat(getComputedStyle(i).fontSize)));
  ok(fs.length===5 && Math.min(...fs)>=(w<=640?16:12) && fs.filter(f=>f>=15).length>=4, `${w}: name fonts ${fs}`);
  const docW=await p.evaluate(()=>document.documentElement.scrollWidth);
  ok(docW<=w, `${w}: no page side-scroll (${docW})`);
  // edit LOA still saves; renaming to a long name keeps it fitting
  const n0=log.filter(x=>x==='updateShip').length;
  const loa=p.locator('#shipBody input[data-sf="loa"]').nth(1);
  await loa.click();await loa.fill('101');await loa.press('Enter');await p.waitForTimeout(500);
  ok(log.filter(x=>x==='updateShip').length===n0+1, `${w}: LOA edit saved`);
  // rename to a long name / long agent in place → refits; back to a short one → full size again
  const nm=p.locator('#shipBody input[data-sf="name"]').nth(1);
  await nm.click();await nm.fill('VERY LONG SHIP NAME OCEAN STAR');await nm.press('Tab');await p.waitForTimeout(700);
  const ag=p.locator('#shipBody input[data-sf="agent"]').nth(2);
  await ag.click();await ag.fill('SOUTHERN STAR MARINE AGENCY');await ag.press('Tab');await p.waitForTimeout(700);
  const c1=await p.$$eval('#shipBody input',a=>a.filter(i=>i.value && i.scrollWidth>i.clientWidth+1 && !i.title).map(i=>i.value));
  ok(c1.length===0, `${w}: long rename/agent fits (or shows full text on hover) ${JSON.stringify(c1)}`);
  const lo=await p.$$eval('#shipBody input[data-sf]',a=>Math.min(...a.filter(i=>i.value).map(i=>parseFloat(getComputedStyle(i).fontSize))));
  ok(lo>=(w<=640?16:12), `${w}: smallest font ${lo}`);
  // slow sheet (2.5 s): the saved, upper-cased long name still fits (or has its tooltip) once the answer arrives
  if(w===768||w===1024){
   await p.route('https://mock.test/**',async r=>{ let a=null; try{ a=JSON.parse(r.request().postData()||'{}').action }catch(e){}
     if(a==='updateShip'){ await new Promise(z=>setTimeout(z,2500)); return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,data:true})}); } return r.fallback(); });
   const n3=p.locator('#shipBody input[data-sf="name"]').nth(3);
   await n3.click();await n3.fill('wwww wwww wwww wwww wwww wwww');await n3.press('Tab');await p.waitForTimeout(3500);
   const st=await n3.evaluate(i=>({v:i.value,cut:i.scrollWidth>i.clientWidth+1,t:i.title}));
   ok(st.v==='WWWW WWWW WWWW WWWW WWWW WWWW' && (!st.cut||st.t===st.v), `${w}: slow save → fits or tooltip ${JSON.stringify(st)}`);
   await p.unroute('https://mock.test/**');
  }
  // search → re-render still fits
  await p.fill('#shipQ','MAERSK');await p.waitForTimeout(300);
  const c2=await p.$$eval('#shipBody input',a=>a.filter(i=>i.value && i.scrollWidth>i.clientWidth+1 && !i.title).length);
  ok(c2===0, `${w}: after search nothing cut`);
  await p.fill('#shipQ','');await p.waitForTimeout(300);
  // rotate / resize keeps it fitting
  await p.setViewportSize({width:w===768?1000:768,height:1024});await p.waitForTimeout(400);
  const c3=await p.$$eval('#shipBody input',a=>a.filter(i=>i.value && i.scrollWidth>i.clientWidth+1 && !i.title).length);
  ok(c3===0, `${w}: after resize nothing cut`);
  for(const t of ['tab-line','tab-work','tab-pilots']){ await p.click('#'+t);await p.waitForTimeout(300); }
  ok(errs.length===0, `${w}: no page errors ${errs}`);
  await p.close();
 }
 await b.close(); console.log(fail?`${fail} FAILED`:'ALL PASS'); process.exit(fail?1:0);
})();
