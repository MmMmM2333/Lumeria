import { dlopen, ptr, type Pointer } from "bun:ffi";
import { release } from "node:os";

export type NativeWindowMaterial="none"|"acrylic"|"mica"|"micaAlt";
export type NativeWindowAppearance="light"|"dark";
export type NativeResizeDirection = "North" | "South" | "West" | "East" | "NorthWest" | "NorthEast" | "SouthWest" | "SouthEast";
const resizeHits: Record<NativeResizeDirection, number> = { West:10, East:11, North:12, NorthWest:13, NorthEast:14, South:15, SouthWest:16, SouthEast:17 };
export function nativeWindowMaterialSupport(platform=process.platform,build=Number(release().split(".")[2])){
  const supported=platform==="win32"&&build>=22621;
  return Object.freeze({platform,supportsAcrylic:supported,supportsMica:supported,supportsMicaAlt:supported});
}
const user=process.platform==="win32"?dlopen("user32.dll",{
  GetAncestor:{args:["ptr","u32"],returns:"ptr"},IsWindow:{args:["ptr"],returns:"i32"},
  GetWindowThreadProcessId:{args:["ptr","ptr"],returns:"u32"},
  GetWindowRect:{args:["ptr","ptr"],returns:"i32"},
  SetWindowPos:{args:["ptr","ptr","i32","i32","i32","i32","u32"],returns:"i32"},
  GetCursorPos:{args:["ptr"],returns:"i32"},
  PostMessageW:{args:["ptr","u32","u64","i64"],returns:"i32"},
  GetWindowLongPtrW:{args:["ptr","i32"],returns:"i64"},
  SetWindowLongPtrW:{args:["ptr","i32","i64"],returns:"i64"},
  MonitorFromWindow:{args:["ptr","u32"],returns:"ptr"},
  GetMonitorInfoW:{args:["ptr","ptr"],returns:"i32"},
}):null;
const dwm=process.platform==="win32"?dlopen("dwmapi.dll",{
  DwmSetWindowAttribute:{args:["ptr","u32","ptr","u32"],returns:"i32"},
  DwmGetWindowAttribute:{args:["ptr","u32","ptr","u32"],returns:"i32"},
  DwmExtendFrameIntoClientArea:{args:["ptr","ptr"],returns:"i32"},
}):null;
const materials={none:1,mica:2,acrylic:3,micaAlt:4} as const;
/** Only the application-owned root window is eligible for presentation changes. */
export function createNativeWindowPresentation(inputWindow:number,releaseCapture:()=>void){
  if(!user||!dwm)return null;
  const window=user.symbols.GetAncestor(inputWindow as Pointer,2),owner=new Uint32Array(1);
  if(!window||!user.symbols.IsWindow(window)||!user.symbols.GetWindowThreadProcessId(window,ptr(owner))||owner[0]!==process.pid){
    throw new Error("Presentation requires a live application-owned window");
  }
  // The native custom GPU window is created with WS_EX_NOREDIRECTIONBITMAP.
  // Do not switch redirection modes after the HWND and DComp surface are created.
  const support=nativeWindowMaterialSupport();
  const setAttribute=(attribute:number,value:number)=>{
    const data=new Int32Array([value]);
    const result=dwm.symbols.DwmSetWindowAttribute(window,attribute,ptr(data),4);
    if(result<0)throw new Error(`DwmSetWindowAttribute(${attribute}) failed (${result})`);
  };
  const readAttribute=(attribute:number)=>{
    const data=new Int32Array(1),result=dwm.symbols.DwmGetWindowAttribute(window,attribute,ptr(data),4);
    return result<0?null:data[0]!;
  };
  const initialDark=readAttribute(20),initialMaterial=readAttribute(38);
  // Border color and corner preference are setter-only DWM attributes. A failed
  // read is not a capability probe; it used to skip both policies at startup.
  const decorationsSupported=Number(release().split(".")[2])>=22000;
  let current={material:"none" as NativeWindowMaterial,appearance:"light" as NativeWindowAppearance};
  let overscanPixels=0;
  let fullscreen=false;
  type WindowPlacement={style:bigint;rect:Int32Array};
  let windowedPlacement:WindowPlacement|null=null;
  const readPlacement=():WindowPlacement=>{
    const rect=new Int32Array(4);
    if(!user.symbols.GetWindowRect(window,ptr(rect)))throw new Error("Cannot read the window frame");
    return {rect,style:BigInt.asUintN(32,BigInt(user.symbols.GetWindowLongPtrW(window,-16)))};
  };
  const writePlacement=({style,rect}:WindowPlacement)=>{
    user.symbols.SetWindowLongPtrW(window,-16,style);
    if(BigInt.asUintN(32,BigInt(user.symbols.GetWindowLongPtrW(window,-16)))!==style)throw new Error("Cannot change the window style");
    if(!user.symbols.SetWindowPos(window,null,rect[0]!,rect[1]!,rect[2]!-rect[0]!,rect[3]!-rect[1]!,0x34))throw new Error("Cannot change the window frame");
    const actual=readPlacement().rect;
    if(actual.some((value,index)=>value!==rect[index]))throw new Error("Window did not retain the requested frame");
  };
  const startNonClient=(hit:number)=>{
    if(!user.symbols.IsWindow(window))throw new Error("Presentation window is closed");
    const point=new Int32Array(2);
    if(!user.symbols.GetCursorPos(ptr(point)))throw new Error("Cannot read the cursor position");
    releaseCapture();
    const position=BigInt(((point[1]!&0xffff)<<16)|(point[0]!&0xffff));
    if(!user.symbols.PostMessageW(window,0xa1,BigInt(hit),position))throw new Error("Cannot start window move or resize");
  };
  const apply=(material:NativeWindowMaterial,appearance:NativeWindowAppearance)=>{
    setAttribute(20,appearance==="dark"?1:0);
    // Application close phases remove native frame decoration together with the material.
    if(decorationsSupported){setAttribute(34,material==="none"||fullscreen?-2:-1);setAttribute(33,material==="none"||fullscreen?1:2);}
    if(initialMaterial!==null){
      setAttribute(38,materials[material]);
      // With WM_NCPAINT active, leaving full-window glass after removing the
      // backdrop produces an opaque black surface instead of DComp transparency.
      const margin=new Int32Array([material!=="none"?-1:0,0,0,0]);
      const result=dwm.symbols.DwmExtendFrameIntoClientArea(window,ptr(margin));
      if(result<0)throw new Error(`DwmExtendFrameIntoClientArea failed (${result})`);
      if(readAttribute(38)!==materials[material])throw new Error("DWM did not retain the requested backdrop");
    }
  };
  return {
    support,
    get fullscreen(){return fullscreen;},
    get overscanPixels(){return overscanPixels;},
    setMode(nextFullscreen:boolean,pixels:number){
      if(!Number.isInteger(pixels)||pixels<0||pixels>16)throw new RangeError("Overscan must be 0–16 physical pixels");
      if(!user.symbols.IsWindow(window))throw new Error("Presentation window is closed");
      const nextPixels=nextFullscreen?pixels:0;
      if(nextFullscreen===fullscreen&&nextPixels===overscanPixels)return;
      const previous=readPlacement();
      let target:WindowPlacement;
      if(nextFullscreen){
        const monitor=user.symbols.MonitorFromWindow(window,2),info=new Int32Array(10);info[0]=40;
        if(!monitor||!user.symbols.GetMonitorInfoW(monitor,ptr(info)))throw new Error("Cannot read the window display bounds");
        target={style:BigInt.asUintN(32,(previous.style&~0x01000000n)|0x80c70000n),
          rect:new Int32Array([info[1]!-pixels,info[2]!-pixels,info[3]!+pixels,info[4]!+pixels])};
      }else{
        if(!windowedPlacement)throw new Error("Windowed placement is unavailable");
        target=windowedPlacement;
      }
      try{writePlacement(target);}
      catch(error){try{writePlacement(previous);}catch(rollback){throw new AggregateError([error,rollback],"Window mode and restoration failed");}throw error;}
      if(nextFullscreen&&!fullscreen)windowedPlacement=previous;
      if(!nextFullscreen)windowedPlacement=null;
      fullscreen=nextFullscreen;overscanPixels=nextPixels;
      if(decorationsSupported){setAttribute(34,fullscreen||current.material==="none"?-2:-1);setAttribute(33,fullscreen||current.material==="none"?1:2);}
    },
    startDrag(){startNonClient(2);},
    startResize(direction:NativeResizeDirection){
      if(!Object.hasOwn(resizeHits,direction))throw new TypeError("Invalid resize direction");
      startNonClient(resizeHits[direction]);
    },
    set(material:NativeWindowMaterial,appearance:NativeWindowAppearance){
      if(!Object.hasOwn(materials,material)||!["light","dark"].includes(appearance))throw new TypeError("Invalid window presentation");
      if(!user.symbols.IsWindow(window))throw new Error("Presentation window is closed");
      if(material!=="none"&&!support.supportsAcrylic)throw new Error("System backdrop requires Windows 11 build 22621");
      try{apply(material,appearance);current={material,appearance};}
      catch(error){try{apply(current.material,current.appearance);}catch(rollback){throw new AggregateError([error,rollback],"Window presentation and rollback failed");}throw error;}
    },
    dispose(){
      if(!user.symbols.IsWindow(window))return;
      if(initialMaterial!==null)setAttribute(38,initialMaterial);
      if(initialDark!==null)setAttribute(20,initialDark);
      if(decorationsSupported){setAttribute(34,-1);setAttribute(33,0);}
    },
  };
}
