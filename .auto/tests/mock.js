// shared mock for schedule.html
function ymd(d){return d.toISOString().slice(0,10)}
function mk(){
 const t=new Date(Date.now()+7*3600e3);const D=ymd(t);const N=ymd(new Date(t.getTime()+864e5));
 const mv=[
  {id:'a1',datetime:D+' 18:00',ship:'MAERSK ALPHA',loa:'180',drf:'9.5',pilot:'12',agent:'ABC',late:0,note:'',type:'IN',to:'PRATEEP',from:'',pob:''},
  {id:'a2',datetime:D+' 18:00',ship:'OCEAN BETA',loa:'150',drf:'8.0',pilot:'7',agent:'XYZ',late:0,note:'',type:'OUT',from:'SAWAT',to:'',pob:''},
  {id:'a3',datetime:D+' 21:30',ship:'SEA GAMMA',loa:'120',drf:'7.2',pilot:'3',agent:'ABC',late:0,note:'',type:'IN',to:'SOUTHERN',from:'',pob:''},
  {id:'a4',datetime:N+' 06:30',ship:'STAR DELTA',loa:'140',drf:'6.5',pilot:'5',agent:'QQ',late:0,note:'',type:'OUT',from:'HARIN1',to:'',pob:''},
  {id:'a5',datetime:N+' 08:00',ship:'MOON EPS',loa:'99',drf:'5.5',pilot:'9',agent:'QQ',late:1,note:'',type:'IN',to:'MPP',from:'',pob:''},
 ];
 const init={ships:[{name:'MAERSK ALPHA EXPRESS NAVIGATOR',loa:'180',agent:'ABC SHIPPING',berth:'PRATEEP',note:'เรือประจำ'},{name:'OCEAN BETA',loa:'150',agent:'XYZ'},{name:'SEA GAMMA',loa:'120',agent:'ABC'},{name:'STAR DELTA',loa:'140',agent:'QQ'},{name:'MOON EPS',loa:'99',agent:'QQ'}],
  berths:['PRATEEP','SAWAT','SOUTHERN','HARIN1','MPP'],agents:['ABC','XYZ','QQ'],pilots:{'3':'0811111111','5':'0822222222','7':'0833333333','9':'0844444444','12':'0855555555'},duty:{},fixed:[],settings:{},snapshots:{},boards:{},layouts:{}};
 return {D,mv,init};
}
async function setup(p,opts={}){
 const st=mk(); const log=[];
 await p.addInitScript(()=>{window.__SCHED__={url:'https://mock.test/x',key:'t'}});
 await p.route('https://mock.test/**',async r=>{
  const u=new URL(r.request().url());let a=u.searchParams.get('action');let body=null;
  if(r.request().method()==='POST'){try{body=JSON.parse(r.request().postData());a=body.action||(body.ops?'ops':a)}catch(e){}}
  log.push(a);
  let data=null;
  if(a==='init')data=st.init;
  else if(a==='movements')data=st.mv;
  else if(a==='saveBoard'){st.init.boards[body.board.date]={...body.board,updated:Date.now()};data={updated:Date.now()}}
  else if(a==='boards')data=st.init.boards;
  else if(a==='load')data={docs:[],seq:1,now:Date.now()};
  else if(a==='saveMovement')data=body.m;
  else data=true;
  await r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,data})});
 });
 return {st,log};
}
module.exports={setup};
