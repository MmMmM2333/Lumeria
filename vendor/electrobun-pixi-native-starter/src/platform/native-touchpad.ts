import { dlopen, JSCallback, ptr, type Pointer } from "bun:ffi";
import { join,dirname } from "node:path";
import { existsSync } from "node:fs";
import type { NativeHostInputEvent } from "../input/native-events";

export type NativeTouchpadPhase="begin"|"update"|"inertia"|"end"|"cancel";
export type NativeTouchpadMetadata={source:"touchpad";phase:NativeTouchpadPhase;sequence:number};
const listeners=new Set<()=>void>();
// Queued threadsafe deliveries can outlive detach: retain this trampoline for the process.
let wake:JSCallback|null=null;
function openLibrary(){
  const path=[join(process.cwd(),"libNativeWrapper.dll"),join(dirname(process.execPath),"libNativeWrapper.dll")].find(existsSync);
  if(!path)throw new Error("Native touchpad wrapper is unavailable");
  return dlopen(path,{nativeTouchpadAbi:{args:[],returns:"i32"},nativeTouchpadAttach:{args:["ptr","ptr"],returns:"i32"},nativeTouchpadPoll:{args:["ptr","ptr"],returns:"i32"},nativeTouchpadDetach:{args:["ptr"],returns:"void"}});
}
let library:ReturnType<typeof openLibrary>|null=null;
export function attachNativeTouchpad(window:number,route:bigint,onWake:()=>void){
  if(process.platform!=="win32")return null;
  wake??=new JSCallback(()=>{for(const listener of [...listeners])listener();},{args:[],returns:"void",threadsafe:true});
  library??=openLibrary();const api=library.symbols;
  if(api.nativeTouchpadAbi()!==1)throw new Error("Native touchpad ABI mismatch");
  const status=api.nativeTouchpadAttach(window as Pointer,wake.ptr);
  if(status<0){console.warn(`Direct Manipulation unavailable (${status}); keeping wheel input`);return null;}
  listeners.add(onWake);let closed=false;const buffer=new Float64Array(10);
  return {
    poll():NativeHostInputEvent|null{
      if(closed)return null;
      const result=api.nativeTouchpadPoll(window as Pointer,ptr(buffer));
      if(result<0)throw new Error(`Native touchpad poll failed (${result})`);if(!result)return null;
      const [phase,time,x,y,dx,dy,modifiers,sequence,,error]=buffer;
      if((error??0)<0)console.warn(`Direct Manipulation gesture cancelled (${error})`);
      // Same GetTickCount64 epoch as native-frame's wheel/pointer input clock.
      return {route,kind:9,timestamp:BigInt(Math.max(0,Math.round(time!))),x:x!,y:y!,movementX:0,movementY:0,
        wheelX:dx!,wheelY:dy!,deltaMode:0,modifiers:modifiers!,button:0,buttons:0,keyCode:0,scanCode:0,repeat:false,detail:0,
        touchpad:{source:"touchpad",phase:(["cancel","begin","update","inertia","end","cancel"] as const)[phase!]??"cancel",sequence:sequence!}};
    },
    destroy(){if(closed)return;closed=true;listeners.delete(onWake);api.nativeTouchpadDetach(window as Pointer);},
  };
}
export function readNativeTouchpad(event:{nativeEvent?:unknown}):NativeTouchpadMetadata|null{
  const native=event.nativeEvent as {nativeTouchpad?:NativeTouchpadMetadata}|null;
  return native?.nativeTouchpad?.source==="touchpad"?native.nativeTouchpad:null;
}
