import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const sitesOrigin="https://mac2maconline-current.brainfarm-us-9004.chatgpt.site";
const allowedOrigins=new Set(["https://mac2maconline.com","https://www.mac2maconline.com",sitesOrigin]);
function cors(origin:string|null){return {"Access-Control-Allow-Origin":origin&&allowedOrigins.has(origin)?origin:"https://mac2maconline.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS",Vary:"Origin"}}

Deno.serve(async(req:Request)=>{
  const headers={...cors(req.headers.get("origin")),"Content-Type":"application/json"};
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  if(req.method!=="POST")return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers});
  try{
    const {email,redirectTo}=await req.json();const normalizedEmail=String(email||"").trim().toLowerCase();
    if(!normalizedEmail)return new Response(JSON.stringify({error:"Email is required"}),{status:400,headers});
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:access,error:accessError}=await supabase.from("pdd_employee_access").select("email,active,invited_at").eq("email",normalizedEmail).eq("active",true).maybeSingle();
    if(accessError)throw accessError;
    if(!access)return new Response(JSON.stringify({ok:true}),{headers});
    if(access.invited_at&&Date.now()-new Date(access.invited_at).getTime()<15*60*1000)return new Response(JSON.stringify({ok:true}),{headers});
    const safeRedirect=typeof redirectTo==="string"&&[...allowedOrigins].some(origin=>redirectTo.startsWith(`${origin}/`))?redirectTo:`${sitesOrigin}/employee-login`;
    const {error:inviteError}=await supabase.auth.admin.inviteUserByEmail(normalizedEmail,{redirectTo:safeRedirect,data:{display_name:normalizedEmail.split("@")[0]}});
    if(inviteError&&/already|registered|exists/i.test(inviteError.message)){
      const {error:recoveryError}=await supabase.auth.resetPasswordForEmail(normalizedEmail,{redirectTo:safeRedirect});
      if(recoveryError)throw recoveryError;
    }else if(inviteError)throw inviteError;
    await supabase.from("pdd_employee_access").update({invited_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("email",normalizedEmail);
    return new Response(JSON.stringify({ok:true}),{headers});
  }catch(error){console.error(error);return new Response(JSON.stringify({error:"Unable to send the activation email right now."}),{status:500,headers})}
});
