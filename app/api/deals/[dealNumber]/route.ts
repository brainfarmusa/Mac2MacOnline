import {supabaseReady,supabaseRequest} from "../../../../lib/supabase";
import {enhanceDealSummary} from "../../../../lib/dealSummary";

export async function GET(_:Request,{params}:{params:Promise<{dealNumber:string}>}){
  const {dealNumber}=await params;
  if(process.env.NODE_ENV!=="production"&&dealNumber.toUpperCase()==="WTBPREVIEW")return Response.json({deal:enhanceDealSummary({
    deal_number:"WTB083026-01",direction:"buying",category:"RAM / SSD / GPU",title:"1,020-Piece High-Demand Memory, Storage & GPUs",description:"Buying tested enterprise RAM, SSDs and professional GPUs.",quantity:1020,manufacturer:"Samsung / Micron / NVIDIA",part_number:"3 wanted product lines",closes_at:"2026-09-03T20:00:00.000Z",location:"California, USA",spreadsheet_filename:"WTB083026-01-Wanted-Equipment.xlsx",public_lines:[
      {line:1,quantity:500,values:{Product:"Samsung DDR4 32GB RDIMM","Part Number":"M393A4K40DB3-CWE","Specifications / Condition":"Tested pulls, Grade A/B"}},
      {line:2,quantity:500,values:{Product:"Enterprise NVMe SSD","Part Number":"3.84TB U.2 / U.3","Specifications / Condition":"Health report required"}},
      {line:3,quantity:20,values:{Product:"NVIDIA RTX 6000 Ada","Part Number":"900-5G133-2250-000","Specifications / Condition":"New or used"}}
    ]
  })});
  if(!supabaseReady())return Response.json({error:"Deal service is unavailable."},{status:503});
  try{
    const columns="id,deal_number,direction,category,title,description,quantity,manufacturer,part_number,closes_at,location,public_lines,spreadsheet_filename";
    const response=await supabaseRequest(`/rest/v1/pdd_public_deals?select=${columns}&deal_number=eq.${encodeURIComponent(dealNumber.toUpperCase())}&status=in.(open,closing_soon)&limit=1`);
    if(!response.ok)return Response.json({error:"The deal could not be opened."},{status:502});
    const rows=await response.json() as unknown[];
    if(!rows[0])return Response.json({error:"This deal is not accepting bids."},{status:404});
    return Response.json({deal:enhanceDealSummary(rows[0] as Record<string,unknown>)},{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"The deal could not be opened."},{status:500})}
}
