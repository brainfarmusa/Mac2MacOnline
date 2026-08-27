import {pddSupabaseKey,pddSupabaseUrl} from "./pdd-auth";

export async function customerUser(request:Request){
  const authorization=request.headers.get("authorization")||"";
  if(!authorization.startsWith("Bearer "))return null;
  const response=await fetch(`${pddSupabaseUrl}/auth/v1/user`,{headers:{apikey:pddSupabaseKey,Authorization:authorization}});
  if(!response.ok)return null;
  const user=await response.json() as {id?:string;email?:string};
  return user.id&&user.email?{id:user.id,email:user.email}:null;
}
