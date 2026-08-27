import {employeeUser} from "../../../../lib/employee-server";
import {pddSupabaseKey,pddSupabaseUrl} from "../../../../lib/pdd-auth";
import {env} from "cloudflare:workers";

const commentSchema=`CREATE TABLE IF NOT EXISTS deal_comments (id TEXT PRIMARY KEY NOT NULL,deal_id TEXT NOT NULL,deal_number TEXT NOT NULL,author_user_id TEXT NOT NULL,author_email TEXT NOT NULL,author_name TEXT NOT NULL,author_initials TEXT NOT NULL,comment TEXT NOT NULL,created_at TEXT NOT NULL,edited_at TEXT)`;
const initials=(name:string,email:string)=>{const parts=name.trim().split(/\s+/).filter(Boolean);return (parts.length>1?parts[0][0]+parts[parts.length-1][0]:(parts[0]||email)[0]+((parts[0]||email)[1]||"")).toUpperCase()};

function upstream(path:string,token:string,init:RequestInit={}){
  const headers=new Headers(init.headers);
  headers.set("apikey",pddSupabaseKey);
  headers.set("Authorization",`Bearer ${token}`);
  headers.set("Content-Type","application/json");
  return fetch(`${pddSupabaseUrl}${path}`,{...init,headers});
}
const encodePath=(path:string)=>path.split("/").map(encodeURIComponent).join("/");

export async function GET(request:Request){
  const employee=await employeeUser(request);if(!employee)return Response.json({error:"Employee access required."},{status:401});
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const columns="id,source_upload_id,deal_number,title,description,quantity,closes_at,location,public_lines,status,published,created_by,created_at,updated_at";
  const response=await upstream(`/rest/v1/pdd_public_deals?select=${columns}&order=created_at.desc`,token);
  if(!response.ok)return Response.json({error:"Deals could not be loaded."},{status:502});
  const deals=await response.json() as Array<Record<string,unknown>&{source_upload_id?:string|null}>;
  const uploadIds=deals.map(deal=>deal.source_upload_id).filter(Boolean) as string[];const owners=new Map<string,{name:string;email:string}>();
  if(uploadIds.length){const uploadResponse=await upstream(`/rest/v1/pdd_deal_uploads?select=id,employee_email&id=in.(${uploadIds.map(encodeURIComponent).join(",")})`,token);if(uploadResponse.ok){const uploads=await uploadResponse.json() as {id:string;employee_email:string}[];let names=new Map<string,string>();const profileResponse=await upstream("/rest/v1/pdd_employee_access?select=email,display_name",token);if(profileResponse.ok)names=new Map((await profileResponse.json() as {email:string;display_name:string}[]).map(profile=>[profile.email,profile.display_name]));for(const upload of uploads)owners.set(upload.id,{name:names.get(upload.employee_email)||upload.employee_email,email:upload.employee_email})}}
  const ownedDeals=deals.map(deal=>{const owner=deal.source_upload_id?owners.get(deal.source_upload_id):undefined;return {...deal,owner_name:owner?.name||"Unassigned",owner_email:owner?.email||""}});
  await env.DB.prepare(commentSchema).run();
  const comments=await env.DB.prepare("SELECT id,deal_id,deal_number,author_user_id,author_initials,author_name,comment,created_at,edited_at FROM deal_comments ORDER BY created_at ASC LIMIT 1000").all();
  return Response.json({deals:ownedDeals,comments:comments.results||[],currentUserId:employee.id,currentUserRole:employee.role});
}

