import {env} from "cloudflare:workers";

const totalsSchema=`CREATE TABLE IF NOT EXISTS pdd_daily_page_views (view_day TEXT NOT NULL,path TEXT NOT NULL,view_count INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(view_day,path))`;
const viewersSchema=`CREATE TABLE IF NOT EXISTS pdd_daily_page_viewers (view_day TEXT NOT NULL,path TEXT NOT NULL,visitor_hash TEXT NOT NULL,first_viewed_at TEXT NOT NULL,PRIMARY KEY(view_day,path,visitor_hash))`;
const headers={"Cache-Control":"no-store"};
function pacificDay(date:Date){const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date),part=(type:string)=>parts.find(item=>item.type===type)?.value||"";return `${part("year")}-${part("month")}-${part("day")}`}
function validPath(value:unknown){const path=String(value||"").replace(/\/+$/g,"")||"/";if(path==="/public-deal-desk"||path==="/live-bid-board")return path;if(/^\/public-deal-desk\/[A-Za-z0-9_-]{1,100}$/.test(path)&&path!=="/public-deal-desk/deal-builder")return path;return ""}
async function digest(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("")}

export async function POST(request:Request){
  const body=await request.json().catch(()=>({})) as {path?:unknown;visitorId?:unknown},path=validPath(body.path),visitorId=String(body.visitorId||"");
  if(!path||visitorId.length<16||visitorId.length>100)return Response.json({error:"Invalid page view."},{status:400,headers});
  const now=new Date(),viewDay=pacificDay(now),viewedAt=now.toISOString(),visitorHash=await digest(visitorId);
  await env.DB.prepare(totalsSchema).run();await env.DB.prepare(viewersSchema).run();
  await env.DB.batch([env.DB.prepare("INSERT INTO pdd_daily_page_views (view_day,path,view_count,updated_at) VALUES (?,?,1,?) ON CONFLICT(view_day,path) DO UPDATE SET view_count=view_count+1,updated_at=excluded.updated_at").bind(viewDay,path,viewedAt),env.DB.prepare("INSERT OR IGNORE INTO pdd_daily_page_viewers (view_day,path,visitor_hash,first_viewed_at) VALUES (?,?,?,?)").bind(viewDay,path,visitorHash,viewedAt)]);
  return Response.json({ok:true},{headers});
}
