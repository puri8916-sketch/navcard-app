// แก้ไข → สมุด: last ship deleted (table drops) → box; page left before answering → asked again on reopen;
// tap outside does not close; ไม่บันทึก clears it; บันทึก writes once
const {chromium}=require('playwright');const {setup}=require('./mock.js');const path=require('path');const R=path.join(__dirname,'../../');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await setup(p);const ops=[];
await p.route('https://mock.test/**',async r=>{const u=new URL(r.request().url());
 if(u.searchParams.get('action')==='load')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,docs:[],seq:1,now:Date.now()})});
 if(r.request().method()==='POST'){try{const j=JSON.parse(r.request().postData());if(j.ops){ops.push(...j.ops);return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,seq:2,now:Date.now()})})}}catch(e){}}
 return r.fallback()});
await p.goto('file://'+R+'schedule.html');await p.waitForTimeout(2000);
// one late ship left in its table; then delete it through the UI action (ลบ) → the table drops
const loc=await p.evaluate(()=>{const bi=BD.blocks.findIndex(b=>b.rows.some(r=>String(r.c[10]||'').trim()));const b=BD.blocks[bi];const keep=b.rows.find(r=>String(r.c[10]||'').trim());
 b.rows.forEach(r=>{if(r!==keep)r.c=r.c.map(()=>'')});for(let k=0;k<9;k++)keep.c[k]='';keep.c[9]='พ';for(const bb of Object.values(BD.all))bb.sent=boardHalves(bb);boardSave();renderBoard();askPut([]);
 return {bi,ri:b.rows.indexOf(keep),ship:keep.c[10]}});
await p.evaluate(({bi,ri})=>{SEL={b:bi,r1:ri,c1:10,r2:ri,c2:10};clearSel()},loc);
const pend=await p.evaluate(()=>askGet().map(h=>h.ship));console.log('pending right after delete',pend);if(pend.join()!==loc.ship)throw Error('not recorded at delete');
await p.reload();await p.waitForTimeout(2500);   // left before answering
let names=await p.locator('.lg-box .lg-row b').allTextContents();console.log('asked again',names);if(names.join()!==loc.ship)throw Error('not asked again');
await p.mouse.click(5,5);await p.waitForTimeout(300);if(!(await p.locator('.lg-box').count()))throw Error('tap outside closed the box');
await p.click('.lg-box [data-a="ok"]');await p.waitForTimeout(1000);
const n=ops.filter(o=>o.col==='calls'&&o.doc&&o.doc.vessel===loc.ship).length;console.log('written',n);if(n!==1)throw Error('not written once');
if(await p.evaluate(()=>askGet().length))throw Error('pending not cleared');
await p.reload();await p.waitForTimeout(2500);if(await p.locator('.lg-box').count())throw Error('asked again after answer');
// no ไม่บันทึก button; keys don't reach the board; unticked + บันทึก = nothing written, cleared
await p.evaluate(()=>{askAdd([{side:'R',ship:'X SHIP',t:'27-1000',X:BD.date,berth:'MPP',pilot:'1',agent:'A'}])});await p.reload();await p.waitForTimeout(2500);
if(await p.locator('.lg-box [data-a="no"]').count())throw Error('ไม่บันทึก still there');
const before=await p.evaluate(()=>JSON.stringify(BD.blocks.map(b=>b.rows.map(r=>r.c))));await p.keyboard.press('Delete');await p.keyboard.type('zz');
if(before!==await p.evaluate(()=>JSON.stringify(BD.blocks.map(b=>b.rows.map(r=>r.c)))))throw Error('keys reached the board');
await p.uncheck('.lg-box input[data-i="0"]');const n0=ops.length;await p.click('.lg-box [data-a="ok"]');await p.waitForTimeout(600);
if(ops.length!==n0||await p.evaluate(()=>askGet().length)||await p.locator('.lg-box').count())throw Error('unticked บันทึก wrong');
if(errs.length)throw Error(errs.join('|'));console.log('PASS');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
