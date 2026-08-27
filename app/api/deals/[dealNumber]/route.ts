import {supabaseReady,supabaseRequest} from "../../../../lib/supabase";

export async function GET(_:Request,{params}:{params:Promise<{dealNumber:string}>}){
  if(!supabaseReady())return Response.json({error:"Deal service is unavailable."},{status:503});
  const {dealNumber}=await params;
  try{
    const columns="id,deal_number,title,description,quantity,closes_at,location,public_lines,spreadsheet_filename";
    const response=await supabaseRequest(`/rest/v1/pdd_public_deals?select=${columns}&deal_number=eq.${encodeURIComponent(dealNumber.toUpperCase())}&published=eq.true&status=eq.open&limit=1`);
    if(!response.ok)return Response.json({error:"The deal could not be opened."},{status:502});
    const rows=await response.json() as unknown[];
    if(!rows[0])return Response.json({error:"This deal is not open."},{status:404});
    return Response.json({deal:rows[0]},{headers:{"Cache-Control":"public, max-age=30"}});
  }catch{return Response.json({error:"The deal could not be opened."},{status:500})}
}
