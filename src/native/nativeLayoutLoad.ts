import {createTextInputHost, type NativePixiApplication } from "../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { LayoutDocument } from "../domain/layoutDocument.js";
import { NativeLayoutRecovery } from "../rendering/native/NativeLayoutRecovery.js";
import {nativeClipboard} from "./nativeClipboard.js";
import {readErrorMessage} from "../application/errorMessage.js";

type LoadResult={cancelled:true}|{cancelled:false;layout:LayoutDocument|null;recovered:boolean};

/** The caller initializes editable state only after a successful read, including a valid null layout. */
export async function loadNativeLayoutWithRetry(app:NativePixiApplication,load:()=>Promise<LayoutDocument|null>,recovery?:{reveal():Promise<void>;reset():Promise<unknown>;canReset?():boolean}):Promise<LoadResult>{
  let failures=0;
  while(true){
    try{return {cancelled:false,layout:await load(),recovered:failures>0};}
    catch(error){
      failures++;
      let decide!:(retry:boolean)=>void;
      const decision=new Promise<boolean>(resolve=>{decide=resolve;});
      const detail=String(error);
      const inputHost=createTextInputHost({root:app.stage,nativeInput:app.nativeInput,nativeTextInput:app.textInput,clipboard:nativeClipboard,requestFrame:()=>app.invalidate()});
      const view=new NativeLayoutRecovery(()=>app.contentSize,()=>app.invalidate(),detail,{
        retry:()=>decide(true),close:()=>decide(false),copy:async()=>{const result=await nativeClipboard.writeText(detail);if(!result.ok)throw new Error(readErrorMessage(result.error));},
        ...(recovery?{reveal:()=>recovery.reveal(),...(recovery.canReset?.()!==false?{reset:async()=>{await recovery.reset();decide(true);}}:{})}:{}),
      },inputHost);
      const offResize=app.on("resize",()=>view.redraw());
      const offKey=app.nativeInput.onKey(event=>{
        if(event.type!=="down"||event.isComposing)return;
        if(event.key)view.handleKey(event.key,event.shiftKey);
      });
      const offClose=app.beforeClose(async()=>{decide(false);});
      app.stage.addChild(view);
      app.window.show();app.window.activate();app.invalidate();
      let retry:boolean;
      try{retry=await decision;}
      finally{offResize();offKey();offClose();app.window.hide();if(!view.destroyed)view.destroy({children:true});inputHost.destroy();app.invalidate();}
      // Disposal belongs exclusively to the startup caller, never a notification callback.
      if(!retry)return {cancelled:true};
    }
  }
}
