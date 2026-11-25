// สมุด layout A: รายงาน ▾ menu opens each report bar; day summary; status stripes; ay-mode still loads
const {chromium}=require('playwright');const path=require('path');const R=path.join(__dirname,'../../');
(async()=>{const b=await chromium.launch();
for(const w of [1280,768,390]){const p=await b.newPage({viewport:{width:w,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript({path:R+'sync_client.js'});await p.goto('file://'+R+'pilot_log.html');await p.waitForTimeout(700);
await p.evaluate(async()=>{const t=new Date(),z=n=>String(n).padStart(2,'0'),d=t.getFullYear()+'-'+z(t.getMonth()+1)+'-'+z(t.getDate()),n=Date.now();
await SyncStore.put('calls','a',{date:d,vessel:'A',t:n,updated:n,status:'ปิดการเงิน',closeNo:'18/1'});
await SyncStore.put('calls','b',{date:d,vessel:'B',t:n+1,updated:n,status:'',closeNo:'18/2'});
await SyncStore.put('calls','c',{date:d,vessel:'C',t:n+2,updated:n,status:''});});await p.waitForTimeout(600);
const sum=await p.textContent('#daySum');if(!/3 ลำ.*ยังไม่ปิด 2.*ปิดแล้ว 1/.test(sum))throw Error('summary '+sum);
const st=await p.evaluate(()=>['a','b','c'].map(id=>document.querySelector(`tr.main[data-id="${id}"]`).className.match(/st-\w+/)?.[0]||''));
if(st.join()!=='st-ok,st-num,')throw Error('stripes '+st);
for(const [btn,bar] of [['wordBtn','wordBar'],['pdfBtn','pdfBar'],['bigBtn','bigBar'],['statBtn','statBar']]){
  await p.click('#rptBtn');if(await p.isHidden('#rptPop'))throw Error('menu not open');
  await p.click('#'+btn);if(await p.isVisible('#rptPop'))throw Error('menu not closed after '+btn);
  if(await p.isHidden('#'+bar))throw Error(bar+' not opened');await p.evaluate(b=>document.getElementById(b).hidden=true,bar);}
await p.click('#rptBtn');await p.keyboard.press('Escape');if(await p.isVisible('#rptPop'))throw Error('Esc did not close');
if(errs.length)throw Error(errs.join('|'));console.log(w,'ok');await p.close()}
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{window.__ONLY__='ay'});await p.addInitScript({path:R+'sync_client.js'});await p.goto('file://'+R+'pilot_log.html');await p.waitForTimeout(700);
if(errs.length)throw Error('ay '+errs.join('|'));console.log('ay ok');
console.log('PASS');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
