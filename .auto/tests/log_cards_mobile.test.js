// test: pilot_log.html บันทึกประจำวัน as cards on phones (≤640px) + การ์ด/ตาราง toggle; tablet/desktop unchanged — usage: node log_cards_mobile.test.js <root> <outprefix>
const {chromium}=require('playwright');
const R=process.argv[2], OUT=process.argv[3]; let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++;};
const seed=()=>{const D=curDate;
 SyncStore.put('calls','c1',{date:D,t:1,vessel:'MAERSK ALPHA EXPRESS',job:'SGZ354/70',from:'A',eta:'0130',order:'0200',pilotIn:'12',berth:'PRATEEP',draughtIn:'9.5',loa:'590',agent:'ABC SHIPPING',atd:'1430',pilotOut:'7',draughtOut:'8.0',remark:'เรือยาวเกินกำหนด',closeNo:'18/1',status:'ปิดการเงิน',shifts:[{order:'0900',pilot:'5',fromBerth:'PRATEEP',berth:'SAWAT',draught:'9.0',agent:'ABC'}]});
 SyncStore.put('calls','c2',{date:D,t:2,vessel:'OCEAN BETA',from:'B',eta:'0600',order:'0630',pilotIn:'3',berth:'SAWAT',draughtIn:'8.0',loa:'492',agent:'XYZ'});
 SyncStore.put('calls','c3',{date:D,t:3,vessel:'SEA GAMMA <img src=x onerror=alert(1)>',eta:'1100 แยกใบแจ้งหนี้',pilotIn:'-CAP-',capIn:'1115',berth:'MPP',loa:'394',agent:'QQ'});
 SyncStore.put('calls','c4',{date:'2026-01-05',t:4,vessel:'OLD SHIP',eta:'0800',agent:'ZZ'});};
