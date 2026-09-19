import type { LaunchpadGestureOutput } from "../domain/input/launchpadGestureEngine.js";
import { getPageSwipeSpeed } from "../rendering/pageSwipePreview.js";

export type TouchpadEvent=Readonly<{kind:"wheel"|"decision"|"scroll"|"mark"|"start"|"stop"|"speed";at:number;speed?:number;eventTime?:number;dx?:number;dy?:number;mode?:number;momentum?:boolean|null;source?:"touchpad"|"unknown";phase?:string;area?:"desktop"|"folder"|"list"|"control";page?:number;progress?:number;target?:number;offset?:number;ctrl?:boolean;meta?:boolean}>;
export function createTouchpadCapture(runtime:"native"|"web",environment:()=>{width:number;height:number;resolution:number},changed:()=>void=()=>{}){
  let recording=false,started=performance.now(),overflow=false,session=0;
  const rows:TouchpadEvent[]=[];
  const add=(row:Omit<TouchpadEvent,"at">)=>{
    if(!recording)return;
    if(rows.length>=30000){recording=false;overflow=true;changed();return;}
    rows.push({...row,at:performance.now()-started});
  };
  return {
    get recording(){return recording;},get count(){return rows.length;},get overflow(){return overflow;},get session(){return session;},
    start(){if(recording||overflow)return;if(!rows.length)started=performance.now();session++;recording=true;add({kind:"start",speed:getPageSwipeSpeed()});changed();},
    speed(){add({kind:"speed",speed:getPageSwipeSpeed()});},
    stop(){if(!recording)return;add({kind:"stop"});recording=false;changed();},
    mark(){add({kind:"mark"});changed();},
    wheel(event:{deltaX:number;deltaY:number;deltaMode:number;timeStamp:number;ctrlKey:boolean;metaKey:boolean;momentum?:boolean|null;nativeEvent?:unknown},area:TouchpadEvent["area"]){
      const meta=(event.nativeEvent as {nativeTouchpad?:{source?:string;phase?:string}}|null)?.nativeTouchpad;
      const phase=meta?.source==="touchpad"&&["begin","update","inertia","end","cancel"].includes(meta.phase??"")?meta.phase:undefined;
      add({kind:"wheel",dx:event.deltaX,dy:event.deltaY,mode:event.deltaMode,eventTime:event.timeStamp,ctrl:event.ctrlKey,meta:event.metaKey,
        momentum:phase?phase==="inertia":typeof event.momentum==="boolean"?event.momentum:null,source:phase?"touchpad":"unknown",...(phase?{phase}:{}),...(area?{area}:{})});
    },
    decision(output:LaunchpadGestureOutput){
      const p=output.presentation;
      if(p)add({kind:"decision",area:p.scope.startsWith("folder:")?"folder":"desktop",progress:p.progress,...(p.targetProgress!==undefined?{target:p.targetProgress}:{})});
      for(const c of output.commands)if(c.type==="commitPage")add({kind:"decision",area:c.scope.startsWith("folder:")?"folder":"desktop",page:c.pageIndex});
    },
    scroll(offset:number){add({kind:"scroll",area:"list",offset});},
    serialize(){return JSON.stringify({schemaVersion:2,runtime,environment:environment(),deviceSource:rows.some(row=>row.source==="touchpad")?"touchpad-observed":"unknown",nativeRawWheelAvailable:false,overflow,events:rows},null,2);},
  };
}
export let activeTouchpadCapture:ReturnType<typeof createTouchpadCapture>|null=null;
export function setTouchpadCapture(capture:typeof activeTouchpadCapture):void{activeTouchpadCapture=capture;}
