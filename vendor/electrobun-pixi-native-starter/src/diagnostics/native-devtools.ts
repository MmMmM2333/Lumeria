import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Container, Rectangle } from "pixi.js";
import type { NativePixiApplication } from "../runtime/native-app";
import { getNativePixiApplicationTesting } from "../runtime/native-app-testing";
import { startAgentDebugBridge } from "./agent-debug";
import { DebugScene, type DebugSelector } from "./debug-scene";

export interface NativeDevtoolsOptions {
  name:string; build:string; isolated?:boolean; enabled?:boolean;
  state?:()=>unknown;
  /** Named app/demo operations only; the core never evaluates arbitrary source. */
  commandExtension?:(command:Record<string,unknown>)=>unknown|Promise<unknown>;
  statusExtension?:()=>Record<string,unknown>;
  clock?:{pause():void;resume():void;advance(milliseconds:number):void};
}
const integer=(value:unknown,fallback:number,min:number,max:number)=>{
  const n=value===undefined?fallback:Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`Expected integer in [${min}, ${max}]`);return n;
};
const selector=(value:unknown):DebugSelector=>{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Node selector required");
  const v=value as DebugSelector;if(v.id!==undefined&&typeof v.id!=="string"||v.label!==undefined&&typeof v.label!=="string")throw new Error("Invalid selector");return v;
};
const sleep=(ms:number,signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  if(signal?.aborted){reject(new Error("Operation canceled"));return;}
  const done=()=>{signal?.removeEventListener("abort",abort);resolve();};
  const timer=setTimeout(done,ms);const abort=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);reject(new Error("Operation canceled"));};signal?.addEventListener("abort",abort,{once:true});
});

