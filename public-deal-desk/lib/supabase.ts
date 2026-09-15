const supabaseUrl=process.env.SUPABASE_URL?.replace(/\/$/,"");
const supabaseKey=process.env.SUPABASE_PUBLISHABLE_KEY;
export function supabaseReady(){return Boolean(supabaseUrl&&supabaseKey)}
export async function supabaseRequest(path:string,init:RequestInit={}){if(!supabaseUrl||!supabaseKey)throw new Error("Supabase is not configured");const headers=new Headers(init.headers);headers.set("apikey",supabaseKey);headers.set("Authorization",`Bearer ${supabaseKey}`);return fetch(`${supabaseUrl}${path}`,{...init,headers})}
