import { expect,test } from "bun:test";
import { dlopen, ptr, type Pointer } from "bun:ffi";
import { nativeWindowMaterialSupport,createNativeWindowPresentation } from "./native-window-presentation";
test("native backdrop availability reflects the documented Windows build boundary",()=>{
  expect(nativeWindowMaterialSupport("win32",22000).supportsAcrylic).toBe(false);
  expect(nativeWindowMaterialSupport("win32",22621).supportsMicaAlt).toBe(true);
  expect(nativeWindowMaterialSupport("linux",99999).supportsMica).toBe(false);
  if(process.platform==="win32")expect(()=>createNativeWindowPresentation(0,()=>{},()=>{})).toThrow();
});

test.skipIf(process.platform!=="win32")("window mode restores frame styles without restoring saved visibility or enabled state",()=>{
  const user=dlopen("user32.dll",{
    CreateWindowExW:{args:["u32","ptr","ptr","u32","i32","i32","i32","i32","ptr","ptr","ptr","ptr"],returns:"ptr"},
    ShowWindow:{args:["ptr","i32"],returns:"i32"},
    EnableWindow:{args:["ptr","i32"],returns:"i32"},
    IsWindowVisible:{args:["ptr"],returns:"i32"},
    IsWindowEnabled:{args:["ptr"],returns:"i32"},
    GetWindowLongPtrW:{args:["ptr","i32"],returns:"i64"},
    DestroyWindow:{args:["ptr"],returns:"i32"},
  });
  const name=Buffer.from("STATIC\0","utf16le"),title=Buffer.from("Owned window mode regression\0","utf16le");
  try{
    for(const [savedVisible,visible,enabled] of [[false,true,true],[true,false,true],[true,true,true],[false,true,false]] as const){
      const window=user.symbols.CreateWindowExW(0,ptr(name),ptr(title),0x00cf0000,120,120,600,400,null,null,null,null);
      if(!window)throw new Error("Cannot create the owned test window");
      try{
        if(savedVisible)user.symbols.ShowWindow(window,4);
        const layers:boolean[]=[];
        const presentation=createNativeWindowPresentation(Number(window),()=>{},enabled=>layers.push(enabled))!;
        const initialStyle=BigInt(user.symbols.GetWindowLongPtrW(window,-16));
        presentation.setMode(true,0);
        user.symbols.ShowWindow(window,visible?4:0);
        user.symbols.EnableWindow(window,enabled?1:0);
        presentation.setMode(false,0);
        expect(Boolean(user.symbols.IsWindowVisible(window))).toBe(visible);
        expect(Boolean(user.symbols.IsWindowEnabled(window))).toBe(enabled);
        const restoredStyle=BigInt(user.symbols.GetWindowLongPtrW(window,-16));
        expect(restoredStyle&0x81c70000n).toBe(initialStyle&0x81c70000n);
        expect(layers).toEqual([true,false]);
        presentation.dispose();
      }finally{user.symbols.DestroyWindow(window as Pointer);}
    }
  }finally{user.close();}
});