/** One consumer registration; the HTTP bridge, CLI and MCP share these operations. */
export async function attachNativeDevtools(app:NativePixiApplication,options:NativeDevtoolsOptions){
  if(options.enabled===false||process.env.PIXI_AGENT_DEBUG==="0")return null;
  const testing=getNativePixiApplicationTesting(app),scene=new DebugScene(app.stage);
  let closed=false,busy=false,sequence=0;
  let replay:AbortController|null=null;
  const events:{sequence:number;at:number;type:string;data:unknown}[]=[];
  type Watch={id:string;target:DebugSelector;property:"effectiveAlpha"|"visible"|"renderable";operator:"lt"|"eq";value:number|boolean;samples:unknown[];triggered:unknown|null;remaining:number;done:boolean};
  const watches=new Map<string,Watch>();
  const record=(type:string,data:unknown)=>{events.push({sequence:++sequence,at:performance.now(),type,data});if(events.length>512)events.shift();};
  const snapshot=()=>({...testing.diagnostics(),...options.statusExtension?.(),application:options.state?.()??null,eventSequence:sequence});
  const present=async(timeoutMs=5000,atFrame?:()=>void)=>{
    if(closed||app.state!=="running")throw new Error(`Cannot present: ${app.state}`);
    if(testing.diagnostics().runtime.paused)throw new Error("Resume or step the paused renderer before waiting for presentation");
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{off();reject(new Error("Presentation timed out"));},timeoutMs);
      const off=app.on("presented",()=>{clearTimeout(timer);off();try{atFrame?.();resolve();}catch(error){reject(error);}});app.invalidate();
    });
  };
  const inspect=(s:unknown)=>scene.inspect(scene.resolve(selector(s)));
  const hit=(x:number,y:number)=>{
    if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error("Finite logical coordinates required");
    app.renderer.events.rootBoundary.rootTarget=app.stage;
    const node=app.renderer.events.rootBoundary.hitTest(x,y) as Container|null;
    return {point:{x,y},node:node?scene.inspect(node):null};
  };
  const point=(step:Record<string,unknown>)=>{
    if(step.target){
      const node=scene.resolve(selector(step.target)),area=node.hitArea as {x?:number;y?:number;width?:number;height?:number}|null;
      let p;
      if(area&&[area.x,area.y,area.width,area.height].every(Number.isFinite))p=node.toGlobal({x:area.x!+area.width!/2,y:area.y!+area.height!/2});
      else{const b=node.getBounds();p={x:b.x+b.width/2,y:b.y+b.height/2};}
      if(step.type==="down"){
        app.renderer.events.rootBoundary.rootTarget=app.stage;
        let actual=app.renderer.events.rootBoundary.hitTest(p.x,p.y) as Container|null;
        while(actual&&actual!==node)actual=actual.parent;
        if(!actual)throw new Error("Target is not hit-testable at its anchor; inspect hit test before replay");
      }
      return {x:p.x+Number(step.offsetX??0),y:p.y+Number(step.offsetY??0)};
    }
    const x=Number(step.x),y=Number(step.y);if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error("Point or node target required");return {x,y};
  };
  const capture=async(command:Record<string,unknown>={})=>{
    if(command.nodes!==undefined&&(!Array.isArray(command.nodes)||command.nodes.length>32))throw new Error("At most 32 nodes can be captured");
    let captured!: {stamp:ReturnType<typeof testing.frameCounters>;state:ReturnType<typeof snapshot>;nodes:ReturnType<typeof inspect>[];image:Promise<string>;at:number};
    await present(integer(command.timeoutMs,5000,1,30000),()=>{
      // Capture metadata and submit the diagnostic render inside the presented
      // callback, before another input/timer can change the observed scene.
      const state=snapshot(),nodes=Array.isArray(command.nodes)?command.nodes.map(inspect):[];
      const target=command.target?scene.resolve(selector(command.target)):app.stage;
      const frame=command.target?undefined:new Rectangle(0,0,app.contentSize.width,app.contentSize.height);
      captured={stamp:testing.frameCounters(),state,nodes,at:performance.now(),image:app.renderer.extract.base64({target,frame,format:"png",resolution:app.resolution})};
    });
    const png=await captured.image;
    // Extract temporarily renders an offscreen target. Restore the application's
    // normal presentation before a subsequent hit-test/input command is allowed.
    await present();
    const directory=join(tmpdir(),"electrobun-pixi-evidence",String(process.pid));await mkdir(directory,{recursive:true});
    const id=crypto.randomUUID(),imagePath=join(directory,id+".png"),jsonPath=join(directory,id+".json");
    await writeFile(imagePath,Buffer.from(png.split(",")[1]!,"base64"));
    const proof={captureId:id,source:"diagnostic-rerender",afterPresentedFrame:captured.stamp.renderCount,at:captured.at,state:captured.state,nodes:captured.nodes,events:events.filter(e=>e.sequence<=captured.state.eventSequence).slice(-128),imagePath};
    await writeFile(jsonPath,JSON.stringify(proof,null,2));return {...proof,jsonPath,path:imagePath,bytes:Buffer.from(png.split(",")[1]!,"base64").length};
  };
  const runReplay=async(command:Record<string,unknown>)=>{
    if(!Array.isArray(command.steps)||!command.steps.length||command.steps.length>256)throw new Error("Replay requires 1..256 steps");
    const steps=command.steps as Record<string,unknown>[];
    const allowed=new Set(["down","move","up","cancel","wait","wheel","key"]);
    let total=0;
    const validationHeld=new Set<number>();
    for(const step of steps){
      if(!step||!allowed.has(String(step.type)))throw new Error("Unknown replay step");total+=integer(step.delayMs,0,0,10000);
      integer(step.modifiers,0,0,15);
      if(step.type==="wait")continue;
      if(step.type==="key"){integer(step.keyCode,0,1,255);continue;}
      const pointerId=integer(step.pointerId,71,2,255);
      if(step.target)selector(step.target);else if(!Number.isFinite(Number(step.x))||!Number.isFinite(Number(step.y)))throw new Error("Finite coordinates required");
      for(const field of ["offsetX","offsetY","dx","dy"])if(step[field]!==undefined&&(!Number.isFinite(Number(step[field]))||Math.abs(Number(step[field]))>10000))throw new Error(`Invalid ${field}`);
      if(step.type==="down"){if(validationHeld.has(pointerId))throw new Error("Duplicate pointer down");validationHeld.add(pointerId);}
      if(step.type==="up"||step.type==="cancel"){if(!validationHeld.delete(pointerId))throw new Error("Unmatched pointer release");}
    }
    if(validationHeld.size)throw new Error("Replay must release every pressed pointer");
    if(total>60000)throw new Error("Replay duration exceeds 60 seconds");
    replay=new AbortController();const controller=replay,held=new Map<number,{x:number;y:number}>();
    const start=performance.now();record("replay-start",{steps:steps.length,source:"injected-native-events"});
    try{
      for(const step of steps){
        await sleep(integer(step.delayMs,0,0,10000),controller.signal);
        const type=String(step.type);
        if(type==="wait"){if(step.present!==false)await present();continue;}
        if(type==="key"){
          const keyCode=integer(step.keyCode,0,1,255),modifiers=integer(step.modifiers,0,0,15);
          app.nativeInput.emitKey("down",{keyCode,modifiers});app.nativeInput.emitKey("up",{keyCode,modifiers});record("key",{keyCode,modifiers});continue;
        }
        const p=point(step),pointerId=integer(step.pointerId,71,2,255),modifiers=integer(step.modifiers,0,0,15);
        if(type==="wheel"){
          const dx=Number(step.dx??0),dy=Number(step.dy??0);if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>10000||Math.abs(dy)>10000)throw new Error("Invalid wheel delta");
          app.nativeInput.emitWheel(p.x,p.y,dx,dy,modifiers);record("wheel",{...p,dx,dy,modifiers});continue;
        }
        if(type==="down"&&held.has(pointerId))throw new Error("Pointer is already down");
        if((type==="up"||type==="cancel")&&!held.has(pointerId))throw new Error("Pointer is not down");
        app.nativeInput.emitPointer("pointer"+type,p.x,p.y,0,modifiers,undefined,{pointerId,pointerType:"touch",isPrimary:pointerId===71,buttons:type==="up"||type==="cancel"?0:held.has(pointerId)||type==="down"?1:0});
        if(type==="down"||held.has(pointerId))held.set(pointerId,p);if(type==="up"||type==="cancel")held.delete(pointerId);
        record("pointer",{type,pointerId,...p,modifiers,source:"injected-touch"});
        if(step.present===true)await present();
      }
      await present();return {completed:true,elapsedMs:performance.now()-start,eventSequence:sequence,source:"injected-native-events",state:snapshot()};
    }finally{
      for(const [pointerId,p]of held)app.nativeInput.emitPointer("pointercancel",p.x,p.y,0,0,undefined,{pointerId,pointerType:"touch",isPrimary:pointerId===71,buttons:0});
      record("replay-end",{canceled:controller.signal.aborted});replay=null;
    }
  };
  const offPresented=app.on("presented",frame=>{
    for(const watch of watches.values()){
      if(watch.done)continue;
      try{
        const node=scene.inspect(scene.resolve(watch.target));
        const sample={frame:frame.frameNumber,deviceGeneration:frame.deviceGeneration,surfaceGeneration:frame.surfaceGeneration,at:performance.now(),node,application:options.state?.()??null,eventSequence:sequence};
        watch.samples.push(sample);if(watch.samples.length>120)watch.samples.shift();
        const actual=node[watch.property];
        const matches=watch.operator==="lt"?typeof actual==="number"&&actual<Number(watch.value):actual===watch.value;
        if(!watch.triggered&&matches){watch.triggered={frame:frame.frameNumber,actual};record("watch-triggered",{id:watch.id,frame:frame.frameNumber,actual});}
        else if(watch.triggered&&--watch.remaining<=0)watch.done=true;
      }catch(error){watch.done=true;watch.triggered={error:String(error)};}
    }
  });
  const capabilities=()=>({protocol:1,actions:["status","tree","inspect","hit-test","capture","replay","cancel","wait","pause","resume","step","events","watch-start","watch-read","watch-stop","resources"],
    captureSources:["diagnostic-rerender"],inputSources:["injected-native-events"],applicationState:Boolean(options.state),controlledClock:Boolean(options.clock),limits:{nodes:2000,steps:256,replayMs:60000}});
  const command=async(command:Record<string,unknown>)=>{
    const action=String(command.action);
    if(action==="cancel"){replay?.abort();return {cancelRequested:Boolean(replay)};}
    if(action==="status")return snapshot();
    if(action==="tree")return scene.tree(integer(command.depth,4,0,12),integer(command.limit,200,1,2000),command.target?selector(command.target):undefined);
    if(action==="inspect")return inspect(command.target);
    if(action==="resources"){
      const textures=new Map<number,NonNullable<ReturnType<DebugScene["inspect"]>["texture"]>>();let texts=0;
      for(const node of scene.nodes()){const info=scene.inspect(node);if(info.text)texts++;if(info.texture)textures.set(info.texture.sourceUid,info.texture);}
      return {textureSources:[...textures.values()],textNodes:texts,scope:"scene-reachable textures only; excludes renderer pools and process GPU memory"};
    }
    if(action==="watch-start"){
      if(watches.size>=8)throw new Error("Remove an existing watch first (limit 8)");
      const target=selector(command.target);scene.resolve(target);
      const property=String(command.property),operator=String(command.operator??"lt"),value=command.value;
      if(!["effectiveAlpha","visible","renderable"].includes(property)||!["lt","eq"].includes(operator)||!(typeof value==="boolean"||typeof value==="number"&&Number.isFinite(value)))throw new Error("Invalid watch predicate");
      const id=crypto.randomUUID();watches.set(id,{id,target,property:property as Watch["property"],operator:operator as Watch["operator"],value,samples:[],triggered:null,remaining:integer(command.afterFrames,20,0,60),done:false});return {id,phase:"armed",sampling:"presented-state",maxFrames:120};
    }
    if(action==="watch-read"||action==="watch-stop"){
      const id=String(command.id),watch=watches.get(id);if(!watch)throw new Error("Watch not found");
      if(action==="watch-stop")watches.delete(id);
      return {id,triggered:watch.triggered,done:watch.done,samples:watch.samples};
    }
    if(action==="events")return {events:events.filter(e=>e.sequence>integer(command.since,0,0,Number.MAX_SAFE_INTEGER)),latest:sequence,truncated:events.length>0&&Number(command.since??0)<events[0]!.sequence-1};
    if(action==="hit-test")return hit(Number(command.x),Number(command.y));
    if(busy)throw new Error("A debug operation is running; wait or cancel it");busy=true;
    try{
      if(action==="capture")return await capture(command);
      if(action==="replay")return await runReplay(command);
      if(action==="pause"){testing.pause();options.clock?.pause();return {paused:true,scope:options.clock?"renderer-and-registered-clock":"renderer-only"};}
      if(action==="resume"){options.clock?.resume();testing.resume();return {paused:false};}
      if(action==="step"){
        const frames=integer(command.frames,1,1,120);if(command.milliseconds!==undefined){if(!options.clock)throw new Error("No controlled application clock registered");options.clock.advance(integer(command.milliseconds,16,0,10000));}
        const before=testing.frameCounters().renderCount;
        await new Promise<void>((resolve,reject)=>{
          const timer=setTimeout(()=>{off();reject(new Error("Frame step timed out"));},10000);
          const off=app.on("presented",()=>{if(testing.frameCounters().renderCount>=before+frames){clearTimeout(timer);off();resolve();}});testing.step(frames);
        });
        return {presentedFrames:testing.frameCounters().renderCount-before,paused:true,scope:"presentation",registeredClock:Boolean(options.clock),unregisteredTimersFrozen:false};
      }
      if(action==="wait"){
        const timeout=integer(command.timeoutMs,5000,1,30000),deadline=performance.now()+timeout;
        do{await present(Math.max(1,deadline-performance.now()));if(!command.target)return snapshot();const node=scene.resolve(selector(command.target));if(node.visible&&node.renderable&&scene.inspect(node).effectiveAlpha>0)return inspect(command.target);await sleep(16);}while(performance.now()<deadline);
        throw new Error("Wait condition timed out");
      }
      if(options.commandExtension)return await options.commandExtension(command);
      throw new Error(`Unsupported debug action: ${action}`);
    }finally{busy=false;}
  };
  const offFatal=app.on("fatal",event=>record("fatal",{type:event.type,message:event.message}));
  let bridge:Awaited<ReturnType<typeof startAgentDebugBridge>>;
  try{bridge=await startAgentDebugBridge({identity:{name:options.name,build:options.build,isolated:options.isolated??false},capabilities,status:snapshot,tree:({depth,limit})=>scene.tree(depth,limit),capture:()=>capture(),command});}
  catch(error){offFatal();offPresented();throw error;}
  const stop=async()=>{if(closed)return;closed=true;replay?.abort();offFatal();offPresented();watches.clear();await bridge?.stop();};
  testing.addCleanup(stop);
  return {identity:bridge?.identity,command,stop};
}
