// แถวคั่น: more than 1 h apart → separator (06:45→08:00 yes, 07:00→08:00 no, 06:30→08:00 yes, 20:00-midnight none)
const {chromium}=require('playwright');const {setup}=require('./mock.js');const path=require('path');const R=path.join(__dirname,'../../');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await setup(p);await p.goto('file://'+R+'schedule.html');await p.waitForTimeout(2000);
const r=await p.evaluate(()=>{const D='2026-11-26 ';const g=(a,b)=>needGap(D+a,D+b);
 const mk=(t,i)=>({id:'x'+i,datetime:D+t,ship:'S'+i,type:'IN',to:'PRATEEP'});
 const rows=autoRows(['06:45','08:00','09:00','10:01'].map(mk)).map(r=>r.blank?'|':'S');
 return {a:g('06:45','08:00'),b:g('06:30','08:00'),c:g('07:00','08:00'),d:g('06:10','07:20'),e:g('06:10','07:10'),f:g('20:30','22:00'),rows:rows.join('')}});
console.log(JSON.stringify(r));
const exp={a:true,b:true,c:false,d:true,e:false,f:false,rows:'S|SS|S'};
for(const k in exp)if(r[k]!==exp[k])throw Error(k+' expected '+exp[k]+' got '+r[k]);
if(errs.length)throw Error(errs.join('|'));console.log('PASS');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
