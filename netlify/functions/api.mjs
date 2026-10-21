import {getStore} from "@netlify/blobs";
const S=n=>getStore({name:n,consistency:"strong"});
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json"}});
const rid=()=>crypto.randomUUID().slice(0,8);
const MAX=5*1024*1024;
export const config={path:"/api/*"};
const ld=async(st,tid,m,cur)=>{let v=await st.get(tid+":"+m,{type:"json"});if(v==null&&cur)v=await st.get(tid,{type:"json"});return v};
export default async req=>{
 const u=new URL(req.url),p=u.pathname.replace(/^\/api\//,""),mt=req.method,q=u.searchParams;
 const code=(req.headers.get("x-code")||q.get("code")||"").trim();
 if(p==="ping")return J({ok:1,admin:!!process.env.ADMIN_CODE});
 if(p==="logo"&&mt==="GET"){const l=await S("cfg").get("logo");return l?new Response(l,{headers:{"content-type":"text/plain"}}):J({},404)}
 const admin=!!code&&!!process.env.ADMIN_CODE&&code===process.env.ADMIN_CODE;
 let me=null;
 if(!admin&&code){const id=await S("bycode").get(code);if(id)me=await S("teachers").get(id,{type:"json"})}
 if(!admin&&!me)return J({error:"auth"},401);
 const T=S("teachers"),EV=S("ev"),SC=S("scores"),F=S("files"),BC=S("bycode"),MS=S("months");
 if(p==="me")return J({role:admin?"admin":"teacher",teacher:me});
 const tid=admin?q.get("t"):me.id,m=q.get("m")||"",cur=q.get("cur")==="1",okm=/^\d{4}-\d{2}$/.test(m),bad=!tid||!okm;
 if(p==="teachers"&&admin){
  if(!okm)return J({error:"m"},400);
  const {blobs}=await T.list();const out=[];
  for(const b of blobs){const t=await T.get(b.key,{type:"json"});if(!t)continue;
   const sc=(await ld(SC,t.id,m,cur))||{},ev=(await ld(EV,t.id,m,cur))||[];
   let total=0;for(const k in sc)if(/^c\d+$/.test(k))total+=+sc[k]||0;out.push({...t,total,files:ev.length})}
  return J(out)}
 if(p==="months"){
  if(!tid)return J({error:"t"},400);const ms=new Set(),cl=[];
  for(const st of [EV,SC,MS]){const {blobs}=await st.list({prefix:tid+":"});for(const b of blobs){const mm=b.key.split(":")[1];ms.add(mm);if(st===MS)cl.push(mm)}}
  return J({months:[...ms],closed:cl})}
 if(p==="data"){if(bad)return J({error:"bad"},400);
  const t=admin?await T.get(tid,{type:"json"}):me;if(!t)return J({error:"nf"},404);
  return J({teacher:t,ev:(await ld(EV,tid,m,cur))||[],scores:(await ld(SC,tid,m,cur))||{},closed:!!(await MS.get(tid+":"+m))})}
 if(p==="file"&&mt==="GET"){if(bad)return J({error:"bad"},400);
  const ev=(await ld(EV,tid,m,cur))||[],e=ev.find(x=>x.fid===q.get("f"));if(!e)return J({error:"nf"},404);
  const b=await F.get(tid+"/"+e.fid,{type:"arrayBuffer"});if(!b)return J({error:"nf"},404);
  return new Response(b,{headers:{"content-type":e.type||"application/octet-stream","content-disposition":"inline; filename*=UTF-8''"+encodeURIComponent(e.name)}})}
 if(p==="upload"&&mt==="POST"){if(admin)return J({error:"forbidden"},403);if(bad)return J({error:"bad"},400);
  if(await MS.get(tid+":"+m))return J({error:"closed"},423);
  const b=await req.arrayBuffer();if(b.byteLength>MAX)return J({error:"big"},413);
  const crit=(q.get("crit")||"").replace(/[^c\d]/g,""),fid=rid();
  await F.set(tid+"/"+fid,b);
  const ev=(await ld(EV,tid,m,cur))||[];ev.push({fid,crit,name:q.get("name")||"file",type:q.get("type")||"",size:b.byteLength,at:Date.now()});
  await EV.setJSON(tid+":"+m,ev);return J({ok:1})}
 if(p==="evidence"&&mt==="DELETE"){if(admin)return J({error:"forbidden"},403);if(bad)return J({error:"bad"},400);
  if(await MS.get(tid+":"+m))return J({error:"closed"},423);
  const ev=((await ld(EV,tid,m,cur))||[]).filter(x=>x.fid!==q.get("f"));
  await EV.setJSON(tid+":"+m,ev);await F.delete(tid+"/"+q.get("f"));return J({ok:1})}
 if(!admin)return J({error:"forbidden"},403);
 if(p==="score"&&mt==="POST"){if(bad)return J({error:"bad"},400);
  if(await MS.get(tid+":"+m))return J({error:"closed"},423);
  await SC.setJSON(tid+":"+m,await req.json());return J({ok:1})}
 if(p==="close"&&mt==="POST"){if(bad)return J({error:"bad"},400);
  await EV.setJSON(tid+":"+m,(await ld(EV,tid,m,cur))||[]);await SC.setJSON(tid+":"+m,(await ld(SC,tid,m,cur))||{});
  await MS.setJSON(tid+":"+m,{at:Date.now()});return J({ok:1})}
 if(p==="reopen"&&mt==="POST"){if(bad)return J({error:"bad"},400);await MS.delete(tid+":"+m);return J({ok:1})}
 if(p==="logo"&&mt==="POST"){await S("cfg").set("logo",await req.text());return J({ok:1})}
 if(p==="teacher"&&mt==="POST"){
  const b=await req.json(),c=String(b.code||"").trim();if(!b.name||c.length<4)return J({error:"bad"},400);
  if(c===process.env.ADMIN_CODE)return J({error:"dup"},409);
  const ex=await BC.get(c);if(ex&&ex!==b.id)return J({error:"dup"},409);
  if(b.id){const old=await T.get(b.id,{type:"json"});if(old&&old.code!==c)await BC.delete(old.code)}
  const t={id:b.id||rid(),name:b.name,campus:b.campus||"",stage:b.stage||"",phone:b.phone||"",code:c};
  await T.setJSON(t.id,t);await BC.set(c,t.id);return J(t)}
 if(p==="teacher"&&mt==="DELETE"){const t=await T.get(tid,{type:"json"});if(!t)return J({ok:1});
  for(const st of [EV,SC,MS]){const {blobs}=await st.list({prefix:tid+":"});for(const b of blobs){
   if(st===EV){for(const e of ((await EV.get(b.key,{type:"json"}))||[]))await F.delete(tid+"/"+e.fid)}await st.delete(b.key)}}
  for(const e of ((await EV.get(tid,{type:"json"}))||[]))await F.delete(tid+"/"+e.fid);
  await EV.delete(tid);await SC.delete(tid);await BC.delete(t.code);await T.delete(tid);return J({ok:1})}
 return J({error:"nf"},404)};
