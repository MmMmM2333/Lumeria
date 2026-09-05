import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const launcher=join(dirname(process.execPath),"launcher.exe");
export const canRestartNative=()=>Boolean(process.env.LAUNCHPAD_NATIVE_RESTART_FILE)||existsSync(launcher);

/** Called only after the close guard has saved successfully. */
export async function prepareNativeRestart():Promise<void>{
  const marker=process.env.LAUNCHPAD_NATIVE_RESTART_FILE;
  if(marker){writeFileSync(marker,JSON.stringify({pid:process.pid,time:Date.now()}));return;}
  if(!existsSync(launcher))throw new Error("Native launcher is unavailable for restart");
  // Standalone packages have no dev supervisor. A detached helper waits for the
  // old owner to exit before launching the same installed executable.
  const script=`const {spawn}=require('node:child_process');const {dirname}=require('node:path');
    const owner=${process.pid},launcher=${JSON.stringify(launcher)};const end=Date.now()+30000;
    const timer=setInterval(()=>{try{process.kill(owner,0);if(Date.now()>end){clearInterval(timer);process.exitCode=1;}}
      catch(error){if(error.code!=='ESRCH')return;clearInterval(timer);
        const child=spawn(launcher,[],{cwd:dirname(launcher),detached:true,stdio:'ignore',windowsHide:true});child.unref();}},100);`;
  const helper=spawn(process.execPath,["-e",script],{detached:true,stdio:"ignore",windowsHide:true});
  await new Promise<void>((resolve,reject)=>{helper.once("error",reject);helper.once("spawn",resolve);});
  helper.unref();
}
