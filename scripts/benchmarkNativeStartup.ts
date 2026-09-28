import assert from "node:assert/strict";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { requestNativeSession } from "../src/native/nativeSession.js";
import { runNativeProcess } from "./runNativeProcess.js";
import { spawn } from "node:child_process";

// Reads an optional layout into an isolated copy; never starts against the user's data.
const [runtimeArg, label = "sample", layoutPath, countArgument="3"] = process.argv.slice(2);
const count=Number(countArgument);
if(!Number.isInteger(count)||count<1||count>30)throw new Error("Startup count must be 1–30");
if (!runtimeArg || !/^[a-z0-9-]+$/i.test(label)) throw new Error("Usage: benchmarkNativeStartup <runtime directory> <label> [layout.json] [manual count]");
const runtime = resolve(runtimeArg);
mkdirSync("artifacts", {recursive:true});
const output = mkdtempSync(resolve(`artifacts/startup-${label}-`));
const data = join(output,"data"); mkdirSync(data);
const layout = JSON.parse(readFileSync(layoutPath ?? "src/domain/fixtures/layout-v2-roundtrip.json","utf8"));
layout.settings.mainWindowShortcut=null;
layout.settings.hotCorners={...layout.settings.hotCorners,enabled:false};
if (!layoutPath) { layout.settings.scanRoots=[]; layout.settings.windowMode="windowed"; layout.settings.backgroundSource="systemMaterial"; }
writeFileSync(join(data,"layout.json"),JSON.stringify(layout));
type Entry={time:string;event:string;pid:number;detail:{cached?:boolean;phase?:string;ms?:number}|null};
const journal=()=>existsSync(join(data,"logs/native-runtime.log"))?readFileSync(join(data,"logs/native-runtime.log"),"utf8").trim().split("\n").filter(Boolean).map(line=>JSON.parse(line) as Entry):[];
const samples=[];
const visibilityPath=join(output,"visibility.jsonl"),stopPath=join(output,"observer.stop");
const observer=spawn("python",[resolve("scripts/observeNativeStartup.py"),join(runtime,"bin/Lumeria.exe"),visibilityPath,stopPath],{windowsHide:true,stdio:"inherit"});
let observerError:Error|undefined;observer.on("error",error=>{observerError=error;});
try{
  const deadline=Date.now()+10_000;
  while(!existsSync(visibilityPath+".ready")&&Date.now()<deadline&&!observerError)await new Promise(resolve=>setTimeout(resolve,20));
  if(observerError)throw observerError;
  assert.ok(existsSync(visibilityPath+".ready"),"native visibility observer must start");
for(const origin of [...Array.from({length:count},()=>"manual"),"login"]){
  const controller=new AbortController();const deadline=setTimeout(()=>controller.abort(),90_000);
  const start=Date.now();
  const log=openSync(join(output,`run-${samples.length}.log`),"w");
  const running=runNativeProcess(join(runtime,"bin/launcher.exe"),[],{cwd:join(runtime,"bin"),stdio:["ignore",log,log],env:{...process.env,
    LUMERIA_NATIVE_DATA_DIR:data,LUMERIA_LAUNCH_ORIGIN:origin,LAUNCHPAD_NATIVE_MODE:undefined,PIXI_AGENT_DEBUG:"0",
    LAUNCHPAD_NATIVE_DATA_HOST:resolve("target/release/lumeria_native_data.exe"),
  }},controller.signal);
  let ended=false;void running.finally(()=>{ended=true;}).catch(()=>{});
  try{
    let pid=0;
    while(!controller.signal.aborted&&!ended){
      const status=await requestNativeSession({data,installationRoot:runtime},"status");
      if(status?.ready){pid=status.pid;break;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(pid,"runtime must become ready");
    while(!controller.signal.aborted&&!ended&&!journal().some(e=>e.pid===pid&&e.event==="startup-prepared"))await new Promise(resolve=>setTimeout(resolve,50));
    assert.ok(!ended&&!controller.signal.aborted,"startup must finish");
    const events=journal().filter(e=>e.pid===pid);
    assert.ok(!events.some(e=>["fatal","uncaught-exception","frame-error"].includes(e.event)));
    const first=events.find(e=>e.event==="first-scene-presented")!;
    const processStart=events.find(e=>e.event==="process-start")!;
    const ready=events.find(e=>e.event==="startup-prepared")!;
    const sample={origin,cached:events.find(e=>e.event==="startup-catalog")?.detail?.cached,
      launchToSceneMs:Date.parse(first.time)-start,launchToReadyMs:Date.parse(ready.time)-start,
      processToSceneMs:Date.parse(first.time)-Date.parse(processStart.time),phases:events.filter(e=>e.event==="startup-phase").map(e=>e.detail)};
    samples.push(sample);console.log(JSON.stringify(sample));
    if(events.some(e=>e.event==="startup-catalog"&&e.detail?.cached)){
      while(!controller.signal.aborted&&!journal().some(e=>e.pid===pid&&["catalog-refreshed","catalog-refresh-failed"].includes(e.event)))await new Promise(resolve=>setTimeout(resolve,100));
      assert.ok(journal().some(e=>e.pid===pid&&e.event==="catalog-refreshed"),"cached startup must finish background refresh");
    }
    await new Promise(resolve=>setTimeout(resolve,100));
    const visibility=existsSync(visibilityPath)?readFileSync(visibilityPath,"utf8").trim().split("\n").filter(Boolean).map(line=>JSON.parse(line)).filter(e=>e.pid===pid&&e.event==="show"):[];
    if(origin==="login")assert.equal(visibility.length,0,"login must never show the native top-level window");
    else{assert.ok(visibility.length>0,"manual startup must show");assert.ok(visibility.every(e=>e.time>=Date.parse(first.time)),"no window/taskbar flash before the first prepared scene");}
    await requestNativeSession({data,installationRoot:runtime},"shutdown");
    assert.equal(await running,0);
  }finally{clearTimeout(deadline);if(!ended){controller.abort();await running;}closeSync(log);}
}
writeFileSync(join(output,"summary.json"),JSON.stringify(samples,null,2));
console.log(`Startup evidence: ${output}`);
}finally{writeFileSync(stopPath,"");await new Promise<void>(resolve=>{if(observer.exitCode!==null)resolve();else observer.once("close",()=>resolve());});}
