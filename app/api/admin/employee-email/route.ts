import {env} from "cloudflare:workers";
import {employeeUser} from "../../../../lib/employee-server";

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char]||char);

export async function POST(request:Request){
  const employee=await employeeUser(request);
  if(!employee)return Response.json({error:"Employee access required."},{status:401});
  if(employee.role!=="administrator")return Response.json({error:"Administrator access required."},{status:403});
  const body=await request.json() as {email?:string;displayName?:string;kind?:string;actionLink?:string};
  const email=String(body.email||"").trim().toLowerCase(),displayName=String(body.displayName||"Employee").trim(),kind=body.kind==="recovery"?"recovery":"invite";
  let action:URL;try{action=new URL(String(body.actionLink||""))}catch{return Response.json({error:"The secure employee link is invalid."},{status:400})}
  if(action.hostname!=="www.mac2maconline.com"||action.pathname!=="/employee-login"||!action.searchParams.get("token_hash")||!/^\S+@\S+\.\S+$/.test(email))return Response.json({error:"The secure employee link is invalid."},{status:400});
  const runtime=env as unknown as Record<string,string|undefined>,apiKey=runtime.RESEND_API_KEY;
  if(!apiKey)return Response.json({error:"Employee email delivery is not configured."},{status:503});
  const recovery=kind==="recovery",subject=recovery?"Reset your Mac2MacOnline employee password":"Activate your Mac2MacOnline employee account",button=recovery?"Reset employee password":"Activate employee account";
  const html=`<h2>${subject}</h2><p>Hello ${escapeHtml(displayName)},</p><p>${recovery?"Use the secure button below to choose a new password for your employee account.":"Your Mac2MacOnline employee access has been approved. Use the secure button below to create your password."}</p><p><a href="${escapeHtml(action.toString())}" style="display:inline-block;padding:12px 18px;background:#176aa6;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">${button}</a></p><p>This link is for the Mac2MacOnline employee Deal Workbook. If you did not request it, you can ignore this email.</p>`;
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from:runtime.BID_EMAIL_FROM||"Mac2MacOnline Deal Desk <bids@mac2maconline.com>",to:[email],subject,html})});
  if(!response.ok)return Response.json({error:"The employee email could not be delivered."},{status:502});
  return Response.json({ok:true,kind});
}
