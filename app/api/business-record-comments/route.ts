import {env} from "cloudflare:workers";
import {employeeUser} from "../../../lib/employee-server";

const recordTypes=new Set(["vendor","customer","prospect"]);
const key=(recordType:string,recordId:string)=>`${recordType}:${recordId}`;

export async function GET(request:Request){
  const employee=await employeeUser(request);
  if(!employee)return Response.json({error:"Employee access required."},{status:401});
  const url=new URL(request.url),recordType=url.searchParams.get("recordType")||"",recordId=(url.searchParams.get("recordId")||"").trim();
  if(!recordTypes.has(recordType)||!recordId)return Response.json({error:"A valid business record is required."},{status:400});
  const row=await env.DB.prepare("SELECT comments,updated_by,updated_at FROM business_record_comments WHERE id=?").bind(key(recordType,recordId)).first<{comments:string;updated_by:string;updated_at:string}>();
  return Response.json({comments:row?.comments||"",updatedBy:row?.updated_by||"",updatedAt:row?.updated_at||null},{headers:{"cache-control":"private, no-store"}});
}

export async function PUT(request:Request){
  const employee=await employeeUser(request);
  if(!employee)return Response.json({error:"Employee access required."},{status:401});
  const body=await request.json().catch(()=>({})) as {recordType?:string;recordId?:string;comments?:string},recordType=String(body.recordType||""),recordId=String(body.recordId||"").trim(),comments=String(body.comments||"").trim();
  if(!recordTypes.has(recordType)||!recordId)return Response.json({error:"A valid business record is required."},{status:400});
  if(comments.length>10000)return Response.json({error:"Comments must be 10,000 characters or fewer."},{status:400});
  const now=new Date().toISOString();
  await env.DB.prepare("INSERT INTO business_record_comments (id,record_type,record_id,comments,updated_by,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET comments=excluded.comments,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(key(recordType,recordId),recordType,recordId,comments,employee.email,now).run();
  return Response.json({comments,updatedBy:employee.email,updatedAt:now});
}
