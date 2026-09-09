import { expect,test } from "bun:test";
import { createAnimationFrameScheduler } from "./animation-frame";

function harness(){
  let now=0,id=0;const timers=new Map<number,{callback:()=>void;at:number}>(),errors:unknown[]=[];
  const scheduler=createAnimationFrameScheduler({now:()=>now,schedule:(callback,delay)=>{timers.set(++id,{callback,at:now+delay});return id;},cancel:handle=>{timers.delete(handle);},onError:error=>errors.push(error)});
  const step=()=>{const entry=[...timers][0];if(!entry)return false;timers.delete(entry[0]);now=entry[1].at;entry[1].callback();return true;};
  return {scheduler,timers,errors,step};
}
test("recursive RAF is paced and callbacks share one timestamp",()=>{
  const h=harness(),times:number[]=[],other:number[]=[];
  const callback=(time:number)=>{times.push(time);if(times.length<60)h.scheduler.request(callback);};
  h.scheduler.request(callback);h.scheduler.request(time=>other.push(time));
  expect(h.timers.size).toBe(1);while(h.step()){}
  expect(times.length).toBe(60);expect(other[0]).toBe(times[0]);expect(times[59]).toBeCloseTo(1000,5);expect(h.timers.size).toBe(0);
});
test("canceling the last request removes its timer and intra-batch cancellation works",()=>{
  const h=harness();let calls=0;
  const first=h.scheduler.request(()=>calls++);h.scheduler.cancel(first);expect(h.timers.size).toBe(0);
  let second=0;h.scheduler.request(()=>h.scheduler.cancel(second));second=h.scheduler.request(()=>calls++);h.step();expect(calls).toBe(0);
});
test("new requests run next frame and one throwing callback does not discard siblings",()=>{
  const h=harness(),times:number[]=[];
  h.scheduler.request(()=>{h.scheduler.request(t=>times.push(t));throw Error("fixture");});h.scheduler.request(t=>times.push(t));
  h.step();expect(times.length).toBe(1);expect(h.errors.length).toBe(1);h.step();expect(times.length).toBe(2);expect(times[1]!>times[0]!).toBe(true);
});