(async()=>{
 const b=await chromium.launch();
 for(const w of [390,768,1280]){
  const mob=w<=640;
  const p=await b.newPage({viewport:{width:w,height:w<500?844:900},hasTouch:mob,isMobile:mob});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));let dlg=0;p.on('dialog',d=>{dlg++;d.dismiss()});
  await p.addInitScript({path:R+'/sync_client.js'});
  await p.goto('file://'+R+'/pilot_log.html');await p.waitForTimeout(800);
  ok(await p.locator('#logCards').isVisible()===mob && (mob? (await p.locator('#logCards .lc-empty').isVisible()):true), `${w}: empty-day card message ${mob?'shown':'hidden'}`);
  await p.evaluate(seed);await p.waitForTimeout(500);
  const docW=await p.evaluate(()=>document.documentElement.scrollWidth);ok(docW<=w, `${w}: no page side-scroll (${docW})`);
  ok(await p.locator('#lvSeg').isVisible()===mob, `${w}: การ์ด/ตาราง switch ${mob?'shown':'hidden'}`);
  ok(await p.locator('#view-log .tablebox').isVisible()===!mob, `${w}: table ${mob?'hidden':'shown (unchanged)'}`);
  ok(await p.locator('#logBody tr.main').count()===3, `${w}: table still rendered (3 rows)`);
  if(mob){
   await p.screenshot({path:`${OUT}_${w}.png`});
   const cards=p.locator('#logCards .lcard');ok(await cards.count()===3, `${w}: 3 cards for the day`);
   const t1=await cards.nth(0).textContent();
   ok(['SGZ354/70','MAERSK ALPHA EXPRESS','590','ABC SHIPPING','0130','0200','PRATEEP','9.5','ย้ายท่า 1','SAWAT','1430','8.0','เรือยาวเกินกำหนด','18/1','✓ ปิดการเงิน'].every(x=>t1.includes(x)), `${w}: card 1 shows No./name/LOA/agent/in/shift/out/remark/closeNo/status`);
   ok((await cards.nth(1).textContent()).includes('ยังไม่ออก'), `${w}: not-sailed ship says ยังไม่ออก`);
   const t3=await cards.nth(2).textContent();ok(t3.includes('แยกใบแจ้งหนี้')&&t3.includes('-CAP-')&&t3.includes('1115'), `${w}: invoice tag + CAP time shown`);
   ok(await p.locator('#logCards img').count()===0&&dlg===0, `${w}: ship name rendered as text (no HTML injection)`);
   const fits=await p.$$eval('#logCards .lcard *',a=>a.every(x=>{const r=x.getBoundingClientRect();return r.width===0||(r.right<=innerWidth+.5&&r.left>=-.5)}));ok(fits, `${w}: nothing in the cards overflows the screen`);
   const fs=await p.$eval('#logCards .lc-name',x=>parseFloat(getComputedStyle(x).fontSize));ok(fs>=20, `${w}: ship name big (${fs}px)`);
   // status toggle on a card
   await cards.nth(1).locator('.stbtn').click();await p.waitForTimeout(400);
   ok(await p.evaluate(()=>allCalls.find(c=>c.id==='c2').status)==='ปิดการเงิน', `${w}: ปิดการเงิน button on the card saves`);
   ok(await p.locator('#sheet').isHidden(), `${w}: status button does not open the form`);
   // tap card → editor → edit → card updates
   await p.locator('#logCards .lcard').nth(1).click();await p.waitForTimeout(300);
   ok(await p.locator('#sheet').isVisible()&&await p.inputValue('#fShip')==='OCEAN BETA', `${w}: tapping a card opens its edit form`);
   await p.screenshot({path:`${OUT}_${w}_editor.png`});
   await p.fill('#fEta','0645');await p.click('#edSave');await p.waitForTimeout(500);
   ok((await p.locator('#logCards .lcard').nth(1).textContent()).includes('06-45'), `${w}: edited ETA shows on the card`);
   // add ship via the form
   await p.click('#addBtn');await p.fill('#fShip','NEW STAR');await p.fill('#fEta','1230');await p.click('#edSave');await p.waitForTimeout(500);
   ok((await p.locator('#logCards').textContent()).includes('NEW STAR'), `${w}: ＋ เพิ่มเรือ appears as a card`);
   // search
   await p.fill('#q','OCEAN');await p.waitForTimeout(300);ok(await p.locator('#logCards .lcard').count()===1&&await p.locator('#logCards mark').count()>0, `${w}: search filters cards + highlights`);
   await p.fill('#q','ZZZZ');await p.waitForTimeout(300);ok((await p.locator('#logCards').textContent()).includes('ไม่พบรายการ'), `${w}: no-match message`);
   await p.fill('#q','');await p.waitForTimeout(200);
   // all days → day headers, tap header → that day
   await p.click('#scopeSeg button[data-v="all"]');await p.waitForTimeout(300);
   ok(await p.locator('#logCards .lc-day').count()===2, `${w}: ทุกวัน groups cards by day`);
   await p.screenshot({path:`${OUT}_${w}_alldays.png`});
   await p.locator('#logCards .lc-day .linkbtn',{hasText:'05-01-69'}).click();await p.waitForTimeout(300);
   ok(await p.evaluate(()=>curDate)==='2026-01-05'&&await p.locator('#logCards .lcard').count()===1, `${w}: tapping a day header opens that day`);
   await p.click('#todayBtn');await p.waitForTimeout(300);
   // closeNo filter shows date line
   await p.fill('#cf','18');await p.waitForTimeout(300);ok(await p.locator('#logCards .lcard').count()===1, `${w}: ลำดับการปิด filter works on cards`);
   await p.fill('#cf','');await p.waitForTimeout(200);
   // switch to table, persists over reload
   await p.click('#lvSeg button[data-v="table"]');await p.waitForTimeout(300);
   ok(await p.locator('#view-log .tablebox').isVisible()&&await p.locator('#logCards').isHidden(), `${w}: ตาราง shows the table again`);
   await p.reload();await p.waitForTimeout(800);
   ok(await p.locator('#view-log .tablebox').isVisible()&&await p.locator('#lvSeg button[data-v="table"]').getAttribute('aria-pressed')==='true', `${w}: choice remembered after reload`);
   await p.click('#lvSeg button[data-v="cards"]');await p.waitForTimeout(300);ok(await p.locator('#logCards').isVisible(), `${w}: back to การ์ด`);
  } else {
   ok(await p.locator('#logCards').isHidden(), `${w}: no cards on wide screens`);
   await p.screenshot({path:`${OUT}_${w}.png`});
   await p.locator('#logBody tr.main').nth(1).locator('.edbtn').click();await p.waitForTimeout(300);
   ok(await p.inputValue('#fShip')==='OCEAN BETA', `${w}: table ✎ still opens the form`);await p.click('#edClose');
  }
  // smoke other tabs
  await p.click('#tab-ves');await p.waitForTimeout(300);ok(await p.locator('#view-ves').isVisible()&&await p.locator('#logCards').isHidden(), `${w}: ทะเบียนเรือ tab renders, cards hidden`);
  await p.click('#tab-cfg');await p.waitForTimeout(300);ok(await p.locator('#syncCard').isVisible(), `${w}: ตั้งค่า tab renders`);
  ok(errs.length===0, `${w}: no page errors ${errs}`);
  await p.close();
 }
 // แจ้งเรืออย. mode unaffected
 const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript({path:R+'/sync_client.js'});await p.addInitScript(()=>{window.__ONLY__='ay'});
 await p.goto('file://'+R+'/pilot_log.html');await p.waitForTimeout(800);await p.evaluate(seed);await p.waitForTimeout(500);
 ok(await p.locator('#logCards').isHidden()&&await p.locator('#view-ay').isVisible()&&(await p.locator('#ayRows').textContent()).includes('OCEAN BETA'), `ay-mode: แจ้งเรืออย. unaffected, no cards`);
 ok(errs.length===0, `ay-mode: no page errors ${errs}`);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL PASS'); process.exit(fail?1:0);
})();
