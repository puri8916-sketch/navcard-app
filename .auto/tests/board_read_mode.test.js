// test: schedule.html แก้ไข › อ่านตัวใหญ่ (≤900px): big-letter read-only list from the board, live updates, tap → board at that ship, remembered; hidden on desktop — usage: node board_read_mode.test.js <root> <outprefix>
const {chromium}=require('playwright');const R=process.argv[2],OUT=process.argv[3];const {setup}=require(R+'/.auto/tests/mock.js');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
(async()=>{const b=await chromium.launch();
 for(const [w,h,scheme] of [[390,844,'light'],[768,1024,'light'],[390,844,'dark'],[1280,900,'light']]){const small=w<=900,tag=`${w}${scheme==='dark'?' dark':''}`;
  const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:w<500,hasTouch:w<1000,colorScheme:scheme});const p=await ctx.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));const {log}=await setup(p);
  await p.goto('file://'+R+'/schedule.html');await p.waitForTimeout(1500);
  ok(await p.locator('#rdBtn').isVisible()===small, `${tag}: อ่านตัวใหญ่ button ${small?'shown':'hidden'}`);
  if(!small){ok(await p.locator('#rdView').isHidden()&&await p.locator('#board').isVisible(), `${tag}: desktop board unchanged`);ok(errs.length===0, `${tag}: no page errors ${errs}`);await ctx.close();continue}
  const z0=await p.$eval('#board',x=>parseFloat(x.style.zoom)||1);
  await p.click('#rdBtn');await p.waitForTimeout(400);
  ok(await p.locator('#rdView').isVisible()&&await p.locator('#view-line .scrollx').isHidden(), `${tag}: list shown, board hidden`);
  ok(await p.getAttribute('#rdBtn','aria-pressed')==='true', `${tag}: button pressed`);
  const ships=await p.$$eval('#rdView .rd-name',a=>a.map(x=>x.textContent));ok(['MAERSK ALPHA','SEA GAMMA','OCEAN BETA','STAR DELTA'].every(s=>ships.includes(s)), `${tag}: all board ships listed (${ships})`);
  const c1=await p.locator('#rdView .rd-ship',{hasText:'MAERSK ALPHA'}).textContent();ok(['24-1800','PRATEEP','12','180','9.5','ABC'].every(x=>c1.includes(x)), `${tag}: card shows time/berth/pilot/LOA/Drf/agent`);
  const outSec=await p.evaluate(()=>{const d=[...document.querySelectorAll('#rdView .rd-day')].find(x=>x.textContent.includes('OCEAN BETA'));const hs=[...d.children];const iOut=hs.findIndex(x=>x.classList.contains('out'));const iShip=hs.findIndex(x=>x.textContent.includes('OCEAN BETA'));return iShip>iOut});
  ok(outSec, `${tag}: outgoing ship under ออก / ย้าย`);
  const fs=await p.$eval('#rdView .rd-name',x=>parseFloat(getComputedStyle(x).fontSize));ok(fs>=22, `${tag}: ship names big (${fs}px)`);
  const fit=await p.$$eval('#rdView *',a=>a.every(x=>{const r=x.getBoundingClientRect();return r.width===0||r.right<=innerWidth+.5}));ok(fit&&await p.evaluate(()=>document.documentElement.scrollWidth)<=w, `${tag}: nothing past the screen edge`);
  if(scheme==='dark'){const lum=c=>{const m=c.match(/[\d.]+/g).map(Number);return (m[0]*299+m[1]*587+m[2]*114)/1000};const cs=await p.$$eval('#rdView :is(.rd-name,.rd-time,.rd-date,.rd-kv span)',a=>a.map(x=>getComputedStyle(x).color));ok(cs.every(c=>lum(c)>150), `${tag}: texts light on dark ${[...new Set(cs)]}`)}
  await p.screenshot({path:`${OUT}_${w}${scheme==='dark'?'_dark':''}.png`});
  ok(await p.locator('#view-line .boldbtn').isHidden()&&await p.locator('#view-line .fillbtn').isHidden()&&await p.locator('#lineCopy').isVisible(), `${tag}: B / colour / พื้นหลัง hidden in the list, คัดลอกส่งLINE stays`);
  await p.evaluate(()=>{const ce=[...document.querySelectorAll('#board .ce[data-c="8"]')].find(x=>x.textContent==='ABC');ce.innerHTML='ABC<br>LINE2 &lt;img src=x onerror="window.__x=1"&gt;<div>L3</div>'});await p.waitForTimeout(500);
  const ag=await p.locator('#rdView .rd-ship',{hasText:'MAERSK ALPHA'}).textContent();ok(ag.includes('ABC LINE2')&&ag.includes(' L3')&&await p.evaluate(()=>!window.__x)&&await p.locator('#rdView img').count()===0, `${tag}: multi-line cell shown with spaces, HTML stays text (${ag.slice(-40)})`);
  // live: a change on the board (as a sync would do) shows in the list
  await p.evaluate(()=>{const ce=[...document.querySelectorAll('#board .ce[data-c="1"]')].find(x=>x.textContent==='SEA GAMMA');ce.textContent='SEA GAMMA II'});await p.waitForTimeout(500);
  ok((await p.$$eval('#rdView .rd-name',a=>a.map(x=>x.textContent))).includes('SEA GAMMA II'), `${tag}: list follows board changes`);
  // tap a card → board at that ship, fitted (not shrunk while hidden)
  await p.locator('#rdView .rd-ship',{hasText:'STAR DELTA'}).click();await p.waitForTimeout(500);
  ok(await p.locator('#board').isVisible()&&await p.locator('#rdView').isHidden(), `${tag}: tapping a ship goes back to the board`);
  const vis=await p.evaluate(()=>{const ce=[...document.querySelectorAll('#board .ce')].find(x=>x.textContent==='STAR DELTA');const r=ce.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=-1&&r.left<innerWidth});ok(vis, `${tag}: that ship is on screen`);
  const z1=await p.$eval('#board',x=>parseFloat(x.style.zoom)||1);ok(Math.abs(z1-z0)<0.02, `${tag}: board zoom kept (${z0}→${z1})`);
  // remembered after reload
  await p.click('#rdBtn');await p.waitForTimeout(200);await p.reload();await p.waitForTimeout(1500);
  ok(await p.locator('#rdView').isVisible()&&(await p.$$eval('#rdView .rd-name',a=>a.length))>=4, `${tag}: read mode remembered after reload`);
  await p.click('#rdBtn');await p.waitForTimeout(300);const z2=await p.$eval('#board',x=>parseFloat(x.style.zoom)||1);
  ok(await p.locator('#board').isVisible()&&Math.abs(z2-z0)<0.02, `${tag}: back to board after reload-in-read-mode, fitted (${z2})`);
  // typing on the board still saves
  const n0=log.filter(a=>a==='saveBoard').length;const ce=p.locator('#board .ce[data-c="10"]',{hasText:'OCEAN BETA'});await ce.click();await p.keyboard.press('End');await p.keyboard.type(' X');await p.locator('#board .ce[data-c="2"]').first().click();await p.waitForTimeout(2500);
  ok(log.filter(a=>a==='saveBoard').length>n0, `${tag}: board edits still save`);
  // other tabs
  await p.click('#rdBtn');await p.waitForTimeout(200);
  for(const id of ['tab-work','tab-ships','tab-pilots'])if(await p.locator('#'+id).isVisible()){await p.click('#'+id);await p.waitForTimeout(300)}
  ok(await p.locator('#rdView').isHidden(), `${tag}: list not shown on other tabs`);
  await p.click('#tab-line');await p.waitForTimeout(300);ok(await p.locator('#rdView').isVisible(), `${tag}: back on แก้ไข the list is there again`);
  await p.setViewportSize({width:1280,height:900});await p.waitForTimeout(400);ok(await p.locator('#rdView').isHidden()&&await p.locator('#board').isVisible(), `${tag}: widening to desktop shows the board`);
  await p.setViewportSize({width:w,height:h});await p.waitForTimeout(400);ok(await p.locator('#rdView').isVisible(), `${tag}: narrow again → the list comes back`);
  ok(errs.length===0, `${tag}: no page errors ${errs}`);await ctx.close()}
 await b.close();console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0)})();
