// จัดตาราง: ships typed in one by one (first entry) end up arranged like จัดอัตโนมัติ — no sharing a row with a far-off ship
const {chromium}=require('playwright');const {setup}=require('./mock.js');const path=require('path');const R=path.join(__dirname,'../../');
(async()=>{const b=await chromium.launch();let fail=0;
const cases=[[['A','L','1800'],['B','R','0630+'],['C','L','2130'],['D','R','2140'],['E','L','1900'],['F','R','1815']],
             [['P','R','0700+'],['Q','L','1830'],['R','L','0500+'],['S','R','2000'],['T','L','2000']]];
for(const [ci,list] of cases.entries()){const p=await b.newPage({viewport:{width:1280,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
const {st}=await setup(p);st.mv.length=0;await p.goto('file://'+R+'schedule.html');await p.waitForTimeout(2000);await p.click('#tab-work');await p.waitForTimeout(800);
const day=await p.evaluate(()=>+S.D.slice(8)),nx=await p.evaluate(()=>+addDays(S.D,1).slice(8));
for(const [n,sd,t] of list){const sel=`#grid tr.newrow input[data-side="${sd}"]`,tt=t.endsWith('+')?nx+'-'+t.slice(0,4):day+'-'+t;
  await p.fill(sel+'[data-k$=":ship"]','SHIP '+n);await p.fill(sel+'[data-k$=":t"]',tt);await p.press(sel+'[data-k$=":t"]','Enter');await p.waitForTimeout(800);}
const fmt=rs=>rs.map(r=>r.blank?'--':(r.L?r.L.ship.slice(5):'.')+'/'+(r.R?r.R.ship.slice(5):'.')).join(' ');
const got=await p.evaluate(()=>arrangeRows(S.mv.filter(m=>inWin(m,S.D)&&!+m.late),S.D).map(r=>r.blank?'--':(r.L?r.L.ship.slice(5):'.')+'/'+(r.R?r.R.ship.slice(5):'.')).join(' '));
const auto=await p.evaluate(()=>autoRows(S.mv.filter(m=>inWin(m,S.D)&&!+m.late).sort(sortMv)).map(r=>r.blank?'--':(r.L?r.L.ship.slice(5):'.')+'/'+(r.R?r.R.ship.slice(5):'.')).join(' '));
console.log('case',ci,'\n got ',got,'\n auto',auto);if(got!==auto){fail++;console.log('FAIL differs from จัดอัตโนมัติ')}
if(errs.length){fail++;console.log('FAIL',errs)}await p.close()}
await b.close();if(fail){console.error('FAIL');process.exit(1)}console.log('PASS')})();
