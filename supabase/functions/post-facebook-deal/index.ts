import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

const sitesOrigin="https://mac2maconline-current.brainfarm-us-9004.chatgpt.site";
const allowedOrigins=new Set(["https://mac2maconline.com","https://www.mac2maconline.com",sitesOrigin]);
function cors(origin:string|null){return {"Access-Control-Allow-Origin":origin&&allowedOrigins.has(origin)?origin:"https://mac2maconline.com","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS",Vary:"Origin"}}
function json(body:unknown,status:number,headers:Record<string,string>){return new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json"}})}

Deno.serve(async(req:Request)=>{
  const headers=cors(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response("ok",{headers});
  if(req.method!=="POST")return json({error:"Method not allowed."},405,headers);
  try{
    const authorization=req.headers.get("authorization")||"",token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
    if(!token)return json({error:"Administrator sign-in required."},401,headers);
    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:{user},error:userError}=await admin.auth.getUser(token);
    if(userError||!user?.email)return json({error:"Administrator sign-in required."},401,headers);
    const {data:caller,error:callerError}=await admin.from("pdd_employee_access").select("role,active").eq("email",user.email.toLowerCase()).maybeSingle();
    if(callerError)throw callerError;
    if(!caller?.active||caller.role!=="administrator")return json({error:"Administrator access required."},403,headers);

    const body=await req.json() as {dealNumber?:string;message?:string;link?:string;photoUrl?:string};
    const dealNumber=String(body.dealNumber||"").trim().toUpperCase(),message=String(body.message||"").trim(),link=String(body.link||"").trim(),photoUrl=String(body.photoUrl||"").trim();
    if(!dealNumber||!message||!link)return json({error:"Deal number, message and link are required."},400,headers);
    if(message.length>5000)return json({error:"Facebook post text must be 5,000 characters or fewer."},400,headers);
    if(!/^https:\/\/mac2maconline\.com\//i.test(link))return json({error:"Use a Mac2MacOnline deal link."},400,headers);
    if(photoUrl&&!/^https:\/\/(?:www\.)?mac2maconline\.com\//i.test(photoUrl))return json({error:"Use a Mac2MacOnline deal photo."},400,headers);

    const pageId=Deno.env.get("FACEBOOK_PAGE_ID")||"195647996966808",pageToken=Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN")||"";
    if(!pageToken)return json({error:"Facebook is not connected yet. Add the protected Page token first."},503,headers);
    const endpoint=photoUrl?`${pageId}/photos`:`${pageId}/feed`,payload=photoUrl?{url:photoUrl,caption:`${message}\n\n${link}`}:{message,link};
    const facebookResponse=await fetch(`https://graph.facebook.com/v26.0/${endpoint}`,{method:"POST",headers:{Authorization:`Bearer ${pageToken}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const facebook=await facebookResponse.json() as {id?:string;post_id?:string;error?:{message?:string}};
    if(!facebookResponse.ok)return json({error:facebook.error?.message||"Facebook rejected the post."},502,headers);
    return json({ok:true,postId:facebook.post_id||facebook.id||"",dealNumber},200,headers);
  }catch(error){console.error(error);return json({error:"The Facebook post could not be created."},500,headers)}
});
