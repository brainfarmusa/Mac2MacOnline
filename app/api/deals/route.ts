import {supabaseReady,supabaseRequest} from "../../../lib/supabase";
import {enhanceDealSummary} from "../../../lib/dealSummary";

export async function GET(){
  if(!supabaseReady())return Response.json({deals:[],mode:"review"});
  try{
    const columns="id,deal_number,direction,category,title,description,quantity,manufacturer,part_number,closes_at,location,public_lines,spreadsheet_filename";
    const response=await supabaseRequest(`/rest/v1/pdd_public_deals?select=${columns}&status=in.(open,working,pending)&order=closes_at.asc`);
    if(!response.ok)return Response.json({deals:[],mode:"review"});
    const deals=(await response.json() as Record<string,unknown>[]).map(enhanceDealSummary);
    return Response.json({deals,mode:"live"},{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({deals:[],mode:"review"})}
}
