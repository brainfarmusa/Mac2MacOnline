import {env} from "cloudflare:workers";
import {employeeUser} from "../../../../lib/employee-server";

const headers={"Cache-Control":"private, no-store"};
const clean=(value:unknown,max=500)=>String(value??"").trim().slice(0,max);
const dealStatuses=new Set(["in_process","ready_for_workbook","completed"]);
const locations=new Set(["inbound","in_house"]);
const itemStatuses=new Set(["testing","data_wipe","grading","complete"]);

export async function GET(request:Request){
 const employee=await employeeUser(request);if(!employee)return Response.json({error:"Employee access required."},{status:401,headers});
 const [deals,items]=await Promise.all([
  env.DB.prepare("SELECT id,po_number,customer,location_status,status,notes,created_by,created_at,updated_at FROM r2_processing_deals ORDER BY CASE status WHEN 'in_process' THEN 0 WHEN 'ready_for_workbook' THEN 1 ELSE 2 END,updated_at DESC").all(),
  env.DB.prepare("SELECT id,deal_id,serial_number,technician,model_sku,tech_data_json,bitraser_report_id,bitraser_data_json,status,created_at,updated_at FROM r2_processing_items ORDER BY updated_at DESC").all()
 ]);
 return Response.json({deals:deals.results||[],items:(items.results||[]).map((row:any)=>({...row,tech_data:JSON.parse(String(row.tech_data_json||"{}")),bitraser_data:JSON.parse(String(row.bitraser_data_json||"{}"))}))},{headers});
}

export async function POST(request:Request){
 const employee=await employeeUser(request);if(!employee)return Response.json({error:"Employee access required."},{status:401,headers});
 try{
  const body=await request.json().catch(()=>({})) as Record<string,any>,action=clean(body.action,40),now=new Date().toISOString();
  if(action==="create_deal"){
   const poNumber=clean(body.poNumber,80),customer=clean(body.customer,180),locationStatus=clean(body.locationStatus,30);
   if(!poNumber||!customer||!locations.has(locationStatus))return Response.json({error:"PO number, customer and location are required."},{status:400,headers});
   const id=crypto.randomUUID(),uploadName=clean(body.uploadName,220),notes=[clean(body.notes,1800),uploadName?`Original inventory: ${uploadName}`:""].filter(Boolean).join("\n"),rawItems=Array.isArray(body.items)?body.items.slice(0,5000):[],seen=new Set<string>(),items=rawItems.map((row:any)=>({serialNumber:clean(row?.serialNumber,160).toUpperCase(),modelSku:clean(row?.modelSku,500)})).filter(row=>row.serialNumber&&!seen.has(row.serialNumber)&&seen.add(row.serialNumber));
   await env.DB.prepare("INSERT INTO r2_processing_deals (id,po_number,customer,location_status,status,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,poNumber,customer,locationStatus,"in_process",notes,employee.email,now,now).run();
   for(let offset=0;offset<items.length;offset+=75)await env.DB.batch(items.slice(offset,offset+75).map(row=>env.DB.prepare("INSERT OR IGNORE INTO r2_processing_items (id,deal_id,serial_number,technician,model_sku,tech_data_json,bitraser_report_id,bitraser_data_json,status,created_at,updated_at) VALUES (?,?,?,?,?,'{}','','{}','testing',?,?)").bind(crypto.randomUUID(),id,row.serialNumber,employee.displayName,row.modelSku,now,now)));
   return Response.json({ok:true,id,itemCount:items.length},{headers});
  }
  if(action==="save_item"){
   const dealId=clean(body.dealId,80),serialNumber=clean(body.serialNumber,160).toUpperCase(),technician=clean(body.technician,160)||employee.displayName,status=clean(body.status,30),techData=body.techData&&typeof body.techData==="object"?body.techData:{};
   if(!dealId||!serialNumber||!itemStatuses.has(status))return Response.json({error:"Deal, serial number and item status are required."},{status:400,headers});
   const deal=await env.DB.prepare("SELECT id FROM r2_processing_deals WHERE id=?").bind(dealId).first();if(!deal)return Response.json({error:"R2 deal not found."},{status:404,headers});
   const id=clean(body.id,80)||crypto.randomUUID(),modelSku=clean(body.modelSku,500),reportId=clean(body.bitraserReportId,120),bitraserData=body.bitraserData&&typeof body.bitraserData==="object"?body.bitraserData:{};
   await env.DB.prepare("INSERT INTO r2_processing_items (id,deal_id,serial_number,technician,model_sku,tech_data_json,bitraser_report_id,bitraser_data_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET deal_id=excluded.deal_id,serial_number=excluded.serial_number,technician=excluded.technician,model_sku=excluded.model_sku,tech_data_json=excluded.tech_data_json,bitraser_report_id=excluded.bitraser_report_id,bitraser_data_json=excluded.bitraser_data_json,status=excluded.status,updated_at=excluded.updated_at").bind(id,dealId,serialNumber,technician,modelSku,JSON.stringify(techData),reportId,JSON.stringify(bitraserData),status,now,now).run();
   await env.DB.prepare("UPDATE r2_processing_deals SET updated_at=? WHERE id=?").bind(now,dealId).run();
   return Response.json({ok:true,id},{headers});
  }
  if(action==="update_deal"){
   const id=clean(body.id,80),status=clean(body.status,30),locationStatus=clean(body.locationStatus,30);
   if(!id||!dealStatuses.has(status)||!locations.has(locationStatus))return Response.json({error:"Choose valid deal and location statuses."},{status:400,headers});
   await env.DB.prepare("UPDATE r2_processing_deals SET status=?,location_status=?,notes=?,updated_at=? WHERE id=?").bind(status,locationStatus,clean(body.notes,2000),now,id).run();
   return Response.json({ok:true},{headers});
  }
  return Response.json({error:"Choose a valid R2 action."},{status:400,headers});
 }catch(error){const message=error instanceof Error&&/UNIQUE/i.test(error.message)?"That serial number is already in R2 processing.":error instanceof Error?error.message:"The R2 record could not be saved.";return Response.json({error:message},{status:400,headers})}
}
