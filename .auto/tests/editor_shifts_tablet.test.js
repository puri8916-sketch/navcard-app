// test: pilot_log.html ฟอร์มแก้ไข › ย้ายท่า on tablets (761–960px): two lines, nothing cut; phones + desktop layout unchanged — usage: node editor_shifts_tablet.test.js <root> <outprefix>
const {chromium}=require('playwright');const R=process.argv[2],OUT=process.argv[3];
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
(async()=>{const b=await chromium.launch();
 for(const w of [390,761,820,900,960,961,1280]){const tab=w>=761&&w<=960;
  const p=await b.newPage({viewport:{width:w,height:1000},isMobile:w<500,hasTouch:w<1000});const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript({path:R+'/sync_client.js'});await p.goto('file://'+R+'/pilot_log.html');await p.waitForTimeout(700);
  await p.evaluate(()=>{SyncStore.put('calls','c1',{date:curDate,t:1,vessel:'MAERSK ALPHA EXPRESS',eta:'0130',berth:'PRATEEP',shifts:[
    {order:'24-09-00',pilot:'12',fromBerth:'PRATEEP',berth:'SOUTHERN',draught:'9.5',agent:'SOUTHERN SHIPPING AGENCY',remark:'R1'},
    {order:'24-12-00',pilot:'5',fromBerth:'SOUTHERN',berth:'HARIN1',draught:'9.0',agent:'ABC',remark:'R2'}]})});await p.waitForTimeout(300);
  if(w<500){await p.locator('#lvSeg button[data-v="table"]').click().catch(()=>{});}
  await p.evaluate(()=>openEditor(allCalls.find(c=>c.id==='c1')));await p.waitForTimeout(400);
  const info=await p.$$eval('#sheet .srow:not(.head)',rs=>rs.map(r=>{const q=s=>r.querySelector(s).getBoundingClientRect();const ins=[...r.querySelectorAll('input')];
    return {cut:ins.filter(i=>i.scrollWidth>i.clientWidth+1).map(i=>i.id),out:ins.filter(i=>{const b=i.getBoundingClientRect();return b.right>innerWidth||b.left<0}).length,
      line1:Math.abs(q('[id^=so]').top-q('[id^=sd]').top)<2&&Math.abs(q('[id^=so]').top-q('[id^=sb]').top)<2,agBelow:q('[id^=sa]').top>q('[id^=so]').bottom-1,rmBelow:q('[id^=sr]').top>q('[id^=so]').bottom-1,
      allOne:ins.every(i=>Math.abs(i.getBoundingClientRect().top-q('[id^=so]').top)<2),mvTop:Math.abs(q('.mv').top-q('[id^=so]').top)<8}}));
  if(tab){
   ok(info.every(x=>x.cut.length===0&&!x.out), `${w}: no ย้ายท่า field cut or off-screen ${JSON.stringify(info.map(x=>x.cut))}`);
   ok(info.every(x=>x.line1&&x.agBelow&&x.rmBelow&&x.mvTop), `${w}: Order/Pilot/ท่า/Draught/▲▼ on line 1, Agent+Remark on line 2`);
   const hd=await p.$$eval('#sheet .srow.head span',a=>a.filter(x=>x.offsetParent).map(x=>x.textContent).filter(Boolean));ok(hd.join()==='Order,Pilot No.,จากท่า,ไปท่า,Draught,ลำดับ', `${w}: column titles above line 1 (${hd})`);
   const al=await p.evaluate(()=>{const h=[...document.querySelectorAll('#sheet .srow.head span')],r=document.querySelector('#sheet .srow:not(.head)');return ['so','sp','sf','sb','sd'].every((id,k)=>Math.abs(h[[1,2,3,5,6][k]].getBoundingClientRect().left-r.querySelector('[id^='+id+']').getBoundingClientRect().left)<2)});
   ok(al, `${w}: titles line up with their fields`);
  }else if(w>=961){
   ok(info.every(x=>x.allOne), `${w}: desktop: one shift = one line (unchanged)`);
   ok(info.every(x=>!x.cut.some(i=>/^s[fb]/.test(i))), `${w}: berths not cut (long Agent may scroll in its box, as before) ${JSON.stringify(info.map(x=>x.cut))}`);
  }else{
   ok(info.every(x=>!x.out), `${w}: phone layout fields on screen`);
   ok(await p.$eval('#sheet .srow.head',x=>getComputedStyle(x).display)==='none', `${w}: phone layout unchanged (no title row)`);
  }
  if(w===820||w===390||w===1280)await p.screenshot({path:`${OUT}_${w}.png`});
  // functions: ▼ reorder, add, delete, save
  await p.locator('#sheet .srow:not(.head)').first().locator('.mv button').nth(1).click();await p.waitForTimeout(100);
  ok(await p.inputValue('#so0')==='24-12-00', `${w}: ▼ moves the shift down`);
  await p.click('#addShift');await p.waitForTimeout(100);ok(await p.locator('#sheet .srow:not(.head)').count()===3&&await p.inputValue('#sf2')==='SOUTHERN', `${w}: + ย้ายท่า adds a row (from = last berth)`);
  await p.fill('#sb2','MPP');await p.locator('#sheet .srow:not(.head)').nth(2).locator('.x').click();ok(await p.locator('#sheet .srow:not(.head)').count()===2, `${w}: ✕ deletes`);
  await p.fill('#sa1','NEW AGENT');await p.click('#edSave');await p.waitForTimeout(400);
  const sh=await p.evaluate(()=>allCalls.find(c=>c.id==='c1').shifts.map(s=>s.order+'|'+s.agent+'|'+s.remark).join(';'));
  ok(sh==='24-12-00|ABC|R2;24-09-00|NEW AGENT|R1', `${w}: saved order + edits (${sh})`);
  ok(errs.length===0, `${w}: no page errors ${errs}`);await p.close()}
 await b.close();console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0)})();
