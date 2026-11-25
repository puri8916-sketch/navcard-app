// test: pilot_log.html แจ้งเรืออย. (window.__ONLY__='ay') phone layout — usage: node ay_phone.test.js <root> <outprefix> [before]
const {chromium}=require('playwright');
const R=process.argv[2], OUT=process.argv[3], BEFORE=process.argv[4]==='before'; let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++;};
async function open(b,w,ay){
 const p=await b.newPage({viewport:{width:w,height:w<500?844:900},hasTouch:w<700,isMobile:w<700});
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 if(ay) await p.addInitScript(()=>{window.__ONLY__='ay'});
 await p.addInitScript({path:R+'/sync_client.js'});
 await p.goto('file://'+R+'/pilot_log.html');await p.waitForTimeout(700);
 await p.evaluate(()=>{const d=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);
  SyncStore.put('calls','c1',{id:'c1',date:d,vessel:'MAERSK ALPHA EXPRESS NAVIGATOR',eta:'0830',berth:'PRATEEP',atd:'2215',shifts:[{order:'1400',fromBerth:'PRATEEP',berth:'SOUTHERN PORT'}]});
  SyncStore.put('calls','c2',{id:'c2',date:d,vessel:'OCEAN BETA',eta:'1030',berth:'SAWAT'});});
  await p.waitForFunction(ay=>document.querySelectorAll(ay?'#ayRows .ay-row':'#logBody tr').length>=(ay?4:2),ay,{timeout:8000}).catch(()=>{});await p.waitForTimeout(400);
 return {p,errs};
}
(async()=>{
 const b=await chromium.launch();
 for(const w of [360,390,768,1280]){
  const {p,errs}=await open(b,w,true);
  await p.screenshot({path:`${OUT}_${w}.png`,fullPage:true});
  const docW=await p.evaluate(()=>document.documentElement.scrollWidth);
  const wide=docW>w?await p.evaluate(w=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>w+1).slice(0,6).map(e=>e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right)),w):'';
  ok(docW<=w, `${w}: no page side-scroll (${docW}) ${wide}`);
  ok(await p.locator('#ayRows .ay-row').count()===4, `${w}: 4 legs listed`);
  if(BEFORE){await p.close();continue}
  const rows=await p.$$eval('#ayRows .ay-row',a=>a.map(r=>{const s=r.querySelectorAll('span')[1],cs=getComputedStyle(s);return {h:r.getBoundingClientRect().height,lines:Math.round(s.getBoundingClientRect().height/parseFloat(cs.lineHeight)),right:Math.max(...[...r.children].map(c=>c.getBoundingClientRect().right)),rr:r.getBoundingClientRect().right}}));
  ok(rows.every(r=>r.right<=r.rr+1), `${w}: nothing sticks out of a row`);
  if(w<=640){
   ok(rows.every(r=>r.lines<=(w<380?3:2)), `${w}: ship name ≤${w<380?3:2} lines ${JSON.stringify(rows.map(r=>r.lines))}`);
   ok(rows.every(r=>r.h>=48), `${w}: rows ≥48px tall`);
   const cb=await p.locator('#ayRows input').first().boundingBox();ok(cb.width>=24, `${w}: tick box ≥24px (${cb.width})`);
   const cp=await p.locator('#ayCopy').boundingBox();ok(cp.height>=48&&cp.width>w*0.7, `${w}: copy button big (${Math.round(cp.width)}x${Math.round(cp.height)})`);
   const fs=await p.$eval('#ayRows .ay-row span:nth-of-type(2)',s=>parseFloat(getComputedStyle(s).fontSize));ok(fs>=18, `${w}: ship font ≥18px`);
  } else {
   ok(rows.every(r=>r.h<80), `${w}: wide layout stays one row per leg`);
  }
  // tick → text
  await p.locator('#ayRows .ay-row').nth(1).click();await p.waitForTimeout(200);
  ok((await p.textContent('#ayText'))==='เข้า OCEAN BETA 24-1030 SAWAT'.replace('24',String(new Date(Date.now()+7*3600e3).getUTCDate()).padStart(2,'0')), `${w}: ticking a leg builds the LINE text (${await p.textContent('#ayText')})`);
  ok(!(await p.locator('#ayCopy').isDisabled()), `${w}: copy enabled`);
  await p.click('#ayAll');await p.waitForTimeout(200);ok((await p.textContent('#ayCnt')).includes('4'), `${w}: เลือกทั้งหมด = 4`);
  ok((await p.textContent('#ayText')).includes('ย้าย MAERSK ALPHA EXPRESS NAVIGATOR')&&(await p.textContent('#ayText')).includes('PRATEEP<>SOUTHERN PORT'), `${w}: shift line text unchanged (berth A<>B)`);
  await p.screenshot({path:`${OUT}_${w}_ticked.png`,fullPage:true});
  await p.click('#ayNone');await p.waitForTimeout(200);ok((await p.textContent('#ayText'))==='' && await p.locator('#ayCopy').isDisabled(), `${w}: ไม่เลือก clears`);
  ok(errs.length===0, `${w}: no page errors ${errs}`);
  await p.close();
  // smoke: normal สมุดบันทึกเรือ unaffected
  const n=await open(b,w,false);
  ok(await n.p.locator('#view-ay').isHidden(), `${w}: log mode hides แจ้งเรืออย.`);
  ok(await n.p.locator('#logBody tr').count()>=2, `${w}: log table/cards render`);
  ok(n.errs.length===0, `${w}: log no page errors ${n.errs}`);
  if(w===390) await n.p.screenshot({path:`${OUT}_log_${w}.png`});
  await n.p.close();
 }
 await b.close(); console.log(fail?'FAILED '+fail:'ALL PASS'); process.exit(fail?1:0);
})();
