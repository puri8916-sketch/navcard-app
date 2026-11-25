// test: schedule.html แก้ไข › อ่านตัวใหญ่ — usage: node board_read.test.js <root> <outprefix> [before]
const {chromium}=require('playwright');const {setup}=require('./mock.js');
const R=process.argv[2], OUT=process.argv[3], BEFORE=process.argv[4]==='before'; let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++;};
(async()=>{
 const b=await chromium.launch();
 for(const w of [390,768,1280]){
  const ctx=await b.newContext({viewport:{width:w,height:w<500?844:(w<1000?1024:800)},hasTouch:w<1000,isMobile:w<500});
  const p=await ctx.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  const {log}=await setup(p);
  await p.goto('file://'+R+'/schedule.html');await p.waitForTimeout(2000);
  await p.screenshot({path:`${OUT}_${w}_board.png`});
  if(BEFORE){ await ctx.close(); continue; }
  const vis=await p.locator('#brBtn').isVisible();
  if(w>900){ ok(!vis, `${w}: no อ่านตัวใหญ่ button on desktop`); ok(await p.locator('#board .ce').count()>0, `${w}: board table renders`); ok(errs.length===0, `${w}: no page errors ${errs}`); await ctx.close(); continue; }
  ok(vis, `${w}: อ่านตัวใหญ่ button visible`);
  const cells0=await p.evaluate(()=>JSON.stringify(BD.blocks.map(b=>b.rows.map(r=>r.c))));
  const saves0=log.filter(x=>x==='saveBoard').length;
  const fitZ=await p.evaluate(()=>parseFloat(document.getElementById('board').style.zoom)||1);
  await p.click('#brBtn');await p.waitForTimeout(400);
  ok(await p.locator('#boardRead').isVisible(), `${w}: read view shown`);
  ok(!(await p.locator('#view-line .scrollx').isVisible()), `${w}: table hidden`);
  ok(!(await p.locator('[data-bact="undo"]').isVisible()), `${w}: edit buttons hidden`);
  ok(await p.locator('#lineCopy').isVisible(), `${w}: คัดลอกส่งLINE still there`);
  const names=await p.$$eval('#boardRead .br-n',a=>a.map(x=>x.textContent));
  const exp=await p.evaluate(()=>{const o=[];BD.blocks.forEach(b=>b.rows.forEach(r=>{[1,10].forEach(k=>{if(String(r.c[k]||'').trim())o.push(String(r.c[k]).trim())})}));return o;});
  ok(names.length===exp.length && exp.length>=3, `${w}: one card per ship (${names.length}/${exp.length})`);
  const fs=await p.$eval('#boardRead .br-n',e=>parseFloat(getComputedStyle(e).fontSize));
  ok(fs>=22, `${w}: ship name ≥22px (${fs})`);
  const docW=await p.evaluate(()=>document.documentElement.scrollWidth);
  ok(docW<=w, `${w}: no page side-scroll (${docW})`);
  const clip=await p.$$eval('#boardRead .br-card',a=>a.filter(c=>c.scrollWidth>c.clientWidth+1).length);
  ok(clip===0, `${w}: no clipped card`);
  if(w===768){ const cols=await p.$eval('.br-cols',e=>getComputedStyle(e).gridTemplateColumns.split(' ').length); ok(cols===2, `768: เข้า | ออก side by side`); }
  await p.screenshot({path:`${OUT}_${w}_read.png`,fullPage:true});
  // XSS: a ship name with HTML is shown as text
  await p.evaluate(()=>{ BD.blocks[0].rows[0].c[1]='<img src=x onerror="window.__x=1">'; renderBoardRead(); });
  ok(!(await p.evaluate(()=>window.__x)) && await p.locator('#boardRead img').count()===0, `${w}: names are escaped`);
  await p.evaluate((c)=>{ const v=JSON.parse(c); BD.blocks.forEach((b,i)=>b.rows.forEach((r,j)=>r.c=v[i][j])); renderBoardRead(); },cells0);
  // shift + late + งด badges
  await p.evaluate(()=>{ const r=BD.blocks.flatMap(b=>b.rows).find(r=>String(r.c[10]||'').trim()); r.c[14]='SAWAT>PRATEEP'; r.c[9]='พ'; renderBoardRead(); });
  ok(await p.locator('#boardRead .br-b.shift').count()===1 && await p.locator('#boardRead .br-b.late').count()>=1, `${w}: ย้าย / พ badges`);
  ok((await p.locator('#boardRead .br-card:has(.br-b.shift) .br-d').first().textContent()).includes('SAWAT → PRATEEP'), `${w}: shift berth shown as A → B`);
  await p.evaluate((c)=>{ const v=JSON.parse(c); BD.blocks.forEach((b,i)=>b.rows.forEach((r,j)=>r.c=v[i][j])); renderBoardRead(); },cells0);
  // read mode survives reload (per device)
  await p.reload();await p.waitForTimeout(2000);
  ok(await p.locator('#boardRead .br-card').count()===exp.length, `${w}: read mode remembered after reload`);
  // tap a card → back to the table, that ship selected
  const tgt=await p.locator('#boardRead .br-card').nth(1).getAttribute('data-brgo');
  await p.locator('#boardRead .br-card').nth(1).click();await p.waitForTimeout(400);
  ok(await p.locator('#view-line .scrollx').isVisible() && !(await p.locator('#boardRead').isVisible()), `${w}: tap card → table`);
  const zA=await p.evaluate(()=>parseFloat(document.getElementById('board').style.zoom)||1);
  ok(Math.abs(zA-fitZ)<0.02, `${w}: table zoom after reload-in-read-mode = fitted zoom (${zA} vs ${fitZ})`);
  // tab switch / date strip while reading must not shrink the table
  await p.click('#brBtn');await p.waitForTimeout(200);await p.click('#tab-work');await p.waitForTimeout(300);await p.click('#tab-line');await p.waitForTimeout(400);
  await p.click('#brBtn');await p.waitForTimeout(300);
  const zB=await p.evaluate(()=>parseFloat(document.getElementById('board').style.zoom)||1);
  ok(Math.abs(zB-fitZ)<0.02, `${w}: zoom kept after tab switch in read mode (${zB})`);
  const [bb,rr,cc]=tgt.split('|');
  ok(await p.locator(`#board td.sel[data-b="${bb}"][data-r="${rr}"][data-c="${cc}"]`).count()===1, `${w}: tapped ship selected in table`);
  const cells1=await p.evaluate(()=>JSON.stringify(BD.blocks.map(b=>b.rows.map(r=>r.c))));
  ok(cells1===cells0, `${w}: board data unchanged by read mode`);
  await p.screenshot({path:`${OUT}_${w}_back.png`});
  // other tabs still fine
  for(const t of ['tab-work','tab-ships','tab-pilots','tab-line']){ await p.click('#'+t);await p.waitForTimeout(300); }
  ok(await p.locator('#view-line .scrollx').isVisible(), `${w}: back on แก้ไข after visiting tabs`);
  ok(errs.length===0, `${w}: no page errors ${errs}`);
  await ctx.close();
 }
 await b.close(); console.log(fail?`${fail} FAILED`:'ALL PASS'); process.exit(fail?1:0);
})();
