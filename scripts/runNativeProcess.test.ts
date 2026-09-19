import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNativeProcess } from "./runNativeProcess.js";

assert.equal(await runNativeProcess(process.execPath,["-e","process.exit(7)"],{stdio:"ignore"}),7);
const directory=mkdtempSync(join(tmpdir(),"launchpad-process-test-"));
const marker=join(directory,"pid");
try {
  const cancel=new AbortController();
  const code="const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('node:fs').writeFileSync(process.argv[1],String(c.pid));setInterval(()=>{},1000)";
  const result=runNativeProcess(process.execPath,["-e",code,marker],{stdio:"ignore",windowsHide:true},cancel.signal);
  const deadline=Date.now()+5000;
  while(!existsSync(marker)){if(Date.now()>deadline){cancel.abort();throw new Error("child startup timed out");}await new Promise(resolve=>setTimeout(resolve,10));}
  const pid=Number(readFileSync(marker,"utf8"));
  process.emit("SIGINT");assert.equal(await result,130);
  assert.throws(()=>process.kill(pid,0),"cancellation must terminate the descendant, not just its wrapper");
} finally {rmSync(directory,{recursive:true,force:true});}
console.log("Native process lifecycle tests passed");
