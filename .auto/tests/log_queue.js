// แก้ไข → สมุด: บันทึก pressed, page left before the sheet answered → sent again next time the page opens; no duplicate
const {chromium}=require('playwright');const {setup}=require('./mock.js');const path=require('path');const R=path.join(__dirname,'../../');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1280,height:900}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await setup(p);let hang=false;const ops=[];const docs=[];
await p.route('https://mock.test/**',async r=>{const u=new URL(r.request().url());
 if(u.searchParams.get('action')==='load'){ if(hang) return; /* never answers: the page is left first */
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,docs,seq:1,now:Date.now()})}); }
 if(r.request().method()==='POST'){try{const j=JSON.parse(r.request().postData());if(j.ops){ops.push(...j.ops);for(const o of j.ops)docs.push({col:o.col,id:o.id,doc:o.doc});return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,seq:2,now:Date.now()})})}}catch(e){}}
 return r.fallback()});
await p.goto('file://'+R+'schedule.html');await p.waitForTimeout(2000);
const ship=await p.evaluate(()=>{boardSave();const r=BD.blocks.flatMap(b=>b.rows).find(r=>String(r.c[1]||'').trim()&&String(r.c[4]||'').trim());const n=r.c[1];for(let k=0;k<9;k++)r.c[k]='';boardSave();return n});
await p.waitForSelector('.lg-box');hang=true;await p.click('.lg-box [data-a="ok"]');await p.waitForTimeout(300);
const q1=await p.evaluate(()=>logqGet().length);console.log('queued before leaving',q1);if(q1!==1)throw Error('not queued');
hang=false;await p.reload();await p.waitForTimeout(3000);   // = switched menu and came back
const n1=ops.filter(o=>o.col==='calls'&&o.doc&&o.doc.vessel===ship).length;const q2=await p.evaluate(()=>logqGet().length);
console.log('written after reopen',n1,'queue',q2);if(n1!==1||q2!==0)throw Error('queued write not sent');
await p.reload();await p.waitForTimeout(3000);
const n2=ops.filter(o=>o.col==='calls'&&o.doc&&o.doc.vessel===ship).length;console.log('after 2nd reopen',n2);if(n2!==1)throw Error('duplicate');
if(errs.length)throw Error(errs.join('|'));console.log('PASS');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
