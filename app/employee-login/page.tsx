"use client";
import {FormEvent,useEffect,useState} from "react";
import {currentPddSession,pddAuthFetch,pddSupabaseKey,pddSupabaseUrl,savePddSession,type PddSession} from "../../lib/pdd-auth";

export default function EmployeeLogin(){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [remember,setRemember]=useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const [inviteToken,setInviteToken]=useState("");
  const [inviteType,setInviteType]=useState<"invite"|"recovery">("invite");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.hash.replace(/^#/,""));
    const token=params.get("access_token"),type=params.get("type");
    if(token&&(type==="invite"||type==="recovery")){setInviteType(type);setInviteToken(token)}
    const query=new URLSearchParams(window.location.search),tokenHash=query.get("token_hash"),queryType=query.get("type");
    if(!token&&!tokenHash)void currentPddSession().then(session=>{if(session)window.location.replace("/employee")});
    if(tokenHash&&(queryType==="invite"||queryType==="recovery"))void(async()=>{
      setBusy(true);
      try{
        const response=await pddAuthFetch("/auth/v1/verify",{method:"POST",body:JSON.stringify({token_hash:tokenHash,type:queryType})});
        const data=await response.json() as PddSession&{msg?:string};
        if(!response.ok)throw new Error(data.msg||"This employee link is invalid or expired.");
        setInviteType(queryType);setInviteToken(data.access_token);window.history.replaceState({},"",window.location.pathname);
      }catch(error){setMessage(error instanceof Error?error.message:"This employee link is invalid or expired.")}finally{setBusy(false)}
    })();
  },[]);

  async function signIn(event:FormEvent){
    event.preventDefault();setBusy(true);setMessage("");
    try{
      const response=await pddAuthFetch("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email:email.trim().toLowerCase(),password})});
      const data=await response.json() as PddSession&{error_description?:string;msg?:string};
      if(!response.ok)throw new Error(data.error_description||data.msg||"The email or password was not accepted.");
      savePddSession(data,remember);window.location.assign("/employee");
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to sign in.")}finally{setBusy(false)}
  }

  async function setInitialPassword(event:FormEvent){
    event.preventDefault();setBusy(true);setMessage("");
    try{
      if(newPassword.length<10)throw new Error("Use at least 10 characters for your password.");
      if(newPassword!==confirmPassword)throw new Error("The two passwords do not match.");
      const response=await fetch(`${pddSupabaseUrl}/auth/v1/user`,{method:"PUT",headers:{apikey:pddSupabaseKey,Authorization:`Bearer ${inviteToken}`,"Content-Type":"application/json"},body:JSON.stringify({password:newPassword})});
      const data=await response.json() as {msg?:string};
      if(!response.ok)throw new Error(data.msg||"The activation link is invalid or expired.");
      window.history.replaceState({},"",window.location.pathname);setInviteToken("");setPassword(newPassword);setMessage("Your password is set. Sign in below.");
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to set your password.")}finally{setBusy(false)}
  }

  return <main className="employeeAuthPage"><section className="employeeAuthCard"><a className="employeeAuthBrand" href="/"><img src="/assets/m2m-logo-large.png" alt="Mac2MacOnline"/></a><p className="eyebrow">LIVE BID BOARD</p>{inviteToken?<><h1>{inviteType==="recovery"?"Reset your password":"Create your password"}</h1><p>Enter the password you want to use for your employee account.</p><form onSubmit={setInitialPassword}><label>New password<input type={showPassword?"text":"password"} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required minLength={10}/></label><label>Confirm new password<input type={showPassword?"text":"password"} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required minLength={10}/></label><label className="rememberLogin"><input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)}/><span>Show password</span></label><button className="button" disabled={busy||!newPassword||newPassword!==confirmPassword}>{busy?"Saving…":"Set password"}</button></form></>:<><h1>Employee sign in</h1><p>Access deal creation and internal deal management.</p><form onSubmit={signIn}><label>Email address<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type={showPassword?"text":"password"} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><label className="rememberLogin"><input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)}/><span>Show password</span></label><label className="rememberLogin"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/><span>Remember me on this device</span></label><button className="button" disabled={busy}>{busy?"Signing in…":"Sign in"}</button></form><p className="employeeResetHelp">Need to activate or reset your password? Ask a Mac2MacOnline administrator to send an employee account email.</p></>}{message&&<p className="employeeAuthMessage" role="status">{message}</p>}<a className="employeeBackLink" href="/live-bid-board">← Back to the Live Bid Board</a></section></main>;
}
