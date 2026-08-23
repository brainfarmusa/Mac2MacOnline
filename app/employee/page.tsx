"use client";
import {useEffect,useState} from "react";
import {clearPddSession,currentPddSession,pddAuthFetch} from "../../lib/pdd-auth";

type Profile={email:string;display_name:string;role:"administrator"|"employee"};
export default function EmployeeDashboard(){
  const [profile,setProfile]=useState<Profile|null>(null);const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{const session=await currentPddSession();if(!session){window.location.replace("/employee-login");return}const response=await pddAuthFetch("/rest/v1/pdd_employee_access?select=email,display_name,role",{headers:{Authorization:`Bearer ${session.access_token}`}});if(!response.ok){clearPddSession();window.location.replace("/employee-login");return}const rows=await response.json() as Profile[];if(!rows[0]){clearPddSession();window.location.replace("/employee-login");return}setProfile(rows[0]);setLoading(false)})()},[]);
  function signOut(){clearPddSession();window.location.assign("/employee-login")}
  if(loading)return <main className="employeeDashboard"><p>Loading your Deal Desk…</p></main>;
  return <main className="employeeDashboard"><header><div><p className="eyebrow">M2M EMPLOYEE DEAL DESK</p><h1>Welcome, {profile?.display_name}</h1><p>{profile?.email} · {profile?.role==="administrator"?"Administrator":"Employee"}</p></div><button className="button secondary" onClick={signOut}>Sign out</button></header><section className="employeeDashboardGrid"><article><span>01</span><h2>Create a deal</h2><p>Upload a raw spreadsheet, quantify matching items and review the deal before publishing.</p><a className="button" href="/public-deal-desk/deal-builder">Open Deal Builder</a></article><article><span>02</span><h2>Manage deals</h2><p>Your saved deals, ownership, bid activity and publishing controls will appear here as we complete the employee workflow.</p><button className="button secondary" disabled>Coming next</button></article><article><span>ADMIN</span><h2>Employee access</h2><p>You are the administrator. Frankie and Daren can be added later without enabling public registration.</p><button className="button secondary" disabled>Darrell active</button></article></section></main>;
}
