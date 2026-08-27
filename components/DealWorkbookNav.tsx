"use client";

import {useEffect,useState} from "react";
import {currentPddSession,pddAuthFetch} from "@/lib/pdd-auth";

export function DealWorkbookNav(){
  const [visible,setVisible]=useState(false);
  const [isAdmin,setIsAdmin]=useState(false);
  useEffect(()=>{void(async()=>{
    const path=window.location.pathname;
    if(!(path==="/employee"||path.startsWith("/employee/")||path==="/public-deal-desk/deal-builder"))return;
    setVisible(true);
    const session=await currentPddSession();
    if(!session)return;
    const response=await pddAuthFetch("/rest/v1/pdd_employee_access?select=role&limit=1",{headers:{Authorization:`Bearer ${session.access_token}`}});
    if(response.ok){const profiles=await response.json() as {role:string}[];setIsAdmin(profiles[0]?.role==="administrator")}
  })()},[]);
  if(!visible)return null;
  return <nav className="dealWorkbookNav" aria-label="Deal Workbook">
    <a className="workbookHome" href="/employee">Deal Workbook</a>
    <details><summary>Deals</summary><div>
      <a href="/public-deal-desk/deal-builder?new=1">Upload New Deal</a>
      <a href="/public-deal-desk/deal-builder">Continue Last Deal</a>
      <a href="/employee/deals">Manage Deals &amp; Awards</a>
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
    <details><summary>Records &amp; Reports</summary><div>
      <a href="/employee/orders">All Orders</a>
      <a href="/employee/contacts">Vendors &amp; Customers</a>
      <a href="/employee/reports">Purchasing &amp; Sales Reports</a>
    </div></details>
    <a className="workbookHome" href="/employee/commissions">Commissions</a>
    {isAdmin&&<details><summary>Administration</summary><div><a href="/employee/access">Employee Access</a></div></details>}
  </nav>
}
