"use client";

import {useEffect,useMemo,useState} from "react";
import {clearPddSession,currentPddSession,pddAuthFetch} from "../../../lib/pdd-auth";

type PurchaseLine={line_number:number;product_sku:string;product_description:string;quantity:number;line_total:number;order:{deal_number:string;created_at:string}};
type SalesLine={line_number:number;product_sku:string;product_description:string;quantity:number;line_total:number;order:{deal_number:string;created_at:string}};
type ProductRow={key:string;sku:string;description:string;purchased:number;purchaseValue:number;sold:number;salesValue:number;costOfSales:number;profit:number};
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
const day=(value:string)=>value.slice(0,10);
const productKey=(sku:string,description:string)=>(sku||description).trim().toLowerCase();
const searchText=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"");

export default function ProductAnalysisPage(){
  const [purchases,setPurchases]=useState<PurchaseLine[]>([]);
  const [sales,setSales]=useState<SalesLine[]>([]);
  const [query,setQuery]=useState("");
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");

  useEffect(()=>{void(async()=>{
    const session=await currentPddSession();
    if(!session){window.location.replace("/employee-login?return_to=/employee/product-analysis");return}
    const headers={Authorization:`Bearer ${session.access_token}`};
    const [purchaseResponse,salesResponse]=await Promise.all([
      pddAuthFetch("/rest/v1/pdd_purchase_order_lines?select=line_number,product_sku,product_description,quantity,line_total,order:pdd_purchase_orders!inner(deal_number,created_at)&order=created_at.desc",{headers}),
      pddAuthFetch("/rest/v1/pdd_sales_order_lines?select=line_number,product_sku,product_description,quantity,line_total,order:pdd_sales_orders!inner(deal_number,created_at)&order=created_at.desc",{headers}),
    ]);
    if(purchaseResponse.status===401||salesResponse.status===401){clearPddSession();window.location.replace("/employee-login");return}
    if(!purchaseResponse.ok||!salesResponse.ok){setMessage("Product analysis could not be loaded.");setLoading(false);return}
    setPurchases(await purchaseResponse.json() as PurchaseLine[]);
    setSales(await salesResponse.json() as SalesLine[]);
    setLoading(false);
  })()},[]);

  const rows=useMemo(()=>{
    const inRange=(date:string)=>(!from||day(date)>=from)&&(!to||day(date)<=to);
    const purchaseCostByDealLine=new Map(purchases.map(line=>[`${line.order.deal_number}:${line.line_number}`,Number(line.line_total)||0]));
    const products=new Map<string,ProductRow>();
    for(const line of purchases){
      if(!inRange(line.order.created_at))continue;
      const cost=Number(line.line_total)||0;
      const key=productKey(line.product_sku,line.product_description);
      if(!key)continue;
      const row=products.get(key)||{key,sku:line.product_sku||"",description:line.product_description||"",purchased:0,purchaseValue:0,sold:0,salesValue:0,costOfSales:0,profit:0};
      row.purchased+=Number(line.quantity)||0;row.purchaseValue+=cost;products.set(key,row);
    }
    for(const line of sales){
      if(!inRange(line.order.created_at))continue;
      const key=productKey(line.product_sku,line.product_description);
      if(!key)continue;
      const revenue=Number(line.line_total)||0;
      const cost=purchaseCostByDealLine.get(`${line.order.deal_number}:${line.line_number}`)||0;
      const row=products.get(key)||{key,sku:line.product_sku||"",description:line.product_description||"",purchased:0,purchaseValue:0,sold:0,salesValue:0,costOfSales:0,profit:0};
      row.sold+=Number(line.quantity)||0;row.salesValue+=revenue;row.costOfSales+=cost;row.profit+=revenue-cost;products.set(key,row);
    }
    const searchTerms=query.trim().split(/\s+/).map(searchText).filter(Boolean);
    return [...products.values()].filter(row=>{
      const productSearchText=searchText(`${row.sku} ${row.description}`);
      return searchTerms.every(term=>productSearchText.includes(term));
    }).sort((a,b)=>b.salesValue-a.salesValue||b.purchaseValue-a.purchaseValue);
  },[purchases,sales,query,from,to]);

  const totals=useMemo(()=>rows.reduce((sum,row)=>({purchased:sum.purchased+row.purchased,purchaseValue:sum.purchaseValue+row.purchaseValue,sold:sum.sold+row.sold,salesValue:sum.salesValue+row.salesValue,costOfSales:sum.costOfSales+row.costOfSales,profit:sum.profit+row.profit}),{purchased:0,purchaseValue:0,sold:0,salesValue:0,costOfSales:0,profit:0}),[rows]);
  const margin=totals.salesValue?totals.profit/totals.salesValue*100:0;

  if(loading)return <main className="reportsPage"><p>Loading product analysis…</p></main>;
  return <main className="reportsPage">
    <header><div><p className="eyebrow">REPORTS</p><h1>Product Analysis</h1><p>Search product history and compare purchases, sales, profit and margin.</p></div><a href="/employee">← Deal Workbook</a></header>
    <section className="reportFilters productAnalysisFilters">
      <label>Product, model, part number or SKU<input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Enter a product or part number"/></label>
      <label>From<input type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label>
      <label>To<input type="date" value={to} onChange={event=>setTo(event.target.value)}/></label>
      <button className="button secondary" type="button" onClick={()=>{setQuery("");setFrom("");setTo("")}}>Clear</button>
    </section>
    <div className="reportGenerateActions"><button className="button secondary" type="button" onClick={()=>window.print()}>Print Report</button></div>
    {message?<p className="reportMessage">{message}</p>:<>
      <section className="reportTotals">
        <article><span>Purchased</span><strong>{totals.purchased.toLocaleString()}</strong><small>{money.format(totals.purchaseValue)}</small></article>
        <article><span>Sold</span><strong>{totals.sold.toLocaleString()}</strong><small>{money.format(totals.salesValue)}</small></article>
        <article><span>Cost of sales</span><strong>{money.format(totals.costOfSales)}</strong><small>Matched PO cost</small></article>
        <article><span>Profit</span><strong>{money.format(totals.profit)}</strong><small>{margin.toFixed(2)}% margin</small></article>
      </section>
      <section className="reportPanel"><header><div><h2>Product results</h2><p>{query?`Matching “${query}”`:"All products"}</p></div><span>{rows.length} products</span></header>
        <div className="reportTable"><table><thead><tr><th>SKU / Part number</th><th>Description</th><th>Purchased</th><th>PO unit price</th><th>Purchase total</th><th>Sold</th><th>SO unit price</th><th>Sales total</th><th>Cost of sales</th><th>Profit</th><th>Margin</th></tr></thead><tbody>
          {rows.map(row=><tr key={row.key}><td><b>{row.sku||"—"}</b></td><td>{row.description||"—"}</td><td>{row.purchased.toLocaleString()}</td><td>{row.purchased?money.format(row.purchaseValue/row.purchased):"—"}</td><td>{money.format(row.purchaseValue)}</td><td>{row.sold.toLocaleString()}</td><td>{row.sold?money.format(row.salesValue/row.sold):"—"}</td><td>{money.format(row.salesValue)}</td><td>{money.format(row.costOfSales)}</td><td>{money.format(row.profit)}</td><td>{row.salesValue?(row.profit/row.salesValue*100).toFixed(2):"0.00"}%</td></tr>)}
          {!rows.length&&<tr><td colSpan={11}>No products match this search and date range.</td></tr>}
        </tbody></table></div>
      </section>
    </>}
  </main>;
}
