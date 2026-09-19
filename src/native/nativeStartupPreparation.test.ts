import assert from "node:assert/strict";
import {createNativeStartupPreparation,NATIVE_STARTUP_PREPARE_MS} from "./nativeStartupPreparation.js";

assert.equal(NATIVE_STARTUP_PREPARE_MS,0,"manual startup should not add an unproven preparation delay");

function harness(background=false,budget=150){
  let now=0,ready=false,shown=0,starts=0;
  const tasks=new Map<object,{at:number;run:()=>void}>();
  const gate=createNativeStartupPreparation(background,{now:()=>now,start:()=>{starts++;},ready:()=>ready,reveal:()=>{shown++;},
    schedule:(run,delay)=>{const key={};tasks.set(key,{run,at:now+delay});return()=>{tasks.delete(key);};}},budget);
  const advance=(ms:number)=>{const end=now+ms;while(true){const next=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;
    now=next[1].at;tasks.delete(next[0]);next[1].run();}now=end;};
  return {gate,advance,setReady:()=>{ready=true;},state:()=>({shown,starts,tasks:tasks.size})};
}
{
  const h=harness(),pending=h.gate.start();h.advance(149);assert.equal(h.state().shown,0);h.advance(1);
  assert.deepEqual(await pending,{reason:"deadline",waitMs:150});assert.equal(h.state().shown,1);
  h.gate.activate();h.advance(500);assert.equal(h.state().shown,1,"startup reveal must never rerun on later activation");
}
{
  const h=harness(),pending=h.gate.start();h.advance(20);h.setReady();h.advance(12);
  assert.equal((await pending).reason,"ready");assert.equal(h.state().shown,1);
}
{
  const h=harness(true),pending=h.gate.start();h.advance(3000);assert.equal(h.state().shown,0);assert.equal(h.gate.canPrepareHidden,true);
  h.setReady();h.advance(16);assert.equal((await pending).reason,"ready");assert.equal(h.state().shown,0,"login startup must never steal focus after preparation");
  assert.equal(h.gate.canPrepareHidden,false);assert.equal(h.state().tasks,0);
}
for(const background of [true,false]){
  const h=harness(background),pending=h.gate.start();h.advance(20);h.gate.activate();
  assert.equal((await pending).reason,"activated");h.advance(500);assert.equal(h.state().shown,0,"explicit show owns activation; pending deadline cannot show again");
  assert.equal(h.gate.canPrepareHidden,false);
  const early=harness(background);early.gate.activate();assert.equal((await early.gate.start()).reason,"activated");assert.equal(early.state().starts,0);
}
{
  const h=harness(),pending=h.gate.start();h.gate.dispose();assert.equal((await pending).reason,"disposed");h.advance(200);assert.equal(h.state().shown,0);
  assert.throws(()=>harness(false,-1),/budget/);
}
console.log("Startup preparation deadline, background, early activation and cancellation passed");
