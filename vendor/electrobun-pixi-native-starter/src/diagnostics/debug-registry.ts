import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface DebugInstance {
  protocol: 1; instanceId: string; pid: number; port: number; token: string;
  name: string; startedAt: string; build: string; isolated: boolean;
}
export const debugRegistryDirectory=()=>process.env.PIXI_AGENT_DEBUG_DIRECTORY||join(tmpdir(),"electrobun-pixi-debug");
export const publicInstance=({token: _token,...instance}:DebugInstance)=>instance;
export function validateInstance(value:unknown):DebugInstance {
  const v=value as DebugInstance;
  if(!v||v.protocol!==1||typeof v.instanceId!=="string"||!/^[\w-]{8,100}$/.test(v.instanceId)
    ||!Number.isSafeInteger(v.pid)||v.pid<=0||!Number.isSafeInteger(v.port)||v.port<1||v.port>65535
    ||typeof v.token!=="string"||v.token.length<20||typeof v.name!=="string"
    ||typeof v.startedAt!=="string"||typeof v.build!=="string"||typeof v.isolated!=="boolean")throw new Error("Invalid debug instance registration");
  return v;
}
export async function registerDebugInstance(instance:DebugInstance,directory=debugRegistryDirectory()){
  validateInstance(instance);await mkdir(directory,{recursive:true});
  const path=join(directory,instance.instanceId+".json"),temporary=path+".tmp";
  await writeFile(temporary,JSON.stringify(instance),{mode:0o600,flag:"wx"});await rename(temporary,path);
  return async()=>{
    try{const current=validateInstance(JSON.parse(await readFile(path,"utf8")));if(current.instanceId===instance.instanceId&&current.token===instance.token)await unlink(path);}
    catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  };
}
export async function discoverDebugInstances(directory=debugRegistryDirectory()):Promise<DebugInstance[]>{
  let files:string[];try{files=await readdir(directory);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return [];throw error;}
  const instances=await Promise.all(files.filter(name=>/^[\w-]+\.json$/.test(name)).map(async name=>{
    try{
      const instance=validateInstance(JSON.parse(await readFile(join(directory,name),"utf8")));
      process.kill(instance.pid,0);
      const response=await fetch(`http://127.0.0.1:${instance.port}/identity`,{headers:{authorization:`Bearer ${instance.token}`},signal:AbortSignal.timeout(800)});
      if(!response.ok)return null;const identity=await response.json() as {instanceId?:string};
      return identity.instanceId===instance.instanceId?instance:null;
    }catch{return null;}
  }));
  return instances.filter((instance):instance is DebugInstance=>instance!==null).sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
}
