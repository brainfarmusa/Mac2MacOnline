import {pddAuthFetch,type PddSession} from "./pdd-auth";

const customerSessionKey="m2m-pdd-customer-session";
export function saveCustomerSession(session:PddSession,remember=true){const value=JSON.stringify(session);localStorage.removeItem(customerSessionKey);sessionStorage.removeItem(customerSessionKey);(remember?localStorage:sessionStorage).setItem(customerSessionKey,value)}
export function clearCustomerSession(){localStorage.removeItem(customerSessionKey);sessionStorage.removeItem(customerSessionKey)}
export function readCustomerSession():PddSession|null{try{return JSON.parse(sessionStorage.getItem(customerSessionKey)||localStorage.getItem(customerSessionKey)||"null") as PddSession|null}catch{return null}}
export async function currentCustomerSession(){
  let session=readCustomerSession();if(!session)return null;
  if(session.expires_at&&session.expires_at*1000<Date.now()+30_000&&session.refresh_token){
    const response=await pddAuthFetch("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:session.refresh_token})});
    if(!response.ok){clearCustomerSession();return null}session=await response.json() as PddSession;saveCustomerSession(session,Boolean(localStorage.getItem(customerSessionKey)));
  }
  return session;
}
