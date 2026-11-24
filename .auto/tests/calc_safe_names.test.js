// เครื่องคิดเลข ×3.2808: ship names with < > & " are shown as plain text (no HTML injection), suggestions still work
// run: node .auto/tests/calc_safe_names.test.js [shotsPrefix]
const {chromium}=require('playwright');const path=require('path');
const ROOT=path.resolve(__dirname,'../..');const shot=process.argv[2]||'';
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++};
(async()=>{const b=await chromium.launch();
for(const w of [390,768,1280]){
 const p=await b.newPage({viewport:{width:w,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript({path:path.join(ROOT,'sync_client.js')});
 await p.addInitScript(()=>{window.__pwned=0;
  addEventListener('DOMContentLoaded',()=>{
   SyncStore.put('calcShips','EVIL <img src=x onerror="window.__pwned=1">',{value:'150',result:'493',time:'x'});
   SyncStore.put('calcShips','M&S <BRAVO> "Q"',{value:'99.5',result:'327',time:'x'});
   SyncStore.put('calcShips','SEA GAMMA',{value:'120',result:'394',time:'x'});});});
 await p.goto('file://'+ROOT+'/calc_3_2808.html');await p.waitForTimeout(300);
 await p.fill('#shipName','e');await p.waitForTimeout(400);
 const items=await p.$$eval('#suggestBox .suggest-item',els=>els.map(e=>e.querySelector('span').textContent));
 ok(items.includes('EVIL <img src=x onerror="window.__pwned=1">'),w+': evil name shown as text');
 ok(await p.evaluate(()=>window.__pwned===0 && !document.querySelector('#suggestBox img')),w+': no injected <img>/script ran');
 await p.fill('#shipName','bravo');await p.waitForTimeout(200);
 const t=await p.$$eval('#suggestBox .suggest-item',els=>els.map(e=>e.textContent));
 ok(t.length===1&&t[0].includes('M&S <BRAVO> "Q"')&&t[0].includes('99.5'),w+': name with & < > " + number shown');
 if(shot)await p.screenshot({path:`${shot}-${w}.png`});
 await p.click('#suggestBox .suggest-item');
 ok(await p.inputValue('#shipName')==='M&S <BRAVO> "Q"'&&await p.inputValue('#inputNum')==='99.5',w+': tap suggestion fills name + number');
 ok((await p.textContent('#resultOut')).trim()==='327',w+': result 99.5×3.2808 → 327');
 // delete from suggestion ✕
 await p.fill('#shipName','evil');await p.waitForTimeout(200);
 await p.click('#suggestBox .suggest-delete-btn');
 ok(await p.evaluate(()=>!Object.keys(SyncStore.all('calcShips')).some(k=>k.startsWith('EVIL')&&!SyncStore.all('calcShips')[k].hidden)),w+': ✕ deletes evil ship');
 // save a new one with special chars
 await p.fill('#shipName','A&B <NEW>');await p.fill('#inputNum','200');await p.click('#addBtn');await p.waitForTimeout(200);
 ok(await p.evaluate(()=>SyncStore.all('calcShips')['A&B <NEW>']?.value=='200'),w+': save name with special chars');
 ok(await p.getAttribute('#inputNum','inputmode')==='decimal',w+': number box opens decimal keypad');
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),w+': no sideways scroll');
 ok(errs.length===0,w+': no JS errors '+errs.join('|'));
 await p.close();}
// smoke: calculator inside สมุดบันทึกเรือ (🧮 panel) — same synced ship list
const calc=require('fs').readFileSync(path.join(ROOT,'calc_3_2808.html'),'utf8');
for(const w of [390,768,1280]){
 const p=await b.newPage({viewport:{width:w,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(c=>{window.__CALC_HTML__=c},calc);
 await p.addInitScript({path:path.join(ROOT,'sync_client.js')});
 await p.goto('file://'+ROOT+'/pilot_log.html');await p.waitForTimeout(500);
 await p.click('#calcBtn');await p.waitForTimeout(600);
 const fr=p.frameLocator('#calcPanel iframe');
 await fr.locator('#shipName').fill('X <Y>');await fr.locator('#inputNum').fill('180');await fr.locator('#addBtn').click();await p.waitForTimeout(300);
 await fr.locator('#shipName').fill('x <');await p.waitForTimeout(200);
 ok((await fr.locator('#suggestBox .suggest-item span').first().textContent())==='X <Y>',w+': log panel suggestion shows X <Y>');
 if(shot)await p.screenshot({path:`${shot}-log-${w}.png`});
 await p.click('#calcX');ok(await p.isHidden('#calcPanel'),w+': ✕ closes panel');
 ok(errs.length===0,w+': log page no JS errors '+errs.join('|'));await p.close();}
await b.close();console.log(fail?`${fail} FAILED`:'ALL PASS');process.exit(fail?1:0)})();
