import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Rectangle } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { createNativeEditing } from "../nativeEditing.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import type { SceneItem } from "../../rendering/sceneFrame.js";
import { measureNativeCreationNodes } from "../../rendering/native/nativeCreationBenchmark.js";

export async function runNativeInteractionBench(o:{app:NativePixiApplication;editing:ReturnType<typeof createNativeEditing>;
  scene:NativeDesktopScene;items:()=>readonly SceneItem[];present:(name:string)=>Promise<void>;
  waitFor:(name:string,predicate:()=>boolean)=>Promise<void>;quit:()=>void}) {
  const dir=process.env.LAUNCHPAD_INTERACTION_BENCH;
  if(!dir||!process.env.LUMERIA_NATIVE_DATA_DIR)throw new Error("Interaction benchmark requires isolated data");
  mkdirSync(dir,{recursive:true});const timings:Record<string,number>={};let phase="setup";
  const profiles:{phase:string;kind:string;ms:number}[]=[];
  const creationFrames:number[]=[],creationWork:{ms:number;plans:number;nodes:number;interaction:number}[]=[];
  const creationNodes=measureNativeCreationNodes(o.app.stage,()=>phase==="createFolder");
  let stopPresent:(()=>void)|undefined,stopObserve:(()=>void)|undefined,timer:ReturnType<typeof setInterval>|undefined;
  const pipeline=o.app.renderer.pipeline,getPipeline=pipeline.getPipeline;
  pipeline.getPipeline=function(...args:Parameters<typeof getPipeline>){const at=performance.now();try{return getPipeline.apply(this,args);}finally{const ms=performance.now()-at;if(ms>1)profiles.push({phase,kind:"pipeline",ms});}};
  const commit=o.scene.commit;o.scene.commit=function(...args:Parameters<typeof commit>){const at=performance.now();const work=commit.apply(this,args),ms=performance.now()-at;
    profiles.push({phase,kind:"scene",ms});if(phase==="createFolder")creationWork.push({ms,plans:work.fullPlanBuilds,nodes:work.reconciledNodes,interaction:work.interactionFrames});return work;};
  try{
  const measure=async(name:string,run:()=>void)=>{phase=name;const start=performance.now();run();timings[name+"SyncMs"]=performance.now()-start;
    await o.present(name);timings[name+"FirstPresentMs"]=performance.now()-start;};
  const ids=o.items().filter(item=>item.type!=="folder").map(item=>item.id);
  assert.ok(ids.length>=20,"benchmark requires a full desktop page");
  await measure("batchCold",()=>o.editing.selection.begin({}));
  await o.waitFor("cold toolbar settled",()=>!o.scene.getMotionSnapshot().active);
  await measure("batchClose",()=>o.editing.selection.clear());
  await measure("batchWarm",()=>o.editing.selection.begin({}));
  await o.waitFor("warm toolbar settled",()=>!o.scene.getMotionSnapshot().active);
  const id=ids[0]!,node=o.app.stage.getChildByLabel(`launchpad-item:${id}`,true)!;
  const bounds=node.getBounds(),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
  o.editing.selection.replace(id);
  const startEvent=o.scene.createDragPointerEvent(id,{clientX:x,clientY:y,pointerId:1,pointerType:"mouse",button:0,buttons:1,type:"pointermove"});
  assert.ok(o.editing.beginDrag(id,{...startEvent,pointerType:"mouse",isPrimary:true,dragStartedFromThreshold:true}));
  await o.present("drag started");
  phase="drag";
  const frames:number[]=[],moves:number[]=[];let last=performance.now(),lastMove=last;
  stopPresent=o.app.on("presented",()=>{const now=performance.now();frames.push(now-last);moves.push(now-lastMove);last=now;});
  const begin=performance.now();let count=0;
  timer=setInterval(()=>{const t=performance.now()-begin;lastMove=performance.now();count++;
    o.editing.drag.updateDragPointer({clientX:x+Math.sin(t/140)*100,clientY:y+130,pointerId:1,pointerType:"mouse",buttons:1,preventDefault:()=>{}});},4);
  await new Promise(resolve=>setTimeout(resolve,1200));clearInterval(timer);timer=undefined;stopPresent();stopPresent=undefined;
  o.editing.drag.cancelDrag({pointerId:1,type:"pointercancel"});
  await o.waitFor("drag cancelled",()=>!o.editing.drag.isDragActive());
  const selectedCount=Number(process.env.LAUNCHPAD_INTERACTION_BENCH_SELECTED??ids.length);
  const crossPage=process.env.LAUNCHPAD_INTERACTION_BENCH_CROSS_PAGE==="1";
  const selectable=crossPage?o.editing.projectedPages().flat().filter(item=>item?.type!=="folder").flatMap(item=>item?[item.id]:[]):ids;
  assert.ok(Number.isInteger(selectedCount)&&selectedCount>=2&&selectedCount<=selectable.length,"selected benchmark count must fit its scope");
  const selected=selectable.slice(0,selectedCount);
  await measure("selectPage",()=>{o.editing.selection.selectScope({key:crossPage?"desktop:all":"desktop:0",orderedIds:selected});});
  const start=performance.now();let firstMotion:number|null=null;
  let lastCreationPresent=start;
  stopObserve=o.app.on("presented",()=>{
    const now=performance.now();creationFrames.push(now-lastCreationPresent);lastCreationPresent=now;
    const layer=o.app.stage.getChildByLabel("group-drag",true);
    if(firstMotion===null&&(layer?.visible||o.editing.drag.groupDragState.value?.phase==="releasing"))firstMotion=performance.now()-start;
  });
  await measure("createFolder",()=>assert.equal(o.editing.createFolder(),true));
  await o.waitFor("batch folder creation settled",()=>!o.editing.drag.isDragActive());stopObserve();stopObserve=undefined;
  timings.createFolderSettledMs=performance.now()-start;
  phase="verify";await o.present("folder final ownership");
  const folder=o.editing.projectedPages().flat().find(item=>item?.type==="folder"&&item.childPages.flat().some(child=>child?.id===selected[0]));
  assert.ok(folder?.type==="folder");assert.deepEqual(folder.childPages.flat().flatMap(item=>item?[item.id]:[]).sort(),[...selected].sort());
  creationNodes.assertSettled(folder.id);
  const screenshot=await o.app.renderer.extract.base64({target:o.app.stage,frame:new Rectangle(0,0,o.app.contentSize.width,o.app.contentSize.height),format:"png",resolution:1});
  writeFileSync(join(dir,"folder-complete.png"),Buffer.from(screenshot.split(",")[1]!,"base64"));
  const percentile=(values:number[],fraction:number)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*fraction)]??0;
  const proof={timings,profiles,createFolderFirstMotionMs:firstMotion,icons:ids.length,totalApps:Number(process.env.LAUNCHPAD_INTERACTION_BENCH_APPS??28),
    creation:{selected:selected.length,crossPage,frames:creationFrames.length,medianMs:percentile(creationFrames,.5),p95Ms:percentile(creationFrames,.95),maxMs:Math.max(...creationFrames),
      over16ms:creationFrames.filter(ms=>ms>1000/60).length,states:creationNodes.count(),work:creationWork},
    drag:{inputSamples:count,frames:frames.length,frameMedianMs:percentile(frames,.5),frameP95Ms:percentile(frames,.95),inputAgeP95Ms:percentile(moves,.95)}};
  writeFileSync(join(dir,"proof.json"),JSON.stringify(proof,null,2));console.log("Interaction benchmark",JSON.stringify(proof));o.quit();
  }finally{
    if(timer!==undefined)clearInterval(timer);stopPresent?.();stopObserve?.();
    pipeline.getPipeline=getPipeline;o.scene.commit=commit;creationNodes.dispose();
  }
}
