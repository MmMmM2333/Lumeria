/** One-shot input work consumed immediately before the next real presentation. */
export function createNativeFrameCallbacks(invalidate:()=>void){
  let next=0,disposed=false;const callbacks=new Map<number,()=>void>();
  return {
    request(callback:()=>void){if(disposed)return 0;const id=++next;callbacks.set(id,callback);invalidate();return id;},
    cancel(id:number){callbacks.delete(id);},
    flush(){const batch=[...callbacks];for(const [id,run] of batch){if(!callbacks.delete(id))continue;run();}},
    dispose(){disposed=true;callbacks.clear();},
  };
}
