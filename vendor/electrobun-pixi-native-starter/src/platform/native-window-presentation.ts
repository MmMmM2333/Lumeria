import { dlopen, ptr, type Pointer } from "bun:ffi";
import { release } from "node:os";
import { centerWindowOnWorkArea } from "./native-monitor-geometry";

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
  MonitorFromPoint:{args:["i64","u32"],returns:"ptr"},
  GetForegroundWindow:{args:[],returns:"ptr"},
  IsIconic:{args:["ptr"],returns:"i32"},
  IsZoomed:{args:["ptr"],returns:"i32"},
  GetWindowPlacement:{args:["ptr","ptr"],returns:"i32"},
  ShowWindow:{args:["ptr","i32"],returns:"i32"},
  GetMonitorInfoW:{args:["ptr","ptr"],returns:"i32"},
}):null;
const dwm=process.platform==="win32"?dlopen("dwmapi.dll",{
  DwmSetWindowAttribute:{args:["ptr","u32","ptr","u32"],returns:"i32"},
  DwmGetWindowAttribute:{args:["ptr","u32","ptr","u32"],returns:"i32"},
  DwmExtendFrameIntoClientArea:{args:["ptr","ptr"],returns:"i32"},
}):null;
const materials={none:1,mica:2,acrylic:3,micaAlt:4} as const;
// Only the bits changed by fullscreen belong to its saved style. WS_VISIBLE,
// WS_MINIMIZE and WS_DISABLED remain owned by the live window lifecycle.
const windowModeStyleMask=0x81c70000n;
/** Only the application-owned root window is eligible for presentation changes. */
export function createNativeWindowPresentation(inputWindow:number,releaseCapture:()=>void,setFullscreenLayer:(enabled:boolean)=>void){
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
    const liveStyle=BigInt.asUintN(32,BigInt(user.symbols.GetWindowLongPtrW(window,-16)));
    const nextStyle=BigInt.asUintN(32,(liveStyle&~windowModeStyleMask)|(style&windowModeStyleMask));
    user.symbols.SetWindowLongPtrW(window,-16,nextStyle);
    if(BigInt.asUintN(32,BigInt(user.symbols.GetWindowLongPtrW(window,-16)))!==nextStyle)throw new Error("Cannot change the window style");
    if(!user.symbols.SetWindowPos(window,null,rect[0]!,rect[1]!,rect[2]!-rect[0]!,rect[3]!-rect[1]!,0x34))throw new Error("Cannot change the window frame");
    const actual=readPlacement().rect;
    if(actual.some((value,index)=>value!==rect[index]))throw new Error("Window did not retain the requested frame");
  };
  let syncingFullscreen=false;
  const syncFullscreenBounds=():boolean=>{
    if(!fullscreen||syncingFullscreen||user.symbols.IsIconic(window))return false;
    if(!user.symbols.IsWindow(window))throw new Error("Presentation window is closed");
    const monitor=user.symbols.MonitorFromWindow(window,2),info=new Int32Array(10);info[0]=40;
    if(!monitor||!user.symbols.GetMonitorInfoW(monitor,ptr(info)))throw new Error("Cannot read fullscreen display bounds");
    const target=new Int32Array([info[1]!-overscanPixels,info[2]!-overscanPixels,info[3]!+overscanPixels,info[4]!+overscanPixels]);
    if(readPlacement().rect.every((value,index)=>value===target[index]))return false;
    // WM_DPICHANGED's suggested rectangle preserves a normal window's logical
    // size. Fullscreen instead owns the monitor's current physical rectangle.
    // Avoid activation/Z-order changes and leave the saved windowed placement intact.
    syncingFullscreen=true;
    try{
      if(!user.symbols.SetWindowPos(window,null,target[0]!,target[1]!,target[2]!-target[0]!,target[3]!-target[1]!,0x14))throw new Error("Cannot refresh fullscreen bounds");
      if(readPlacement().rect.some((value,index)=>value!==target[index]))throw new Error("Fullscreen bounds were not retained");
      return true;
    }finally{syncingFullscreen=false;}
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
      // Keep non-client rendering active for Acrylic show/focus recovery.
      // Extending only the bottom edge avoids the accent-colored caption.
      const margin=new Int32Array([0,0,0,material!=="none"?1:0]);
      const result=dwm.symbols.DwmExtendFrameIntoClientArea(window,ptr(margin));
      if(result<0)throw new Error(`DwmExtendFrameIntoClientArea failed (${result})`);
      if(readAttribute(38)!==materials[material])throw new Error("DWM did not retain the requested backdrop");
    }
  };
  return {
    support,
    get handle(){return Number(window);},
    get displayId(){const monitor=user.symbols.MonitorFromWindow(window,2);if(!monitor)throw new Error("Window display is unavailable");return Number(monitor);},
    prepareWindowActivation(targetPoint?:Readonly<{x:number;y:number;displayId?:number}>,preserveForeground=false){
      if(!user.symbols.IsWindow(window))throw new Error("Presentation window is closed");
      const foreground=user.symbols.GetForegroundWindow()===window;
      if(preserveForeground&&foreground)return {foreground,displayChanged:false};
      const point=new Int32Array(2);
      if(targetPoint){
        if(![targetPoint.x,targetPoint.y].every(value=>Number.isInteger(value)&&value>=-2147483648&&value<=2147483647))throw new Error("Invalid activation point");
        point[0]=targetPoint.x;point[1]=targetPoint.y;
      }else if(!user.symbols.GetCursorPos(ptr(point)))throw new Error("Cannot read the cursor position");
      const packed=BigInt.asIntN(64,BigInt(point[0]!>>>0)|(BigInt(point[1]!>>>0)<<32n));
      const target=user.symbols.MonitorFromPoint(packed,targetPoint?0:2),currentMonitor=user.symbols.MonitorFromWindow(window,2);
      if(!target||!currentMonitor)throw new Error("Cannot resolve shortcut display");
      if(targetPoint?.displayId!==undefined&&Number(target)!==targetPoint.displayId)throw new Error("Hot corner display changed before activation");
      const displayChanged=target!==currentMonitor;
      if(displayChanged){
        const info=new Int32Array(10);info[0]=40;
        if(!user.symbols.GetMonitorInfoW(target,ptr(info)))throw new Error("Cannot read shortcut display bounds");
        const work=info.slice(5,9),monitor=info.slice(1,5);
        const minimized=Boolean(user.symbols.IsIconic(window));
        const placement=new Int32Array(11);placement[0]=44;
        if(!user.symbols.GetWindowPlacement(window,ptr(placement)))throw new Error("Cannot read shortcut window placement");
        const maximized=Boolean(user.symbols.IsZoomed(window))||(minimized&&(placement[1]!&2)!==0);
        // Restore before measuring; WM_DPICHANGED may synchronously resize on relocation.
        if(minimized||maximized)user.symbols.ShowWindow(window,9);
        const previous=readPlacement();
        const move=(rect:Int32Array)=>{
          if(!user.symbols.SetWindowPos(window,null,rect[0]!,rect[1]!,rect[2]!-rect[0]!,rect[3]!-rect[1]!,0x214))throw new Error("Cannot relocate shortcut window");
        };
        if(fullscreen){
          move(new Int32Array([monitor[0]!-overscanPixels,monitor[1]!-overscanPixels,monitor[2]!+overscanPixels,monitor[3]!+overscanPixels]));
          if(windowedPlacement)windowedPlacement={...windowedPlacement,rect:centerWindowOnWorkArea(windowedPlacement.rect,work)};
        }else{
          move(centerWindowOnWorkArea(previous.rect,work));
          move(centerWindowOnWorkArea(readPlacement().rect,work));
          if(maximized)user.symbols.ShowWindow(window,3);
        }
      }
      // The monitor can keep its identity while its scale/bounds change.
      syncFullscreenBounds();
      return {foreground,displayChanged};
    },
    get fullscreen(){return fullscreen;},
    get overscanPixels(){return overscanPixels;},
    syncFullscreenBounds,
    setMode(nextFullscreen:boolean,pixels:number){
      if(!Number.isInteger(pixels)||pixels<0||pixels>16)throw new RangeError("Overscan must be 0–16 physical pixels");
      if(!user.symbols.IsWindow(window))throw new Error("Presentation window is closed");
      const nextPixels=nextFullscreen?pixels:0;
      if(nextFullscreen===fullscreen&&nextPixels===overscanPixels){syncFullscreenBounds();return;}
      const previous=readPlacement();
      let target:WindowPlacement;
      if(nextFullscreen){
        const monitor=user.symbols.MonitorFromWindow(window,2),info=new Int32Array(10);info[0]=40;
        if(!monitor||!user.symbols.GetMonitorInfoW(monitor,ptr(info)))throw new Error("Cannot read the window display bounds");
        // Fullscreen owns the monitor bounds. WS_THICKFRAME / WS_MAXIMIZEBOX
        // allow Win+Arrow to snap/maximize it; Windows then constrains the frame
        // while syncFullscreenBounds tries to restore it, exhausting GPU recovery.
        // Keep caption/minimize support for shell recognition and Win+Down, and
        // restore the original resizable style when leaving fullscreen.
        target={style:BigInt.asUintN(32,(previous.style&~0x01050000n)|0x80c20000n),
          rect:new Int32Array([info[1]!-pixels,info[2]!-pixels,info[3]!+pixels,info[4]!+pixels])};
      }else{
        if(!windowedPlacement)throw new Error("Windowed placement is unavailable");
        target=windowedPlacement;
      }
      try{writePlacement(target);setFullscreenLayer(nextFullscreen);}
      catch(error){try{writePlacement(previous);setFullscreenLayer(fullscreen);}catch(rollback){throw new AggregateError([error,rollback],"Window mode and restoration failed");}throw error;}
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
      if(fullscreen){setFullscreenLayer(false);fullscreen=false;}
      if(initialMaterial!==null)setAttribute(38,initialMaterial);
      if(initialDark!==null)setAttribute(20,initialDark);
      if(decorationsSupported){setAttribute(34,-1);setAttribute(33,0);}
    },
  };
}
