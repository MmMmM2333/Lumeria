// 150/250/400 ms A/B did not improve immediate distant paging enough to pay for
// the added startup wait. Manual startup reveals as soon as the current page is ready.
export const NATIVE_STARTUP_PREPARE_MS=0;
type Result={reason:"ready"|"deadline"|"activated"|"disposed";waitMs:number};
type Host={start():void;ready():boolean;reveal():void;now?():number;
  schedule?(run:()=>void,delay:number):()=>void};

/** A one-shot startup gate. Ordinary hide/show never re-enters this policy. */
export function createNativeStartupPreparation(background:boolean,host:Host,budgetMs=NATIVE_STARTUP_PREPARE_MS){
  if(!Number.isFinite(budgetMs)||budgetMs<0)throw new RangeError("Invalid startup preparation budget");
  const now=host.now??(()=>performance.now());
  const schedule=host.schedule??((run,delay)=>{const timer=setTimeout(run,delay);return()=>clearTimeout(timer);});
  let phase:"new"|"preparing"|"done"|"disposed"="new",hiddenWork=true,cancel=()=>{},started=0;
  let resolve:((result:Result)=>void)|null=null,promise:Promise<Result>|null=null;
  const finish=(reason:Result["reason"],show:boolean)=>{
    if(phase==="done"||phase==="disposed")return;
    const waitMs=Math.max(0,now()-started);
    phase=reason==="disposed"?"disposed":"done";hiddenWork=false;cancel();
    if(show)host.reveal();
    resolve?.({reason,waitMs});resolve=null;
  };
  const poll=()=>{
    if(phase!=="preparing")return;
    if(host.ready()){finish("ready",!background);return;}
    if(!background&&now()-started>=budgetMs){finish("deadline",true);return;}
    cancel=schedule(poll,Math.min(16,background?16:Math.max(0,budgetMs-(now()-started))));
  };
  return {
    get canPrepareHidden(){return hiddenWork&&phase!=="disposed";},
    get pending(){return phase==="new"||phase==="preparing";},
    start():Promise<Result>{
      if(promise)return promise;
      if(phase==="done"||phase==="disposed")return Promise.resolve({reason:phase==="disposed"?"disposed":"activated",waitMs:0});
      started=now();phase="preparing";promise=new Promise(done=>{resolve=done;});host.start();poll();return promise;
    },
    activate(){if(phase==="new")started=now();finish("activated",false);},
    dispose(){if(phase==="new")started=now();finish("disposed",false);},
  };
}
