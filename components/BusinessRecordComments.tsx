"use client";
import {useEffect,useState} from "react";
import type {PddSession} from "../lib/pdd-auth";

export default function BusinessRecordComments({recordType,recordId,session}:{recordType:"vendor"|"customer"|"prospect";recordId:string;session:PddSession|null}){
  const [comments,setComments]=useState(""),[busy,setBusy]=useState(true),[message,setMessage]=useState("");
  useEffect(()=>{if(!session)return;setBusy(true);void (async()=>{try{const response=await fetch(`/api/business-record-comments?recordType=${recordType}&recordId=${encodeURIComponent(recordId)}`,{headers:{Authorization:`Bearer ${session.access_token}`}}),data=await response.json() as {comments?:string};if(response.ok)setComments(data.comments||"")}finally{setBusy(false)}})()},[recordId,recordType,session]);
  async function save(){if(!session)return;setBusy(true);setMessage("");try{const response=await fetch("/api/business-record-comments",{method:"PUT",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({recordType,recordId,comments})}),data=await response.json().catch(()=>({})) as {error?:string;comments?:string};if(!response.ok)throw new Error(data.error||"Comments could not be saved.");setComments(data.comments||"");setMessage("Comments saved") }catch(error){setMessage(error instanceof Error?error.message:"Comments could not be saved.")}finally{setBusy(false)}}
  return <section className="businessRecordComments"><label><span>Comments</span><textarea rows={3} maxLength={10000} value={comments} disabled={busy} onChange={event=>setComments(event.target.value)} placeholder={`Add comments about this ${recordType}…`}/></label><div><button className="button secondary" type="button" disabled={busy} onClick={()=>void save()}>{busy?"Please wait…":"Save Comments"}</button>{message&&<small>{message}</small>}</div></section>
}
