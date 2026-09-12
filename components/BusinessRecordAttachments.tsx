"use client";

import {useState} from "react";
import type {PddSession} from "../lib/pdd-auth";

type Attachment={id:string;filename:string;content_type:string;size_bytes:number;uploaded_by:string;created_at:string};

const accepted=".pdf,.xls,.xlsx,.csv,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png,.webp,.zip";
const size=(bytes:number)=>bytes<1024?`${bytes} B`:bytes<1024*1024?`${Math.ceil(bytes/1024)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;

export default function BusinessRecordAttachments({recordType,recordId,recordName,session,isAdministrator=false}:{recordType:"vendor"|"customer"|"prospect";recordId:string;recordName:string;session:PddSession|null;isAdministrator?:boolean}){
 const [expanded,setExpanded]=useState(false),[loaded,setLoaded]=useState(false),[files,setFiles]=useState<Attachment[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const headers=()=>({Authorization:`Bearer ${session?.access_token||""}`});
 async function load(){if(!session)return;setBusy(true);setMessage("");try{const response=await fetch(`/api/business-record-attachments?recordType=${recordType}&recordId=${encodeURIComponent(recordId)}`,{headers:headers()}),data=await response.json() as {attachments?:Attachment[];error?:string};if(!response.ok)throw new Error(data.error||"Documents could not be loaded.");setFiles(data.attachments||[]);setLoaded(true)}catch(error){setMessage(error instanceof Error?error.message:"Documents could not be loaded.")}finally{setBusy(false)}}
 async function toggle(){const next=!expanded;setExpanded(next);if(next&&!loaded)await load()}
 async function upload(selected:FileList|null){if(!session||!selected?.length)return;setBusy(true);setMessage("");try{const form=new FormData();form.set("recordType",recordType);form.set("recordId",recordId);form.set("recordName",recordName);Array.from(selected).slice(0,10).forEach(file=>form.append("documents",file));const response=await fetch("/api/business-record-attachments",{method:"POST",headers:headers(),body:form}),data=await response.json() as {attachments?:Attachment[];error?:string};if(!response.ok)throw new Error(data.error||"Documents could not be uploaded.");setFiles(current=>[...current,...(data.attachments||[])]);setLoaded(true);setMessage(`${data.attachments?.length||0} document${data.attachments?.length===1?"":"s"} added.`)}catch(error){setMessage(error instanceof Error?error.message:"Documents could not be uploaded.")}finally{setBusy(false)}}
 async function download(file:Attachment){if(!session)return;setMessage("");try{const response=await fetch(`/api/business-record-attachments?id=${encodeURIComponent(file.id)}`,{headers:headers()});if(!response.ok){const data=await response.json().catch(()=>({})) as {error?:string};throw new Error(data.error||"The document could not be downloaded.")}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=file.filename;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}catch(error){setMessage(error instanceof Error?error.message:"The document could not be downloaded.")}}
 async function remove(file:Attachment){if(!session||!window.confirm(`Delete “${file.filename}”?`))return;setBusy(true);setMessage("");try{const response=await fetch("/api/business-record-attachments",{method:"DELETE",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify({id:file.id})}),data=await response.json().catch(()=>({})) as {error?:string};if(!response.ok)throw new Error(data.error||"The document could not be deleted.");setFiles(current=>current.filter(item=>item.id!==file.id));setMessage("Document deleted.")}catch(error){setMessage(error instanceof Error?error.message:"The document could not be deleted.")}finally{setBusy(false)}}
 return <section className="recordAttachments">
  <button className="recordAttachmentsToggle" type="button" onClick={()=>void toggle()} aria-expanded={expanded}><span>Attachments{loaded?` (${files.length})`:""}</span><strong>{expanded?"Close":"Add or view"}</strong></button>
  {expanded&&<div className="recordAttachmentsBody">
   <label className="recordAttachmentPicker"><span>{busy?"Working…":"Add documents"}</span><small>PDF, Word, Excel, CSV, images, text, or ZIP · up to 15MB each</small><input type="file" multiple accept={accepted} disabled={busy} onChange={event=>{void upload(event.target.files);event.currentTarget.value=""}}/></label>
   {message&&<p className="recordAttachmentMessage" role="status">{message}</p>}
   {busy&&!loaded?<p className="recordAttachmentEmpty">Loading documents…</p>:files.length?<ul>{files.map(file=><li key={file.id}><button type="button" onClick={()=>void download(file)}>{file.filename}</button><span>{size(file.size_bytes)} · {new Date(file.created_at).toLocaleDateString()}</span>{(isAdministrator||file.uploaded_by===session?.user?.email)&&<button className="recordAttachmentDelete" type="button" disabled={busy} onClick={()=>void remove(file)}>Delete</button>}</li>)}</ul>:<p className="recordAttachmentEmpty">No documents attached yet.</p>}
  </div>}
 </section>
}
