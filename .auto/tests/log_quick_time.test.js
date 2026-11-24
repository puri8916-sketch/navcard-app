// test: pilot_log.html ฟอร์ม — quick date/time chips on empty time boxes (phone/tablet only) — usage: node log_quick_time.test.js <root> <outprefix> [before]
const {chromium}=require('playwright');
const R=process.argv[2], OUT=process.argv[3], BEFORE=process.argv[4]==='before'; let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++;};
(async()=>{
 const b=await chromium.launch();
 for(const w of [390,768,1280]){
  const ctx=await b.newContext({viewport:{width:w,height:w<500?844:(w<1000?1024:800)},hasTouch:w<1000,isMobile:w<500});
  const p=await ctx.newPage(); const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript({path:R+'/sync_client.js'});
  await p.goto('file://'+R+'/pilot_log.html');await p.waitForTimeout(800);
  await p.evaluate(()=>{ SyncStore.put('calls','c1',{date:'2026-11-20',t:1,vessel:'OCEAN BETA',eta:'',order:'',pilotIn:'3',berth:'SAWAT',loa:'492',agent:'XYZ'}); });
  await p.evaluate(()=>setDate('2026-11-20'));await p.waitForTimeout(400);
  // new record → ETA Bar
  await p.click('#addBtn');await p.waitForTimeout(300);
  await p.click('#fEta');await p.waitForTimeout(200);
  if(BEFORE){ await p.screenshot({path:`${OUT}_${w}.png`}); await ctx.close(); continue; }
  const vis=await p.locator('#tq').isVisible();
  if(w>900){ ok(!vis, `${w}: no chips on desktop`); await p.keyboard.type('20111530'); ok(await p.inputValue('#fEta')==='20-11-1530', `${w}: typing unchanged`); ok(errs.length===0,`${w}: no errors ${errs}`); await ctx.close(); continue; }
  ok(vis, `${w}: chips shown under empty ETA`);
  await p.screenshot({path:`${OUT}_${w}.png`});
  const txt=await p.$$eval('#tq button',a=>a.map(x=>x.dataset.v));
  ok(txt[0]==='20-11-' && txt[1]==='21-11-' && /^\d\d-\d\d-\d{4}$/.test(txt[2]), `${w}: chips ${txt}`);
  const box=await p.locator('#tq').boundingBox(), ib=await p.locator('#fEta').boundingBox();
  ok(box.x>=0 && box.x+box.width<=w && !(box.y<ib.y+ib.height && ib.y<box.y+box.height), `${w}: chips on screen, not covering the box`);
  const hs=await p.$$eval('#tq button',a=>a.map(x=>x.getBoundingClientRect().height));
  ok(hs.every(h=>h>=44), `${w}: chips ≥44px tall`);
  // tap day chip → prefix, focus kept, Order follows (ETA = Order on), type hhmm
  await p.locator('#tq button').first().click();await p.waitForTimeout(150);
  ok(await p.inputValue('#fEta')==='20-11-' && await p.evaluate(()=>document.activeElement.id)==='fEta', `${w}: day chip fills 20-11- and keeps focus`);
  ok(await p.inputValue('#fOrder')==='20-11-', `${w}: Order follows ETA`);
  ok(!(await p.locator('#tq').isVisible()), `${w}: chips hide once the box has text`);
  await p.keyboard.type('1530');
  ok(await p.inputValue('#fEta')==='20-11-1530' && await p.inputValue('#fOrder')==='20-11-1530', `${w}: then typing 1530 → 20-11-1530`);
  // ATD: next day chip
  await p.click('#fAtd');await p.waitForTimeout(200);
  await p.locator('#tq button').nth(1).click();await p.keyboard.type('0700');
  ok(await p.inputValue('#fAtd')==='21-11-0700', `${w}: next-day chip → 21-11-0700`);
  // ตอนนี้ on a shift row Order
  await p.click('#addShift');await p.waitForTimeout(200);
  await p.click('#so0');await p.waitForTimeout(200);
  ok(await p.locator('#tq').isVisible(), `${w}: chips on ย้ายท่า Order`);
  const now=await p.locator('#tq button.now').getAttribute('data-v');
  await p.locator('#tq button.now').click();await p.waitForTimeout(150);
  ok(await p.inputValue('#so0')===now, `${w}: ตอนนี้ → ${now}`);
  // filled box: no chips; other fields: no chips
  await p.click('#fEta');await p.waitForTimeout(200);ok(!(await p.locator('#tq').isVisible()), `${w}: no chips on a filled box`);
  await p.click('#fPilotIn');await p.waitForTimeout(200);ok(!(await p.locator('#tq').isVisible()), `${w}: no chips on non-time box`);
  // save: values stored
  await p.fill('#fShip','SEA GAMMA');
  await p.click('#edSave');await p.waitForTimeout(600);
  const doc=await p.evaluate(()=>new Promise(r=>{ const all=[]; try{ const L=SyncStore.list?SyncStore.list('calls'):null; r(JSON.stringify(L||allCalls)); }catch(e){ r(JSON.stringify(allCalls)); } }));
  ok(doc.includes('20-11-1530') && doc.includes('21-11-0700') && doc.includes(now), `${w}: saved with the times`);
  ok(await p.locator('#sheet').isHidden() && !(await p.locator('#tq').isVisible()), `${w}: closed, chips gone`);
  // edit existing record c1 (date 2026-11-20): chips use the record's date, Cancel hides chips
  await p.evaluate(()=>openEditor(allCalls.find(c=>c.vessel==='OCEAN BETA')));await p.waitForTimeout(300);
  await p.click('#fOrder');await p.waitForTimeout(200);
  ok((await p.locator('#tq button').first().getAttribute('data-v'))==='20-11-', `${w}: edit → record's date`);
  await p.click('#edCancel');await p.waitForTimeout(200);ok(!(await p.locator('#tq').isVisible()), `${w}: cancel hides chips`);
  for(const t of ['tab-ves','tab-cfg','tab-log']){ await p.click('#'+t);await p.waitForTimeout(200); }
  ok(errs.length===0, `${w}: no page errors ${errs}`);
  await ctx.close();
 }
 // แจ้งเรืออย. still loads
 const p=await b.newPage({viewport:{width:390,height:844}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{window.__ONLY__='ay'});await p.addInitScript({path:R+'/sync_client.js'});
 await p.goto('file://'+R+'/pilot_log.html');await p.waitForTimeout(800);ok(errs.length===0, `ay: loads without errors ${errs}`);
 await b.close(); console.log(fail?`${fail} FAILED`:'ALL PASS'); process.exit(fail?1:0);
})();
