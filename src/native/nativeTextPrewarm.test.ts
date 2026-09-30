import assert from "node:assert/strict";
import { Text, type WebGPURenderer, type Texture } from "pixi.js";
import { installNativeCanvasTestAdapter } from "./nativeCanvasTestAdapter.js";
import { createNativeTextPrewarm } from "../rendering/native/nativeTextPrewarm.js";
import { createNativeResumeTiming } from "./nativeResumeTiming.js";

installNativeCanvasTestAdapter();
const wait=()=>new Promise(resolve=>setTimeout(resolve,25));
const counts=new Map<string,number>(),textures=new Map<string,Texture>(),prepared:string[]=[];
const renderer={uid:123,canvasText:{
  getReferenceCount:(key:string)=>counts.get(key)??0,
  getManagedTexture:(text:Text)=>{const key=text.styleKey;counts.set(key,(counts.get(key)??0)+1);prepared.push(text.text);
    const texture={destroyed:false} as Texture;textures.set(key,texture);return texture;},
  decreaseReferenceCount:(key:string)=>{assert.ok((counts.get(key)??0)>0);counts.set(key,counts.get(key)!-1);},
}} as unknown as WebGPURenderer;
let visible=true;const errors:unknown[]=[];
const warm=createNativeTextPrewarm({renderer:()=>renderer,canRun:()=>visible,onError:e=>errors.push(e)});
const a=new Text({text:"第一页"}),b=new Text({text:"目标页"});
warm.setCandidates([{text:a,page:0},{text:b,page:9}]);await wait();
assert.equal(prepared.length,0,"must not warm before first presentation starts the queue");
warm.prioritize(9,9);warm.start();await wait();
assert.deepEqual(prepared,["目标页","第一页"],"prioritize the requested page without processing duplicate labels");
warm.start();await wait();assert.equal(prepared.length,2);
counts.set(a.styleKey,2);a._gpuData[123]={currentKey:a.styleKey,destroy(){}} as never;warm.presented();
assert.equal(counts.get(a.styleKey),1,"actual text pipe ownership releases exactly the warm reference");
const oldKey=b.styleKey;b.text="更名";warm.setCandidates([{text:b,page:9}]);await wait();
assert.equal(counts.get(oldKey),0,"changed text must release its stale lease");
assert.equal(prepared.at(-1),"更名");
warm.pause();b.text="暂停中";warm.setCandidates([{text:b,page:9}]);await wait();assert.notEqual(prepared.at(-1),"暂停中");
visible=false;warm.start();await wait();assert.notEqual(prepared.at(-1),"暂停中");
visible=true;warm.start();await wait();assert.equal(prepared.at(-1),"暂停中");
warm.dispose();assert.equal(counts.get(b.styleKey),0);assert.deepEqual(errors,[]);a.destroy();b.destroy();
{
  let current=renderer;
  const subject=createNativeTextPrewarm({renderer:()=>current,canRun:()=>true,onError:e=>{throw e;}});
  const text=new Text({text:"设备恢复"});subject.setCandidates([{text,page:0}]);subject.start();await wait();
  const oldCount=counts.get(text.styleKey);
  let nextReferences=0;
  current={uid:124,canvasText:{getReferenceCount:()=>nextReferences,getManagedTexture:()=>{nextReferences++;return {destroyed:false};},
    decreaseReferenceCount:()=>{nextReferences--;}}} as unknown as WebGPURenderer;
  subject.start();await wait();
  assert.equal(counts.get(text.styleKey),oldCount,"a replaced renderer owns its old cache cleanup");
  assert.equal(nextReferences,1,"recovery must prepare the replacement renderer cache");
  subject.dispose();assert.equal(nextReferences,0);text.destroy();
}
{
  const subject=createNativeTextPrewarm({renderer:()=>renderer,canRun:()=>true,onError:e=>{throw e;}});
  const text=new Text({text:"移除未显示的标签"});subject.setCandidates([{text,page:0}]);subject.start();await wait();
  const key=text.styleKey;text.destroy();subject.presented();
  assert.equal(counts.get(key),0,"destroyed offscreen text must release its preparation lease without reading GPU data");
  subject.dispose();
}
let now=0,report:unknown;const timing=createNativeResumeTiming(value=>{report=value;},()=>now);
timing.begin("hidden");now=3;timing.measure("show",()=>{now=8;});timing.mark("renderStart");now=10;timing.mark("renderStart");timing.presented();
assert.deepEqual(report,{id:1,start:0,context:"hidden",spans:{show:5},marks:{renderStart:8},totalMs:10});
timing.begin("replaced");timing.cancel();now=20;timing.presented();assert.equal((report as {id:number}).id,1);
timing.begin("prepared");now=25;timing.presented(false);assert.equal((report as {id:number}).id,1,"hidden preparation must not finish a visible-resume measurement");
timing.mark("windowShown");now=30;timing.presented(true);
assert.deepEqual(report,{id:3,start:20,context:"prepared",spans:{},marks:{windowShown:5},totalMs:10});
console.log("Native text prewarm ownership, priority, pause and resume timing passed");
