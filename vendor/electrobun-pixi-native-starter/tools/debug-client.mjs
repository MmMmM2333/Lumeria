import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const directory=()=>process.env.PIXI_AGENT_DEBUG_DIRECTORY||join(tmpdir(),"electrobun-pixi-debug");
export class DebugClient {
  #selected=null;
  async #instances(){
    let files;try{files=await readdir(directory());}catch(error){if(error.code==="ENOENT")return [];throw error;}
    const results=await Promise.all(files.filter(name=>/^[\w-]+\.json$/.test(name)).map(async name=>{
      try{
        const instance=JSON.parse(await readFile(join(directory(),name),"utf8"));
        if(instance.protocol!==1||!Number.isSafeInteger(instance.port)||instance.port<1||instance.port>65535||typeof instance.token!=="string"||typeof instance.instanceId!=="string")return null;
        const response=await fetch(`http://127.0.0.1:${instance.port}/identity`,{headers:{authorization:`Bearer ${instance.token}`},signal:AbortSignal.timeout(800)});
        if(!response.ok)return null;const identity=await response.json();return identity.instanceId===instance.instanceId?instance:null;
      }catch{return null;}
    }));return results.filter(Boolean);
  }
  async list(){return (await this.#instances()).map(({token,...identity})=>identity);}
  async select(instanceId){
    const instance=(await this.#instances()).find(value=>value.instanceId===instanceId);
    if(!instance)throw new Error("Instance is no longer available");this.#selected=instance;
    const {token,...identity}=instance;return identity;
  }
  async request(path,body){
    if(!this.#selected)throw new Error("Select an instance first");
    const response=await fetch(`http://127.0.0.1:${this.#selected.port}${path}`,{
      method:body===undefined?"GET":"POST",headers:{authorization:`Bearer ${this.#selected.token}`,"content-type":"application/json"},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||`Debug request failed: ${response.status}`);return result;
  }
  command(body){return this.request("/command",body);}
}
