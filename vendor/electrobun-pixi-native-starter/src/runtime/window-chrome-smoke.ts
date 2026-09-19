import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { Graphics,Rectangle } from "pixi.js";
import type { NativePixiApplication } from "./native-app";
import { getNativePixiApplicationTesting } from "./native-app-testing";

/** OS screenshots include DWM/non-client pixels that renderer.extract cannot see. */
export async function runWindowChromeSmoke(app:NativePixiApplication):Promise<void>{
  const output=process.env.PIXI_WINDOW_PROBE_DIR;if(!output)throw new Error("Window probe directory is required");mkdirSync(output,{recursive:true});
  const testing=getNativePixiApplicationTesting(app),hwnd=testing.handles().inputWindow;
  const header=new Graphics().rect(0,0,4000,48).fill(0x254f91);app.stage.addChild(header);
  const frame=()=>{const pending=app.nextPresent();app.invalidate();return pending;};
  app.setWindowPresentation("acrylic","dark");await frame();
  const script=String.raw`
import ctypes as c,sys,time,json,os
from ctypes import wintypes as w
from PIL import Image,ImageGrab,ImageChops,ImageStat
pid,h=int(sys.argv[1]),int(sys.argv[2]);out=sys.argv[3]
u=c.WinDLL('user32',use_last_error=True);d=c.WinDLL('dwmapi')
u.SetThreadDpiAwarenessContext.argtypes=[c.c_void_p];u.SetThreadDpiAwarenessContext(c.c_void_p(-4))
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)]
u.GetWindowRect.argtypes=[w.HWND,c.POINTER(w.RECT)];u.GetClientRect.argtypes=[w.HWND,c.POINTER(w.RECT)]
u.SetWindowPos.argtypes=[w.HWND,w.HWND,c.c_int,c.c_int,c.c_int,c.c_int,w.UINT]
u.SetForegroundWindow.argtypes=[w.HWND];u.GetForegroundWindow.restype=w.HWND
u.SendMessageW.argtypes=[w.HWND,w.UINT,w.WPARAM,w.LPARAM];u.SetWindowTextW.argtypes=[w.HWND,w.LPCWSTR]
u.GetWindowLongPtrW.argtypes=[w.HWND,c.c_int];u.GetWindowLongPtrW.restype=c.c_ssize_t
d.DwmGetWindowAttribute.argtypes=[w.HWND,w.DWORD,c.c_void_p,w.DWORD]
owner=w.DWORD();u.GetWindowThreadProcessId(h,c.byref(owner))
if owner.value!=pid:raise RuntimeError('Probe window owner changed')
r=w.RECT();u.GetWindowRect(h,c.byref(r));original=[r.left,r.top,r.right-r.left,r.bottom-r.top]
u.SetForegroundWindow(h);time.sleep(.2)
if u.GetForegroundWindow()!=h:raise RuntimeError('Probe is not foreground')
samples=[]
try:
 for index,(dw,dh) in enumerate([(0,0),(100,40),(200,80),(60,20),(0,0)]):
  u.SetWindowPos(h,None,original[0],original[1],original[2]+dw,original[3]+dh,0x14)
  if index>0:
   u.SetWindowTextW(h,'LaunchPad native title redraw probe')
   u.SendMessageW(h,0x86,0,0);u.SendMessageW(h,0x86,1,0)
   u.SendMessageW(h,0x85,1,0);u.SendMessageW(h,0xae,0,0);u.SendMessageW(h,0xaf,0,0)
  for phase,delay in [('immediate',.016),('settled',.18)]:
   time.sleep(delay);u.GetWindowRect(h,c.byref(r));client=w.RECT();u.GetClientRect(h,c.byref(client))
   image=ImageGrab.grab(bbox=(r.left,r.top,r.right,r.bottom),all_screens=True,include_layered_windows=True)
   image.save(os.path.join(out,f'window-{index}-{phase}.png'))
   ink=image.crop((32,8,350,32)).convert('RGB');reference=Image.new('RGB',ink.size,(37,79,145))
   diff=ImageStat.Stat(ImageChops.difference(ink,reference)).mean
   material=c.c_int();d.DwmGetWindowAttribute(h,38,c.byref(material),4)
   body=image.crop((30,80,min(800,image.width-30),min(500,image.height-30))).convert('RGB')
   pixels=list(body.getdata());bad=sum(1 for p in pixels if min(p)>245 or max(abs(p[i]-[9,11,20][i]) for i in range(3))<2)/len(pixels)
   samples.append(dict(index=index,phase=phase,opaqueFallbackRatio=bad,style=hex(u.GetWindowLongPtrW(h,-16)&0xffffffff),headerDifference=diff,material=material.value,client=[client.right,client.bottom],outer=[r.right-r.left,r.bottom-r.top]))
finally:u.SetWindowPos(h,None,*original,0x14)
print(json.dumps(samples))
`;
  const child=spawn("python",["-c",script,String(process.pid),String(hwnd),output],{windowsHide:true,stdio:["ignore","pipe","pipe"]});let result="",errors="";
  child.stdout.on("data",chunk=>{result+=chunk;});child.stderr.on("data",chunk=>{errors+=chunk;});
  await new Promise<void>((resolve,reject)=>{child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(new Error(errors)));});
  const samples=JSON.parse(result) as {headerDifference:number[];opaqueFallbackRatio:number;material:number;client:number[];outer:number[]}[];
  writeFileSync(join(output,"samples.json"),JSON.stringify(samples,null,2));
  for(const sample of samples){assert.equal(sample.material,3);assert.deepEqual(sample.client,sample.outer);assert.ok(Math.max(...sample.headerDifference)<2,"native caption must never overwrite the custom header");assert.ok(sample.opaqueFallbackRatio<0.1,"Acrylic may not flash to the white/opaque fast-path fallback");}
  app.setWindowPresentation("none","dark");await frame();
  const pixels=await app.renderer.extract.pixels({target:app.stage,frame:new Rectangle(50,80,10,10),resolution:1,clearColor:[0,0,0,0]});
  assert.equal(pixels.pixels[3],0,"content background remains transparent after native material is removed");
  console.log("System chrome probe passed: 10 OS captures, full client bounds, stable Acrylic attribute and no caption paint");
}
