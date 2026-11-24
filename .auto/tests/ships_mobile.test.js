// test: schedule.html ทะเบียนเรือ (mobile cards + desktop unchanged) — usage: node t1.js <root> <outprefix> [before]   (before = only the layout checks, for the old main page)
const {chromium}=require('playwright');const {setup}=require('./mock.js');
const R=process.argv[2], OUT=process.argv[3], BEFORE=process.argv[4]==='before'; let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++;};
(async()=>{
 const b=await chromium.launch();
 for(const w of [360,390,640,1280]){
  const p=await b.newPage({viewport:{width:w,height:w<500?844:800},hasTouch:w<700,isMobile:w<700});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  const {log}=await setup(p);
  await p.goto('file://'+R+'/schedule.html');await p.waitForTimeout(1800);
  await p.evaluate(()=>document.getElementById('tab-ships').click());await p.waitForTimeout(600);
  await p.screenshot({path:`${OUT}_${w}.png`});
  // every input shows its full value (no clipping)
  const clip=await p.$$eval('#shipBody input',a=>a.filter(i=>i.value && !(i.dataset.sf==='name'&&i.value.length>26) && i.scrollWidth>i.clientWidth+1).map(i=>i.dataset.sf+':'+i.value));
  ok(clip.length===0, `${w}: no clipped inputs ${JSON.stringify(clip)}`);
  const docW=await p.evaluate(()=>document.documentElement.scrollWidth);
  ok(docW<=w, `${w}: no page side-scroll (${docW})`);
  const del=await p.$$eval('#shipBody [data-delship]',a=>a.map(x=>{const r=x.getBoundingClientRect();return r.right<=innerWidth&&r.width>0}));
  ok(del.length===5&&del.every(Boolean), `${w}: all ลบ buttons visible`);
  if(!BEFORE){
   // edit LOA through the card → updateShip
   const n0=log.filter(x=>x==='updateShip').length;
   const loa=p.locator('#shipBody input[data-sf="loa"]').first();
   await loa.click();await loa.fill('181');await loa.press('Enter');await p.waitForTimeout(400);
   ok(log.filter(x=>x==='updateShip').length===n0+1, `${w}: LOA edit saved (updateShip)`);
   // search filters cards
   await p.fill('#shipQ','OCEAN');await p.waitForTimeout(300);
   ok(await p.locator('#shipBody tr').count()===1, `${w}: search shows 1 card`);
   await p.fill('#shipQ','ZZZZ');await p.waitForTimeout(300);
   const em=await p.locator('#shipBody td.empty').boundingBox();
   ok(em&&em.width>w*0.6, `${w}: "ไม่พบเรือ" spans the row (${em&&Math.round(em.width)})`);
   await p.screenshot({path:`${OUT}_${w}_empty.png`});
   await p.fill('#shipQ','');await p.waitForTimeout(300);
   // delete: arm then confirm
   const d=p.locator('#shipBody [data-delship]').last();await d.click();ok((await d.textContent())==='ยืนยันลบ', `${w}: ลบ arms`);
   const ov=await d.evaluate(b=>{const r=b.getBoundingClientRect();return [...b.closest('tr').querySelectorAll('input')].some(i=>{const q=i.getBoundingClientRect();return q.left<r.right&&r.left<q.right&&q.top<r.bottom&&r.top<q.bottom})});
   ok(!ov, `${w}: armed ยืนยันลบ does not cover any field`);
   await d.click();await p.waitForTimeout(300);ok(await p.locator('#shipBody tr').count()===4 && log.includes('deleteShip'), `${w}: delete works`);
   // add ship
   await p.fill('#nsName','NEW ONE');await p.fill('#nsLoa','77');await p.click('#shipAdd button[type=submit]');await p.waitForTimeout(400);
   ok(log.includes('saveShip'), `${w}: add ship saves`);
   // other tabs still render
   for(const k of ['tab-line','tab-work','tab-pilots']){await p.evaluate(k=>document.getElementById(k).click(),k);await p.waitForTimeout(500);}
   ok(await p.locator('#pilotBody tr').count()>=5, `${w}: ผก. tab renders`);
  }
  ok(errs.length===0, `${w}: no page errors ${errs}`);
  await p.close();
 }
 await b.close(); console.log(fail?'FAILED '+fail:'ALL PASS'); process.exit(fail?1:0);
})();
