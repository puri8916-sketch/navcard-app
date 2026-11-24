// test: schedule.html user-facing texts name the combined script Navcard.gs (not the replaced Schedule.gs); smoke of all tabs — usage: node script_name_texts.test.js <root> <outprefix>
const {chromium}=require('playwright');const R=process.argv[2],OUT=process.argv[3];const {setup}=require(R+'/.auto/tests/mock.js');
const fs=require('fs');let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
(async()=>{const src=fs.readFileSync(R+'/schedule.html','utf8');
 ok(!/Schedule\.gs/.test(src), 'schedule.html: no user text points to Schedule.gs');
 ok((src.match(/Navcard\.gs/g)||[]).length>=4, 'schedule.html: messages name Navcard.gs');
 const b=await chromium.launch();
 for(const w of [390,1280]){
  // not connected: the connect card
  let p=await b.newPage({viewport:{width:w,height:900}});let errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+R+'/schedule.html');await p.waitForTimeout(1000);
  const t=await p.locator('p.note',{hasText:'ShipSchedule_DB'}).first().textContent();
  ok(t.includes('apps_script/Navcard.gs')&&t.includes('ติดตั้งแบบรวม'), `${w}: connect card names Navcard.gs + README section (${t.trim()})`);
  await p.screenshot({path:`${OUT}_${w}_connect.png`});ok(errs.length===0, `${w}: no page errors (not connected) ${errs}`);await p.close();
  // connected (mock): every tab opens
  p=await b.newPage({viewport:{width:w,height:900},isMobile:w<500,hasTouch:w<500});errs=[];p.on('pageerror',e=>errs.push(e.message));await setup(p);
  await p.goto('file://'+R+'/schedule.html');await p.waitForTimeout(1500);
  for(const id of ['tab-work','tab-print','tab-ships','tab-pilots','tab-line'])if(await p.locator('#'+id).isVisible()){await p.click('#'+id);await p.waitForTimeout(300)}
  ok(await p.locator('#board table').count()>0, `${w}: tabs open, board rendered`);ok(errs.length===0, `${w}: no page errors ${errs}`);await p.close()}
 await b.close();console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0)})();
