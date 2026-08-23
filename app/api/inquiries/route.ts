const ENDPOINT="https://nmqlpthencvxhmkhvgzq.supabase.co/functions/v1/submit-inquiry";
const PUBLISHABLE_KEY="sb_publishable_IrHSWmkDcqgOkudqke4wCw_z5Zo2uKL";

export async function POST(request:Request){
  try{
    const form=await request.formData();
    const name=String(form.get("Name")||"").trim();
    const company=String(form.get("Company")||"").trim();
    const email=String(form.get("Email")||"").trim();
    if(!name||!company||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Please complete your name, company and a valid email address."},{status:400});
    const upstream=await fetch(ENDPOINT,{method:"POST",headers:{Authorization:`Bearer ${PUBLISHABLE_KEY}`,apikey:PUBLISHABLE_KEY,Origin:"https://www.brainfarmusa.ai",Referer:"https://www.brainfarmusa.ai"},body:form});
    const text=await upstream.text();
    let result:Record<string,unknown>={};
    try{result=JSON.parse(text) as Record<string,unknown>}catch{}
    if(!upstream.ok)return Response.json({error:typeof result.error==="string"?result.error:"The request could not be submitted."},{status:upstream.status>=400&&upstream.status<500?upstream.status:502});
    return Response.json({ok:true,reference:result.reference||"submitted"},{status:201});
  }catch{
    return Response.json({error:"We could not submit your request. Please try again."},{status:500});
  }
}
