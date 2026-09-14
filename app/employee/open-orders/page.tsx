"use client";
import {useEffect,useMemo,useState,type FormEvent} from "react";
import {clearPddSession,currentPddSession,downloadPddDocument,pddAuthFetch,type PddSession} from "../../../lib/pdd-auth";

type Order={
  id:string;
  dbId:string;
  kind:"Purchase Order"|"Sales Order";
  number:string;
  deal:string;
  party:string;
  total:number;
  owner:string;
  createdAt:string;
  status:"open"|"awarded_pending_fulfillment"|"completed";
  completedAt:string|null;
  xlsx:string|null;
  pdf:string|null;
  commentKey:string;
};
type Comment={id:string;deal_id:string;deal_number:string;author_initials:string;author_name:string;comment:string;created_at:string;edited_at:string|null};

export default function OpenOrders(){
  const [session,setSession]=useState<PddSession|null>(null);
  const [orders,setOrders]=useState<Order[]>([]);
  const [view,setView]=useState<"open"|"completed">("open");
  const [message,setMessage]=useState("Loading purchase orders and sales orders…");
  const [completing,setCompleting]=useState("");
  const [downloading,setDownloading]=useState("");
  const [comments,setComments]=useState<Comment[]>([]);
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [posting,setPosting]=useState("");

  useEffect(()=>{void(async()=>{
    const active=await currentPddSession();
    if(!active){window.location.replace("/employee-login?return_to=/employee/open-orders");return}
    setSession(active);
    const headers={Authorization:`Bearer ${active.access_token}`};
    const [poResponse,soResponse,dealResponse]=await Promise.all([
      pddAuthFetch("/rest/v1/pdd_purchase_orders?select=id,po_number,deal_number,vendor_total,purchasing_owner_name,generated_by_name,created_at,order_status,completed_at,xlsx_storage_path,pdf_storage_path,vendor:pdd_vendors(company_name)&order=created_at.desc",{headers}),
      pddAuthFetch("/rest/v1/pdd_sales_orders?select=id,so_number,deal_number,customer_company,sales_total,sales_owner_name,generated_by_name,created_at,order_status,completed_at,xlsx_storage_path,pdf_storage_path&order=created_at.desc",{headers}),
      fetch("/api/admin/deals",{headers})
    ]);
    if(poResponse.status===401||soResponse.status===401||dealResponse.status===401){clearPddSession();window.location.replace("/employee-login?return_to=/employee/open-orders");return}
    if(!poResponse.ok||!soResponse.ok||!dealResponse.ok){setMessage("Orders and comments could not be loaded.");return}
    const dealData=await dealResponse.json() as {deals:Array<{id:string;deal_number:string}>;comments:Comment[]};
    const dealIds=new Map((dealData.deals||[]).map(deal=>[deal.deal_number,deal.id]));
    setComments(dealData.comments||[]);
    const purchases=await poResponse.json() as Array<{id:string;po_number:string;deal_number:string;vendor_total:number;purchasing_owner_name:string;generated_by_name:string;created_at:string;order_status:"open"|"awarded_pending_fulfillment"|"completed";completed_at:string|null;xlsx_storage_path:string|null;pdf_storage_path:string|null;vendor:{company_name:string}|null}>;
    const sales=await soResponse.json() as Array<{id:string;so_number:string;deal_number:string;customer_company:string;sales_total:number;sales_owner_name:string;generated_by_name:string;created_at:string;order_status:"open"|"awarded_pending_fulfillment"|"completed";completed_at:string|null;xlsx_storage_path:string|null;pdf_storage_path:string|null}>;
    const rows:Order[]=[
      ...purchases.map(order=>({id:`po-${order.id}`,dbId:order.id,kind:"Purchase Order" as const,number:order.po_number,deal:order.deal_number,party:order.vendor?.company_name||"Vendor",total:Number(order.vendor_total),owner:order.purchasing_owner_name||order.generated_by_name||"Unassigned",createdAt:order.created_at,status:order.order_status,completedAt:order.completed_at,xlsx:order.xlsx_storage_path,pdf:order.pdf_storage_path,commentKey:dealIds.get(order.deal_number)||`order-po-${order.id}`})),
      ...sales.map(order=>({id:`so-${order.id}`,dbId:order.id,kind:"Sales Order" as const,number:order.so_number,deal:order.deal_number,party:order.customer_company||"Customer",total:Number(order.sales_total),owner:order.sales_owner_name||order.generated_by_name||"Unassigned",createdAt:order.created_at,status:order.order_status,completedAt:order.completed_at,xlsx:order.xlsx_storage_path,pdf:order.pdf_storage_path,commentKey:dealIds.get(order.deal_number)||`order-so-${order.id}`}))
    ].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
    setOrders(rows);
    setMessage(rows.length?"":"There are no open purchase orders or sales orders.");
  })()},[]);

  const counts=useMemo(()=>({
    open:orders.filter(order=>order.status!=="completed").length,
    completed:orders.filter(order=>order.status==="completed").length,
    purchase:orders.filter(order=>order.status!=="completed"&&order.kind==="Purchase Order").length,
    sales:orders.filter(order=>order.status!=="completed"&&order.kind==="Sales Order").length
  }),[orders]);
  const visibleOrders=useMemo(()=>orders.filter(order=>view==="open"?order.status!=="completed":order.status==="completed"),[orders,view]);

  async function download(order:Order,extension:"xlsx"|"pdf"){
    if(!session)return;
    const path=extension==="xlsx"?order.xlsx:order.pdf;
    if(!path){setMessage(`${order.number} does not have a saved ${extension.toUpperCase()} file.`);return}
    const key=`${order.id}-${extension}`;
    setDownloading(key);setMessage(`Preparing ${order.number} ${extension.toUpperCase()}…`);
    try{await downloadPddDocument(path,session,`${order.number}-${order.party.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"")}.${extension}`);setMessage("")}
    catch(error){setMessage(error instanceof Error?error.message:"The document could not be downloaded.")}
    finally{setDownloading("")}
  }

  async function changeStatus(order:Order,nextStatus:"open"|"completed"){
    const reopening=nextStatus==="open";
    if(!session||!window.confirm(`${reopening?"Reopen":"Mark"} ${order.number}${reopening?"?":" as completed?"}`))return;
    setCompleting(order.id);
    setMessage(`${reopening?"Reopening":"Completing"} ${order.number}…`);
    const table=order.kind==="Purchase Order"?"pdd_purchase_orders":"pdd_sales_orders";
    try{
      const response=await pddAuthFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(order.dbId)}`,{
        method:"PATCH",
        headers:{Authorization:`Bearer ${session.access_token}`,Prefer:"return=representation"},
        body:JSON.stringify({order_status:nextStatus,completed_at:reopening?null:new Date().toISOString(),updated_at:new Date().toISOString()})
      });
      if(!response.ok)throw new Error("The order could not be completed.");
      const updated=await response.json() as Array<{id:string}>;
      if(!updated.length)throw new Error("The order status was not changed.");
      setOrders(current=>current.map(item=>item.id===order.id?{...item,status:nextStatus,completedAt:reopening?null:new Date().toISOString()}:item));
      setMessage(`${order.number} was ${reopening?"reopened":"marked completed"}.`);
    }catch(error){setMessage(error instanceof Error?error.message:`The order could not be ${reopening?"reopened":"completed"}.`)}
    finally{setCompleting("")}
  }

  async function addComment(event:FormEvent,order:Order){
    event.preventDefault();
    if(!session)return;
    const comment=(drafts[order.id]||"").trim();
    if(!comment)return;
    setPosting(order.id);
    const response=await fetch("/api/admin/deals",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({dealId:order.commentKey,dealNumber:order.deal,comment})});
    const data=await response.json();
    setPosting("");
    if(!response.ok){setMessage(data.error||"Comment could not be saved.");return}
    setComments(current=>[...current,{...data.comment,edited_at:null}]);
    setDrafts(current=>({...current,[order.id]:""}));
    setMessage(`Comment added to ${order.number}.`);
  }

  return <main className="openOrdersPage">
    <header><div><p className="eyebrow">DEAL WORKFLOW</p><h1>Open POs &amp; Sales Orders</h1><p>Review every active order and mark it completed when the transaction is finished.</p></div><a className="button secondary" href="/employee">← Dashboard</a></header>
    <section className="openOrderSummary"><article><strong>{counts.open}</strong><span>All open orders</span></article><article><strong>{counts.purchase}</strong><span>Open purchase orders</span></article><article><strong>{counts.sales}</strong><span>Open sales orders</span></article><article><strong>{counts.completed}</strong><span>Completed orders</span></article></section>
    <nav className="openOrderTabs" aria-label="Order status"><button className={view==="open"?"active":""} onClick={()=>setView("open")}>Open Orders ({counts.open})</button><button className={view==="completed"?"active":""} onClick={()=>setView("completed")}>Completed Orders ({counts.completed})</button></nav>
    {message&&<p className="openOrderMessage">{message}</p>}
    <section className="openOrderList">
      {visibleOrders.map(order=>{const thread=comments.filter(item=>item.deal_id===order.commentKey||(item.deal_number===order.deal&&!order.deal.startsWith("UPLOAD-")));return <article key={order.id}>
        <div className="openOrderIdentity"><span>{order.kind}{order.status==="awarded_pending_fulfillment"?" · AWARDED — PENDING FULFILLMENT":""}</span><h2>{order.number}</h2><p>Deal {order.deal} · {order.party}</p></div>
        <div><small>Total</small><strong>{order.total.toLocaleString(undefined,{style:"currency",currency:"USD"})}</strong></div>
        <div><small>Owner</small><strong>{order.owner}</strong><small>{new Date(order.createdAt).toLocaleDateString()}</small></div>
        <div className="openOrderActions"><button className="button secondary" type="button" disabled={!order.xlsx||Boolean(downloading)} onClick={()=>void download(order,"xlsx")}>{downloading===`${order.id}-xlsx`?"Downloading…":"Download Excel"}</button><button className="button secondary" type="button" disabled={!order.pdf||Boolean(downloading)} onClick={()=>void download(order,"pdf")}>{downloading===`${order.id}-pdf`?"Downloading…":"Download PDF"}</button><a className="button secondary" href={`/employee/orders?type=${order.kind==="Purchase Order"?"purchase":"sales"}`}>View Order</a><button className="button" type="button" disabled={Boolean(completing)} onClick={()=>void changeStatus(order,view==="open"?"completed":"open")}>{completing===order.id?(view==="open"?"Completing…":"Reopening…"):(view==="open"?"Mark Completed":"Reopen Order")}</button></div>
        <div className="openOrderComments"><div className="openOrderCommentThread">{thread.map(item=><div key={item.id}><b title={item.author_name}>{item.author_initials.toUpperCase()}</b><p>{item.comment}{item.edited_at&&<small>Edited</small>}</p><time>{new Date(item.created_at).toLocaleString()}</time></div>)}{!thread.length&&<span>No comments yet.</span>}</div><form onSubmit={event=>void addComment(event,order)}><textarea rows={1} maxLength={1000} value={drafts[order.id]||""} onChange={event=>setDrafts(current=>({...current,[order.id]:event.target.value}))} placeholder="Add a comment…"/><button type="submit" disabled={posting===order.id||!(drafts[order.id]||"").trim()}>{posting===order.id?"Adding…":"Comment"}</button></form></div>
      </article>})}
      {!visibleOrders.length&&!message.startsWith("Loading")&&<div className="openOrdersEmpty"><strong>{view==="open"?"All caught up":"No completed orders"}</strong><span>{view==="open"?"No open purchase orders or sales orders remain.":"Completed orders will appear here and can be reopened."}</span></div>}
    </section>
  </main>
}
