import { createAnimationFrameScheduler } from "./animation-frame";

if (typeof globalThis.requestAnimationFrame !== "function") {
  const scheduler=createAnimationFrameScheduler({now:()=>performance.now(),
    schedule:(callback,delay)=>setTimeout(callback,Math.ceil(delay)),cancel:clearTimeout,
    onError:error=>queueMicrotask(()=>{throw error;})});
  globalThis.requestAnimationFrame=scheduler.request;
  globalThis.cancelAnimationFrame=scheduler.cancel;
}
