export const pddSupabaseUrl=(process.env.NEXT_PUBLIC_SUPABASE_URL||"https://nmqlpthencvxhmkhvgzq.supabase.co").replace(/\/$/,"");
// This is Supabase's public browser key, not a service-role secret.
export const pddSupabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_IrHSWmkDcqgOkudqke4wCw_z5Zo2uKL";

export type PddSession={
  access_token:string;
  refresh_token:string;
  expires_at?:number;
  user?:{email?:string};
};

const sessionKey="m2m-pdd-employee-session";

export function savePddSession(session:PddSession){localStorage.setItem(sessionKey,JSON.stringify(session))}
export function clearPddSession(){localStorage.removeItem(sessionKey)}
export function readPddSession():PddSession|null{
  try{return JSON.parse(localStorage.getItem(sessionKey)||"null") as PddSession|null}catch{return null}
}

export async function pddAuthFetch(path:string,init:RequestInit={}){
  const headers=new Headers(init.headers);
  headers.set("apikey",pddSupabaseKey);
  headers.set("Content-Type","application/json");
  return fetch(`${pddSupabaseUrl}${path}`,{...init,headers});
}

export async function uploadPddDocument(path:string,blob:Blob,session:PddSession){
 return fetch(`${pddSupabaseUrl}/storage/v1/object/pdd-deal-uploads/${path.split("/").map(encodeURIComponent).join("/")}`,{method:"POST",headers:{apikey:pddSupabaseKey,Authorization:`Bearer ${session.access_token}`,"Content-Type":blob.type||"application/octet-stream","x-upsert":"false"},body:blob});
}

export async function replacePddDocument(path:string,blob:Blob,session:PddSession){
 return fetch(`${pddSupabaseUrl}/storage/v1/object/pdd-deal-uploads/${path.split("/").map(encodeURIComponent).join("/")}`,{method:"POST",headers:{apikey:pddSupabaseKey,Authorization:`Bearer ${session.access_token}`,"Content-Type":blob.type||"application/octet-stream","x-upsert":"true"},body:blob});
}

export async function deletePddDocument(path:string,session:PddSession){
 return fetch(`${pddSupabaseUrl}/storage/v1/object/pdd-deal-uploads/${path.split("/").map(encodeURIComponent).join("/")}`,{method:"DELETE",headers:{apikey:pddSupabaseKey,Authorization:`Bearer ${session.access_token}`}});
}

export async function downloadPddDocument(path:string,session:PddSession,filename:string){
 const response=await fetch(`${pddSupabaseUrl}/storage/v1/object/authenticated/pdd-deal-uploads/${path.split("/").map(encodeURIComponent).join("/")}`,{headers:{apikey:pddSupabaseKey,Authorization:`Bearer ${session.access_token}`}});
 if(!response.ok)throw new Error("The stored document could not be downloaded.");
 const link=document.createElement("a");link.href=URL.createObjectURL(await response.blob());link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}

export async function currentPddSession(){
  let session=readPddSession();
  if(!session)return null;
  if(session.expires_at && session.expires_at*1000<Date.now()+30_000 && session.refresh_token){
    const response=await pddAuthFetch("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:session.refresh_token})});
    if(!response.ok){clearPddSession();return null}
    session=await response.json() as PddSession;
    savePddSession(session);
  }
  return session;
}
