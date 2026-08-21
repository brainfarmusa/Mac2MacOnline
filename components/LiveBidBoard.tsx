"use client";

import {useEffect,useMemo,useState} from "react";

const SHEET_ID="1HgPjnh9I4BvF1H8E63bMUnCPKbqHbggoRwKTGA0FNV8";
const SHEET_GID="2088576041";
const SHEET_URL=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}#gid=${SHEET_GID}`;

type Lot={category:string;bidId:string;details:string;notes:string;sheetRow:number};
type Cell={v?:unknown;f?:unknown}|null;

function cellText(cell:Cell){return String(cell?.f??cell?.v??"").trim()}
function lotParts(value:string){const lines=value.split(/\n+/).map(x=>x.trim()).filter(Boolean);return{title:lines[0]||"Current opportunity",due:lines.slice(1).join(" · ")}}

export default function LiveBidBoard(){
  const [lots,setLots]=useState<Lot[]>([]);
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState("");
  const [state,setState]=useState<"loading"|"ready"|"error">("loading");

  useEffect(()=>{
    const callback=(response:any)=>{
      try{
        if(!response||response.status==="error")throw new Error("Feed unavailable");
        const next:Lot[]=response.table.rows.map((row:any,index:number)=>{const cells:Cell[]=row.c||[];return{category:cellText(cells[0]),bidId:cellText(cells[1]),details:cellText(cells[2]),notes:cellText(cells[4]),sheetRow:index+10}}).filter((lot:Lot)=>lot.category&&lot.bidId&&lot.details);
        setLots(next);setState("ready");
      }catch{setState("error")}
    };
    const w=window as any;
    w.google=w.google||{};w.google.visualization=w.google.visualization||{};w.google.visualization.Query=w.google.visualization.Query||{};w.google.visualization.Query.setResponse=callback;
    const script=document.createElement("script");
    const query="select A,C,D,E,F where A is not null";
    script.src=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${SHEET_GID}&range=A9:F&headers=1&tqx=out:json&tq=${encodeURIComponent(query)}`;
    script.onerror=()=>setState("error");document.head.appendChild(script);
    return()=>{script.remove()};
  },[]);

  const categories=useMemo(()=>Array.from(new Set(lots.map(lot=>lot.category))).sort(),[lots]);
  const filtered=useMemo(()=>{const term=search.trim().toLowerCase();return lots.filter(lot=>(!category||lot.category===category)&&(!term||[lot.category,lot.bidId,lot.details,lot.notes].join(" ").toLowerCase().includes(term)))},[lots,search,category]);

  return <>
    <div className="bid-stats" aria-live="polite"><div><strong>{state==="ready"?lots.length:"—"}</strong><span>Active lots</span></div><div><strong>{state==="ready"?categories.length:"—"}</strong><span>Categories</span></div><div><strong>LIVE</strong><span>Google Sheets feed</span></div></div>
    <div className="bid-controls"><label><span>Search opportunities</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search part number, product, category or notes"/></label><label><span>Category</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{categories.map(name=><option key={name} value={name}>{name}</option>)}</select></label></div>
    <p className={`bid-status ${state}`}>{state==="loading"?"Loading current opportunities…":state==="error"?<>The live listings could not be loaded. <a href={SHEET_URL} target="_blank" rel="noreferrer">Open the full bid board.</a></>:filtered.length===lots.length?"Showing all current opportunities.":`Showing ${filtered.length} of ${lots.length} current opportunities.`}</p>
    {state==="ready"&&filtered.length>0?<div className="bid-grid">{filtered.map(lot=>{const parts=lotParts(lot.details);return <article className="bid-card" key={`${lot.bidId}-${lot.sheetRow}`}><div className="bid-meta"><span>{lot.category}</span><b>{lot.bidId}</b></div><h3>{parts.title}</h3>{parts.due&&<p className="bid-due">{parts.due}</p>}{lot.notes&&<p className="bid-notes">{lot.notes}</p>}<a href={`${SHEET_URL}&range=A${lot.sheetRow}`} target="_blank" rel="noreferrer">View lot on live board →</a></article>})}</div>:state==="ready"&&<div className="bid-empty"><h3>No matching opportunities</h3><p>Try a broader search or choose a different category.</p></div>}
  </>;
}
