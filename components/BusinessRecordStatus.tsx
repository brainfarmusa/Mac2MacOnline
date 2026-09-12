"use client";
import {useEffect,useState} from "react";
import type {PddSession} from "../lib/pdd-auth";

export const businessRecordStatuses=["new","contacted","qualified","opportunity","awaiting_response","submitted_request","vendor_approved","customer","researching"] as const;
const label=(value:string)=>value==="customer"?"Vetted Customer":value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());

export default function BusinessRecordStatus({recordType,recordId,session}:{recordType:"vendor"|"customer";recordId:string;session:PddSession|null}){
 const [status,setStatus]=useState("new"),[busy,setBusy]=useState(true),[message,setMessage]=useState("");
 useEffect(()=>{if(!session)return;void (async()=>{try{const response=await fetch(`/api/business-record-status?recordType=${recordType}&recordId=${encodeURIComponent(recordId)}`,{headers:{Authorization:`Bearer ${session.access_token}`}}),data=await response.json() as {status?:string};if(response.ok&&data.status)setStatus(data.status)}finally{setBusy(false)}})()},[recordId,recordType,session]);
 async function update(value:string){if(!session)return;const previous=status;setStatus(value);setBusy(true);setMessage("");try{const response=await fetch("/api/business-record-status",{method:"PUT",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({recordType,recordId,status:value})}),data=await response.json().catch(()=>({})) as {error?:string};if(!response.ok)throw new Error(data.error||"Status could not be saved.");setMessage("Saved")}catch(error){setStatus(previous);setMessage(error instanceof Error?error.message:"Status could not be saved.")}finally{setBusy(false)}}
 const availableStatuses=recordType==="customer"?businessRecordStatuses.filter(value=>value!=="vendor_approved"):businessRecordStatuses;
 const displayedStatus=recordType==="customer"&&status==="vendor_approved"?"new":status;
 return <label className="businessRecordStatus"><span>Status</span><select aria-label={`Status for this ${recordType}`} value={displayedStatus} disabled={busy} onChange={event=>void update(event.target.value)}>{availableStatuses.map(value=><option key={value} value={value}>{label(value)}</option>)}</select>{message&&<small>{message}</small>}</label>
}
