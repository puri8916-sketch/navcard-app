// ลำดับการปิด filter: a card numbered today shows in this month even if it sailed last month
const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();
for(const w of [1280,390]){const p=await b.newPage({viewport:{width:w,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript({path:path.join(__dirname,'../../sync_client.js')});
await p.goto('file://'+path.join(__dirname,'../../pilot_log.html'));await p.waitForTimeout(800);
await p.evaluate(async()=>{const now=new Date(),pm=new Date(now.getFullYear(),now.getMonth()-1,10),z=n=>String(n).padStart(2,'0');
const d=pm.getFullYear()+'-'+z(pm.getMonth()+1)+'-10',n=Date.now();
await SyncStore.put('calls','j',{date:d,vessel:'JUMBO ADVANCER',atd:'0800',t:n,updated:n,status:'',closeNo:'18/3',cnAt:n});
await SyncStore.put('calls','o',{date:d,vessel:'OLD SHIP',atd:'0900',t:n+1,updated:n,status:'',closeNo:'18/1',cnAt:pm.getTime()});});
await p.waitForTimeout(600);
await p.fill('#cf','18');await p.waitForTimeout(600);
const txt=await p.locator('#view-log').innerText();
const j=txt.includes('JUMBO ADVANCER'),o=txt.includes('OLD SHIP');console.log(w,'JUMBO',j,'OLD',o);
if(!j)throw Error('JUMBO ADVANCER (typed today) missing');if(o)throw Error('OLD SHIP (typed last month) should not show');
if(errs.length)throw Error(errs.join('|'));await p.close()}
console.log('PASS');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
