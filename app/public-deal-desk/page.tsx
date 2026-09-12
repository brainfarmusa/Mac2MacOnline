"use client";
import {useEffect,useMemo,useState} from "react";
import {Shell} from "@/components/SiteShell";
import {buildLotNotes} from "@/lib/bidSpreadsheet";
import {detectProductCategory} from "@/lib/productCategory";
import DealViewerPresence from "@/components/DealViewerPresence";
import "./pdd.css";

type PublicLine={line?:number;quantity:number;values:Record<string,string>;award_mode?:"single"|"multiple"};
type Deal={id:string;deal_number:string;direction:"buying"|"selling";category:string;title:string;description:string;quantity:number;manufacturer:string;part_number:string;closes_at:string;location:string;public_lines?:PublicLine[];spreadsheet_filename?:string};
function formatClose(value:string){return value?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}).format(new Date(value)):"Open for offers"}
function detailHref(deal:Deal){const path=`/public-deal-desk/${deal.deal_number.toLowerCase()}`;return deal.direction==="buying"?`${path}?sell=1`:path}
function lotNotes(deal:Deal){const lines=deal.public_lines||[];if(!lines.length)return deal.description||[deal.manufacturer,deal.part_number].filter(Boolean).join(" · ")||"—";const headers=[...new Set(lines.flatMap(line=>Object.keys(line.values)))];return buildLotNotes(lines.length,[...headers.map(header=>({header,value:(index:number)=>lines[index]?.values[header]||""})),{header:"Qty",value:(index:number)=>lines[index]?.quantity||0}])}
function spreadsheetHref(deal:Deal){return `/api/deals/${encodeURIComponent(deal.deal_number.toLowerCase())}/spreadsheet`}
function productCategory(deal:Deal){const saved=deal.category?.trim();if(saved)return saved;const text=`${deal.title} ${deal.description} ${(deal.public_lines||[]).flatMap(line=>Object.values(line.values)).join(" ")}`;return detectProductCategory(text,"Technology")}
function dealTitle(deal:Deal){const category=productCategory(deal);const saved=deal.title.replace(/\s+Lot$/i,"");const withoutQuantity=saved.replace(/^(?:qty\.?\s*[:#-]?\s*)?\d[\d,]*\s*(?:-|–|—|\s)\s*(?:pcs?|pieces?|units?)\b\s*(?:of\s+)?/i,"").replace(/^(?:pcs?|pieces?|units?)\s*[:#-]?\s*\d[\d,]*\b\s*/i,"");const verbose=/mixed it equipment/i.test(withoutQuantity)||/^We (?:are|'re) looking to buy\b/i.test(withoutQuantity)||withoutQuantity.length>72;if(verbose&&category!=="Technology")return category==="RAM"?"RAM Memory Modules":category==="SSD"?"Enterprise SSDs":category;return withoutQuantity}

function DealSection({title,subtitle,deals,emptyText,tone}:{title:string;subtitle:string;deals:Deal[];emptyText:string;tone:"wtb"|"wts"}){
 return <section className={`pddDealSection ${tone}`}>
  <header className="pddDealSectionHeader"><div><span>{tone.toUpperCase()}</span><h2>{title}</h2><p>{subtitle}</p></div><strong>{deals.length} active {deals.length===1?"deal":"deals"}</strong></header>
  {deals.length?<div className="pddDealTable"><div className="pddDealHead"><span>Type / category</span><span>Deal</span><span>Inventory</span><span>Qty</span><span>Closing</span><span>Lot notes</span><span>Actions</span></div>{deals.map(deal=><article key={deal.id}><div className="pddDealType"><b className={deal.direction}>{deal.direction==="selling"?"For Sale":"Want to Buy"}</b><span>{productCategory(deal)}</span></div><a className="pddDealNumber" href={detailHref(deal)}>{deal.deal_number}</a><div className="pddDealInventory"><h2>{dealTitle(deal)}</h2></div><strong className="pddDealQty">{deal.quantity.toLocaleString()}</strong><time>{formatClose(deal.closes_at)}</time><p className="pddLotNotes">{lotNotes(deal)}</p><div className="pddDealActions"><a href={detailHref(deal)}>{deal.direction==="buying"?"Respond to WTB →":"View / Bid →"}</a>{deal.direction==="selling"&&<a href={spreadsheetHref(deal)}>Download XLSX ↓</a>}</div></article>)}</div>:<div className="pddSectionEmpty"><p>{emptyText}</p></div>}
 </section>
}

export default function PublicDealDesk(){
 const [direction,setDirection]=useState("all");
 const [query,setQuery]=useState("");
 const [allDeals,setAllDeals]=useState<Deal[]>([]);
 const [live,setLive]=useState(false);
 const [updated,setUpdated]=useState("");
 useEffect(()=>{const requested=new URLSearchParams(window.location.search).get("direction");if(requested==="selling"||requested==="buying")setDirection(requested)},[]);
 useEffect(()=>{let active=true;fetch("/api/deals").then(r=>r.ok?r.json():Promise.reject()).then(data=>{if(active&&Array.isArray(data.deals)){setAllDeals(data.deals);setLive(true);setUpdated(new Date().toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"}))}}).catch(()=>{});return()=>{active=false}},[]);
 const deals=useMemo(()=>allDeals.filter(deal=>{const haystack=`${deal.deal_number} ${deal.category} ${deal.title} ${deal.description} ${deal.manufacturer} ${deal.part_number}`.toLowerCase();return(direction==="all"||deal.direction===direction)&&haystack.includes(query.toLowerCase())}),[allDeals,direction,query]);
 const wtbDeals=deals.filter(deal=>deal.direction==="buying");
 const wtsDeals=deals.filter(deal=>deal.direction==="selling");
 const categories=useMemo(()=>new Set(allDeals.map(productCategory).filter(Boolean)).size,[allDeals]);
 return <Shell><main className="pdd pddInventoryPage"><section className="pddBoard">
  <header className="pddBoardHeader"><img src="/assets/m2m-logo-transparent.png" alt="Mac2MacOnline"/><div className="pddBoardTitle"><span>Live Bid Board</span><h1>Live M2M Deals.</h1><p>Review current inventory, download the bid sheet or submit an offer online.</p></div><div className="pddBoardStats"><div><strong>{live?allDeals.length:"—"}</strong><span>Active deals</span></div><div><strong>{live?categories:"—"}</strong><span>Categories</span></div><div><strong className="pddLiveWord">LIVE</strong><span>M2M feed</span></div><DealViewerPresence dealNumber="PUBLIC-DEAL-DESK" scopeLabel="this page"/></div></header>
  <div className="pddBoardUpdated">◷ Updated {updated||"loading current M2M deals…"}</div>
  <div className="pddCompactControls"><div className="pddSegments"><button className={direction==="all"?"active":""} onClick={()=>setDirection("all")}>All deals</button><button className={direction==="selling"?"active":""} onClick={()=>setDirection("selling")}>For sale</button><button className={direction==="buying"?"active":""} onClick={()=>setDirection("buying")}>Want to buy</button></div><label><span>Search deals</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Deal, product, category or part number"/></label></div>
  <p className="pddBoardStatus">{live?`Showing ${deals.length} of ${allDeals.length} current M2M deals.`:"Loading current M2M deals…"}</p>
  {live&&<div className="pddDealSections">
   {direction!=="buying"&&<DealSection
    tone="wts"
    title="Want to Sell"
    subtitle="Inventory Mac2MacOnline currently has available for customer offers."
    deals={wtsDeals}
    emptyText={query?"No Want to Sell deals match your search.":"There are no active Want to Sell deals right now."}
   />}
   {direction!=="selling"&&<DealSection
    tone="wtb"
    title="Want to Buy"
    subtitle="Equipment Mac2MacOnline is actively looking to purchase."
    deals={wtbDeals}
    emptyText={query?"No Want to Buy deals match your search.":"There are no active Want to Buy deals right now."}
   />}
  </div>}
 </section></main></Shell>
}
