import {env} from "cloudflare:workers";

const allowed=new Set(["inquiry_submit","email_click","phone_click","bid_submit"]);
const clean=(value:unknown,max=300)=>typeof value==="string"?value.trim().slice(0,max):"";

export async function POST(request:Request){try{const body=await request.json() as Record<string,unknown>,eventName=clean(body.event,40);if(!allowed.has(eventName))return Response.json({ok:false},{status:400});await env.DB.prepare(`CREATE TABLE IF NOT EXISTS marketing_conversions (id TEXT PRIMARY KEY,event_name TEXT NOT NULL,label TEXT NOT NULL DEFAULT '',path TEXT NOT NULL DEFAULT '',referrer TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL)`).run();await env.DB.prepare("INSERT INTO marketing_conversions (id,event_name,label,path,referrer,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),eventName,clean(body.label,160),clean(body.path,240),clean(body.referrer,300),new Date().toISOString()).run();return Response.json({ok:true})}catch{return Response.json({ok:false},{status:400})}}
