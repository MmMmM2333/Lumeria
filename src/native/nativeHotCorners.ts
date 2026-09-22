import { readHotCornerSettings, type HotCornerSettings } from "../domain/hotCorners.js";

export type HotCornerEvent = Readonly<{ x:number; y:number; corner:number; displayId:number; topology:number; toggle:boolean }>;
export type HotCornerBackend = Readonly<{
  start(mask:number,delay:number,modifier:number,pause:boolean,allowSeams:boolean,generation:number,handler:(generation:number,x:number,y:number,corner:number,displayId:number,topology:number)=>void):void;
  stop():void;
}>;

/** The native thread only reports entries. Window policy remains on the UI owner. */
export function createNativeHotCorners(backend:HotCornerBackend,onTrigger:(event:HotCornerEvent)=>void,onError:(error:unknown)=>void) {
  let generation=0,disposed=false,pending=false;
  return {
    apply(value:HotCornerSettings){
      if(disposed)throw new Error("Hot corner service is closed");
      const config=readHotCornerSettings(value);
      const current=++generation;pending=false;backend.stop();
      if(!config.enabled)return;
      const modifier={none:0,shift:16,control:17,alt:18}[config.modifier];
      backend.start(config.corners,config.delayMs,modifier,config.pauseFullscreen,config.allowSeams??false,current,(eventGeneration,x,y,corner,displayId,topology)=>{
        if(disposed||eventGeneration!==generation||current!==generation||pending)return;
        pending=true;
        queueMicrotask(()=>{
          if(disposed||current!==generation)return;
          pending=false;
          try{onTrigger({x,y,corner,displayId,topology,toggle:config.toggle});}catch(error){onError(error);}
        });
      });
    },
    dispose(){if(disposed)return;disposed=true;++generation;pending=false;backend.stop();},
  };
}
