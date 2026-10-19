import {getStore} from "@netlify/blobs";
const S=n=>getStore({name:n,consistency:"strong"});
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json"}});
const rid=()=>crypto.randomUUID().slice(0,8);
const MAX=5*1024*1024;
export const config={path:"/api/*"};
export default async req=>{
 const u=new URL(req.url),p=u.pathname.replace(/^\/api\//,""),m=req.method,q=u.searchParams;
 const code=(req.headers.get("x-code")||q.get("code")||"").trim();
 if(p==="ping")return J({ok:1,admin:!!process.env.ADMIN_CODE});
 if(p==="logo"&&m==="GET"){const l=await S("cfg").get("logo");return l?new Response(l,{headers:{"content-type":"text/plain"}}):J({},404)}
 const admin=!!code&&!!process.env.ADMIN_CODE&&code===process.env.ADMIN_CODE;
 let me=null;
 if(!admin&&code){const id=await S("bycode").get(code);if(id)me=await S("teachers").get(id,{type:"json"})}
 if(!admin&&!me)return J({error:"auth"},401);
 const tid=admin?q.get("t"):me.id;
 const T=S("teachers"),EV=S("ev"),SC=S("scores"),F=S("files"),BC=S("bycode");
 if(p==="me")return J({role:admin?"admin":"teacher",teacher:me});
 if(p==="teachers"&&admin){
  const {blobs}=await T.list();const out=[];
  for(const b of blobs){const t=await T.get(b.key,{type:"json"});if(!t)continue;
   const sc=(await SC.get(t.id,{type:"json"}))||{},ev=(await EV.get(t.id,{type:"json"}))||[];
   let total=0;for(const k in sc)if(/^c\d+$/.test(k))total+=+sc[k]||0;out.push({...t,total,files:ev.length})}
  return J(out)}
 if(p==="data"){if(!tid)return J({error:"t"},400);
  const t=admin?await T.get(tid,{type:"json"}):me;if(!t)return J({error:"nf"},404);
  return J({teacher:t,ev:(await EV.get(tid,{type:"json"}))||[],scores:(await SC.get(tid,{type:"json"}))||{}})}
 if(p==="file"&&m==="GET"){
  const ev=(await EV.get(tid,{type:"json"}))||[],e=ev.find(x=>x.fid===q.get("f"));if(!e)return J({error:"nf"},404);
  const b=await F.get(tid+"/"+e.fid,{type:"arrayBuffer"});if(!b)return J({error:"nf"},404);
  return new Response(b,{headers:{"content-type":e.type||"application/octet-stream","content-disposition":"inline; filename*=UTF-8''"+encodeURIComponent(e.name)}})}
 if(p==="upload"&&m==="POST"){if(admin)return J({error:"forbidden"},403);
  const b=await req.arrayBuffer();if(b.byteLength>MAX)return J({error:"big"},413);
  const crit=(q.get("crit")||"").replace(/[^c\d]/g,""),fid=rid();
  await F.set(me.id+"/"+fid,b);
  const ev=(await EV.get(me.id,{type:"json"}))||[];ev.push({fid,crit,name:q.get("name")||"file",type:q.get("type")||"",size:b.byteLength,at:Date.now()});
  await EV.setJSON(me.id,ev);return J({ok:1})}
 if(p==="evidence"&&m==="DELETE"){if(admin)return J({error:"forbidden"},403);
  const ev=((await EV.get(me.id,{type:"json"}))||[]).filter(x=>x.fid!==q.get("f"));
  await EV.setJSON(me.id,ev);await F.delete(me.id+"/"+q.get("f"));return J({ok:1})}
 if(!admin)return J({error:"forbidden"},403);
 if(p==="score"&&m==="POST"){await SC.setJSON(tid,await req.json());return J({ok:1})}
 if(p==="logo"&&m==="POST"){await S("cfg").set("logo",await req.text());return J({ok:1})}
 if(p==="teacher"&&m==="POST"){
  const b=await req.json(),c=String(b.code||"").trim();if(!b.name||c.length<4)return J({error:"bad"},400);
  if(c===process.env.ADMIN_CODE)return J({error:"dup"},409);
  const ex=await BC.get(c);if(ex&&ex!==b.id)return J({error:"dup"},409);
  let t={id:b.id||rid()};
  if(b.id){const old=await T.get(b.id,{type:"json"});if(old&&old.code!==c)await BC.delete(old.code)}
  t={...t,name:b.name,campus:b.campus||"",stage:b.stage||"",phone:b.phone||"",code:c};
  await T.setJSON(t.id,t);await BC.set(c,t.id);return J(t)}
 if(p==="teacher"&&m==="DELETE"){const t=await T.get(tid,{type:"json"});if(!t)return J({ok:1});
  const ev=(await EV.get(tid,{type:"json"}))||[];for(const e of ev)await F.delete(tid+"/"+e.fid);
  await EV.delete(tid);await SC.delete(tid);await BC.delete(t.code);await T.delete(tid);return J({ok:1})}
 return J({error:"nf"},404)};
