import {env} from "cloudflare:workers";
import {employeeUser} from "../../../../lib/employee-server";

const noStore={"Cache-Control":"private, no-store"};
const SERVICE_ID="39";
const SERVICE_NAME="Apple Full Info [+Carrier] A-updated";
type ImeiEnv=typeof env&{IMEICHECK_API_KEY?:string};
const clean=(value:unknown,max=500)=>String(value??"").trim().slice(0,max);

async function ensureTable(){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS imei_check_results (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL DEFAULT '',
  identifier TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_name TEXT NOT NULL,
  response_json TEXT NOT NULL,
  response_status TEXT NOT NULL,
  checked_by TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  UNIQUE(identifier,service_id,deal_id)
 )`).run();
 await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_imei_check_deal ON imei_check_results(deal_id,checked_at)").run();
}
function safeIdentifier(value:unknown){
 const identifier=clean(value,80).replace(/[\s-]+/g,"").toUpperCase();
 if(!/^[A-Z0-9]{8,24}$/.test(identifier))throw new Error(`“${clean(value,40)}” is not a valid IMEI or serial number.`);
 return identifier;
}
function normalizeResponse(value:unknown){
 if(value&&typeof value==="object")return value as Record<string,unknown>;
 return {message:clean(value,10000)};
}
function responseStatus(value:Record<string,unknown>){
 const raw=clean(value.status||value.result||value.success,80).toLowerCase();
 if(raw==="true"||/success|complete|clean/.test(raw))return "success";
 if(/fail|error|invalid|insufficient|wrong/.test(raw))return "failed";
 return raw||"received";
}
const plain=(value:unknown)=>clean(value,2000).replace(/<br\s*\/?\s*>/gi,"\n").replace(/<[^>]*>/g,"").replace(/&amp;/gi,"&").replace(/&nbsp;/gi," ").trim();
const keyName=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
function objectValues(value:Record<string,unknown>){const object=Object.entries(value).find(([key,item])=>keyName(key)==="object"&&item&&typeof item==="object")?.[1];return object&&typeof object==="object"?object as Record<string,unknown>:{} }
function valueFor(source:Record<string,unknown>,...names:string[]){const wanted=new Set(names.map(keyName)),entry=Object.entries(source).find(([key])=>wanted.has(keyName(key)));return entry?plain(entry[1]):""}
function resultLines(value:Record<string,unknown>){const result=Object.entries(value).find(([key])=>keyName(key)==="result")?.[1],lines=plain(result).split(/\n+/).map(line=>line.trim()).filter(Boolean),mapped:Record<string,string>={};for(const line of lines){const index=line.indexOf(":");if(index>0)mapped[keyName(line.slice(0,index))]=line.slice(index+1).trim()}return mapped}
function deviceFields(value:Record<string,unknown>){const object=objectValues(value),lines=resultLines(value),pick=(names:string[])=>names.map(keyName).map(name=>lines[name]).find(Boolean)||valueFor(object,...names)||"";return{model:pick(["Model","Model Description"]),serialNumber:pick(["Serial","Serial Number"])||valueFor(value,"Imei","IMEI"),activationStatus:pick(["Activated","Activation Status"]),warrantyStatus:pick(["Warranty Status","WarrantyStatus"]),estimatedPurchaseDate:pick(["Estimated Purchase Date","EstPurchasedDate","EstPurchaseDate"]),coverageEndDate:pick(["Coverage End Date","CoverageEndDate"]),technicalSupport:pick(["Telephone Technical Support","Technical Support","TechnicalSupport"]),repairsServiceCoverage:pick(["Repairs and Service Coverage","RepairsServiceCoverage"]),appleCareEligible:pick(["AppleCare Eligible","AppleCareEligible"]),replacedByApple:pick(["Replaced by Apple","ReplacedByApple"]),findMyStatus:pick(["Find My Mac","Find My iPhone","FMI","FindMyMac"]),mdmLockStatus:pick(["MDM Lock Status","MDM Status","MDM","Remote Management Status"])||"Not Known",lockedCarrier:pick(["Locked Carrier","Carrier","LockedCarrier"]),simLockStatus:pick(["SIM-Lock Status","SimLock Status","SimLockStatus"]),orderId:valueFor(value,"OrderId","Order ID"),price:valueFor(value,"Price"),duration:valueFor(value,"Duration")}}
function jsonObject(value:unknown){try{const parsed=JSON.parse(String(value||"{}"));return parsed&&typeof parsed==="object"?parsed as Record<string,unknown>:{} }catch{return{}}}
function positiveStatus(value:unknown){const status=clean(value,100).toLowerCase();if(!status||/not known|unknown|unlocked|disabled|inactive|clean|\boff\b|\bno\b|false/.test(status))return false;return /locked|enabled|active|\bon\b|\byes\b|true|lost/.test(status)}
function underWarranty(device:ReturnType<typeof deviceFields>){const status=clean(device.warrantyStatus,150).toLowerCase();if(/expired|out of warranty|no coverage|not covered|inactive/.test(status))return false;if(/covered|coverage active|limited warranty|applecare|in warranty|active/.test(status))return true;const date=Date.parse(device.coverageEndDate);return Number.isFinite(date)&&date>=Date.now()}
async function r2Row(dealId:string,identifier:string){return env.DB.prepare("SELECT id,model_sku,tech_data_json FROM r2_processing_items WHERE deal_id=? AND upper(replace(replace(serial_number,' ',''),'-',''))=? LIMIT 1").bind(dealId,identifier).first<any>()}
async function syncR2Item(dealId:string,identifier:string,device:ReturnType<typeof deviceFields>,raw:Record<string,unknown>,checkedAt:string){if(!dealId)return false;const row=await r2Row(dealId,identifier);if(!row)return false;const current=jsonObject(row.tech_data_json);delete current.imeiCheckFailure;const fields={imeiModel:device.model,activationStatus:device.activationStatus,warrantyStatus:device.warrantyStatus,estimatedPurchaseDate:device.estimatedPurchaseDate,coverageEndDate:device.coverageEndDate,technicalSupport:device.technicalSupport,repairsServiceCoverage:device.repairsServiceCoverage,appleCareEligible:device.appleCareEligible,replacedByApple:device.replacedByApple,findMyStatus:device.findMyStatus,mdmLockStatus:device.mdmLockStatus,lockedCarrier:device.lockedCarrier,simLockStatus:device.simLockStatus,imeiCheckService:SERVICE_NAME,imeiCheckPrice:device.price,imeiCheckOrderId:device.orderId,imeiCheckedAt:checkedAt},techData={...current,...Object.fromEntries(Object.entries(fields).filter(([,entry])=>entry)),imeiCheck:{...device,serviceId:SERVICE_ID,serviceName:SERVICE_NAME,checkedAt,raw}};await env.DB.prepare("UPDATE r2_processing_items SET model_sku=CASE WHEN trim(model_sku)='' THEN ? ELSE model_sku END,tech_data_json=?,updated_at=? WHERE id=?").bind(device.model,JSON.stringify(techData),checkedAt,row.id).run();return true}
async function syncR2Failure(dealId:string,identifier:string,reason:string,checkedAt:string){if(!dealId)return false;const row=await r2Row(dealId,identifier);if(!row)return false;const current=jsonObject(row.tech_data_json),techData={...current,imeiCheckFailure:{identifier,serviceId:SERVICE_ID,serviceName:SERVICE_NAME,reason,checkedAt}};await env.DB.prepare("UPDATE r2_processing_items SET tech_data_json=?,updated_at=? WHERE id=?").bind(JSON.stringify(techData),checkedAt,row.id).run();return true}

export async function GET(request:Request){
 const employee=await employeeUser(request);
 if(!employee)return Response.json({error:"Employee sign-in required."},{status:401,headers:noStore});
 await ensureTable();
 const url=new URL(request.url),dealId=clean(url.searchParams.get("deal"),80);
 const query=dealId
  ? env.DB.prepare("SELECT id,deal_id,identifier,service_id,service_name,response_json,response_status,checked_by,checked_at FROM imei_check_results WHERE deal_id=? ORDER BY checked_at DESC LIMIT 1000").bind(dealId)
  : env.DB.prepare("SELECT id,deal_id,identifier,service_id,service_name,response_json,response_status,checked_by,checked_at FROM imei_check_results ORDER BY checked_at DESC LIMIT 250");
 const rows=await query.all(),results=(rows.results||[]).map((row:any)=>{const response=normalizeResponse(jsonObject(row.response_json));return{...row,response,device:deviceFields(response)}});
 let stats=null;
 if(dealId){
  const itemRows=await env.DB.prepare("SELECT serial_number,tech_data_json FROM r2_processing_items WHERE deal_id=? AND trim(serial_number)<>''").bind(dealId).all(),items=new Map<string,Record<string,unknown>>();
  for(const row of itemRows.results||[]){const serial=clean(row.serial_number,80).replace(/[\s-]+/g,"").toUpperCase();if(serial&&!items.has(serial))items.set(serial,jsonObject(row.tech_data_json))}
  const successes=new Map<string,ReturnType<typeof deviceFields>>();for(const result of results){const serial=clean(result.identifier,80).replace(/[\s-]+/g,"").toUpperCase();if(items.has(serial)&&!successes.has(serial))successes.set(serial,result.device)}
  const reasons=new Map<string,number>();let recordedFailures=0;for(const [serial,tech] of items){if(successes.has(serial))continue;const failure=tech.imeiCheckFailure&&typeof tech.imeiCheckFailure==="object"?tech.imeiCheckFailure as Record<string,unknown>:null,reason=clean(failure?.reason,500);if(reason){recordedFailures++;reasons.set(reason,(reasons.get(reason)||0)+1)}}
  const notCompleted=Math.max(0,items.size-successes.size),unknown=Math.max(0,notCompleted-recordedFailures);if(unknown)reasons.set("No saved result from the earlier interrupted run",unknown);
  stats={total:items.size,accomplished:successes.size,notCompleted,findMyLocked:[...successes.values()].filter(device=>positiveStatus(device.findMyStatus)).length,mdmLocked:[...successes.values()].filter(device=>positiveStatus(device.mdmLockStatus)).length,underWarranty:[...successes.values()].filter(underWarranty).length,reasons:[...reasons].map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count)};
 }
 return Response.json({configured:Boolean(clean((env as ImeiEnv).IMEICHECK_API_KEY,500)),service:{id:SERVICE_ID,name:SERVICE_NAME,displayPrice:0.12},results,stats},{headers:noStore});
}

export async function POST(request:Request){
 const employee=await employeeUser(request);
 if(!employee)return Response.json({error:"Employee sign-in required."},{status:401,headers:noStore});
 try{
  const key=clean((env as ImeiEnv).IMEICHECK_API_KEY,500);
  if(!key)throw new Error("The IMEICheck API key is not configured in Sites.");
  const body=await request.json().catch(()=>({})) as Record<string,unknown>,dealId=clean(body.dealId,80),requested=Array.isArray(body.identifiers)?body.identifiers:[body.identifier],identifiers=[...new Set(requested.filter(Boolean).map(safeIdentifier))].slice(0,1000);
  if(!dealId)throw new Error("Select the associated R2 deal before running checks.");
  if(!identifiers.length)throw new Error("Enter at least one IMEI or serial number.");
  await ensureTable();
  const now=new Date().toISOString(),results=[] as Record<string,unknown>[],failures=[] as Record<string,string>[];
  for(const identifier of identifiers){
   const cached=await env.DB.prepare("SELECT id,deal_id,identifier,service_id,service_name,response_json,response_status,checked_by,checked_at FROM imei_check_results WHERE identifier=? AND service_id=? ORDER BY checked_at DESC LIMIT 1").bind(identifier,SERVICE_ID).first<any>();
   if(cached){
    if(dealId!==cached.deal_id){
     const linkedId=crypto.randomUUID();
     await env.DB.prepare("INSERT OR IGNORE INTO imei_check_results (id,deal_id,identifier,service_id,service_name,response_json,response_status,checked_by,checked_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(linkedId,dealId,identifier,SERVICE_ID,SERVICE_NAME,cached.response_json,cached.response_status,employee.email,now).run();
     const savedResponse=normalizeResponse(JSON.parse(String(cached.response_json||"{}"))),device=deviceFields(savedResponse),syncedToR2=await syncR2Item(dealId,identifier,device,savedResponse,now);
     results.push({...cached,id:linkedId,deal_id:dealId,checked_by:employee.email,checked_at:now,response:savedResponse,device,syncedToR2,cached:true});
    }else{const savedResponse=normalizeResponse(JSON.parse(String(cached.response_json||"{}"))),device=deviceFields(savedResponse),syncedToR2=await syncR2Item(dealId,identifier,device,savedResponse,now);results.push({...cached,response:savedResponse,device,syncedToR2,cached:true})}
    continue;
   }
   const endpoint=new URL("https://alpha.imeicheck.com/api/php-api/create");
   endpoint.searchParams.set("key",key);endpoint.searchParams.set("service",SERVICE_ID);endpoint.searchParams.set("imei",identifier);
   let response:Response,text:string;
   try{response=await fetch(endpoint,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(20000)});text=await response.text()}
   catch(error){const reason=error instanceof Error?error.message:"IMEICheck did not respond.";await syncR2Failure(dealId,identifier,reason,now);failures.push({identifier,error:reason});continue}
   let parsed:unknown;try{parsed=JSON.parse(text)}catch{parsed=text}
   const data=normalizeResponse(parsed),status=responseStatus(data);
   if(!response.ok||status==="failed"){
    const reason=clean(data.message||data.error||data.result,500)||"IMEICheck rejected the serial number.";await syncR2Failure(dealId,identifier,reason,now);failures.push({identifier,error:reason});
    continue;
   }
   const id=crypto.randomUUID();
   await env.DB.prepare("INSERT INTO imei_check_results (id,deal_id,identifier,service_id,service_name,response_json,response_status,checked_by,checked_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,dealId,identifier,SERVICE_ID,SERVICE_NAME,JSON.stringify(data),status,employee.email,now).run();
   const device=deviceFields(data),syncedToR2=await syncR2Item(dealId,identifier,device,data,now);
   results.push({id,deal_id:dealId,identifier,service_id:SERVICE_ID,service_name:SERVICE_NAME,response:data,device,response_status:status,checked_by:employee.email,checked_at:now,syncedToR2,cached:false});
  }
  return Response.json({ok:true,results,failures,processed:identifiers.length},{headers:noStore});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"IMEICheck could not process the request."},{status:400,headers:noStore})}
}
