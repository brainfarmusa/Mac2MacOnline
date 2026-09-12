import { env } from "cloudflare:workers";
import { employeeUser } from "../../../../lib/employee-server";

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char]||char);
const safeName=(value:string)=>value.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)||"offer";
function base64(buffer:ArrayBuffer){const bytes=new Uint8Array(buffer);let binary="";for(let index=0;index<bytes.length;index+=0x8000)binary+=String.fromCharCode(...bytes.subarray(index,index+0x8000));return btoa(binary)}

export async function POST(request:Request){
  const employee=await employeeUser(request);
  if(!employee)return Response.json({error:"Employee access required."},{status:401});
  const form=await request.formData(),to=String(form.get("to")||"").trim(),subject=String(form.get("subject")||"").trim(),message=String(form.get("message")||"").trim(),pdf=form.get("pdf"),excel=form.get("excel");
  const recipients=to.split(",").map(email=>email.trim().toLowerCase()).filter(Boolean);
  if(!recipients.length||!recipients.every(email=>/^\S+@\S+\.\S+$/.test(email))||!subject||!message)return Response.json({error:"Enter valid vendor email addresses separated by commas, a subject, and a message."},{status:400});
  if(!(pdf instanceof File)||!(excel instanceof File)||!pdf.size||!excel.size)return Response.json({error:"Generate both offer documents before sending the email."},{status:400});
  if(pdf.size+excel.size>20*1024*1024)return Response.json({error:"The offer attachments are too large to email. Download them and send them manually."},{status:400});
  const runtime=env as unknown as Record<string,string|undefined>;
  if(!runtime.RESEND_API_KEY)return Response.json({error:"Vendor offer email delivery is not configured."},{status:503});
  const html=`<p>${escapeHtml(message).replace(/\n/g,"<br>")}</p><p>Sent by ${escapeHtml(employee.displayName)} at Mac2MacOnline.</p>`;
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${runtime.RESEND_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({from:runtime.BID_EMAIL_FROM||"Mac2MacOnline Deal Desk <bids@mac2maconline.com>",to:recipients,subject,html,attachments:[{filename:safeName(pdf.name),content:base64(await pdf.arrayBuffer())},{filename:safeName(excel.name),content:base64(await excel.arrayBuffer())}]})});
  if(!response.ok)return Response.json({error:`The vendor offer email could not be delivered (${response.status}).`},{status:502});
  return Response.json({ok:true,to});
}
