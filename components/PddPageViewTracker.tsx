"use client";
import {useEffect,useRef} from "react";

const consentKey="m2m_privacy_consent_v1";
const visitorKey="m2m_pdd_analytics_visitor_v1";

export default function PddPageViewTracker(){
  const sent=useRef(false);
  useEffect(()=>{
    const track=()=>{
      if(sent.current||window.location.pathname==="/public-deal-desk/deal-builder")return;
      try{
        const consent=JSON.parse(localStorage.getItem(consentKey)||"null") as {analytics?:boolean}|null;
        if(!consent?.analytics)return;
        let visitorId=localStorage.getItem(visitorKey);
        if(!visitorId){visitorId=crypto.randomUUID();localStorage.setItem(visitorKey,visitorId)}
        sent.current=true;
        void fetch("/api/page-views",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:window.location.pathname,visitorId}),keepalive:true});
      }catch{/* Analytics remains off when the saved choice cannot be read. */}
    };
    track();window.addEventListener("m2m:privacy-consent",track);
    return()=>window.removeEventListener("m2m:privacy-consent",track);
  },[]);
  return null;
}
