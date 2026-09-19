import { expect,test } from "bun:test";
import { nativeWindowMaterialSupport,createNativeWindowPresentation } from "./native-window-presentation";
test("native backdrop availability reflects the documented Windows build boundary",()=>{
  expect(nativeWindowMaterialSupport("win32",22000).supportsAcrylic).toBe(false);
  expect(nativeWindowMaterialSupport("win32",22621).supportsMicaAlt).toBe(true);
  expect(nativeWindowMaterialSupport("linux",99999).supportsMica).toBe(false);
  if(process.platform==="win32")expect(()=>createNativeWindowPresentation(0,()=>{})).toThrow();
});
