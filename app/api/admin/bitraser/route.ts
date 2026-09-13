import {env} from "cloudflare:workers";
import {employeeUser} from "../../../../lib/employee-server";

const noStore={"Cache-Control":"no-store"};
const clean=(value:unknown,max=160)=>String(value??"").trim().slice(0,max);
type BitRaserEnv=typeof env&{BITRASER_USERNAME?:string;BITRASER_PASSWORD?:string};
type BitRaserReport=Record<string,any>;

function credentials(){
 const username=clean((env as BitRaserEnv).BITRASER_USERNAME,320),password=clean((env as BitRaserEnv).BITRASER_PASSWORD,500);
 if(!username||!password)throw new Error("BitRaser credentials are not configured in Sites.");
 return{username,password};
}
function reportPath(value:string){
 if(!/^[A-Za-z0-9._:-]+$/.test(value))throw new Error("Enter a valid system serial number.");
 return `/api/reports/system_serial_no?system_serial_no=${encodeURIComponent(value)}`;
}
function safeReport(report:BitRaserReport){
 const info=report.reportInformation||{},summary=report.erasureSummary||{},hardware=report.hardwareInformation||{},tests=report.hardwareTest||{};
 return{
  result:clean(report.result),
  report:{id:clean(info.reportID),digitalId:clean(info.digitalID),reportDate:clean(info.reportDateAsProfile||info.reportDate),softwareVersion:clean(info.softwareVersion)},
  erasure:{totalDisks:clean(summary.totalDisk),successfulDisks:clean(summary.successfulDisk),failedDisks:clean(summary.failedDisk),method:clean(summary.erasureMethod),verification:clean(summary.verification),writePasses:clean(summary.writePasses)},
  device:{manufacturer:clean(hardware.manufacturer),model:clean(hardware.modelName),sku:clean(hardware.skuNumber,500),systemSerial:clean(hardware.systemSerial),chassisSerial:clean(hardware.chassisSerial),boardSerial:clean(hardware.boardSerial),uuid:clean(hardware.uuid),memory:clean(hardware.memory_RAM),autopilotStatus:clean(hardware.autopilotStatus)},
  hardwareTests:Object.entries(tests).filter(([,value])=>clean(value)).map(([name,status])=>({name:name.replace(/Status$/,"").replace(/([A-Z])/g," $1").trim(),status:clean(status)})),
  disks:(Array.isArray(report.erasureResults)?report.erasureResults:[]).map((row:any)=>({diskNumber:clean(row.diskNo),model:clean(row.erasedDiskInfo?.diskModel,300),serial:clean(row.erasedDiskInfo?.diskSerial),size:clean(row.erasedDiskInfo?.diskSize),mediaType:clean(row.erasedDiskInfo?.mediaType),smartStatus:clean(row.erasedDiskInfo?.smart_Status),badSectors:clean(row.badSectors),method:clean(row.erasureMethod),status:clean(row.status),started:clean(row.startTime),completed:clean(row.endTime),duration:clean(row.duration)})),
  processors:(Array.isArray(hardware.processorInfo)?hardware.processorInfo:[]).map((row:any)=>({manufacturer:clean(row.manufacturer),model:clean(row.version_ModelName,300),cores:clean(row.coreEnabled),speed:clean(row.currentClockSpeed)})),
  memoryModules:(Array.isArray(hardware.memoryInfo)?hardware.memoryInfo:[]).map((row:any)=>({manufacturer:clean(row.manufacturer),sizeBytes:clean(row.memorySize),speed:clean(row.memorySpeed),formFactor:clean(row.formFactor),serial:clean(row.serial)}))
 };
}

export async function GET(request:Request){
 const employee=await employeeUser(request);if(!employee)return Response.json({error:"Employee sign-in required."},{status:401,headers:noStore});
 const configured=Boolean(clean((env as BitRaserEnv).BITRASER_USERNAME)&&clean((env as BitRaserEnv).BITRASER_PASSWORD));
 return Response.json({configured},{headers:noStore});
}

export async function POST(request:Request){
 const employee=await employeeUser(request);if(!employee)return Response.json({error:"Employee sign-in required."},{status:401,headers:noStore});
 try{
  const body=await request.json().catch(()=>({})) as Record<string,unknown>,value=clean(body.value);
  if(!value)return Response.json({error:"Enter a system serial number."},{status:400,headers:noStore});
  const {username,password}=credentials(),response=await fetch(`https://api.bitrasercloud.com${reportPath(value)}`,{headers:{Authorization:`Basic ${btoa(`${username}:${password}`)}`,Accept:"application/json"},signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>null) as BitRaserReport|null;
  if(!response.ok)throw new Error(response.status===401||response.status===403?"BitRaser rejected the saved username or password.":"BitRaser could not complete the report request.");
  if(!data)throw new Error("BitRaser returned an unreadable response.");
  if(clean(data.result).toLowerCase()!=="success")throw new Error(clean(data.result)||"BitRaser did not find that report.");
  return Response.json({ok:true,report:safeReport(data)},{headers:noStore});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"The BitRaser connection could not be tested."},{status:400,headers:noStore})}
}
