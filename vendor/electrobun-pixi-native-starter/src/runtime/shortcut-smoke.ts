import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { GlobalShortcut } from "../../.hutch/devkit-dcomp-2.0.1/api/sdks/main/proc/native";

export async function sendAltSpace():Promise<void>{
  const script=String.raw`
import ctypes as c, time
from ctypes import wintypes as w
u=c.WinDLL('user32',use_last_error=True)
class Keyboard(c.Structure):_fields_=[('vk',w.WORD),('scan',w.WORD),('flags',w.DWORD),('time',w.DWORD),('extra',c.c_size_t)]
class Payload(c.Union):_fields_=[('keyboard',Keyboard),('padding',c.c_byte*32)]
class Input(c.Structure):_fields_=[('type',w.DWORD),('payload',Payload)]
u.SendInput.argtypes=[w.UINT,c.POINTER(Input),c.c_int];u.SendInput.restype=w.UINT
assert c.sizeof(Input)==40
def key(vk,flags):
 data=Input(1,Payload(keyboard=Keyboard(vk,0,flags,0,0)))
 if u.SendInput(1,c.byref(data),c.sizeof(data))!=1:raise c.WinError(c.get_last_error())
key(0x12,0)
try:
 key(0x20,0);time.sleep(.06);key(0x20,2)
finally:key(0x12,2)
`;
  const child=spawn("python",["-c",script],{windowsHide:true,stdio:["ignore","pipe","pipe"]});let error="";
  child.stderr.on("data",chunk=>{error+=chunk;});
  await new Promise<void>((resolve,reject)=>{child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(new Error(error)));});
}
export async function runShortcutSmoke():Promise<void>{
  let calls=0;
  assert.ok(GlobalShortcut.register("Alt+Space",()=>{calls++;}),"Alt+Space must be available for this isolated test");
  try{
    await sendAltSpace();const deadline=performance.now()+2000;
    while(!calls){if(performance.now()>deadline)throw new Error("Registered shortcut callback was not delivered");await new Promise(resolve=>setTimeout(resolve,10));}
    assert.equal(calls,1);console.log("Physical Alt+Space reached the Starter shortcut callback");
  }finally{GlobalShortcut.unregister("Alt+Space");}
}
