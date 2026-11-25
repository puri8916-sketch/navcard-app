// ยังไม่ปิดการ์ด: a typed ลำดับการปิด must not count as closed; only ✓ ปิด closes
const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript({path:path.join(__dirname,'../../sync_client.js')});
await p.goto('file://'+path.join(__dirname,'../../pilot_log.html'));await p.waitForTimeout(800);
const d=await p.evaluate(()=>{const t=new Date(),z=n=>String(n).padStart(2,'0');return t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate())});
await p.evaluate(async d=>{const n=Date.now();
await SyncStore.put('calls','a',{date:d,vessel:'ALPHA',t:n,updated:n,status:''});
await SyncStore.put('calls','b',{date:d,vessel:'BRAVO',t:n+1,updated:n,status:'',closeNo:'18/1'});
await SyncStore.put('calls','c',{date:d,vessel:'CHARLIE',t:n+2,updated:n,status:'ปิดการเงิน',closeNo:'18/2'});},d);
await p.waitForTimeout(800);
const n1=await p.textContent('#openN');console.log('openN',n1);if(n1!=='2')throw Error('expected 2 open, got '+n1);
await p.locator('tr',{hasText:'BRAVO'}).locator('.stbtn').click();await p.waitForTimeout(800);
const n2=await p.textContent('#openN');console.log('after ปิด',n2);if(n2!=='1')throw Error('expected 1, got '+n2);
if(errs.length)throw Error(errs.join('|'));console.log('PASS');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
