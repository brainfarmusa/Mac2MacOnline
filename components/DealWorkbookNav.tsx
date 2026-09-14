"use client";

import {useEffect,useState} from "react";
import {currentPddEmployeeEmail,currentPddSession,pddAuthFetch} from "@/lib/pdd-auth";

export function DealWorkbookNav(){
  const [visible,setVisible]=useState(false);
  const [isAdmin,setIsAdmin]=useState(false);
  useEffect(()=>{void(async()=>{
    const path=window.location.pathname;
    if(!(path==="/employee"||path.startsWith("/employee/")||path==="/public-deal-desk/deal-builder"))return;
    const session=await currentPddSession();
    if(!session)return;
    const email=await currentPddEmployeeEmail(session);
    if(!email)return;
    const response=await pddAuthFetch(`/rest/v1/pdd_employee_access?select=role&email=eq.${encodeURIComponent(email)}&active=eq.true&limit=1`,{headers:{Authorization:`Bearer ${session.access_token}`}});
    if(response.ok){const profiles=await response.json() as {role:string}[];if(profiles.length){setVisible(true);setIsAdmin(profiles[0]?.role==="administrator")}}
  })()},[]);
  if(!visible)return null;
  return <nav className="dealWorkbookNav" aria-label="Dashboard">
    <a className="workbookHome" href="/employee">Dashboard</a>
    <a className="workbookHome" href="/employee/active-bids">Deal Dashboard</a>
    <details><summary>Deals</summary><div>
      <a href="/employee/box-awards">Box Awards</a>
      <a href="/employee/deals">Manage Deals &amp; Awards</a>
      <a href="/public-deal-desk/deal-builder?new=1&amp;award=single">Create New Deal</a>
      <a href="/public-deal-desk/deal-builder?new=1&amp;award=multiple">Create Multi-Tab/Lot Deal</a>
    </div></details>
    <details><summary>Sales</summary><div>
      <a href="/employee/customer-bid">Submit Customer Bid</a>
      <a href="/employee/sales-order">Create Sales Order</a>
      <a href="/employee/orders?type=sales">Sales Order History</a>
    </div></details>
    <details><summary>Purchasing</summary><div>
      <a href="/employee/reverse-offer">Create Purchase Order</a>
      <a href="/employee/purchase-order-upload">PO From Spreadsheet</a>
      <a href="/employee/orders?type=purchase">Purchase Order History</a>
      <a href="/employee/contacts?type=vendors">Vendor Directory</a>
    </div></details>
    <details><summary>Research</summary><div>
      <a href="/employee/spec-bid-analysis?purchase=broker">Spec Bid Analysis (Broker Purchase)</a>
      <a href="/employee/spec-bid-analysis?purchase=end-user">Spec Bid Analysis (End-User Purchase)</a>
      <a href="/employee/spec-bid-analysis?purchase=itad">Spec Bid Analysis (ITAD Purchase)</a>
    </div></details>
    <details><summary>Records &amp; Reports</summary><div>
      <a href="/employee/orders">All Orders</a>
      <a href="/employee/contacts">Vendors &amp; Customers</a>
      <a href="/employee/reports">Purchasing &amp; Sales Reports</a>
    </div></details>
    <a className="workbookHome" href="/employee/commissions">Commissions</a>
    <a className="workbookHome" href="/employee/imei-checker">IMEI Checker</a>
    {isAdmin&&<details><summary>Administration</summary><div><a href="/employee/access">Employee Access</a></div></details>}
  </nav>
}
