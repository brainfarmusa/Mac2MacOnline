import {env} from "cloudflare:workers";
import {sendBidNotifications} from "../../../lib/bid-email";
import {supabaseReady,supabaseRequest} from "../../../lib/supabase";
import {customerUser} from "../../../lib/customer-server";
import {employeeUser} from "../../../lib/employee-server";

type SubmittedLine={lineNumber:number;assetId:string;brand:string;model:string;modelNumber:string;processor:string;ram:string;hardDrive:string;condition:string;issues:string;quantity:number;unitBid:number;comments:string};
const clean=(value:unknown,max=500)=>typeof value==="string"?value.trim().slice(0,max):"";

export async function POST(request:Request){
  try{
    const body=await request.json() as Record<string,unknown>;
    const dealNumber=clean(body.dealNumber,40);
    const company=clean(body.company,160);
    const contactName=clean(body.contactName,160);
    const email=clean(body.email,200);
    const phone=clean(body.phone,80);
    const address1=clean(body.address1,200);const address2=clean(body.address2,200);const city=clean(body.city,120);const region=clean(body.region,120);const postalCode=clean(body.postalCode,40);const country=clean(body.country,100);
    const customerNotes=clean(body.customerNotes,3000);
    const submittedOnBehalf=body.submittedOnBehalf===true;
    const enteredBy=submittedOnBehalf?await employeeUser(request):null;
    if(submittedOnBehalf&&!enteredBy)return Response.json({error:"Employee access is required to submit a bid for a customer."},{status:401});
    let liveDeal=false;
    if(!liveDeal&&supabaseReady()){const dealResponse=await supabaseRequest(`/rest/v1/pdd_public_deals?select=deal_number&deal_number=eq.${encodeURIComponent(dealNumber)}&published=eq.true&status=eq.open&closes_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`);liveDeal=dealResponse.ok&&((await dealResponse.json()) as unknown[]).length>0}
    if(!liveDeal||!company||!contactName||!email||!phone||!address1||!city||!region||!postalCode||!country||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Please complete the bidder contact and address information."},{status:400});
    if(!Array.isArray(body.lineItems)||body.lineItems.length<1||body.lineItems.length>1000)return Response.json({error:"Enter an offer on at least one line item."},{status:400});
    const lineItems:SubmittedLine[]=body.lineItems.map((raw,index)=>{const row=(raw&&typeof raw==="object"?raw:{}) as Record<string,unknown>;return {lineNumber:Number(row.lineNumber)||index+1,assetId:clean(row.assetId,60),brand:clean(row.brand,80),model:clean(row.model,120),modelNumber:clean(row.modelNumber,120),processor:clean(row.processor,240),ram:clean(row.ram,160),hardDrive:clean(row.hardDrive,160),condition:clean(row.condition,80),issues:clean(row.issues,300),quantity:Number(row.quantity),unitBid:Number(row.unitBid),comments:clean(row.comments,500)}});
    if(lineItems.some(line=>!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>10000||!Number.isFinite(line.unitBid)||line.unitBid<=0))return Response.json({error:"Each selected line must have a valid quantity and unit offer."},{status:400});
    const totalQuantity=lineItems.reduce((sum,line)=>sum+line.quantity,0);
    const totalBid=Math.round(lineItems.reduce((sum,line)=>sum+(line.quantity*line.unitBid),0)*100)/100;
    const now=new Date();
    const id=crypto.randomUUID();
    const stamp=now.toISOString().replace(/\D/g,"").slice(2,14);
    const internalBidNumber=`IB-${dealNumber}-${stamp}`;
    const db=env.DB;
    let user:{id:string;email:string}|null=null;if(!submittedOnBehalf)try{user=await customerUser(request)}catch{/* Authentication lookup must never block a valid bid. */}
    const customerUserId=submittedOnBehalf?clean(body.customerUserId,100)||null:user?.id||null;
    await db.prepare(`CREATE TABLE IF NOT EXISTS internal_bids (
      id TEXT PRIMARY KEY,
      internal_bid_number TEXT NOT NULL UNIQUE,
      deal_number TEXT NOT NULL,
      company TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      customer_notes TEXT NOT NULL DEFAULT '',
      line_items_json TEXT NOT NULL,
      line_count INTEGER NOT NULL,
      total_quantity INTEGER NOT NULL,
      total_bid REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      submitted_at TEXT NOT NULL
    )`).run();
    await db.prepare("INSERT INTO internal_bids (id,internal_bid_number,deal_number,company,contact_name,email,phone,customer_notes,line_items_json,line_count,total_quantity,total_bid,status,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,internalBidNumber,dealNumber,company,contactName,email,phone,customerNotes,JSON.stringify(lineItems),lineItems.length,totalQuantity,totalBid,"submitted",now.toISOString()).run();
    try{await db.prepare(`CREATE TABLE IF NOT EXISTS internal_bid_customers (bid_id TEXT PRIMARY KEY,customer_user_id TEXT,address1 TEXT NOT NULL DEFAULT '',address2 TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',region TEXT NOT NULL DEFAULT '',postal_code TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT '')`).run();await db.prepare("INSERT INTO internal_bid_customers (bid_id,customer_user_id,address1,address2,city,region,postal_code,country) VALUES (?,?,?,?,?,?,?,?)").bind(id,customerUserId,address1,address2,city,region,postalCode,country).run()}catch{/* Account linkage must never block a valid bid. */}
    if(enteredBy)try{await db.prepare(`CREATE TABLE IF NOT EXISTS internal_bid_agents (bid_id TEXT PRIMARY KEY,employee_user_id TEXT NOT NULL,employee_name TEXT NOT NULL,employee_email TEXT NOT NULL,customer_key TEXT NOT NULL DEFAULT '',uploaded_file_name TEXT NOT NULL DEFAULT '',entered_at TEXT NOT NULL)`).run();await db.prepare("INSERT INTO internal_bid_agents (bid_id,employee_user_id,employee_name,employee_email,customer_key,uploaded_file_name,entered_at) VALUES (?,?,?,?,?,?,?)").bind(id,enteredBy.id,enteredBy.displayName,enteredBy.email,clean(body.customerKey,200),clean(body.uploadedFileName,240),now.toISOString()).run()}catch{/* Employee attribution must never block a valid customer bid. */}
    const runtime=env as unknown as Record<string,string|undefined>;
    const ownerKey=`DEAL_OWNER_EMAIL_${dealNumber.replace(/[^A-Z0-9]/g,"_")}`;
    const notification=await sendBidNotifications({apiKey:runtime.RESEND_API_KEY,from:runtime.BID_EMAIL_FROM,adminEmail:runtime.BID_ADMIN_EMAIL,employeeEmail:runtime[ownerKey]||runtime.BID_EMPLOYEE_EMAIL,bidderEmail:email,bidderName:contactName,company,bidNumber:internalBidNumber,dealNumber,total:totalBid,quantity:totalQuantity,lines:lineItems,notes:customerNotes});
    try{
      await db.prepare(`CREATE TABLE IF NOT EXISTS bid_notification_log (
        id TEXT PRIMARY KEY,
        bid_number TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`).run();
      await db.prepare("INSERT INTO bid_notification_log (id,bid_number,channel,status,error,created_at) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),internalBidNumber,"email",notification.status,notification.error||"",new Date().toISOString()).run();
    }catch{/* The bid remains valid even if delivery-status logging is unavailable. */}
    return Response.json({ok:true,internalBidNumber,lineCount:lineItems.length,totalQuantity,totalBid,emailNotification:notification.status},{status:201});
  }catch{return Response.json({error:"The internal bid could not be generated. Please try again."},{status:500})}
}
