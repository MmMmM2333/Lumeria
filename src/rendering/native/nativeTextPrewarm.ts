import { Text, type WebGPURenderer, type Texture } from "pixi.js";
import { setImmediate, clearImmediate } from "node:timers";

export type NativeTextCandidate={text:Text;page:number};
type Host={renderer():WebGPURenderer;canRun():boolean;onError(error:unknown):void};
type Lease={key:string;renderer:WebGPURenderer;texture:Texture};

/** Incremental text raster/upload preparation using Pixi's reference-counted cache.
 * One temporary reference is released when the real text pipe owns the texture.
 * This never attaches offscreen nodes, changes visibility or retains icon images.
 */
export function createNativeTextPrewarm(host:Host){
  let candidates:readonly NativeTextCandidate[]=[],queue:NativeTextCandidate[]=[],timer:ReturnType<typeof setImmediate>|null=null;
  let enabled=false,disposed=false,from=0,target=0;
  const leases=new Map<Text,Lease>();
  const stats={prepared:0,reused:0,batches:0,totalMs:0,maxBatchMs:0};
  const release=(text:Text,lease:Lease)=>{
    // A replaced renderer owns/destroys its whole cache during recovery.
    if(lease.renderer===host.renderer()&&!lease.texture.destroyed)lease.renderer.canvasText.decreaseReferenceCount(lease.key);
    leases.delete(text);
  };
  const prune=()=>{
    const renderer=host.renderer();
    for(const [text,lease] of leases){
      const gpu=text.destroyed?undefined:text._gpuData[renderer.uid] as {currentKey?:string}|undefined;
      if(text.destroyed||lease.renderer!==renderer||lease.key!==text.styleKey||lease.texture.destroyed||gpu?.currentKey===lease.key)release(text,lease);
    }
  };
  const ready=(text:Text)=>{
    if(text.destroyed||!text.visible||!text.text)return true;
    const renderer=host.renderer(),gpu=text._gpuData[renderer.uid] as {currentKey?:string}|undefined;
    return gpu?.currentKey===text.styleKey||leases.get(text)?.key===text.styleKey;
  };
  const rank=(page:number)=>{
    if(from===target)return Math.abs(page-target);
    const low=Math.min(from,target),high=Math.max(from,target);
    return page>=low&&page<=high?Math.abs(page-from):1000+Math.abs(page-target);
  };
  const refill=()=>{prune();queue=candidates.filter(({text})=>!ready(text)).sort((a,b)=>rank(a.page)-rank(b.page));};
  const schedule=()=>{
    if(disposed||!enabled||timer||!queue.length)return;
    // Windows short timers may round up to a display-sized interval. Yield one
    // event-loop turn between bounded slices instead of waiting on that timer.
    timer=setImmediate(run);
  };
  const run=()=>{
    timer=null;if(disposed||!enabled||!host.canRun())return;
    const start=performance.now();let count=0;
    try{
      prune();
      // At most 2 ms or 8 labels per slice. One raster operation is indivisible.
      while(queue.length&&count<8&&performance.now()-start<2){
        const {text}=queue.shift()!;if(ready(text))continue;
        const renderer=host.renderer();
        const existing=renderer.canvasText.getReferenceCount(text.styleKey)>0;
        const texture=renderer.canvasText.getManagedTexture(text);
        leases.set(text,{key:text.styleKey,renderer,texture});
        if(existing)stats.reused++;else stats.prepared++;
        count++;
      }
      const elapsed=performance.now()-start;stats.batches++;stats.totalMs+=elapsed;stats.maxBatchMs=Math.max(stats.maxBatchMs,elapsed);
      schedule();
    }catch(error){enabled=false;host.onError(error);}
  };
  return {
    setCandidates(next:readonly NativeTextCandidate[]){
      const live=new Set(next.map(item=>item.text));
      for(const [text,lease] of leases)if(!live.has(text))release(text,lease);
      candidates=next;refill();schedule();
    },
    prioritize(source:number,destination:number){from=source;target=destination;refill();schedule();},
    start(){enabled=true;refill();schedule();},
    pause(){enabled=false;if(timer)clearImmediate(timer);timer=null;},
    presented(){prune();},
    snapshot(){return {...stats,pending:queue.length,leases:leases.size,enabled};},
    dispose(){disposed=true;if(timer)clearImmediate(timer);timer=null;for(const [text,lease] of leases)release(text,lease);queue=[];candidates=[];},
  };
}
