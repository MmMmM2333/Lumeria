import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {randomBytes} from "node:crypto";
import {mkdtempSync} from "node:fs";
import {resolve} from "node:path";
import {once} from "node:events";
import {NativeDataPipe} from "../src/native/nativeDataPipe.js";
const path=`\\\\.\\pipe\\lumeria-data-${process.pid}-${randomBytes(16).toString("hex")}`;
const data=mkdtempSync(resolve("artifacts/data-pipe-"));
const processChild=spawn(resolve("target/release/lumeria_native_data.exe"),["--pipe",path],{windowsHide:true,stdio:"pipe",env:{...process.env,LUMERIA_NATIVE_DATA_DIR:data}});
let stderr="";processChild.stderr.on("data",chunk=>stderr+=chunk);const ended=once(processChild,"close");
const pipe=new NativeDataPipe(path);
try{
  assert.equal((await pipe.request("hello") as {protocolVersion:number}).protocolVersion,1);
  assert.deepEqual(await Promise.all([pipe.request("loadLayout"),pipe.request("loadLayout")]),[null,null]);
  await assert.rejects(pipe.request("unknown"));
  assert.equal(await pipe.request("loadLayout"),null);
  const pending=pipe.request("loadLayout");const closing=pipe.dispose();
  assert.equal(await pending,null,"close drains pending requests");await closing;await pipe.dispose();
  const [code]=await ended;assert.equal(code,0,stderr);
  await assert.rejects(pipe.request("hello"),/disposed/);
}finally{await pipe.dispose();if(processChild.exitCode===null)processChild.kill();}
console.log("Native prestarted pipe handshake, ordering, errors and EOF shutdown passed");
const lostPath=`\\\\.\\pipe\\lumeria-data-${process.pid}-${randomBytes(16).toString("hex")}`;
const lost=spawn(resolve("target/release/lumeria_native_data.exe"),["--pipe",lostPath],{windowsHide:true,stdio:"ignore",env:{...process.env,LUMERIA_NATIVE_DATA_DIR:data}});
const disconnected=new NativeDataPipe(lostPath);
try{
  await disconnected.request("hello");const exited=once(lost,"close");lost.kill();await exited;
  await assert.rejects(disconnected.request("loadLayout"));
}finally{await disconnected.dispose();if(lost.exitCode===null)lost.kill();}
console.log("Native data pipe disconnect rejects requests without restarting or pretending success");
