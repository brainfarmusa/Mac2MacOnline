"use client";

import {FormEvent, useEffect, useRef, useState} from "react";
import {currentPddSession} from "@/lib/pdd-auth";

type Message = {role:"user"|"assistant"; content:string};

export default function LorraineChat(){
  const [open,setOpen]=useState(false);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [employeeMode,setEmployeeMode]=useState(false);
  const [employeeName,setEmployeeName]=useState("");
  const messagesRef=useRef<HTMLDivElement>(null);
  const [messages,setMessages]=useState<Message[]>([{role:"assistant",content:"Hello, I’m Lorraine. Ask me about buying, selling, consigning, trade-ins, equipment categories, or the Live Bid Board."}]);

  useEffect(()=>{let active=true;(async()=>{const session=await currentPddSession();if(!session?.access_token)return;try{const response=await fetch("/api/lorraine",{headers:{Authorization:`Bearer ${session.access_token}`}});const data=await response.json() as {employee?:boolean;displayName?:string};if(active&&response.ok&&data.employee){setEmployeeMode(true);setEmployeeName(data.displayName||"");setMessages([{role:"assistant",content:`Hello${data.displayName?` ${data.displayName}`:""}, I’m Lorraine. Ask me how to use the Deal Workbook, create and manage deals, prepare bid spreadsheets, process bids and awards, check serials, or complete orders.`}])}}catch{/* Keep the public assistant when no verified employee session is available. */}})();return()=>{active=false}},[]);

  useEffect(()=>{
    const list=messagesRef.current;
    if(!list)return;
    requestAnimationFrame(()=>list.scrollTo({top:list.scrollHeight,behavior:"smooth"}));
  },[messages,open,busy]);

  async function revealAnswer(answer:string){
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){setMessages(current=>[...current,{role:"assistant",content:answer}]);return}
    setMessages(current=>[...current,{role:"assistant",content:""}]);
    for(let index=0;index<answer.length;index+=3){
      const visible=answer.slice(0,index+3);
      setMessages(current=>current.map((item,itemIndex)=>itemIndex===current.length-1?{role:"assistant",content:visible}:item));
      await new Promise(resolve=>setTimeout(resolve,12));
    }
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    const message=input.trim();
    if(!message||busy)return;
    const prior=messages.slice(-8);
    setMessages(current=>[...current,{role:"user",content:message}]);
    setInput("");setBusy(true);
    try{
      const session=await currentPddSession();
      const headers:Record<string,string>={"content-type":"application/json"};
      if(session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;
      const response=await fetch("/api/lorraine",{method:"POST",headers,body:JSON.stringify({message,history:prior})});
      const data=await response.json() as {answer?:string;error?:string;accessLevel?:string;displayName?:string};
      if(!response.ok||!data.answer)throw new Error(data.error||"Lorraine could not answer right now.");
      if(data.accessLevel&&data.accessLevel!=="public"){setEmployeeMode(true);setEmployeeName(data.displayName||"");}
      await revealAnswer(data.answer);
    }catch(error){setMessages(current=>[...current,{role:"assistant",content:error instanceof Error?error.message:"Lorraine could not answer right now. Please try again."}]);}
    finally{setBusy(false);}
  }

  return <>
    <button className={`lorraineLauncher${busy?" thinking":""}`} type="button" onClick={()=>setOpen(value=>!value)} aria-expanded={open}>
      <img src="/lorraine-icon.jpeg?v=2" alt="" aria-hidden="true"/>
      <span>{open?"Close Lorraine":employeeMode?"Ask Employee Lorraine":"Ask Lorraine"}</span>
    </button>
    {open&&<section className={`lorrainePanel${busy?" thinking":""}`} aria-label="Chat with Lorraine">
      <header><div className="lorraineIdentity"><img src="/lorraine-icon.jpeg?v=2" alt="Lorraine"/><div><strong>Lorraine</strong><span>{employeeMode?`Employee operations expert${employeeName?` · ${employeeName}`:""}`:"Mac2MacOnline AI assistant"}</span></div></div><button type="button" onClick={()=>setOpen(false)} aria-label="Close chat">×</button></header>
      <div ref={messagesRef} className="lorraineMessages" aria-live="polite">{messages.map((message,index)=><div key={index} className={`lorraineMessage ${message.role}`}>{message.content}</div>)}</div>
      <form onSubmit={submit}><input value={input} onChange={event=>setInput(event.target.value)} maxLength={1600} autoComplete="off" placeholder="Ask Lorraine a question…" aria-label="Question for Lorraine"/><button type="submit" disabled={busy}>{busy?"…":"Send"}</button></form>
      <small>{employeeMode?"Employee-only procedural guidance · no live company records shared · read-only.":"Lorraine provides public information only and cannot change site or account data."}</small>
    </section>}
  </>;
}
