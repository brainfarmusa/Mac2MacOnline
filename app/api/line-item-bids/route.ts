import {env} from "cloudflare:workers";

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
    const customerNotes=clean(body.customerNotes,3000);
    const supportedDeals=new Set(["B082126-01","B081026-01"]);
    if(!supportedDeals.has(dealNumber)||!company||!contactName||!email||!phone||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Please complete the company and contact information."},{status:400});
    if(!Array.isArray(body.lineItems)||body.lineItems.length<1||body.lineItems.length>181)return Response.json({error:"Enter an offer on at least one line item."},{status:400});
    const lineItems:SubmittedLine[]=body.lineItems.map((raw,index)=>{const row=(raw&&typeof raw==="object"?raw:{}) as Record<string,unknown>;return {lineNumber:Number(row.lineNumber)||index+1,assetId:clean(row.assetId,60),brand:clean(row.brand,80),model:clean(row.model,120),modelNumber:clean(row.modelNumber,120),processor:clean(row.processor,240),ram:clean(row.ram,160),hardDrive:clean(row.hardDrive,160),condition:clean(row.condition,80),issues:clean(row.issues,300),quantity:Number(row.quantity),unitBid:Number(row.unitBid),comments:clean(row.comments,500)}});
    if(lineItems.some(line=>!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>10000||!Number.isFinite(line.unitBid)||line.unitBid<=0))return Response.json({error:"Each selected line must have a valid quantity and unit offer."},{status:400});
    const totalQuantity=lineItems.reduce((sum,line)=>sum+line.quantity,0);
    const totalBid=Math.round(lineItems.reduce((sum,line)=>sum+(line.quantity*line.unitBid),0)*100)/100;
    const now=new Date();
    const id=crypto.randomUUID();
    const stamp=now.toISOString().replace(/\D/g,"").slice(2,14);
    const internalBidNumber=`IB-${dealNumber}-${stamp}`;
    const db=env.DB;
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
    return Response.json({ok:true,internalBidNumber,lineCount:lineItems.length,totalQuantity,totalBid},{status:201});
  }catch{return Response.json({error:"The internal bid could not be generated. Please try again."},{status:500})}
}
