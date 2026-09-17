import type { NativePixiApplication } from "../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { LayoutDocument } from "../domain/layoutDocument.js";
import { createLaunchpadNotices } from "../application/launchpadNotices.js";
import { createNativeStateHost } from "../application/stateHost.js";
import { NativeNotice } from "../rendering/native/NativeNotice.js";
import { t } from "./nativeLocalization.js";

type LoadResult={cancelled:true}|{cancelled:false;layout:LayoutDocument|null;recovered:boolean};

/** The caller initializes editable state only after a successful read, including a valid null layout. */
export async function loadNativeLayoutWithRetry(app:NativePixiApplication,load:()=>Promise<LayoutDocument|null>):Promise<LoadResult>{
  let failures=0;
  while(true){
    try{return {cancelled:false,layout:await load(),recovered:failures>0};}
    catch(error){
      failures++;
      const view=new NativeNotice(()=>app.contentSize,()=>app.invalidate());
      const notices=createLaunchpadNotices({localizationText:{t}},createNativeStateHost(()=>{}));
      let decide!:(retry:boolean)=>void;
      const decision=new Promise<boolean>(resolve=>{decide=resolve;});
      const offResize=app.on("resize",()=>view.redraw());
      const offKey=app.nativeInput.onKey(event=>{
        if(event.type!=="down"||event.isComposing)return;
        if(event.key==="Tab"){if(!view.handleKey("Tab",event.shiftKey))view.focusEdge(event.shiftKey);}
        else if(event.key)view.handleKey(event.key);
      });
      const offClose=app.beforeClose(async()=>{decide(false);});
      notices.showLayoutLoadFailed({error,retryCount:failures,onRetry:()=>decide(true)});
      app.stage.addChild(view);view.show(notices.transientNotice.value,()=>decide(false));view.focusEdge();
      app.window.show();app.window.activate();app.invalidate();
      let retry:boolean;
      try{retry=await decision;}
      finally{offResize();offKey();offClose();notices.clearTransientNoticeTimer();if(!view.destroyed)view.destroy({children:true});app.invalidate();}
      // Disposal belongs exclusively to the startup caller, never a notification callback.
      if(!retry)return {cancelled:true};
    }
  }
}
