"use client";
import {useEffect} from "react";
import {DealWorkbookNav} from "./DealWorkbookNav";

type ConversionDetail={event:string;label?:string};
function record(detail:ConversionDetail){const gtag=(window as typeof window&{gtag?:(...args:unknown[])=>void}).gtag;gtag?.("event",detail.event,{event_category:"engagement",event_label:detail.label||"",page_path:window.location.pathname});const body=JSON.stringify({...detail,path:window.location.pathname,referrer:document.referrer||"direct"});if(navigator.sendBeacon){navigator.sendBeacon("/api/analytics",new Blob([body],{type:"application/json"}));return}void fetch("/api/analytics",{method:"POST",headers:{"content-type":"application/json"},body,keepalive:true})}

export default function ConversionTracker(){useEffect(()=>{const click=(event:MouseEvent)=>{const anchor=(event.target as HTMLElement|null)?.closest("a");if(!anchor)return;const href=anchor.getAttribute("href")||"";if(href.startsWith("mailto:"))record({event:"email_click",label:href.slice(7)});else if(href.startsWith("tel:"))record({event:"phone_click",label:href.slice(4)})};const conversion=(event:Event)=>record((event as CustomEvent<ConversionDetail>).detail);document.addEventListener("click",click);window.addEventListener("m2m-conversion",conversion);return()=>{document.removeEventListener("click",click);window.removeEventListener("m2m-conversion",conversion)}},[]);return <DealWorkbookNav/>}
