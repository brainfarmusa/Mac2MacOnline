import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const sitesOrigin="https://mac2maconline-current.brainfarm-us-9004.chatgpt.site";
const allowedOrigins=new Set(["https://mac2maconline.com","https://www.mac2maconline.com",sitesOrigin]);
const roles=new Set(["administrator","employee"]);
function cors(origin:string|null){return {"Access-Control-Allow-Origin":origin&&allowedOrigins.has(origin)?origin:"https://mac2maconline.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS",Vary:"Origin"}}
function json(body:unknown,status:number,headers:Record<string,string>){return new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json"}})}
function normalizeEmail(value:unknown){return String(value||"").trim().toLowerCase()}
async function prepareEmployeeEmail(admin:ReturnType<typeof createClient>,email:string,displayName:string){
  const redirectTo="https://mac2maconline.com/employee-login";
  let accountExists=false;
  for(let page=1;page<=10&&!accountExists;page++){
    const {data,error}=await admin.auth.admin.listUsers({page,perPage:100});
    if(error)throw error;
    accountExists=data.users.some(user=>user.email?.toLowerCase()===email);
    if(data.users.length<100)break;
  }
  if(accountExists){
    const {data,error}=await admin.auth.admin.generateLink({type:"recovery",email,options:{redirectTo}});
    if(error)throw error;
    return {email,displayName,kind:"recovery",actionLink:`https://www.mac2maconline.com/employee-login?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`};
  }else{
    const {data,error}=await admin.auth.admin.generateLink({type:"invite",email,options:{redirectTo,data:{display_name:displayName}}});
    if(error)throw error;
    return {email,displayName,kind:"invite",actionLink:`https://www.mac2maconline.com/employee-login?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=invite`};
  }
}

Deno.serve(async(req:Request)=>{
  const headers=cors(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  if(!["GET","POST"].includes(req.method))return json({error:"Method not allowed."},405,headers);
  try{
    const authorization=req.headers.get("authorization")||"",token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
    if(!token)return json({error:"Administrator sign-in required."},401,headers);
    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:{user},error:userError}=await admin.auth.getUser(token);
    if(userError||!user?.email)return json({error:"Administrator sign-in required."},401,headers);
    const callerEmail=user.email.toLowerCase();
    const {data:caller,error:callerError}=await admin.from("pdd_employee_access").select("email,role,active").eq("email",callerEmail).maybeSingle();
    if(callerError)throw callerError;
    if(!caller?.active||caller.role!=="administrator")return json({error:"Administrator access required."},403,headers);
    if(req.method==="POST"){
      let employeeEmail:null|{email:string;displayName:string;kind:string;actionLink:string}=null;
      const body=await req.json() as {action?:string,email?:string,displayName?:string,role?:string,active?:boolean};
      const email=normalizeEmail(body.email);
      if(!email||!email.includes("@"))return json({error:"Enter a valid email address."},400,headers);
      if(body.action==="add"){
        const displayName=String(body.displayName||"").trim(),role=String(body.role||"employee");
        if(!displayName)return json({error:"Enter the employee's full name."},400,headers);
        if(!roles.has(role))return json({error:"Choose a valid role."},400,headers);
        const {error}=await admin.from("pdd_employee_access").upsert({email,display_name:displayName,role,active:true,updated_at:new Date().toISOString()},{onConflict:"email"});if(error)throw error;
        employeeEmail=await prepareEmployeeEmail(admin,email,displayName);
      }else if(body.action==="send_activation"){
        const {data:employee,error}=await admin.from("pdd_employee_access").select("display_name,active").eq("email",email).maybeSingle();
        if(error)throw error;
        if(!employee?.active)return json({error:"This employee is not approved for active access."},400,headers);
        employeeEmail=await prepareEmployeeEmail(admin,email,employee.display_name||email.split("@")[0]);
      }else if(body.action==="update"){
        const changes:Record<string,unknown>={updated_at:new Date().toISOString()};
        if(body.role!==undefined){if(!roles.has(body.role))return json({error:"Choose a valid role."},400,headers);changes.role=body.role}
        if(body.active!==undefined)changes.active=Boolean(body.active);
        if(email===callerEmail&&(changes.role==="employee"||changes.active===false))return json({error:"You cannot remove your own administrator access."},400,headers);
        const {error}=await admin.from("pdd_employee_access").update(changes).eq("email",email);if(error)throw error;
      }else return json({error:"Choose a valid action."},400,headers);
      if(employeeEmail){
        const {error}=await admin.from("pdd_employee_access").update({invited_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("email",email);if(error)throw error;
        return json({employeeEmail},200,headers);
      }
    }
    const {data:access,error:accessError}=await admin.from("pdd_employee_access").select("display_name,email,role,active,created_at,invited_at").order("display_name");if(accessError)throw accessError;
    const authUsers:Record<string,{created_at:string|null,last_sign_in_at:string|null}>={};
    for(let page=1;page<=10;page++){const {data,error}=await admin.auth.admin.listUsers({page,perPage:100});if(error)throw error;for(const item of data.users)if(item.email)authUsers[item.email.toLowerCase()]={created_at:item.created_at||null,last_sign_in_at:item.last_sign_in_at||null};if(data.users.length<100)break}
    return json({employees:(access||[]).map(item=>({...item,account_created:Boolean(authUsers[item.email]),account_created_at:authUsers[item.email]?.created_at||null,last_sign_in_at:authUsers[item.email]?.last_sign_in_at||null})),currentEmail:callerEmail},200,headers);
  }catch(error){console.error(error);return json({error:"Employee access could not be loaded."},500,headers)}
});
