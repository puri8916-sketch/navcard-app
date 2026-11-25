// test: Streamlit ปิดการ์ด page — opaque logo bar while scrolling, phone text/buttons; other pages' header untouched
// usage: start `streamlit run app.py --server.port 8599 --server.headless true`, then node close_page_phone.test.js <outprefix> [before]
const {chromium}=require('playwright');
const OUT=process.argv[2], BEFORE=process.argv[3]==='before'; let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++;};
const go=async(p,name)=>{ const sb=p.locator('section[data-testid="stSidebar"]');
  if(!(await sb.isVisible().catch(()=>false)) || (await sb.boundingBox().catch(()=>null)||{x:-1}).x<0){ await p.locator('[data-testid="stExpandSidebarButton"]').first().click().catch(()=>{}); await p.waitForTimeout(800); }
  await sb.getByText(name).first().click(); await p.waitForTimeout(5000); };
(async()=>{
 const b=await chromium.launch();
 for(const w of [390,768,1280]){
  const p=await b.newPage({viewport:{width:w,height:900},isMobile:w<500,hasTouch:w<1000});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8599');await p.waitForTimeout(6000);
  await go(p,'ปิดการ์ด');
  await p.screenshot({path:`${OUT}_${w}_top.png`});
  await p.evaluate(()=>{const m=document.querySelector('[data-testid="stMain"]');m.scrollTop+=500;window.scrollBy(0,500)});await p.waitForTimeout(500);
  await p.screenshot({path:`${OUT}_${w}_scrolled.png`});
  if(BEFORE){ await p.close(); continue; }
  const hb=await p.evaluate(()=>{const h=document.querySelector('[data-testid="stHeader"]');const r=h.getBoundingClientRect();return {bg:getComputedStyle(h).backgroundColor,w:r.right}});
  ok(hb.bg==='rgb(255, 255, 255)' && hb.w>=w-1, `${w}: logo bar opaque + reaches the right edge (${JSON.stringify(hb)})`);
  const bt=await p.$$eval('[data-testid="stMain"] [data-testid="stButton"] button',a=>a.filter(x=>x.offsetParent).map(x=>[x.getBoundingClientRect().width,x.getBoundingClientRect().height,parseFloat(getComputedStyle(x.querySelector('p')||x).fontSize)]));
  if(w<=640){
   const mw=await p.evaluate(()=>document.querySelector('[data-testid="stMain"] [data-testid="stVerticalBlock"]').getBoundingClientRect().width);
   ok(bt.length>=3 && bt.every(([bw,bh,fs])=>bw>=mw*0.9 && bh>=48 && fs>=17), `${w}: buttons full width, ≥48px, ≥17px ${JSON.stringify(bt)}`);
   const small=await p.$$eval('[data-testid="stMain"] [data-testid="stMarkdownContainer"] p, [data-testid="stMain"] [data-testid="stWidgetLabel"] p',a=>a.filter(e=>e.offsetParent&&e.textContent.trim()&&parseFloat(getComputedStyle(e).fontSize)<16).map(e=>e.textContent.slice(0,20)));
   ok(small.length===0, `${w}: no text under 16px ${JSON.stringify(small)}`);
  } else {
   ok(bt.every(([bw])=>bw<600), `${w}: buttons keep their normal width`);
  }
  const docW=await p.evaluate(()=>document.documentElement.scrollWidth); ok(docW<=w, `${w}: no side-scroll (${docW})`);
  // back to จัดตารางเรือ: header transparent again (its own layout)
  await go(p,'จัดตารางเรือ');
  const hb2=await p.evaluate(()=>getComputedStyle(document.querySelector('[data-testid="stHeader"]')).backgroundColor);
  ok(hb2==='rgba(0, 0, 0, 0)', `${w}: จัดตารางเรือ header unchanged (${hb2})`);
  await go(p,'สมุดบันทึกเรือ');
  ok(errs.length===0, `${w}: no page errors ${errs}`);
  await p.close();
 }
 await b.close(); console.log(fail?`${fail} FAILED`:'ALL PASS'); process.exit(fail?1:0);
})();
