import {env} from "cloudflare:workers";
import {employeeUser} from "../../../../lib/employee-server";

const totalsSchema=`CREATE TABLE IF NOT EXISTS pdd_daily_page_views (view_day TEXT NOT NULL,path TEXT NOT NULL,view_count INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(view_day,path))`;
const viewersSchema=`CREATE TABLE IF NOT EXISTS pdd_daily_page_viewers (view_day TEXT NOT NULL,path TEXT NOT NULL,visitor_hash TEXT NOT NULL,first_viewed_at TEXT NOT NULL,PRIMARY KEY(view_day,path,visitor_hash))`;
export async function GET(request:Request){
  const employee=await employeeUser(request);if(!employee)return Response.json({error:"Employee access required."},{status:401});
  await env.DB.prepare(totalsSchema).run();await env.DB.prepare(viewersSchema).run();
  const rows=await env.DB.prepare("SELECT totals.view_day,totals.path,totals.view_count,COUNT(viewers.visitor_hash) AS unique_viewers FROM pdd_daily_page_views totals LEFT JOIN pdd_daily_page_viewers viewers ON viewers.view_day=totals.view_day AND viewers.path=totals.path WHERE totals.view_day>=date('now','-90 days') GROUP BY totals.view_day,totals.path,totals.view_count ORDER BY totals.view_day DESC,totals.view_count DESC,totals.path ASC").all();
  return Response.json({rows:rows.results||[]},{headers:{"Cache-Control":"no-store"}});
}
