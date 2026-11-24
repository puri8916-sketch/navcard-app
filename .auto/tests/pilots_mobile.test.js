// test: schedule.html ผก. & เวร (mobile pilot cards + desktop unchanged) — usage: node t2.js <root> <outprefix> [full]
const {chromium}=require('playwright');const {setup}=require('./mock.js');
const R=process.argv[2], OUT=process.argv[3], FULL=process.argv[4]==='full'; let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++;};
(async()=>{
 const b=await chromium.launch();
 for(const w of [390,1280]){
  const p=await b.newPage({viewport:{width:w,height:w<500?844:800},hasTouch:w<500,isMobile:w<500});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  const {log,st}=await setup(p);
  await p.goto('file://'+R+'/schedule.html');await p.waitForTimeout(1800);
  await p.evaluate(()=>document.getElementById('tab-pilots').click());await p.waitForTimeout(600);
  // give pilot 3 a nickname so the name box has text
  await p.evaluate(()=>{});
  await p.screenshot({path:`${OUT}_${w}.png`});
  const clip=await p.$$eval('#pilotBody input',a=>a.filter(i=>i.value && i.scrollWidth>i.clientWidth+1).map(i=>i.value));
  ok(clip.length===0, `${w}: phone numbers not cut ${JSON.stringify(clip)}`);
  const ph=await p.$$eval('#pilotBody input[data-pphone]',a=>a.map(i=>i.getBoundingClientRect().width));
  ok(ph.every(x=>x>=110), `${w}: phone boxes wide enough ${ph.map(Math.round)}`);
  const docW=await p.evaluate(()=>document.documentElement.scrollWidth);
  ok(docW<=w, `${w}: no page side-scroll (${docW})`);
  if(FULL){
   const nm=p.locator('#pilotBody input.pname').first();await nm.click();await nm.fill('สมชาย');await nm.press('Tab');await p.waitForTimeout(400);
   const phn=p.locator('#pilotBody input[data-pphone]').first();await phn.fill('0899999999');await phn.press('Tab');await p.waitForTimeout(400);
   ok(log.includes('savePilots'), `${w}: phone edit saves (savePilots)`);
   await p.fill('#npNo','21');await p.fill('#npPhone','0812345678');await p.click('#pilotAdd button[type=submit]');await p.waitForTimeout(400);
   ok(await p.locator('#pilotBody tr').count()===6, `${w}: add pilot → 6 cards`);
   const d=p.locator('#pilotBody [data-delpilot]').last();await d.click();ok((await d.textContent())==='ยืนยันลบ', `${w}: ลบ arms`);
   await d.click();await p.waitForTimeout(300);ok(await p.locator('#pilotBody tr').count()===5, `${w}: delete pilot works`);
   // duty box still works
   const di=p.locator('#dutyBody [data-duty]').first();await di.click();await di.fill('7');await di.press('Enter');await p.waitForTimeout(400);
   ok(log.includes('saveDuty'), `${w}: duty saves`);
   await p.screenshot({path:`${OUT}_${w}_after_edit.png`,fullPage:true});
   for(const k of ['tab-line','tab-work','tab-ships']){await p.evaluate(k=>document.getElementById(k).click(),k);await p.waitForTimeout(500);}
   ok(await p.locator('#shipBody tr').count()>=5, `${w}: ทะเบียนเรือ renders`);
  }
  ok(errs.length===0, `${w}: no page errors ${errs}`);
  await p.close();
 }
 await b.close(); console.log(fail?'FAILED '+fail:'ALL PASS'); process.exit(fail?1:0);
})();
