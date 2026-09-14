import {env} from "cloudflare:workers";
import {employeeUser} from "../../../lib/employee-server";
const schema=`CREATE TABLE IF NOT EXISTS onboarding_applications (id TEXT PRIMARY KEY,reference TEXT NOT NULL UNIQUE,site TEXT NOT NULL,kind TEXT NOT NULL,company TEXT NOT NULL,contact_name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',created_at TEXT NOT NULL)`;
const attachmentSchema=`CREATE TABLE IF NOT EXISTS onboarding_attachments (id TEXT PRIMARY KEY,application_id TEXT NOT NULL,object_key TEXT NOT NULL,filename TEXT NOT NULL,content_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,created_at TEXT NOT NULL)`;
const clean=(value:unknown,max=1000)=>typeof value==="string"?value.trim().slice(0,max):"";
export async function GET(request:Request){
 const employee=await employeeUser(request);
 if(!employee)return Response.json({error:"Employee sign-in required."},{status:401});
 try{
  if(new URL(request.url).searchParams.get("site")==="brainfarm"){
   const response=await fetch("https://www.brainfarmusa.ai/api/onboarding",{headers:{Authorization:request.headers.get("authorization")||""},cache:"no-store"});
   return new Response(await response.text(),{status:response.status,headers:{"content-type":"application/json"}});
  }
  await env.DB.prepare(schema).run();await env.DB.prepare(attachmentSchema).run();
  const result=await env.DB.prepare("SELECT id,reference,site,kind,company,contact_name,email,phone,payload,status,created_at FROM onboarding_applications ORDER BY created_at DESC").all();
  const attached=await env.DB.prepare("SELECT id,application_id,filename,content_type,size_bytes,created_at FROM onboarding_attachments ORDER BY created_at ASC").all();
  return Response.json({canEdit:true,applications:result.results.map((row:any)=>({...row,attachments:attached.results.filter((file:any)=>file.application_id===row.id)}))});
 }catch{return Response.json({error:"Applications could not be loaded."},{status:500})}
}
export async function PATCH(request:Request){
 const employee=await employeeUser(request);
 if(!employee)return Response.json({error:"Employee sign-in required."},{status:401});
 try{
  const site=new URL(request.url).searchParams.get("site");
  if(site==="brainfarm"){
   const response=await fetch("https://www.brainfarmusa.ai/api/onboarding",{method:"PATCH",headers:{Authorization:request.headers.get("authorization")||"","content-type":"application/json"},body:await request.text()});
   return new Response(await response.text(),{status:response.status,headers:{"content-type":"application/json"}});
  }
  const body=await request.json() as Record<string,unknown>,id=clean(body.id,80),company=clean(body.company,180),contactName=clean(body.contactName,140),email=clean(body.email,180).toLowerCase(),phone=clean(body.phone,60),status=clean(body.status,30)||"new";
  if(!id||!company)return Response.json({error:"Company name is required."},{status:400});
  const raw=body.payload&&typeof body.payload==="object"?body.payload as Record<string,unknown>:{},payload=Object.fromEntries(Object.entries(raw).slice(0,120).map(([key,value])=>[key.slice(0,80),clean(value)]));
  const result=await env.DB.prepare("UPDATE onboarding_applications SET company=?,contact_name=?,email=?,phone=?,payload=?,status=? WHERE id=?").bind(company,contactName,email,phone,JSON.stringify(payload),status,id).run();
  if(!result.meta.changes)return Response.json({error:"Application not found."},{status:404});
  return Response.json({ok:true});
 }catch{return Response.json({error:"Application could not be saved."},{status:500})}
}
export async function POST(request:Request){try{
 if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:"Request not allowed."},{status:403});
 const body=await request.json() as Record<string,unknown>;if(clean(body.websiteTrap))return Response.json({ok:true,reference:"received"});
 const kind=clean(body.kind,20),company=clean(body.company,180),contactName=clean(body.contactName,140),email=clean(body.email,180).toLowerCase(),phone=clean(body.phone,60),site=clean(body.site,50)||"Mac2MacOnline";
 if(!["customer","vendor"].includes(kind)||!company)return Response.json({error:"Company name is required."},{status:400});
 const id=crypto.randomUUID(),reference=""+(kind==="vendor"?"V":"C")+"-"+new Date().toISOString().slice(2,10).replaceAll("-","")+"-"+id.slice(0,6).toUpperCase();
 const reserved=new Set(["kind","site","company","contactName","email","phone","websiteTrap"]),payload=Object.fromEntries(Object.entries(body).filter(([key])=>!reserved.has(key)).slice(0,120).map(([key,value])=>[key,clean(value)]));
 await env.DB.prepare(schema).run();await env.DB.prepare("INSERT INTO onboarding_applications (id,reference,site,kind,company,contact_name,email,phone,payload,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,'new',?)").bind(id,reference,site,kind,company,contactName,email,phone,JSON.stringify(payload),new Date().toISOString()).run();
 return Response.json({ok:true,reference,id});
 }catch{return Response.json({error:"The application could not be submitted. Please try again."},{status:500})}}
