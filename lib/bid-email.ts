type BidLine={lineNumber:number;brand?:string;model?:string;modelNumber?:string;quantity:number;unitBid:number};

type BidEmailInput={
  apiKey?:string;
  from?:string;
  adminEmail?:string;
  employeeEmail?:string;
  bidderEmail:string;
  bidderName:string;
  company:string;
  bidNumber:string;
  dealNumber:string;
  total:number;
  quantity:number;
  lines?:BidLine[];
  notes?:string;
};

export type BidEmailResult={status:"sent"|"not_configured"|"failed";error?:string};

const escapeHtml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char]||char);
const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);

async function send(apiKey:string,from:string,to:string[],subject:string,html:string){
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to,subject,html}),signal:AbortSignal.timeout(8000)});
  if(!response.ok){
    const detail=(await response.text()).slice(0,500);
    throw new Error(`Email service returned ${response.status}${detail?`: ${detail}`:""}`);
  }
}

export async function sendBidNotifications(input:BidEmailInput):Promise<BidEmailResult>{
  const apiKey=input.apiKey?.trim();
  if(!apiKey)return {status:"not_configured",error:"RESEND_API_KEY is not configured"};
  const from=input.from?.trim()||"Mac2MacOnline Deal Desk <bids@mac2maconline.com>";
  const admin=input.adminEmail?.trim()||"sales@mac2maconline.com";
  const staffRecipients=[admin,input.employeeEmail?.trim()].filter((value,index,array):value is string=>Boolean(value)&&array.indexOf(value)===index);
  const detailRows=(input.lines||[]).slice(0,200).map(line=>`<tr><td style="padding:6px;border-bottom:1px solid #dbe3ec">${line.lineNumber}</td><td style="padding:6px;border-bottom:1px solid #dbe3ec">${escapeHtml([line.brand,line.model,line.modelNumber].filter(Boolean).join(" "))}</td><td style="padding:6px;text-align:right;border-bottom:1px solid #dbe3ec">${line.quantity}</td><td style="padding:6px;text-align:right;border-bottom:1px solid #dbe3ec">${money(line.unitBid)}</td><td style="padding:6px;text-align:right;border-bottom:1px solid #dbe3ec">${money(line.quantity*line.unitBid)}</td></tr>`).join("");
  const summary=`<p><strong>Bid:</strong> ${escapeHtml(input.bidNumber)}<br><strong>Deal:</strong> ${escapeHtml(input.dealNumber)}<br><strong>Company:</strong> ${escapeHtml(input.company)}<br><strong>Contact:</strong> ${escapeHtml(input.bidderName)} (${escapeHtml(input.bidderEmail)})<br><strong>Total units:</strong> ${input.quantity}<br><strong>Grand total:</strong> ${money(input.total)}</p>`;
  const table=detailRows?`<table style="border-collapse:collapse;width:100%;max-width:900px"><thead><tr><th align="left">Line</th><th align="left">Item</th><th align="right">Qty</th><th align="right">Unit bid</th><th align="right">Line total</th></tr></thead><tbody>${detailRows}</tbody></table>`:"";
  try{
    await Promise.all([
      send(apiKey,from,[input.bidderEmail],`We received your bid ${input.bidNumber}`,`<h2>Thank you—your bid was received.</h2>${summary}<p>Mac2MacOnline will contact you if additional information is needed.</p>`),
      send(apiKey,from,staffRecipients,`New Deal Desk bid ${input.bidNumber} — ${input.company}`,`<h2>New bid submitted</h2>${summary}${table}${input.notes?`<p><strong>Notes:</strong><br>${escapeHtml(input.notes).replace(/\n/g,"<br>")}</p>`:""}`)
    ]);
    return {status:"sent"};
  }catch(error){return {status:"failed",error:error instanceof Error?error.message:"Unknown email delivery error"}}
}
