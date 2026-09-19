import assert from "node:assert/strict";
import { NativeDataTransport } from "./nativeDataTransport.js";
import { NativeLaunchError } from "./nativeDataProtocol.js";

// A real subprocess exercises stream/exit boundaries without system side effects.
const fixture = `
const readline = require('node:readline');
const lines = readline.createInterface({input: process.stdin});
lines.on('line', line => {
  const request = JSON.parse(line);
  if (request.operation === 'exit') { process.exit(9); }
  if (request.operation === 'malformed') { console.log('not json'); return; }
  if (request.operation === 'wrongId') { console.log(JSON.stringify({version:1,id:request.id+1,ok:true,value:null})); return; }
  if (request.operation === 'missingValue') { console.log(JSON.stringify({version:1,id:request.id,ok:true})); return; }
  if (request.operation === 'launchApp') { console.log(JSON.stringify({version:1,id:request.id,ok:false,error:{kind:'cancelled',detail:'fixture'}})); return; }
  const respond = () => console.log(JSON.stringify({version:1,id:request.id,ok:true,value:request.operation}));
  if(request.operation === 'slow') setTimeout(respond, 25); else respond();
});`;

const transport = new NativeDataTransport(process.execPath, ["-e", fixture]);
try {
  assert.deepEqual(await Promise.all([transport.request("slow"), transport.request("next")]), ["slow", "next"], "serial transport must not write the second request ahead of the first response");
  await assert.rejects(transport.request("launchApp"), error => error instanceof NativeLaunchError && error.kind === "cancelled" && error.detail === "fixture");
  await assert.rejects(transport.request("wrongId"), /invalid.*envelope/);
  await assert.rejects(transport.request("malformed"), SyntaxError);
  await assert.rejects(transport.request("missingValue"), /missing value/);
  assert.equal(await transport.request("recover"), "recover", "a rejected response does not poison the serial promise queue");
  const pending = transport.request("slow");
  const closing = transport.dispose();
  assert.equal(await pending, "slow", "normal disposal drains already queued work");
  await closing;
  await transport.dispose();
  await assert.rejects(transport.request("closed"), /disposed/);
} finally { await transport.dispose(); }

const exiting = new NativeDataTransport(process.execPath, ["-e", fixture]);
try {
  const results = await Promise.allSettled([exiting.request("exit"), exiting.request("queued-after-exit")]);
  assert.ok(results.every(result => result.status === "rejected"), "process exit must reject both current and queued requests");
} finally { await exiting.dispose(); }

const missing = new NativeDataTransport(`${process.execPath}.does-not-exist`);
try { await assert.rejects(missing.request("hello")); }
finally { await missing.dispose(); }

console.log("Native data transport serial ordering, protocol errors, process exit and draining shutdown passed");
