"use client";
import {useEffect,useState} from "react";

type Choice={analytics:boolean;advertising:boolean};
const KEY="m2m_privacy_consent_v1";
function apply(choice:Choice){
  window.gtag?.("consent","update",{analytics_storage:choice.analytics?"granted":"denied",ad_storage:choice.advertising?"granted":"denied",ad_user_data:choice.advertising?"granted":"denied",ad_personalization:choice.advertising?"granted":"denied"});
  localStorage.setItem(KEY,JSON.stringify(choice));
}
declare global{interface Window{gtag?:(...args:unknown[])=>void}}
export default function PrivacyConsent(){
  const [open,setOpen]=useState(false),[manage,setManage]=useState(false),[choice,setChoice]=useState<Choice>({analytics:false,advertising:false});
  useEffect(()=>{try{const saved=localStorage.getItem(KEY);if(saved){const value=JSON.parse(saved);setChoice(value);apply(value)}else setOpen(true)}catch{setOpen(true)}},[]);
  const save=(value:Choice)=>{setChoice(value);apply(value);setOpen(false);setManage(false)};
  return <><button className="privacy-settings-tab" onClick={()=>{setManage(true);setOpen(true)}}>Cookie preferences</button>{open&&<div className="consent-backdrop" role="presentation"><section className="consent-panel" role="dialog" aria-modal="true" aria-labelledby="consent-title"><h2 id="consent-title">Your privacy choices</h2><p>We use necessary technology to operate the site. With your permission, Google Analytics helps us understand site use. You can accept, reject, or customize nonessential tracking.</p>{manage&&<div className="consent-options"><label><span><b>Necessary</b><small>Security, forms, accounts and saved privacy choices.</small></span><input type="checkbox" checked disabled/></label><label><span><b>Analytics</b><small>Helps us understand visits and improve the site.</small></span><input type="checkbox" checked={choice.analytics} onChange={e=>setChoice({...choice,analytics:e.target.checked})}/></label><label><span><b>Advertising</b><small>Allows advertising measurement if those services are used.</small></span><input type="checkbox" checked={choice.advertising} onChange={e=>setChoice({...choice,advertising:e.target.checked})}/></label></div>}<p className="consent-policy"><a href="/privacy">Read our Privacy &amp; Cookie Policy</a></p><div className="consent-actions">{manage?<button onClick={()=>save(choice)}>Save choices</button>:<button className="secondary" onClick={()=>setManage(true)}>Manage</button>}<button className="secondary" onClick={()=>save({analytics:false,advertising:false})}>Reject nonessential</button><button onClick={()=>save({analytics:true,advertising:true})}>Accept all</button></div></section></div>}</>;
}
