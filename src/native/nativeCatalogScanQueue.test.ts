import assert from "node:assert/strict";
import { createNativeCatalogScanQueue } from "./nativeCatalogScanQueue.js";
const queue = createNativeCatalogScanQueue<string>();
const started: string[] = []; let finish!: (value: string) => void;
const first = queue.run("same", () => { started.push("same"); return new Promise(resolve => { finish = resolve; }); });
const shared = queue.run("same", async () => { throw new Error("must share work"); });
const next = queue.run("next", async () => { started.push("next"); return "next"; });
assert.equal(first, shared); await Promise.resolve(); assert.deepEqual(started, ["same"]);
finish("done"); assert.deepEqual(await Promise.all([first, shared, next]), ["done", "done", "next"]);
await queue.drain(); assert.equal(queue.idle, true);
await assert.rejects(queue.run("failure", async () => { throw new Error("failed"); }), /failed/);
assert.equal(await queue.run("failure", async () => "retry"), "retry", "failed work is not retained as a hit");
assert.equal(await queue.run("same", async () => "new scan"), "new scan", "complete requests do not hide later filesystem changes");
{
  let now=10; const freshQueue=createNativeCatalogScanQueue<string>(()=>now);let finishOld!:(value:string)=>void;let runs=0;
  const old=freshQueue.run("same",()=>{runs++;return new Promise(resolve=>{finishOld=resolve;});});await Promise.resolve();
  now=20;
  const fresh=freshQueue.run("same",async()=>{runs++;return"after filesystem event";},20);
  const shared=freshQueue.run("same",async()=>{throw new Error("queued fresh work should be shared");},20);
  assert.notEqual(old,fresh,"an event after worker start needs a fresh enumeration");assert.equal(fresh,shared);
  finishOld("older snapshot");assert.equal(await fresh,"after filesystem event");assert.equal(runs,2);await freshQueue.drain();
}
console.log("Catalog scan queue: in-flight sharing, serialization, failure eviction, fresh work and draining passed");
