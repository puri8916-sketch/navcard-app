// test: pilot_log.html form on phones: every box ≥16px text (no iPhone zoom), ≥44px tall, big บันทึก; tablet/desktop unchanged; add/edit still save — usage: node log_form_phone.test.js <root> <outprefix>
const {chromium}=require('playwright');const R=process.argv[2],OUT=process.argv[3];
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
(async()=>{const b=await chromium.launch();
 for(const w of [360,390,768,1280]){const ph=w<=640;
  const p=await b.newPage({viewport:{width:w,height:ph?780:900},isMobile:ph,hasTouch:ph});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript({path:R+'/sync_client.js'});await p.goto('file://'+R+'/pilot_log.html');await p.waitForTimeout(700);
  await p.evaluate(()=>{SyncStore.put('vessels','v1',{name:'OCEAN BETA',loa:'492',agent:'XYZ'});SyncStore.put('calls','c1',{date:curDate,t:1,vessel:'SEA GAMMA',eta:'24-01-30',agent:'QQ',shifts:[{order:'24-09-00',pilot:'-CAP-',capTime:'24-08-00',fromBerth:'PRATEEP',berth:'SAWAT',draught:'9.5',agent:'ABC',remark:'R'}]})});await p.waitForTimeout(300);
  const fsz=await p.$$eval('#q,#cf',a=>a.map(x=>parseFloat(getComputedStyle(x).fontSize)));ok(ph?fsz.every(f=>f>=16):fsz.every(f=>f<16), `${w}: search/ลำดับการปิด text ${ph?'≥16px':'unchanged'} (${fsz})`);
  await p.click('#addBtn');await p.waitForTimeout(400);
  const ins=await p.$$eval('#sheet input:not([type=checkbox])',a=>a.filter(x=>x.offsetParent).map(x=>[x.id,parseFloat(getComputedStyle(x).fontSize),x.getBoundingClientRect().height,x.getBoundingClientRect().right<=innerWidth]));
  if(ph){ok(ins.length>10&&ins.every(x=>x[1]>=16), `${w}: all form boxes ≥16px text (no iPhone zoom) ${JSON.stringify(ins.filter(x=>x[1]<16))}`);
   ok(ins.every(x=>x[2]>=44), `${w}: boxes ≥44px tall`);ok(ins.every(x=>x[3]), `${w}: no box off-screen`);
   const sv=await p.$eval('#edSave',x=>{const r=x.getBoundingClientRect();return [r.height,r.width,r.right<=innerWidth]});ok(sv[0]>=46&&sv[1]>=120&&sv[2], `${w}: big บันทึก button ${sv}`);
   if(w>=390)ok(await p.evaluate(()=>document.documentElement.scrollWidth)<=w, `${w}: no page side-scroll (360px: 2px pre-existing on main)`);
   await p.screenshot({path:`${OUT}_${w}_top.png`});
  }else{ok(ins.every(x=>x[1]<16&&x[2]<40), `${w}: form boxes unchanged (14px, 32px)`)}
  // add a ship with the combo list
  await p.fill('#fShip','OCEAN');await p.waitForTimeout(200);
  const opt=p.locator('.combo-pop .opt').first();ok(await opt.isVisible(), `${w}: ship list pops up`);
  if(ph){const of=await opt.evaluate(x=>parseFloat(getComputedStyle(x).fontSize));ok(of>=16, `${w}: list text ${of}px`);await p.screenshot({path:`${OUT}_${w}_combo.png`})}
  await opt.click();await p.waitForTimeout(150);ok(await p.inputValue('#fShip')==='OCEAN BETA'&&await p.inputValue('#fAgent')==='XYZ', `${w}: picking a ship fills name + agent`);
  await p.fill('#fEta','2412');await p.click('#edSave');await p.waitForTimeout(400);
  ok(await p.evaluate(()=>allCalls.some(c=>c.vessel==='OCEAN BETA'&&c.eta==='24-12')), `${w}: new ship saved`);
  // edit existing incl. shift row
  await p.evaluate(()=>openEditor(allCalls.find(c=>c.id==='c1')));await p.waitForTimeout(300);
  if(ph){await p.$eval('#sheet .body',x=>x.scrollTop=x.scrollHeight);await p.screenshot({path:`${OUT}_${w}_bottom.png`})}
  if(ph){const bt=await p.$$eval('#sheet .srow:not(.head) :is(.mv button,.x)',a=>a.map(x=>Math.round(x.getBoundingClientRect().height)));ok(bt.length===3&&bt.every(h=>h>=40), `${w}: ▲▼ ✕ buttons ≥40px (${bt})`)}
  if(ph){const L=await p.$eval('#sheet .srow:not(.head)',r=>{const t=s=>Math.round(r.querySelector(s).getBoundingClientRect().top),sp=r.querySelector('[id^=sp]');return {cap:sp.scrollWidth<=sp.clientWidth+1,l1:t('[id^=so]')===t('[id^=sp]'),l2:t('[id^=sf]')===t('[id^=sb]')&&t('[id^=sf]')>t('[id^=so]'),l3:t('[id^=sd]')===t('[id^=sa]')&&t('[id^=sd]')>t('[id^=sf]'),l4:t('[id^=sr]')>t('[id^=sd]')&&Math.abs(t('.mv')-t('[id^=sr]'))<6&&Math.abs(t('.x')-t('[id^=sr]'))<6}});
   ok(L.cap, `${w}: Pilot "-CAP- 24-08-00" fits its box`);ok(L.l1&&L.l2&&L.l3&&L.l4, `${w}: ย้ายท่า lines: Order·Pilot / จากท่า·ไปท่า / Draught·Agent / ▲▼·Remark·✕ ${JSON.stringify(L)}`)}
  const sh=await p.$$eval('#sheet .srow:not(.head) input',a=>a.map(x=>parseFloat(getComputedStyle(x).fontSize)));ok(ph?sh.every(f=>f>=16):true, `${w}: ย้ายท่า boxes ${sh}`);
  await p.fill('#sb0','MPP');await p.click('#edSave');await p.waitForTimeout(400);
  ok(await p.evaluate(()=>allCalls.find(c=>c.id==='c1').shifts[0].berth)==='MPP', `${w}: edit saved`);
  await p.click('#tab-ves');await p.waitForTimeout(200);await p.click('#tab-cfg');await p.waitForTimeout(200);ok(await p.locator('#syncCard').isVisible(), `${w}: other tabs ok`);
  ok(errs.length===0, `${w}: no page errors ${errs}`);await p.close()}
 await b.close();console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0)})();
