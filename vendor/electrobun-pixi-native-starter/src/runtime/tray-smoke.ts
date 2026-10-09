import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { NativeTray } from "./native-tray";

/** Deliver shell notification messages only to a tray owned by this test worker. */
export async function sendTrayTestAction(id:number,action:"left"|"menu"|"recover"|"removed",menuIndex=0):Promise<void>{
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
found=[];top=[]
@cb
def find(window,_):
 name=c.create_unicode_buffer(64);u.GetClassNameW(window,name,64)
 if name.value=='TrayWindowClass':
  owner=w.DWORD();thread=u.GetWindowThreadProcessId(window,c.byref(owner))
  if owner.value==pid:found.append((window,thread));top.append(window)
 return True
u.EnumWindows.argtypes=[cb,w.LPARAM];u.EnumWindows(find,0)
h=None
while True:
 h=u.FindWindowExW(w.HWND(-3),h,'TrayWindowClass',None)
 if not h:break
 owner=w.DWORD();thread=u.GetWindowThreadProcessId(h,c.byref(owner))
 if owner.value==pid:found.append((h,thread))
if action=='removed':
 if found:raise RuntimeError('Removing the tray left an owned window behind')
 print('Owned tray window removed');sys.exit(0)
if len(found)!=1:raise RuntimeError('Expected one owned tray window, found '+str(len(found)))
h,thread=found[0]
if action=='recover':
 if h not in top:raise RuntimeError('Tray window cannot receive taskbar broadcasts')
 if u.IsWindowVisible(h):raise RuntimeError('Tray receiver must stay hidden')
 shell=c.WinDLL('shell32',use_last_error=True)
 class NID(c.Structure):
  _fields_=[('cbSize',w.DWORD),('hWnd',w.HWND),('uID',w.UINT),('uFlags',w.UINT),('uCallbackMessage',w.UINT),('hIcon',w.HICON),('szTip',w.WCHAR*128),('dwState',w.DWORD),('dwStateMask',w.DWORD),('szInfo',w.WCHAR*256),('uVersion',w.UINT),('szInfoTitle',w.WCHAR*64),('dwInfoFlags',w.DWORD),('guidItem',c.c_byte*16),('hBalloonIcon',w.HICON)]
 shell.Shell_NotifyIconW.argtypes=[w.DWORD,c.POINTER(NID)];shell.Shell_NotifyIconW.restype=w.BOOL
 u.RegisterWindowMessageW.argtypes=[w.LPCWSTR];u.RegisterWindowMessageW.restype=w.UINT
 nid=NID();nid.cbSize=c.sizeof(nid);nid.hWnd=h;nid.uID=trayid
 message=u.RegisterWindowMessageW('TaskbarCreated')
 if not message:raise c.WinError(c.get_last_error())
 for attempt in range(3):
  if not shell.Shell_NotifyIconW(2,c.byref(nid)):raise RuntimeError('Owned tray entry could not be removed')
  if shell.Shell_NotifyIconW(1,c.byref(nid)):raise RuntimeError('Owned tray entry survived deletion')
  if not u.PostMessageW(h,message,0,0):raise c.WinError(c.get_last_error())
  deadline=time.monotonic()+5
  while not shell.Shell_NotifyIconW(1,c.byref(nid)):
   if time.monotonic()>deadline:raise RuntimeError('Tray icon was not restored')
   time.sleep(.02)
 # DPI notifications can arrive while the entry already exists.
 if not u.PostMessageW(h,message,0,0):raise c.WinError(c.get_last_error())
 time.sleep(.1)
 if not shell.Shell_NotifyIconW(1,c.byref(nid)):raise RuntimeError('Repeated notification removed the tray')
 print('Owned tray recovered three times; duplicate notification preserved registration');sys.exit(0)
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
    await sendTrayTestAction(tray.id,"recover");
    await sendTrayTestAction(tray.id,"left");await wait(1);assert.deepEqual(actions,[""]);
    await sendTrayTestAction(tray.id,"menu");await wait(2);assert.deepEqual(actions,["","show"]);
    tray.setImage(image);await sendTrayTestAction(tray.id,"recover");
    console.log("Tray smoke passed: taskbar recovery, repeated notification, left activation, right menu, image update and callback routing");
  }finally{
    const id=tray.id;tray.remove();await sendTrayTestAction(id,"removed");
  }
}
