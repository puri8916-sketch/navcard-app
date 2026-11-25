// แก้ไข: deleting a ship pops "บันทึกลงสมุดบันทึกเรือ" at once (no LINE copy); งด not offered; asked only once
const {chromium}=require('playwright');const {setup}=require('./mock.js');const path=require('path');const R=path.join(__dirname,'../../');
(async()=>{const b=await chromium.launch();
for(const w of [1280,390]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const {log}=await setup(p);const ops=[];
await p.route('https://mock.test/**',async r=>{const u=new URL(r.request().url());if(u.searchParams.get('action')==='load')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,docs:[],seq:1,now:Date.now()})});
 if(r.request().method()==='POST'){try{const j=JSON.parse(r.request().postData());if(j.ops){ops.push(...j.ops);return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,seq:2,now:Date.now()})})}}catch(e){}}return r.fallback()});await p.goto('file://'+R+'schedule.html');await p.waitForTimeout(2000);
await p.click('#tab-line').catch(()=>{});await p.waitForTimeout(500);
const info=await p.evaluate(()=>{boardSave();const rows=BD.blocks.flatMap(b=>b.rows).filter(r=>String(r.c[1]||'').trim()&&String(r.c[4]||'').trim());return rows.map(r=>r.c[1])});
if(info.length<2)throw Error('need 2 inbound ships, got '+info);
// mark the 2nd as งด, then delete both rows' left side one by one
await p.evaluate(()=>{const rows=BD.blocks.flatMap(b=>b.rows).filter(r=>String(r.c[1]||'').trim()&&String(r.c[4]||'').trim());rows[1].c[3]='งด';boardSave();
  for(let k=0;k<9;k++)rows[0].c[k]='';boardSave();});
await p.waitForTimeout(700);
const dlg=await p.locator('.lg-box').count();const names=await p.locator('.lg-box .lg-row b').allTextContents();
console.log(w,'dialog',dlg,names);if(dlg!==1||names.length!==1||names[0]!==info[0])throw Error('expected dialog for '+info[0]);
await p.click('.lg-box [data-a="ok"]');await p.waitForTimeout(800);
const tt=await p.evaluate(()=>[...document.querySelectorAll('.toast,#toast')].map(e=>e.textContent).join('|'));console.log('toast',tt);if(!/บันทึกลงสมุดบันทึกเรือแล้ว/.test(tt)||!ops.some(o=>o.col==='calls'))throw Error('log not written');
// งด row deleted → no dialog
await p.evaluate(()=>{const r=BD.blocks.flatMap(b=>b.rows).find(r=>r.c[3]==='งด');for(let k=0;k<9;k++)r.c[k]='';boardSave()});await p.waitForTimeout(600);
if(await p.locator('.lg-box').count())throw Error('งด offered');
// another save / LINE copy does not ask again
await p.evaluate(()=>boardSave());await p.waitForTimeout(500);await p.click('#lineCopy').catch(()=>{});await p.waitForTimeout(1200);
if(await p.locator('.lg-box').count())throw Error('asked again');
if(errs.length)throw Error(errs.join('|'));await p.close()}
console.log('PASS');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
