import {buildBidSpreadsheet} from "@/lib/bidSpreadsheet";
import {supabaseReady,supabaseRequest} from "@/lib/supabase";
import {dealSpreadsheetFilename} from "@/lib/dealFilename";

type PublicLine={quantity:number;values:Record<string,string>;award_mode?:"single"|"multiple"};
type Deal={deal_number:string;public_lines?:PublicLine[];spreadsheet_filename?:string;closes_at?:string;quantity?:number;title?:string;category?:string};

export async function GET(_request:Request,{params}:{params:Promise<{dealNumber:string}>}){
 if(!supabaseReady())return Response.json({error:"The deal service is unavailable."},{status:503});
 const {dealNumber}=await params,deal=decodeURIComponent(dealNumber).trim().toUpperCase();
 if(!/^(?:B|WTB)\d{6}-\d{2}$/i.test(deal))return Response.json({error:"A valid deal number is required."},{status:400});
 try{
  const response=await supabaseRequest(`/rest/v1/pdd_public_deals?select=deal_number,public_lines,spreadsheet_filename,closes_at,quantity,title,category&deal_number=eq.${encodeURIComponent(deal)}&status=in.(open,closing_soon)&limit=1`);
  if(!response.ok)return Response.json({error:"The deal spreadsheet could not be loaded."},{status:502});
  const record=(await response.json() as Deal[])[0],lines=record?.public_lines||[];
  if(!record||!lines.length)return Response.json({error:"This deal spreadsheet is not available."},{status:404});
  const headers=[...new Set(lines.flatMap(line=>Object.keys(line.values||{})))];
  const {bytes,filename}=buildBidSpreadsheet(record.deal_number,lines.length,[...headers.map(header=>({header,value:(index:number)=>lines[index]?.values?.[header]||""})),{header:"Qty",value:(index:number)=>lines[index]?.quantity||0}],dealSpreadsheetFilename(record),{awardMode:lines.some(line=>line.award_mode==="multiple")?"multiple":"single"});
  return new Response(bytes,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="${filename.replace(/["\\\r\n]/g,"-")}"`,"Cache-Control":"public, max-age=300"}});
 }catch{return Response.json({error:"The deal spreadsheet could not be created."},{status:500})}
}
