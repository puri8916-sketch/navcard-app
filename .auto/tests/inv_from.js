// แยกใบแจ้งหนี้: เขตท่า เข้า must not be copied to เขตท่า ออก (form + table cell); normal records still copy
const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();
for(const w of [1280,390]){const p=await b.newPage({viewport:{width:w,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript({path:path.join(__dirname,'../../sync_client.js')});
await p.goto('file://'+path.join(__dirname,'../../pilot_log.html'));await p.waitForTimeout(800);
await p.evaluate(async()=>{const t=new Date(),z=n=>String(n).padStart(2,'0'),d=t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate()),n=Date.now();
await SyncStore.put('calls','s',{date:d,vessel:'SPLIT SHIP',t:n,updated:n,status:'',atd:'0800',invOut:true});
await SyncStore.put('calls','o',{date:d,vessel:'OUTONLY SHIP',t:n+1,updated:n,status:'',atd:'0800',invIn:true});
await SyncStore.put('calls','n',{date:d,vessel:'NORMAL SHIP',t:n+2,updated:n,status:''});});
await p.waitForTimeout(600);
const form=async id=>{await p.evaluate(id=>openEditor(allCalls.find(c=>c.id===id)),id);await p.waitForTimeout(300);
  await p.fill('#fFrom','SKA');await p.dispatchEvent('#fFrom','change');const v=await p.inputValue('#fLbp');await p.keyboard.press('Escape');await p.evaluate(()=>document.getElementById('edClose').click());await p.waitForTimeout(200);return v};
const r={split:await form('s'),outonly:await form('o'),normal:await form('n')};
console.log(w,'form',JSON.stringify(r));
if(r.split||r.outonly)throw Error('form copied เขตท่า on split');if(r.normal!=='SKA')throw Error('normal no longer copies');
if(w===1280){ // table cell
  for(const id of ['s','n']){await p.click(`tr[data-id="${id}"]:not([data-si]) td[data-f="from"]`);await p.keyboard.type('SKB');await p.keyboard.press('Enter');await p.waitForTimeout(500);await p.keyboard.press('Escape');}
  const lb=await p.evaluate(()=>({s:allCalls.find(c=>c.id==='s').lbp||'',n:allCalls.find(c=>c.id==='n').lbp||'',sf:allCalls.find(c=>c.id==='s').from}));
  console.log('cell',JSON.stringify(lb));if(lb.sf!=='SKB')throw Error('cell edit not saved');if(lb.s)throw Error('cell copied on split');if(lb.n!=='SKB')throw Error('cell normal no copy');}
if(errs.length)throw Error(errs.join('|'));await p.close()}
console.log('PASS');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
