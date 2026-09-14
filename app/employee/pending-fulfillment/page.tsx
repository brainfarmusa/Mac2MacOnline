"use client";

import {useEffect,useMemo,useState} from "react";
import {clearPddSession,currentPddSession,downloadPddDocument,pddAuthFetch,type PddSession} from "../../../lib/pdd-auth";

type PendingOrder={
  id:string;
  kind:"po"|"so";
  number:string;
  deal:string;
  party:string;
  contact:string;
  email:string;
  total:number;
  status:"awarded_pending_fulfillment"|"completed";
  qbInvoiceNumber:string;
  qbPoNumber:string;
  fulfillmentComments:string;
  pdf:string|null;
  xlsx:string|null;
};
type PendingDeal={deal:string;dealId:string;po:PendingOrder|null;so:PendingOrder|null};
type FulfillmentDetails={qbInvoiceNumber:string;qbPoNumber:string;comments:string};
type EmailReview={order:PendingOrder;to:string;subject:string;message:string};

export default function PendingFulfillment(){
  const [session,setSession]=useState<PddSession|null>(null);
  const [orders,setOrders]=useState<PendingOrder[]>([]);
  const [view,setView]=useState<"pending"|"fulfilled">("pending");
  const [dealIds,setDealIds]=useState<Record<string,string>>({});
  const [message,setMessage]=useState("Loading pending fulfillment deals…");
  const [downloading,setDownloading]=useState("");
  const [fulfilling,setFulfilling]=useState("");
  const [details,setDetails]=useState<Record<string,FulfillmentDetails>>({});
  const [saving,setSaving]=useState("");
  const [emailReview,setEmailReview]=useState<EmailReview|null>(null);
  const [emailBusy,setEmailBusy]=useState(false);

  useEffect(()=>{void(async()=>{
    setView(new URLSearchParams(window.location.search).get("view")==="fulfilled"?"fulfilled":"pending");
    const active=await currentPddSession();
    if(!active){window.location.replace("/employee-login?return_to=/employee/pending-fulfillment");return}
    setSession(active);
    const headers={Authorization:`Bearer ${active.access_token}`};
    const [poResponse,soResponse,dealResponse]=await Promise.all([
      pddAuthFetch("/rest/v1/pdd_purchase_orders?order_status=in.(awarded_pending_fulfillment,completed)&select=id,po_number,deal_number,vendor_total,order_status,qb_invoice_number,qb_po_number,fulfillment_comments,xlsx_storage_path,pdf_storage_path,vendor:pdd_vendors(company_name,contact_name,email)&order=created_at.desc",{headers}),
      pddAuthFetch("/rest/v1/pdd_sales_orders?order_status=in.(awarded_pending_fulfillment,completed)&select=id,so_number,deal_number,customer_company,customer_contact,customer_email,sales_total,order_status,qb_invoice_number,qb_po_number,fulfillment_comments,xlsx_storage_path,pdf_storage_path&order=created_at.desc",{headers}),
      fetch("/api/admin/deals",{headers})
    ]);
    if(poResponse.status===401||soResponse.status===401||dealResponse.status===401){clearPddSession();window.location.replace("/employee-login?return_to=/employee/pending-fulfillment");return}
    if(!poResponse.ok||!soResponse.ok||!dealResponse.ok){setMessage("Pending fulfillment deals could not be loaded.");return}
    const purchases=await poResponse.json() as Array<{id:string;po_number:string;deal_number:string;vendor_total:number;order_status:"awarded_pending_fulfillment"|"completed";qb_invoice_number:string;qb_po_number:string;fulfillment_comments:string;xlsx_storage_path:string|null;pdf_storage_path:string|null;vendor:{company_name:string;contact_name:string;email:string}|null}>;
    const sales=await soResponse.json() as Array<{id:string;so_number:string;deal_number:string;customer_company:string;customer_contact:string;customer_email:string;sales_total:number;order_status:"awarded_pending_fulfillment"|"completed";qb_invoice_number:string;qb_po_number:string;fulfillment_comments:string;xlsx_storage_path:string|null;pdf_storage_path:string|null}>;
    const dealData=await dealResponse.json() as {deals:Array<{id:string;deal_number:string}>};
    setDealIds(Object.fromEntries((dealData.deals||[]).map(deal=>[deal.deal_number,deal.id])));
    const rows:PendingOrder[]=[
      ...purchases.map(order=>({id:order.id,kind:"po" as const,number:order.po_number,deal:order.deal_number,party:order.vendor?.company_name||"Vendor",contact:order.vendor?.contact_name||"",email:order.vendor?.email||"",total:Number(order.vendor_total),status:order.order_status,qbInvoiceNumber:order.qb_invoice_number||"",qbPoNumber:order.qb_po_number||"",fulfillmentComments:order.fulfillment_comments||"",pdf:order.pdf_storage_path,xlsx:order.xlsx_storage_path})),
      ...sales.map(order=>({id:order.id,kind:"so" as const,number:order.so_number,deal:order.deal_number,party:order.customer_company||"Customer",contact:order.customer_contact||"",email:order.customer_email||"",total:Number(order.sales_total),status:order.order_status,qbInvoiceNumber:order.qb_invoice_number||"",qbPoNumber:order.qb_po_number||"",fulfillmentComments:order.fulfillment_comments||"",pdf:order.pdf_storage_path,xlsx:order.xlsx_storage_path}))
    ];
    setOrders(rows);
    const saved:Record<string,FulfillmentDetails>={};
    rows.forEach(order=>{if(!saved[order.deal]||order.kind==="po")saved[order.deal]={qbInvoiceNumber:order.qbInvoiceNumber,qbPoNumber:order.qbPoNumber,comments:order.fulfillmentComments}});
    setDetails(saved);
    setMessage(rows.length?"":"There are no deals pending fulfillment.");
  })()},[]);

  const deals=useMemo(()=>{
    const grouped=new Map<string,PendingDeal>();
    orders.filter(order=>view==="pending"?order.status==="awarded_pending_fulfillment":order.status==="completed").forEach(order=>{
      const current=grouped.get(order.deal)||{deal:order.deal,dealId:dealIds[order.deal]||"",po:null,so:null};
      current[order.kind]=order;
      current.dealId=dealIds[order.deal]||current.dealId;
      grouped.set(order.deal,current);
    });
    return [...grouped.values()].sort((a,b)=>b.deal.localeCompare(a.deal));
  },[orders,dealIds,view]);

  async function download(order:PendingOrder,extension:"pdf"|"xlsx"){
    if(!session)return;
    const path=extension==="pdf"?order.pdf:order.xlsx;
    if(!path){setMessage(`${order.number} does not have a saved ${extension==="pdf"?"PDF":"spreadsheet"}.`);return}
    const key=`${order.id}-${extension}`;
    setDownloading(key);
    try{await downloadPddDocument(path,session,`${order.number}-${order.party.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"")}.${extension}`);setMessage("")}
    catch(error){setMessage(error instanceof Error?error.message:"The document could not be downloaded.")}
    finally{setDownloading("")}
  }

  async function fulfill(item:PendingDeal){
    if(!session||!item.po||!item.so||!item.dealId)return;
    if(!window.confirm(`Mark ${item.deal} and both orders as fulfilled?`))return;
    setFulfilling(item.deal);setMessage(`Fulfilling ${item.deal}…`);
    const now=new Date().toISOString(),headers={Authorization:`Bearer ${session.access_token}`,Prefer:"return=representation"};
    try{
      const [poResponse,soResponse]=await Promise.all([
        pddAuthFetch(`/rest/v1/pdd_purchase_orders?id=eq.${encodeURIComponent(item.po.id)}`,{method:"PATCH",headers,body:JSON.stringify({order_status:"completed",completed_at:now,updated_at:now})}),
        pddAuthFetch(`/rest/v1/pdd_sales_orders?id=eq.${encodeURIComponent(item.so.id)}`,{method:"PATCH",headers,body:JSON.stringify({order_status:"completed",completed_at:now,updated_at:now})})
      ]);
      if(!poResponse.ok||!soResponse.ok)throw new Error("Both orders could not be marked fulfilled.");
      const dealResponse=await fetch("/api/admin/deals",{method:"PATCH",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({id:item.dealId,status:"completed"})});
      if(!dealResponse.ok)throw new Error("The orders were completed, but the deal status could not be updated.");
      setOrders(current=>current.map(order=>order.deal===item.deal?{...order,status:"completed"}:order));
      setMessage(`${item.deal} was fulfilled.`);
    }catch(error){setMessage(error instanceof Error?error.message:"The deal could not be fulfilled.")}
    finally{setFulfilling("")}
  }

  async function saveDetails(item:PendingDeal){
    if(!session||!item.po||!item.so)return;
    const values=details[item.deal]||{qbInvoiceNumber:"",qbPoNumber:"",comments:""};
    const update={qb_invoice_number:values.qbInvoiceNumber.trim(),qb_po_number:values.qbPoNumber.trim(),fulfillment_comments:values.comments.trim(),updated_at:new Date().toISOString()};
    setSaving(item.deal);setMessage(`Saving QuickBooks details for ${item.deal}…`);
    try{
      const headers={Authorization:`Bearer ${session.access_token}`,Prefer:"return=representation"};
      const [poResponse,soResponse]=await Promise.all([
        pddAuthFetch(`/rest/v1/pdd_purchase_orders?id=eq.${encodeURIComponent(item.po.id)}`,{method:"PATCH",headers,body:JSON.stringify(update)}),
        pddAuthFetch(`/rest/v1/pdd_sales_orders?id=eq.${encodeURIComponent(item.so.id)}`,{method:"PATCH",headers,body:JSON.stringify(update)})
      ]);
      if(!poResponse.ok||!soResponse.ok)throw new Error("The QuickBooks details could not be saved to both orders.");
      setOrders(current=>current.map(order=>order.deal===item.deal?{...order,qbInvoiceNumber:update.qb_invoice_number,qbPoNumber:update.qb_po_number,fulfillmentComments:update.fulfillment_comments}:order));
      setMessage(`QuickBooks details and comments were saved to both sides of ${item.deal}.`);
    }catch(error){setMessage(error instanceof Error?error.message:"The QuickBooks details could not be saved.")}
    finally{setSaving("")}
  }

  function reviewEmail(order:PendingOrder){
    const po=order.kind==="po",name=order.contact||order.party;
    setEmailReview({
      order,
      to:order.email,
      subject:po?`Purchase award for Deal ${order.deal} — ${order.number}`:`Deal ${order.deal} awarded — ${order.number}`,
      message:po
        ?`Hello ${name},\n\nMac2MacOnline confirms the purchase award for Deal ${order.deal}. Please review the attached purchase order ${order.number} and reply to confirm receipt.`
        :`Hello ${name},\n\nYour company has been awarded Deal ${order.deal}. The attached sales order ${order.number} confirms the award and order details. Please reply with any questions.`,
    });
  }

  async function sendEmail(){
    if(!session||!emailReview)return;
    setEmailBusy(true);setMessage("");
    try{
      const response=await fetch("/api/admin/finalization",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({action:emailReview.order.kind==="po"?"send_vendor":"send_customer",dealNumber:emailReview.order.deal,to:emailReview.to,subject:emailReview.subject,message:emailReview.message})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"The email could not be delivered.");
      const sent=emailReview.order;
      setEmailReview(null);
      setMessage(`${sent.number} email sent.`);
    }catch(error){setMessage(error instanceof Error?error.message:"The email could not be delivered.")}
    finally{setEmailBusy(false)}
  }

  return <main className="pendingFulfillmentPage">
    <header><div><p className="eyebrow">SALES</p><h1>{view==="pending"?"Pending Fulfillment":"Fulfilled Deals"}</h1><p>{view==="pending"?"Download both order documents and mark the deal fulfilled when the transaction is complete.":"Review fulfilled deals and download their purchase orders and sales orders."}</p></div><nav className="summaryReturnNav"><a className="button secondary" href="/employee/active-bids">← Back to Summary</a><a className="button secondary" href="/employee">Dashboard</a></nav></header>
    <nav className="openOrderTabs" aria-label="Fulfillment status"><a className={view==="pending"?"active":""} href="/employee/pending-fulfillment">Pending Fulfillment</a><a className={view==="fulfilled"?"active":""} href="/employee/pending-fulfillment?view=fulfilled">Fulfilled Deals</a></nav>
    {message&&<p className="openOrderMessage">{message}</p>}
    <section className="pendingDealList">
      {deals.map(item=><article key={item.deal}>
        <div className="pendingDealIdentity"><span>{view==="pending"?"AWARDED — PENDING FULFILLMENT":"FULFILLED"}</span><h2>{item.deal}</h2></div>
        <div className="pendingOrderPair">
          <div><small>PURCHASE ORDER</small><strong>{item.po?.number||"Not available"}</strong><span>{item.po?`${item.po.party} · ${item.po.total.toLocaleString(undefined,{style:"currency",currency:"USD"})}`:"The purchase order has not been generated."}</span><div className="pendingOrderDownloads"><button className="button secondary" type="button" disabled={!item.po?.pdf||Boolean(downloading)} onClick={()=>item.po&&void download(item.po,"pdf")}>{item.po&&downloading===`${item.po.id}-pdf`?"Downloading…":"PO PDF"}</button><button className="button secondary" type="button" disabled={!item.po?.xlsx||Boolean(downloading)} onClick={()=>item.po&&void download(item.po,"xlsx")}>{item.po&&downloading===`${item.po.id}-xlsx`?"Downloading…":"PO Spreadsheet"}</button><button className="button" type="button" disabled={!item.po?.pdf} onClick={()=>item.po&&reviewEmail(item.po)}>Send/Resend PO</button></div></div>
          <div><small>SALES ORDER</small><strong>{item.so?.number||"Not available"}</strong><span>{item.so?`${item.so.party} · ${item.so.total.toLocaleString(undefined,{style:"currency",currency:"USD"})}`:"The sales order has not been generated."}</span><div className="pendingOrderDownloads"><button className="button secondary" type="button" disabled={!item.so?.pdf||Boolean(downloading)} onClick={()=>item.so&&void download(item.so,"pdf")}>{item.so&&downloading===`${item.so.id}-pdf`?"Downloading…":"SO PDF"}</button><button className="button secondary" type="button" disabled={!item.so?.xlsx||Boolean(downloading)} onClick={()=>item.so&&void download(item.so,"xlsx")}>{item.so&&downloading===`${item.so.id}-xlsx`?"Downloading…":"SO Spreadsheet"}</button><button className="button" type="button" disabled={!item.so?.pdf} onClick={()=>item.so&&reviewEmail(item.so)}>Send/Resend SO</button></div></div>
        </div>
        <div className="pendingDealFields">
          <label className="pendingDealNumber">QB Invoice Number<input value={details[item.deal]?.qbInvoiceNumber||""} onChange={event=>setDetails(current=>({...current,[item.deal]:{...(current[item.deal]||{qbInvoiceNumber:"",qbPoNumber:"",comments:""}),qbInvoiceNumber:event.target.value}}))}/></label>
          <label className="pendingDealNumber">QB P/O Number<input value={details[item.deal]?.qbPoNumber||""} onChange={event=>setDetails(current=>({...current,[item.deal]:{...(current[item.deal]||{qbInvoiceNumber:"",qbPoNumber:"",comments:""}),qbPoNumber:event.target.value}}))}/></label>
          <label className="pendingDealComments">Comments<textarea rows={1} maxLength={2000} value={details[item.deal]?.comments||""} onChange={event=>setDetails(current=>({...current,[item.deal]:{...(current[item.deal]||{qbInvoiceNumber:"",qbPoNumber:"",comments:""}),comments:event.target.value}}))}/></label>
          <button className="button secondary" type="button" disabled={!item.po||!item.so||saving===item.deal} onClick={()=>void saveDetails(item)}>{saving===item.deal?"Saving…":"Save to PO & SO"}</button>
        </div>
        {view==="pending"?<button className="button fulfillDealButton" type="button" disabled={!item.po||!item.so||!item.dealId||Boolean(fulfilling)} onClick={()=>void fulfill(item)}>{fulfilling===item.deal?"Fulfilling Deal…":"Fulfill Deal"}</button>:<strong className="fulfilledDealStatus">✓ Fulfilled</strong>}
      </article>)}
      {!deals.length&&!message.startsWith("Loading")&&<div className="openOrdersEmpty"><strong>{view==="pending"?"No deals pending fulfillment":"No fulfilled deals"}</strong><span>{view==="pending"?"Finalized deals will appear here with their purchase order and sales order.":"Deals will appear here after you click Fulfill Deal."}</span></div>}
    </section>
    {emailReview&&<div className="pendingEmailBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!emailBusy)setEmailReview(null)}}><section className="pendingEmailDialog" role="dialog" aria-modal="true" aria-labelledby="pending-email-title"><header><div><p className="eyebrow">{emailReview.order.kind==="po"?"PURCHASE ORDER":"SALES ORDER"}</p><h2 id="pending-email-title">Review and send {emailReview.order.number}</h2></div><button type="button" onClick={()=>setEmailReview(null)} disabled={emailBusy} aria-label="Close email review">×</button></header><div className="pendingEmailFields"><label>To<input type="text" inputMode="email" value={emailReview.to} onChange={event=>setEmailReview(current=>current?{...current,to:event.target.value}:current)} placeholder="name@company.com, second@company.com"/></label><label>Subject<input value={emailReview.subject} onChange={event=>setEmailReview(current=>current?{...current,subject:event.target.value}:current)}/></label><label>Email message<textarea rows={9} value={emailReview.message} onChange={event=>setEmailReview(current=>current?{...current,message:event.target.value}:current)}/></label><p><b>Attachments:</b> {emailReview.order.number}.pdf{emailReview.order.xlsx?` and ${emailReview.order.number}.xlsx`:""}</p><div><button className="button secondary" type="button" onClick={()=>setEmailReview(null)} disabled={emailBusy}>Cancel</button><button className="button" type="button" onClick={()=>void sendEmail()} disabled={emailBusy||!emailReview.to.trim()||!emailReview.subject.trim()||!emailReview.message.trim()}>{emailBusy?"Sending…":`Send ${emailReview.order.kind.toUpperCase()} Email`}</button></div></div></section></div>}
  </main>;
}
