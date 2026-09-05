import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const dataRoot=process.env.LUMERIA_NATIVE_DATA_DIR??join(process.env.APPDATA??homedir(),"com.lumeria.app");
export const nativeLogDirectory=join(dataRoot,"logs");
export const nativeLogPath=join(nativeLogDirectory,"native-runtime.log");
let logUnavailable=false;

/** Low-volume lifecycle/error journal; never records queries, layouts or credentials. */
export function logNativeRuntime(event:string,detail:unknown=null):void{
  const value=detail instanceof Error?{message:detail.message,stack:detail.stack}:detail;
  const line=JSON.stringify({time:new Date().toISOString(),pid:process.pid,event,detail:value});
  console.log(`[native-runtime] ${line}`);
  try{
    mkdirSync(nativeLogDirectory,{recursive:true});
    if(existsSync(nativeLogPath)&&statSync(nativeLogPath).size>2*1024*1024){
      const previous=nativeLogPath+".1";rmSync(previous,{force:true});renameSync(nativeLogPath,previous);
    }
    appendFileSync(nativeLogPath,line+"\n","utf8");
  }catch(error){
    if(!logUnavailable){logUnavailable=true;console.error("Native runtime log unavailable",error);}
  }
}

logNativeRuntime("process-start");
process.on("uncaughtExceptionMonitor",error=>logNativeRuntime("uncaught-exception",error));
process.on("exit",code=>logNativeRuntime("process-exit",{code}));
