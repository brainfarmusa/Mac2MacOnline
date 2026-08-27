import {supabaseReady,supabaseRequest} from "../../../lib/supabase";

export async function GET(){
  if(!supabaseReady())return Response.json({deals:[],mode:"review"});
  try{
    const columns="id,deal_number,direction,category,title,description,quantity,manufacturer,part_number,closes_at,location";
    const response=await supabaseRequest(`/rest/v1/pdd_public_deals?select=${columns}&published=eq.true&status=eq.open&closes_at=gt.${encodeURIComponent(new Date().toISOString())}&order=closes_at.asc`);
    if(!response.ok)return Response.json({deals:[],mode:"review"});
    return Response.json({deals:await response.json(),mode:"live"},{headers:{"Cache-Control":"public, max-age=60"}});
  }catch{return Response.json({deals:[],mode:"review"})}
}
