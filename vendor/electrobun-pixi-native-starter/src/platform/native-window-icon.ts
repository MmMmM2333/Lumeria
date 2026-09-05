import { dlopen, ptr, type Pointer } from "bun:ffi";

const library=process.platform==="win32"?dlopen("user32.dll",{
  GetAncestor:{args:["ptr","u32"],returns:"ptr"},
  IsWindow:{args:["ptr"],returns:"i32"},
  CreateIconFromResourceEx:{args:["ptr","u32","i32","u32","i32","i32","u32"],returns:"ptr"},
  DestroyIcon:{args:["ptr"],returns:"i32"},
  SendMessageW:{args:["ptr","u32","u64","i64"],returns:"i64"},
}):null;
const signature=[137,80,78,71,13,10,26,10];

/** Own only handles created here; never destroy the window's pre-existing icons. */
export function createNativeWindowIcon(inputWindow:number){
  if(!library)return null;
  const api=library.symbols;
  const window=api.GetAncestor(inputWindow as Pointer,2);
  if(!window)throw new Error("Native icon requires a root window");
  let owned:Pointer|bigint|null=null;
  const previous=[0,1].map(size=>api.SendMessageW(window,0x7f,BigInt(size),0));
  return {
    set(png:Uint8Array):void{
      if(png.length<24||png.length>4*1024*1024||signature.some((byte,index)=>png[index]!==byte)){
        throw new TypeError("Window icon must be a PNG of at most 4 MB");
      }
      if(!api.IsWindow(window))throw new Error("Native icon window is closed");
      const icon=api.CreateIconFromResourceEx(ptr(png),png.length,1,0x30000,0,0,0);
      if(!icon)throw new Error("Windows could not decode the icon");
      for(const size of [0,1])api.SendMessageW(window,0x80,BigInt(size),BigInt(icon));
      const matches=[0,1].every(size=>BigInt(api.SendMessageW(window,0x7f,BigInt(size),0))===BigInt(icon));
      if(!matches){
        for(const size of [0,1])api.SendMessageW(window,0x80,BigInt(size),owned?BigInt(owned):previous[size]!);
        api.DestroyIcon(icon);throw new Error("Windows did not apply the requested icon");
      }
      const old=owned;owned=icon;if(old)api.DestroyIcon(old);
    },
    dispose():void{
      if(!owned)return;
      if(api.IsWindow(window))for(const size of [0,1])api.SendMessageW(window,0x80,BigInt(size),previous[size]!);
      api.DestroyIcon(owned);owned=null;
    },
  };
}
