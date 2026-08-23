"use client";
import {FormEvent,useEffect,useState} from "react";
import {pddAuthFetch,pddSupabaseKey,pddSupabaseUrl,savePddSession,type PddSession} from "../../lib/pdd-auth";

export default function EmployeeLogin(){
  const [email,setEmail]=useState("darrell@mac2maconline.com");
  const [password,setPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [inviteToken,setInviteToken]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.hash.replace(/^#/,""));
    const token=params.get("access_token");
    if(token&&(params.get("type")==="invite"||params.get("type")==="recovery"))setInviteToken(token);
  },[]);

  async function signIn(event:FormEvent){
    event.preventDefault();setBusy(true);setMessage("");
    try{
      const response=await pddAuthFetch("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email:email.trim().toLowerCase(),password})});
      const data=await response.json() as PddSession&{error_description?:string;msg?:string};
      if(!response.ok)throw new Error(data.error_description||data.msg||"The email or password was not accepted.");
      savePddSession(data);window.location.assign("/employee");
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to sign in.")}finally{setBusy(false)}
  }

  async function requestInvite(){
    setBusy(true);setMessage("");
    try{
      const response=await fetch(`${pddSupabaseUrl}/functions/v1/request-pdd-employee-access`,{method:"POST",headers:{apikey:pddSupabaseKey,"Content-Type":"application/json"},body:JSON.stringify({email:email.trim().toLowerCase(),redirectTo:`${window.location.origin}/employee-login`})});
      if(!response.ok)throw new Error("Unable to send the activation email right now.");
      setMessage("If this email is approved, an activation link has been sent. Please check your inbox.");
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to send the activation email.")}finally{setBusy(false)}
  }

  async function setInitialPassword(event:FormEvent){
    event.preventDefault();setBusy(true);setMessage("");
    try{
      if(newPassword.length<10)throw new Error("Use at least 10 characters for your password.");
      const response=await fetch(`${pddSupabaseUrl}/auth/v1/user`,{method:"PUT",headers:{apikey:pddSupabaseKey,Authorization:`Bearer ${inviteToken}`,"Content-Type":"application/json"},body:JSON.stringify({password:newPassword})});
      const data=await response.json() as {msg?:string};
      if(!response.ok)throw new Error(data.msg||"The activation link is invalid or expired.");
      window.history.replaceState({},"",window.location.pathname);setInviteToken("");setPassword(newPassword);setMessage("Your password is set. Sign in below.");
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to set your password.")}finally{setBusy(false)}
  }

  return <main className="employeeAuthPage"><section className="employeeAuthCard"><a className="employeeAuthBrand" href="/"><img src="/assets/m2m-logo-large.png" alt="Mac2MacOnline"/></a><p className="eyebrow">PUBLIC DEAL DESK</p>{inviteToken?<><h1>Create your password</h1><p>Finish activating your employee account.</p><form onSubmit={setInitialPassword}><label>New password<input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required minLength={10}/></label><button className="button" disabled={busy}>{busy?"Saving…":"Set password"}</button></form></>:<><h1>Employee sign in</h1><p>Access deal creation and internal deal management.</p><form onSubmit={signIn}><label>Email address<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="button" disabled={busy}>{busy?"Signing in…":"Sign in"}</button></form><button className="employeeInviteLink" type="button" onClick={requestInvite} disabled={busy}>Activate an approved account</button></>}{message&&<p className="employeeAuthMessage" role="status">{message}</p>}<a className="employeeBackLink" href="/public-deal-desk">← Back to the Public Deal Desk</a></section></main>;
}
