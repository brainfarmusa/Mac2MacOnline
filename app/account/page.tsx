"use client";
import {useEffect} from "react";
import {currentCustomerSession} from "../../lib/customer-auth";
import {currentPddSession} from "../../lib/pdd-auth";
export default function AccountRouter(){useEffect(()=>{(async()=>{if(await currentCustomerSession()){window.location.replace("/my-bids");return}if(await currentPddSession()){window.location.replace("/employee");return}window.location.replace("/customer-login")})()},[]);return <main className="employeeAuthPage"><section className="employeeAuthCard"><p className="eyebrow">MY ACCOUNT</p><h1>Opening your account…</h1><p>Checking your active sign-in securely.</p></section></main>}
