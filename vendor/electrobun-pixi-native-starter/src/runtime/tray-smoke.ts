import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { NativeTray } from "./native-tray";

/** Deliver shell notification messages only to a tray owned by this test worker. */
export async function sendTrayTestAction(id:number,action:"left"|"menu",menuIndex=0):Promise<void>{
  const script=String.raw`
import ctypes as c,sys,time
from ctypes import wintypes as w
pid,trayid=int(sys.argv[1]),int(sys.argv[2]);action=sys.argv[3];index=int(sys.argv[4])
u=c.WinDLL('user32',use_last_error=True)
u.FindWindowExW.argtypes=[w.HWND,w.HWND,w.LPCWSTR,w.LPCWSTR];u.FindWindowExW.restype=w.HWND
u.GetWindowThreadProcessId.argtypes=[w.HWND,c.POINTER(w.DWORD)]
u.PostMessageW.argtypes=[w.HWND,w.UINT,w.WPARAM,w.LPARAM]
u.SendMessageW.argtypes=[w.HWND,w.UINT,w.WPARAM,w.LPARAM];u.SendMessageW.restype=w.LPARAM
u.GetMenuItemID.argtypes=[w.HMENU,c.c_int];u.GetMenuItemID.restype=w.UINT
u.IsWindowVisible.argtypes=[w.HWND]
cb=c.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM);u.EnumThreadWindows.argtypes=[w.DWORD,cb,w.LPARAM]
u.GetClassNameW.argtypes=[w.HWND,w.LPWSTR,c.c_int]
h=None;found=[]
while True:
 h=u.FindWindowExW(w.HWND(-3),h,'TrayWindowClass',None)
 if not h:break
 owner=w.DWORD();thread=u.GetWindowThreadProcessId(h,c.byref(owner))
 if owner.value==pid:found.append((h,thread))
if len(found)!=1:raise RuntimeError('Expected one owned tray window, found '+str(len(found)))
h,thread=found[0]
if not u.PostMessageW(h,0x464,trayid,0x202 if action=='left' else 0x205):raise c.WinError(c.get_last_error())
if action=='menu':
 menus=[]
 @cb
 def visit(window,_):
  name=c.create_unicode_buffer(64);u.GetClassNameW(window,name,64)
  if name.value=='#32768' and u.IsWindowVisible(window):menus.append(window)
  return True
 deadline=time.monotonic()+3
 while not menus:
  u.EnumThreadWindows(thread,visit,0)
  if time.monotonic()>deadline:raise RuntimeError('Right-click menu was not opened')
  time.sleep(.01)
 menu=u.SendMessageW(menus[0],0x1e1,0,0)
 command=u.GetMenuItemID(menu,index)
 if command==0xffffffff:raise RuntimeError('Tray menu has no first command')
 u.PostMessageW(h,0x111,command,0);u.PostMessageW(h,0x1f,0,0)
print('Owned tray shell notification delivered: '+action)
`;
  const child=spawn("python",["-c",script,String(process.pid),String(id),action,String(menuIndex)],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
  let error="";child.stderr.on("data",chunk=>{error+=chunk;});
  await new Promise<void>((resolve,reject)=>{child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(new Error(error)));});
}

export async function runTraySmoke(image:string):Promise<void>{
  const actions:string[]=[];
  const tray=new NativeTray({title:"Starter tray smoke",image,onAction:action=>actions.push(action),onError:error=>{throw error;}});
  try{
    tray.setMenu([{type:"normal",label:"Show smoke window",action:"show"},{type:"normal",label:"Quit smoke",action:"quit"}]);
    const wait=async(count:number)=>{const deadline=performance.now()+3000;while(actions.length<count){if(performance.now()>deadline)throw new Error("Tray callback timed out");await new Promise(resolve=>setTimeout(resolve,10));}};
    await sendTrayTestAction(tray.id,"left");await wait(1);assert.deepEqual(actions,[""]);
    await sendTrayTestAction(tray.id,"menu");await wait(2);assert.deepEqual(actions,["","show"]);
    tray.setImage(image);console.log("Tray smoke passed: creation, left activation, right menu, image update and callback routing");
  }finally{tray.remove();}
}
