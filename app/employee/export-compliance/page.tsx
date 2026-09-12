"use client";
import {useEffect,useState} from "react";
import {clearPddSession,currentPddSession} from "../../../lib/pdd-auth";
import "../applications/applications.css";

type Submission={id:string;reference:string;company:string;contact_name:string;email:string;destination_country:string;payload:string;status:string;created_at:string};
const label=(key:string)=>key.replace(/([A-Z])/g," $1").replace(/^./,x=>x.toUpperCase());
const parse=(value:string)=>{try{return JSON.parse(value) as Record<string,string|boolean>}catch{return {}}};
export default function ExportComplianceReviews(){
 const [items,setItems]=useState<Submission[]>([]),[open,setOpen]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{void (async()=>{const session=await currentPddSession();if(!session){window.location.replace("/employee-login?return_to=/employee/export-compliance");return}const response=await fetch("/api/export-compliance",{headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"});if(response.status===401){clearPddSession();window.location.replace("/employee-login?return_to=/employee/export-compliance");return}const data=await response.json() as {submissions?:Submission[];error?:string};if(!response.ok)setError(data.error||"Submissions could not be loaded.");else setItems(data.submissions||[]);setLoading(false)})()},[]);
 return <main className="applicationRecordsPage"><header><div><p className="eyebrow">EXPORT COMPLIANCE</p><h1>End-Use Certifications</h1><p>Review the customer’s parties, destination, products and intended use before any export proceeds.</p></div><a href="/employee">← Deal Workbook</a></header>
 {loading?<p className="applicationRecordMessage">Loading certifications…</p>:error?<p className="applicationRecordMessage error">{error}</p>:items.length===0?<p className="applicationRecordMessage">No export compliance certifications have been submitted.</p>:<section className="applicationRecordList">{items.map(item=>{const details=parse(item.payload);return <article className={open===item.id?"open":""} key={item.id}><button className="applicationRecordSummary" onClick={()=>setOpen(open===item.id?"":item.id)}><div><span>{item.reference}</span><h2>{item.company}</h2><p>{item.contact_name} · {item.destination_country}</p></div><div><small>Status</small><strong>{item.status.replaceAll("_"," ")}</strong></div><b>{open===item.id?"Close":"Review"}</b></button>{open===item.id&&<div className="applicationRecordDetails"><dl>{Object.entries(details).filter(([,value])=>value!==""&&value!==false).map(([name,value])=><div key={name}><dt>{label(name)}</dt><dd>{typeof value==="boolean"?(value?"Yes":"No"):String(value)}</dd></div>)}</dl></div>}</article>})}</section>}</main>
}
