import assert from "node:assert/strict";
import { createNativeCatalogRefresh } from "./nativeCatalogRefresh.js";
let request={roots:[{id:"one",type:"customDirectory" as const,label:"Root",path:"C:/fixture",enabled:true}],filters:{keywordBlacklist:[],keywordAllowlist:[]}};
let ticks:{run:()=>void;delay:number}[]=[],changed=()=>{},closed=0;
const scans:{resolve:(value:string)=>void}[]=[],applied:string[]=[],errors:unknown[]=[];
const refresh=createNativeCatalogRefresh({request:()=>request,
  scan:()=>new Promise<string>(resolve=>scans.push({resolve})),apply:value=>{applied.push(value);},report:error=>errors.push(error),
  watchRoot:(_path,notify)=>{changed=notify;return{close(){closed++;}};},
  schedule:(run,delay)=>{const tick={run,delay};ticks.push(tick);return()=>{ticks=ticks.filter(value=>value!==tick);};},intervalMs:1000});
const tick=(delay:number)=>{const item=ticks.find(item=>item.delay===delay);assert.ok(item);ticks=ticks.filter(tick=>tick!==item);item.run();};
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
refresh.start(true);changed();changed();tick(250);assert.equal(scans.length,1,"notifications coalesce");
changed();scans[0]!.resolve("obsolete");await flush();assert.deepEqual(applied,[],"events during a scan obsolete its result");
tick(250);scans[1]!.resolve("current");await flush();assert.deepEqual(applied,["current"]);
request={...request,roots:[{...request.roots[0]!,path:"C:/other"}]};refresh.sync();assert.equal(closed,1);
tick(250);scans[2]!.resolve("new root");await flush();assert.deepEqual(applied,["current","new root"]);
tick(1000);tick(250);assert.equal(scans.length,4,"periodic enumeration runs even without notifications");
refresh.dispose();scans[3]!.resolve("closed");await flush();assert.equal(applied.length,2);assert.equal(ticks.length,0);assert.equal(errors.length,0);
console.log("Catalog notifications: coalescing, stale scans, configuration, periodic fallback and disposal passed");
