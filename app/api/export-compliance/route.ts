import {env} from "cloudflare:workers";
import {employeeUser} from "../../../lib/employee-server";
const clean=(value:unknown,max=4000)=>typeof value==="string"?value.trim().slice(0,max):"";
const allowedKeys=new Set(["dealReference","company","dba","website","registrationCountry","contactName","contactTitle","email","phone","purchaserLegalName","purchaserAddress","purchaserCountry","ultimateConsigneeName","ultimateConsigneeAddress","ultimateConsigneeCountry","endUserName","endUserAddress","endUserCountry","parentCompany","parentCountry","forwarderName","forwarderAddress","forwarderCountry","destinationCountry","routeCountries","items","manufacturerPartNumbers","quantity","eccn","endUse","installationAddress","industry","dataCenterOperator","dataCenterOwner","remoteAccessCountries","resaleDetails","licenseDetails","governmentUse","militaryUse","intelligenceUse","nuclearUse","missileUse","chemicalBiologicalUse","semiconductorUse","supercomputerUse","aiTrainingUse","restrictedParty","diversionRisk","samePurchaser","sameEndUser","resale","certifyAccurate","certifyEndUse","certifyNoTransfer","certifyScreening","signerName","signerTitle","signature","signedDate"]);
export async function GET(request:Request){
 const employee=await employeeUser(request);if(!employee)return Response.json({error:"Employee sign-in required."},{status:401});
 try{const result=await env.DB.prepare("SELECT id,reference,company,contact_name,email,destination_country,payload,status,created_at FROM export_compliance_submissions ORDER BY created_at DESC").all();return Response.json({submissions:result.results})}
 catch{return Response.json({error:"Export compliance submissions could not be loaded."},{status:500})}
}
export async function POST(request:Request){try{
 if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:"Request not allowed."},{status:403});
 const body=await request.json() as Record<string,unknown>;if(clean(body.websiteTrap))return Response.json({ok:true,reference:"received"});
 const company=clean(body.company,180),contactName=clean(body.contactName,140),email=clean(body.email,180).toLowerCase(),destinationCountry=clean(body.destinationCountry,120);
 if(!company||!contactName||!email||!destinationCountry||!clean(body.items)||!clean(body.endUse))return Response.json({error:"Complete all required company, product, destination and end-use fields."},{status:400});
 if(!body.certifyAccurate||!body.certifyEndUse||!body.certifyNoTransfer||!body.certifyScreening||!clean(body.signerName)||!clean(body.signerTitle)||!clean(body.signature))return Response.json({error:"All certifications and the electronic signature are required."},{status:400});
 const payload=Object.fromEntries(Object.entries(body).filter(([key])=>allowedKeys.has(key)).map(([key,value])=>[key,typeof value==="boolean"?value:clean(value)]));
 const id=crypto.randomUUID(),reference=`EC-${new Date().toISOString().slice(2,10).replaceAll("-","")}-${id.slice(0,6).toUpperCase()}`;
 await env.DB.prepare("INSERT INTO export_compliance_submissions (id,reference,company,contact_name,email,destination_country,payload,status,created_at) VALUES (?,?,?,?,?,?,?,'pending_review',?)").bind(id,reference,company,contactName,email,destinationCountry,JSON.stringify(payload),new Date().toISOString()).run();
 return Response.json({ok:true,reference});
 }catch{return Response.json({error:"Your certification could not be submitted. Please try again or contact sales@mac2maconline.com."},{status:500})}}
