// test: schedule.html dark mode — no near-invisible text in the tool bars of every tab (วันที่ label, B button); light mode unchanged — usage: node sched_dark_toolbar.test.js <root> <outprefix>
const {chromium}=require('playwright');const R=process.argv[2],OUT=process.argv[3];const {setup}=require(R+'/.auto/tests/mock.js');
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
(async()=>{const b=await chromium.launch();
 for(const [scheme,theme] of [['dark',null],['light',null],['dark','light'],['light','dark']]){const dark=theme?theme==='dark':scheme==='dark',tag=scheme+(theme?' + app '+theme:'');
  for(const w of [390,1280]){const p=await b.newPage({viewport:{width:w,height:900},colorScheme:scheme,isMobile:w<500,hasTouch:w<500});const errs=[];p.on('pageerror',e=>errs.push(e.message));
   await setup(p);if(theme)await p.addInitScript(t=>{window.__THEME__=t},theme);
   await p.goto('file://'+R+'/schedule.html');await p.waitForTimeout(1500);
   if(theme)await p.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
   for(const t of ['line','work','ships','pilots']){const L=p.locator('#tab-'+t);if(!(await L.isVisible()))continue;await L.click();await p.waitForTimeout(400);
    const bad=await p.evaluate(()=>{const lum=c=>{const m=c.match(/[\d.]+/g).map(Number);return (m[0]*299+m[1]*587+m[2]*114)/1000};
     const bg=el=>{for(let x=el;x;x=x.parentElement){const c=getComputedStyle(x).backgroundColor;if(!/rgba\(0, 0, 0, 0\)|transparent/.test(c))return c}return 'rgb(255,255,255)'};
     return [...document.querySelectorAll('section:not([hidden]) *, header *')].filter(x=>x.offsetParent&&[...x.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&!x.closest('#board,#grid,#paperBig,.paper')).map(x=>[x.tagName+':'+x.textContent.trim().slice(0,12),Math.round(Math.abs(lum(getComputedStyle(x).color)-lum(bg(x))))]).filter(a=>a[1]<70)});
    if(dark)ok(bad.length===0, `${tag} ${w} ${t}: all tool-bar text readable ${JSON.stringify(bad)}`)}
   await p.click('#tab-line');await p.waitForTimeout(300);
   const c=await p.$$eval('label.since,.boldbtn b',a=>a.map(x=>getComputedStyle(x).color));
   ok(dark?c.every(x=>x==='rgb(230, 238, 244)'):c.every(x=>x==='rgb(17, 17, 17)'), `${tag} ${w}: วันที่ + B colour ${c}`);
   if(w===390&&!theme)await p.screenshot({path:`${OUT}_${scheme}_${w}.png`,clip:{x:0,y:0,width:390,height:260}});
   ok(errs.length===0, `${tag} ${w}: no page errors ${errs}`);await p.close()}}
 await b.close();console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0)})();
