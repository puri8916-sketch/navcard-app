// test (needs: streamlit run app.py --server.port 8599 --server.headless true): ปิดการ์ด page titles on phones ≤28px / 21px, desktop unchanged, every menu still opens — usage: node close_page_titles.test.js <outprefix>
const {chromium}=require('playwright');const OUT=process.argv[2];
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
(async()=>{const b=await chromium.launch();
 for(const w of [390,768,1280]){const p=await b.newPage({viewport:{width:w,height:1000},isMobile:w<500,hasTouch:w<500});
  await p.goto('http://localhost:8599');await p.waitForTimeout(7000);
  const go=async t=>{await p.locator('button').filter({hasText:t}).first().evaluate(x=>x.click());await p.waitForTimeout(5000)};
  await go('ปิดการ์ด');
  const h1=await p.$eval('.stApp h1',x=>[parseFloat(getComputedStyle(x).fontSize),Math.round(x.getBoundingClientRect().height)]);
  const h3=await p.$$eval('.stMain h3',a=>a.map(x=>parseFloat(getComputedStyle(x).fontSize)));
  if(w<=640){ok(h1[0]===28&&h1[1]<=60, `${w}: page title 28px on one line (${h1})`);ok(h3.length>=2&&h3.every(f=>f===21), `${w}: step titles 21px (${h3})`)}
  else{ok(h1[0]>30&&h3.every(f=>f>21), `${w}: title sizes unchanged (${h1[0]} / ${h3})`)}
  ok(await p.evaluate(()=>document.documentElement.scrollWidth)<=w, `${w}: no side-scroll`);
  ok(!(await p.locator('text=Traceback').count()), `${w}: no Python error on the page`);
  await p.screenshot({path:`${OUT}_${w}.png`,fullPage:w<=640});
  for(const t of ['จัดตารางเรือ','สมุดบันทึกเรือ','แจ้งเรือขาดย้ายท่า','แจ้งเรืออย.']){await go(t);ok(await p.locator('iframe').count()>0&&!(await p.locator('text=Traceback').count()), `${w}: ${t} opens`)}
  await p.close()}
 await b.close();console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0)})();
