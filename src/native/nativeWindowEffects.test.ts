import assert from "node:assert/strict";
import { createNativeWindowEffects } from "./nativeWindowEffects.js";

export function runNativeWindowEffectsTests():void{
  let visible=true,fail=false;
  const calls:string[]=[],errors:unknown[]=[],timers:{run:()=>void;delay:number;cancelled:boolean}[]=[];
  const effects=createNativeWindowEffects({visible:()=>visible,apply:(material,appearance)=>{if(fail)throw new Error("DWM failure");calls.push(`${material}:${appearance}`);},onError:error=>errors.push(error),schedule:(run,delay)=>{const timer={run,delay,cancelled:false};timers.push(timer);return()=>{timer.cancelled=true;};}});
  effects.set("acrylic","dark");assert.deepEqual(timers.map(timer=>timer.delay),[80,180]);
  const old=timers.slice();effects.set("none","dark");old.forEach(timer=>timer.run());assert.deepEqual(calls,["acrylic:dark","none:dark"],"old settle passes cannot restore material during closing");
  effects.set("acrylic","dark");effects.refresh();const focused=timers.slice(-2);focused.forEach(timer=>timer.run());assert.deepEqual(calls.slice(-4),Array(4).fill("acrylic:dark"));
  visible=false;const before=calls.length;effects.refresh();focused.forEach(timer=>timer.run());assert.equal(calls.length,before,"hidden window must not receive recovery writes");
  visible=true;effects.set("acrylic","light");const light=timers.slice(-2);effects.set("mica","dark");light.forEach(timer=>timer.run());assert.equal(calls.at(-1),"mica:dark","stale theme/material cannot overwrite a newer request");
  fail=true;effects.refresh();assert.equal(errors.length,1);fail=false;
  const remaining=timers.slice();effects.dispose();const final=calls.length;remaining.forEach(timer=>timer.run());effects.refresh();assert.equal(calls.length,final,"dispose invalidates queued callbacks");
}
