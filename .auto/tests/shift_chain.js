// สมุด › ย้ายท่า: ไปท่า of shift n fills จากท่า of shift n+1 at once; a different จากท่า typed by hand stays
const {chromium}=require('playwright');const path=require('path');const R=path.join(__dirname,'../../');
(async()=>{const b=await chromium.launch();
for(const w of [1280,390]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript({path:R+'sync_client.js'});await p.goto('file://'+R+'pilot_log.html');await p.waitForTimeout(700);
await p.click('#addBtn');await p.waitForTimeout(300);await p.fill('#fBerth','SPT');
for(let k=0;k<3;k++){await p.click('#addShift');await p.waitForTimeout(150);}
await p.fill('#sb0','PSB-1');await p.fill('#sb1','MPP');
let v=[await p.inputValue('#sf0'),await p.inputValue('#sf1'),await p.inputValue('#sf2')];console.log(w,v);
if(v.join()!=='SPT,PSB-1,MPP')throw Error('chain '+v);
await p.fill('#sb0','PSB-2');v=await p.inputValue('#sf1');if(v!=='PSB-2')throw Error('retype not followed '+v);
await p.fill('#sf2','HAND');await p.fill('#sb1','SKL');v=await p.inputValue('#sf2');if(v!=='HAND')throw Error('hand value overwritten '+v);
if(errs.length)throw Error(errs.join('|'));await p.close()}
console.log('PASS');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
