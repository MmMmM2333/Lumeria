import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NativePixiApplication } from "../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { NativeSearchBar } from "../rendering/native/NativeSearchBar.js";
import type { NativeIconRepository } from "../rendering/native/nativeIconResidency.js";

/** Replays the actual editor/scene path, without claiming OS keyboard latency. */
export async function measureNativeSearch(app:NativePixiApplication,bar:NativeSearchBar,icons:NativeIconRepository,present:()=>Promise<void>){
  const samples:{query:string;inputMs:number;presentMs:number;resident:number}[]=[];
  const sources=new Set<number>();
  const recordSources=()=>{for(const item of icons.snapshot().cached)if(item.sourceUid!==null)sources.add(item.sourceUid);};
  recordSources();const initialSources=sources.size;
  bar.input.focus();
  for(let cycle=0;cycle<16;cycle++){
    for(const query of ["w",""]){
      const start=performance.now();
      if(query)bar.input.commitText(query);else app.nativeInput.emitKey("down",{keyCode:8});
      const inputMs=performance.now()-start;
      assert.equal(bar.input.value,query);
      await present();
      const presentMs=performance.now()-start;
      recordSources();samples.push({query,inputMs,presentMs,resident:icons.residency().resident});
    }
  }
  const percentile=(values:number[],fraction:number)=>values.toSorted((a,b)=>a-b)[Math.floor((values.length-1)*fraction)]!;
  const summary={initialSources,newSources:sources.size-initialSources,samples:samples.length,
    inputP50:percentile(samples.map(s=>s.inputMs),.5),inputP95:percentile(samples.map(s=>s.inputMs),.95),
    presentP50:percentile(samples.map(s=>s.presentMs),.5),presentP95:percentile(samples.map(s=>s.presentMs),.95)};
  writeFileSync(join(process.env.LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR!,"search-performance.json"),JSON.stringify({summary,samples},null,2));
  console.log("Native search measurements",JSON.stringify(summary));
  return summary;
}
