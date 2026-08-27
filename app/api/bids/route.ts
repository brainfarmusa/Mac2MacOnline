import {env} from "cloudflare:workers";
import {supabaseReady,supabaseRequest} from "../../../lib/supabase";
import {sendBidNotifications} from "../../../lib/bid-email";

const MAX_FILE_SIZE=10*1024*1024;
const ALLOWED_TYPES=new Set(["application/pdf","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/csv","image/jpeg","image/png"]);
const clean=(value:FormDataEntryValue|null)=>typeof value==="string"?value.trim():"";
const safeName=(value:string)=>value.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100)||"attachment";

export async function POST(request:Request){
  if(!supabaseReady())return Response.json({error:"The live Deal Desk is being connected. Please try again after setup is complete."},{status:503});
  try{
    const form=await request.formData();
    const dealId=clean(form.get("deal_id"));
    const company=clean(form.get("company"));
    const contactName=clean(form.get("contact"));
    const email=clean(form.get("email"));
    const phone=clean(form.get("phone"));
    const notes=clean(form.get("notes"));
    const quantity=Number(clean(form.get("quantity")));
    const unitPrice=Number(clean(form.get("unit_price")));
    const attachment=form.get("attachment");
    if(!dealId||!company||!contactName||!email||!phone||!notes||!Number.isInteger(quantity)||quantity<1||!Number.isFinite(unitPrice)||unitPrice<0)return Response.json({error:"Please complete every required field with a valid quantity and price."},{status:400});
    if(!/^\S+@\S+\.\S+$/.test(email))return Response.json({error:"Please enter a valid email address."},{status:400});
    if(attachment instanceof File&&attachment.size){
      if(attachment.size>MAX_FILE_SIZE)return Response.json({error:"The supporting file must be 10 MB or smaller."},{status:400});
      if(!ALLOWED_TYPES.has(attachment.type))return Response.json({error:"Please attach a PDF, spreadsheet, CSV, JPG or PNG file."},{status:400});
    }
    const id=crypto.randomUUID();
    const bidNumber=`PDD-BID-${Date.now().toString(36).toUpperCase()}`;
    const attachmentPath=attachment instanceof File&&attachment.size?`${id}/${safeName(attachment.name)}`:null;
    const bid={id,bid_number:bidNumber,deal_id:dealId,company,contact_name:contactName,email,phone,quantity,unit_price:unitPrice,notes,attachment_path:attachmentPath,status:"submitted"};
    const inserted=await supabaseRequest("/rest/v1/pdd_bids",{method:"POST",headers:{"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify(bid)});
    if(!inserted.ok)return Response.json({error:"This offer could not be recorded. Please verify the deal is still open and try again."},{status:400});
    if(attachmentPath&&attachment instanceof File){
      const uploaded=await supabaseRequest(`/storage/v1/object/pdd-attachments/${attachmentPath.split("/").map(encodeURIComponent).join("/")}`,{method:"POST",headers:{"Content-Type":attachment.type,"x-upsert":"false"},body:attachment});
      if(!uploaded.ok)return Response.json({error:`Offer ${bidNumber} was recorded, but the attachment did not upload. Please contact Mac2MacOnline with this offer number.`},{status:502});
    }
    const runtime=env as unknown as Record<string,string|undefined>;
    const ownerKey=`DEAL_OWNER_EMAIL_${dealId.toUpperCase().replace(/[^A-Z0-9]/g,"_")}`;
    const notification=await sendBidNotifications({apiKey:runtime.RESEND_API_KEY,from:runtime.BID_EMAIL_FROM,adminEmail:runtime.BID_ADMIN_EMAIL,employeeEmail:runtime[ownerKey]||runtime.BID_EMPLOYEE_EMAIL,bidderEmail:email,bidderName:contactName,company,bidNumber,dealNumber:dealId,total:Math.round(quantity*unitPrice*100)/100,quantity,notes});
    return Response.json({ok:true,bid_number:bidNumber,emailNotification:notification.status},{status:201});
  }catch{return Response.json({error:"Your offer could not be submitted. Please try again."},{status:500})}
}
