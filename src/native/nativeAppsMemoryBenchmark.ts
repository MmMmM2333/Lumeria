import { mkdirSync,writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { heapStats } from "bun:jsc";
import type { Container } from "pixi.js";
import { nativeAppsSettingsPage } from "../rendering/native/nativeAppsSettingsPage.js";
import { NativeScrollView } from "../rendering/native/NativeScrollView.js";

type Options=Parameters<typeof nativeAppsSettingsPage>[0];
export async function runNativeAppsMemoryBenchmark(options:Options,stage:Container,present:()=>Promise<void>):Promise<void>{
  const output=process.env.LAUNCHPAD_MEMORY_BENCH!;
  const fixtures=Array.from({length:1000},(_,index)=>({id:`memory-${index}`,name:`Application ${String(index).padStart(4,"0")}`,type:"app" as const,emoji:"A",launchTarget:{kind:"url" as const,path:`https://example.invalid/${index}`}}));
  const samples:unknown[]=[];
  const count=(node:Container):number=>1+node.children.reduce((total,child)=>total+count(child),0);
  const sample=(phase:string,nodes:number,buildMs=0)=>{const usage=process.memoryUsage(),heap=heapStats();samples.push({phase,nodes,buildMs,rss:usage.rss,heapUsed:usage.heapUsed,heapSize:heap.heapSize,heapCapacity:heap.heapCapacity,objects:heap.objectCount});};
  sample("startup",count(stage));
  for(let cycle=0;cycle<6;cycle++){
    for(const phase of ["open","search","select"]){
      const list=phase==="search"?fixtures.slice(0,100):fixtures;
      const model=new Proxy(options.apps,{get(target,key){
        if(key==="filteredManagedApps")return {value:list};if(key==="managedApps")return {value:fixtures};
        if(key==="appManagerSelectedIds")return {value:phase==="select"?[fixtures[0]!.id]:[]};
        if(key==="selectedManagedAppCount")return {value:phase==="select"?1:0};
        return Reflect.get(target,key);
      }});
      const start=performance.now();
      const page=nativeAppsSettingsPage({...options,apps:model,subPage:"apps.appManager"});
      const scroll=new NativeScrollView(options.invalidate);scroll.position.set(30,30);stage.addChild(scroll);scroll.content.addChild(page.node);
      scroll.resize(options.width,450,page.layout?.reflow(new Map())??page.height);
      page.viewport?.(0,450);
      const ms=performance.now()-start;
      await present();sample(`${cycle}:${phase}`,count(page.node),ms);
      page.dispose();scroll.destroy();await present();
    }
    await new Promise(resolve=>setTimeout(resolve,100));sample(`${cycle}:closed`,count(stage));
  }
  sample("beforeDiagnosticGc",count(stage));Bun.gc(true);await new Promise(resolve=>setTimeout(resolve,300));sample("afterDiagnosticGc",count(stage));
  mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify({fixtureCount:fixtures.length,samples},null,2));
  console.log("Application list memory benchmark",JSON.stringify(samples));
}
