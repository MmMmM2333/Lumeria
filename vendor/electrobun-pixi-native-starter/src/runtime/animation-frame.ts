/** A paced RAF fallback. Recursive requests belong to the next batch, not the
 * current event-loop turn. Native input and application invalidation remain
 * independently driven by their existing host callbacks. */
export function createAnimationFrameScheduler<Handle>(host:{
  now():number;
  schedule(callback:()=>void,delayMs:number):Handle;
  cancel(handle:Handle):void;
  onError(error:unknown):void;
},intervalMs=1000/60){
  if(!Number.isFinite(intervalMs)||intervalMs<=0)throw new RangeError("Animation frame interval must be positive");
  let nextId=0,timer:Handle|undefined,scheduled=false,lastFrame:number|null=null;
  const callbacks=new Map<number,FrameRequestCallback>();
  const schedule=()=>{
    if(scheduled||!callbacks.size)return;
    scheduled=true;
    const delay=lastFrame===null?intervalMs:Math.max(0,intervalMs-(host.now()-lastFrame));
    timer=host.schedule(flush,delay);
  };
  const flush=()=>{
    scheduled=false;timer=undefined;
    const time=host.now();lastFrame=time;
    const ids=[...callbacks.keys()];
    for(const id of ids){
      const callback=callbacks.get(id);if(!callback)continue;
      callbacks.delete(id);
      try{callback(time);}catch(error){host.onError(error);}
    }
    schedule();
  };
  return {
    request(callback:FrameRequestCallback):number{
      if(typeof callback!=="function")throw new TypeError("Animation callback must be a function");
      const id=++nextId;callbacks.set(id,callback);schedule();return id;
    },
    cancel(id:number):void{
      callbacks.delete(id);
      if(!callbacks.size&&scheduled){host.cancel(timer!);scheduled=false;timer=undefined;}
    },
  };
}
