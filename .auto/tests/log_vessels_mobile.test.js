// test: pilot_log.html ทะเบียนเรือ (mobile cards + desktop unchanged) + smoke of the log/settings tabs — usage: node t3.js <root> <outprefix> [full]
const {chromium}=require('playwright');
const R=process.argv[2], OUT=process.argv[3], FULL=process.argv[4]==='full'; let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++;};
(async()=>{
 const b=await chromium.launch();
 for(const w of [390,1280]){
  const p=await b.newPage({viewport:{width:w,height:w<500?844:800},hasTouch:w<500,isMobile:w<500});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript({path:R+'/sync_client.js'});
  await p.goto('file://'+R+'/pilot_log.html');await p.waitForTimeout(800);
  await p.click('#tab-ves');await p.waitForTimeout(300);
  await p.screenshot({path:`${OUT}_${w}_empty.png`});
  await p.evaluate(()=>{
    SyncStore.put('vessels','v1',{name:'MAERSK ALPHA EXPRESS NAVIGATOR',loa:'590',agent:'SOUTHERN SHIPPING AGENCY CO'});
    SyncStore.put('vessels','v2',{name:'OCEAN BETA',loa:'492',agent:'XYZ'});
    SyncStore.put('vessels','v3',{name:'SEA GAMMA',loa:'394',agent:'ABC'});});
  await p.waitForTimeout(500);
  await p.screenshot({path:`${OUT}_${w}.png`});
  const docW=await p.evaluate(()=>document.documentElement.scrollWidth);
  ok(docW<=w, `${w}: no page side-scroll (${docW})`);
  const vis=await p.$$eval('#vBody td',a=>a.filter(td=>td.textContent.trim()).map(td=>{const r=td.getBoundingClientRect();const box=td.closest('.tablebox').getBoundingClientRect();return r.right<=box.right+1&&r.left>=box.left-1&&td.scrollWidth<=td.clientWidth+1}));
  ok(vis.length>0&&vis.every(Boolean), `${w}: every cell (name, LOA, Agent, buttons) fully visible`);
  const bt=await p.$$eval('#vBody .linkbtn',a=>a.map(x=>{const r=x.getBoundingClientRect();return r.right<=innerWidth&&r.height>0?r.height:0}));
  ok(bt.length===6&&bt.every(h=>h>0)&&(w>640||bt.every(h=>h>=40)), `${w}: แก้ไข/ลบ buttons visible${w<=640?' and ≥40px tall':''} ${bt.map(Math.round)}`);
  if(FULL){
   await p.locator('#vBody tr').nth(1).locator('.linkbtn',{hasText:'แก้ไข'}).click();
   ok(await p.inputValue('#vName')==='OCEAN BETA', `${w}: แก้ไข fills the form`);
   await p.fill('#vLoa','500');await p.click('#vSave');await p.waitForTimeout(400);
   ok(await p.evaluate(()=>SyncStore.get?SyncStore.get('vessels','v2')?.loa:'?')!==undefined, `${w}: save runs`);
   ok((await p.locator('#vBody tr').nth(1).textContent()).includes('500'), `${w}: edited LOA shows on the card`);
   const del=p.locator('#vBody tr').last().locator('.linkbtn.del');await del.click();ok((await del.textContent()).includes('ยืนยัน'), `${w}: ลบ arms`);
   await del.click();await p.waitForTimeout(400);ok(await p.locator('#vBody tr').count()===2, `${w}: delete works`);
   await p.fill('#vSearch','OCEAN');await p.waitForTimeout(200);ok(await p.locator('#vBody tr').count()===1, `${w}: search filters`);
   await p.fill('#vSearch','');
   // smoke: log tab add ship, settings tab
   await p.click('#tab-log');await p.click('#addBtn');await p.fill('#fShip','OCEAN BETA');await p.fill('#fEta','1230');await p.click('#edSave');await p.waitForTimeout(400);
   ok((await p.locator('#logBody').textContent()).includes('OCEAN BETA'), `${w}: log tab still adds a ship`);
   await p.click('#tab-cfg');await p.waitForTimeout(300);ok(await p.locator('#syncCard').isVisible(), `${w}: settings tab renders`);
  }
  ok(errs.length===0, `${w}: no page errors ${errs}`);
  await p.close();
 }
 await b.close(); console.log(fail?'FAILED '+fail:'ALL PASS'); process.exit(fail?1:0);
})();
