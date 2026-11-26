// แก้ไข: colour given to ETA goes to POB too when both hold the same time (whole cell + part of the text); different times: not
const {chromium}=require('playwright');const {setup}=require('./mock.js');const path=require('path');const R=path.join(__dirname,'../../');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await setup(p);await p.goto('file://'+R+'schedule.html');await p.waitForTimeout(2000);
const loc=await p.evaluate(()=>{for(const [bi,bl] of BD.blocks.entries())for(const [ri,r] of bl.rows.entries())if(String(r.c[1]||'').trim()){r.c[4]=r.c[5]='27-1800';r.r[4]=r.r[5]='';setH(r,4,'');setH(r,5,'');renderBoard();return {bi,ri}}});
const st=(c)=>p.evaluate(({bi,ri,c})=>{const r=BD.blocks[bi].rows[ri];return {r:r.r[c]||'',h:(r.h&&r.h[c])||'',dom:document.querySelector(`.ce[data-b="${bi}"][data-r="${ri}"][data-c="${c}"]`).innerHTML}},{...loc,c});
// whole cell
await p.evaluate(({bi,ri})=>{SEL={b:bi,r1:ri,c1:4,r2:ri,c2:4};setColor('#FF0000')},loc);
let s5=await st(5);console.log('whole',s5.r);if(s5.r!=='#FF0000')throw Error('POB not red');
// different time → POB keeps its colour
await p.evaluate(({bi,ri})=>{const r=BD.blocks[bi].rows[ri];r.r[4]=r.r[5]='';r.c[5]='27-1900';renderBoard();SEL={b:bi,r1:ri,c1:4,r2:ri,c2:4};setColor('#0070C0')},loc);
s5=await st(5);if(s5.r)throw Error('different time coloured');
// part of the text (last 4 digits) in red
await p.evaluate(({bi,ri})=>{const r=BD.blocks[bi].rows[ri];r.c[5]='27-1800';r.r[4]=r.r[5]='';renderBoard()},loc);
const sel=`.ce[data-b="${loc.bi}"][data-r="${loc.ri}"][data-c="4"]`;await p.click(sel);
await p.evaluate(({bi,ri,sel})=>{const e=document.querySelector(sel);const t=e.firstChild;const rg=document.createRange();rg.setStart(t,3);rg.setEnd(t,7);const s=getSelection();s.removeAllRanges();s.addRange(rg);SEL={b:bi,r1:ri,c1:4,r2:ri,c2:4};setColor('#FF0000')},{...loc,sel});
s5=await st(5);console.log('part',s5.h,'|',s5.dom);if(!/color/i.test(s5.h)||!/color/i.test(s5.dom))throw Error('POB part colour missing');
if(errs.length)throw Error(errs.join('|'));console.log('PASS');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