export async function POST(request:Request){
  const employee=await employeeUser(request);if(!employee)return Response.json({error:"Employee access required."},{status:401});
  const body=await request.json() as {dealId?:string;dealNumber?:string;comment?:string};const comment=String(body.comment||"").trim();
  if(!body.dealId||!body.dealNumber||!comment)return Response.json({error:"Enter a comment."},{status:400});if(comment.length>1000)return Response.json({error:"Comments must be 1,000 characters or fewer."},{status:400});
  await env.DB.prepare(commentSchema).run();const item={id:crypto.randomUUID(),deal_id:body.dealId,deal_number:body.dealNumber,author_initials:initials(employee.displayName,employee.email),author_name:employee.displayName,comment,created_at:new Date().toISOString()};
  await env.DB.prepare("INSERT INTO deal_comments (id,deal_id,deal_number,author_user_id,author_email,author_name,author_initials,comment,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(item.id,item.deal_id,item.deal_number,employee.id,employee.email,item.author_name,item.author_initials,item.comment,item.created_at).run();
  return Response.json({comment:item},{status:201});
}

export async function DELETE(request:Request){
  const employee=await employeeUser(request);if(!employee)return Response.json({error:"Employee access required."},{status:401});
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");const url=new URL(request.url);const dealId=url.searchParams.get("deal");
  if(dealId){
    const currentResponse=await upstream(`/rest/v1/pdd_public_deals?id=eq.${encodeURIComponent(dealId)}&select=id,source_upload_id,deal_number,status,created_by&limit=1`,token);if(!currentResponse.ok)return Response.json({error:"The deal could not be opened."},{status:502});
    const current=(await currentResponse.json() as {id:string;source_upload_id:string|null;deal_number:string;status:string;created_by:string}[])[0];if(!current)return Response.json({error:"Deal not found."},{status:404});if(employee.role!=="administrator"&&current.created_by!==employee.id)return Response.json({error:"Only the deal owner or an administrator can delete this deal."},{status:403});if(current.status!=="open")return Response.json({error:"Only an open deal can be deleted here."},{status:400});
    let storagePath="";if(current.source_upload_id){const uploadResponse=await upstream(`/rest/v1/pdd_deal_uploads?id=eq.${encodeURIComponent(current.source_upload_id)}&select=storage_path&limit=1`,token);if(uploadResponse.ok)storagePath=((await uploadResponse.json() as {storage_path:string}[])[0]?.storage_path||"")}
    const publicDelete=await upstream(`/rest/v1/pdd_public_deals?id=eq.${encodeURIComponent(current.id)}`,token,{method:"DELETE"});if(!publicDelete.ok)return Response.json({error:"The open deal could not be deleted."},{status:502});
    if(current.source_upload_id){const uploadDelete=await upstream(`/rest/v1/pdd_deal_uploads?id=eq.${encodeURIComponent(current.source_upload_id)}`,token,{method:"DELETE"});if(!uploadDelete.ok)return Response.json({error:"The deal was removed, but its source upload could not be deleted."},{status:502})}
    if(storagePath)await fetch(`${pddSupabaseUrl}/storage/v1/object/pdd-deal-uploads/${encodePath(storagePath)}`,{method:"DELETE",headers:{apikey:pddSupabaseKey,Authorization:`Bearer ${token}`}});
    await env.DB.prepare(commentSchema).run();await env.DB.batch([env.DB.prepare("DELETE FROM internal_bid_customers WHERE bid_id IN (SELECT id FROM internal_bids WHERE deal_number=?)").bind(current.deal_number),env.DB.prepare("DELETE FROM bid_notification_log WHERE bid_number IN (SELECT internal_bid_number FROM internal_bids WHERE deal_number=?)").bind(current.deal_number),env.DB.prepare("DELETE FROM internal_bids WHERE deal_number=?").bind(current.deal_number),env.DB.prepare("DELETE FROM deal_comments WHERE deal_id=? OR deal_number=?").bind(current.id,current.deal_number)]);
    return Response.json({ok:true,dealNumber:current.deal_number});
  }
  const id=url.searchParams.get("comment");if(!id)return Response.json({error:"Comment ID is required."},{status:400});
  await env.DB.prepare(commentSchema).run();const existing=await env.DB.prepare("SELECT author_user_id FROM deal_comments WHERE id=? LIMIT 1").bind(id).first<{author_user_id:string}>();
  if(!existing)return Response.json({error:"Comment not found."},{status:404});if(existing.author_user_id!==employee.id&&employee.role!=="administrator")return Response.json({error:"You may only delete your own comments."},{status:403});
  await env.DB.prepare("DELETE FROM deal_comments WHERE id=?").bind(id).run();return Response.json({ok:true});
}

export async function PATCH(request:Request){
  const employee=await employeeUser(request);if(!employee)return Response.json({error:"Employee access required."},{status:401});
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  const body=await request.json() as {id?:string;status?:string;commentId?:string;comment?:string;dealName?:string};
  if(body.commentId){
    const comment=String(body.comment||"").trim();if(!comment)return Response.json({error:"Enter a comment."},{status:400});if(comment.length>1000)return Response.json({error:"Comments must be 1,000 characters or fewer."},{status:400});
    await env.DB.prepare(commentSchema).run();const existing=await env.DB.prepare("SELECT author_user_id FROM deal_comments WHERE id=? LIMIT 1").bind(body.commentId).first<{author_user_id:string}>();
    if(!existing)return Response.json({error:"Comment not found."},{status:404});if(existing.author_user_id!==employee.id)return Response.json({error:"You may only edit your own comments."},{status:403});
    const editedAt=new Date().toISOString();await env.DB.prepare("UPDATE deal_comments SET comment=?,edited_at=? WHERE id=?").bind(comment,editedAt,body.commentId).run();return Response.json({comment:{id:body.commentId,comment,edited_at:editedAt}});
  }
  if(body.id&&body.dealName!==undefined){
    const dealName=String(body.dealName).trim();if(dealName.length<2||dealName.length>100)return Response.json({error:"Deal name must be between 2 and 100 characters."},{status:400});
    const currentResponse=await upstream(`/rest/v1/pdd_public_deals?id=eq.${encodeURIComponent(body.id)}&select=id,source_upload_id,deal_number,quantity,closes_at,spreadsheet_filename&limit=1`,token);if(!currentResponse.ok)return Response.json({error:"Deal could not be opened."},{status:502});
    const current=(await currentResponse.json() as {id:string;source_upload_id:string|null;deal_number:string;quantity:number;closes_at:string;spreadsheet_filename:string|null}[])[0];if(!current)return Response.json({error:"Deal not found."},{status:404});
    const slug=dealName.replace(/&/g," and ").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"Mixed-IT-Equipment",spreadsheetFilename=current.spreadsheet_filename?.replace(/(\d+PCS-).*?(\.xlsx)$/i,`$1${slug}$2`)||null,updatedAt=new Date().toISOString(),title=`${Number(current.quantity).toLocaleString("en-US")}-Piece ${dealName} Lot`;
    const response=await upstream(`/rest/v1/pdd_public_deals?id=eq.${encodeURIComponent(body.id)}`,token,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({category:dealName,title,spreadsheet_filename:spreadsheetFilename,updated_at:updatedAt})});if(!response.ok)return Response.json({error:"Deal name could not be updated."},{status:502});
    if(current.source_upload_id){const close=new Date(current.closes_at),displayDate=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",year:"numeric"}).format(close),displayTime=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",hour:"numeric",minute:"2-digit"}).format(close),displayName=`${current.deal_number} — ${Number(current.quantity).toLocaleString("en-US")} pcs ${dealName} — Closes ${displayDate} at ${displayTime} PT`;await upstream(`/rest/v1/pdd_deal_uploads?id=eq.${encodeURIComponent(current.source_upload_id)}`,token,{method:"PATCH",body:JSON.stringify({short_description:dealName,display_name:displayName,display_filename:spreadsheetFilename,updated_at:updatedAt})})}
    return Response.json({deal:(await response.json())[0]});
  }
  if(!body.id||!["open","working","pending","no_bid","lost","completed","closed","archived"].includes(body.status||""))return Response.json({error:"Choose a valid deal status."},{status:400});
  const response=await upstream(`/rest/v1/pdd_public_deals?id=eq.${encodeURIComponent(body.id)}`,token,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({status:body.status,published:body.status==="open",updated_at:new Date().toISOString()})});
  if(!response.ok)return Response.json({error:"Deal status could not be updated."},{status:502});
  return Response.json({deal:(await response.json())[0]});
}
