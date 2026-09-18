import { mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { Container,Graphics } from "pixi.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { readErrorMessage } from "../../application/errorMessage.js";
import { createTouchpadCapture,setTouchpadCapture } from "../../debug/touchpadCapture.js";
import { NativeFluentButton } from "../../rendering/native/NativeFluentButton.js";
import type { NativeManagement } from "../../rendering/native/NativeManagement.js";
import type { NativeSearchBar } from "../../rendering/native/NativeSearchBar.js";
import { createNativeText } from "../../rendering/native/nativeTypography.js";
import { cyclePageSwipeSpeed,getPageSwipeSpeed } from "../../rendering/pageSwipePreview.js";
import { PIXI_UI_FONT_FAMILY } from "../../rendering/typography.js";
import { t } from "../nativeLocalization.js";
import type { NativeNavigationKey } from "../nativeStartup.js";
import type { NativeFolderFlow } from "../product/nativeInputRouter.js";

export async function attachNativeTouchpadCapture({ app, directory, searchBar, management, folderFlow,
  getSettingsShell, onKey, interruptWheel, clearWheelPresentation, present, requestQuit, smoke }: {
  app: NativePixiApplication; directory: string; searchBar: NativeSearchBar; management: NativeManagement;
  folderFlow: NativeFolderFlow; getSettingsShell(): unknown; onKey(event: NativeNavigationKey): boolean;
  interruptWheel(event: {timeStamp:number}): void; clearWheelPresentation(): void;
  present(description:string): Promise<void>; requestQuit(): void; smoke: typeof import("../nativeSmokeSupport.js");
}): Promise<void> {
    app.window.setTitle("LaunchPad · Swipe speed preview");
    mkdirSync(directory,{recursive:true});
    const outputPath=join(directory,`touchpad-native-${Date.now()}.json`);
    const status=createNativeText({text:"",eventMode:"none",style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,fill:"#ffffff"}});
    const panel=new Container({label:"native-touchpad-capture",eventMode:"static"});
    panel.addChild(new Graphics({eventMode:"none"}).roundRect(0,0,480,140,8).fill("#20242e"),status);status.position.set(10,8);
    let detail=t("touchpadCapture.hint");
    const paint=()=>{if(panel.destroyed)return;status.text=`${t("touchpadCapture.title")}: ${t(capture.recording?"touchpadCapture.recording":capture.overflow?"touchpadCapture.full":"touchpadCapture.stopped")}\n${detail}`;panel.position.set(8,app.contentSize.height-148);app.stage.setChildIndex(panel,app.stage.children.length-1);app.invalidate();};
    const capture=createTouchpadCapture("native",()=>({...app.contentSize,resolution:app.resolution}),paint);
    setTouchpadCapture(capture);app.stage.addChild(panel);paint();
    for(const type of ["pointerdown","pointertap","wheel"] as const)panel.on(type,event=>event.stopPropagation());
    const exportFile=()=>{capture.stop();try{writeFileSync(outputPath,capture.serialize(),"utf8");detail=t("touchpadCapture.saved");}catch(error){detail=t("touchpadCapture.failed",{error:readErrorMessage(error)});}paint();};
    const toggle=()=>capture.recording?capture.stop():capture.start();
    const mark=()=>{capture.mark();detail=t("touchpadCapture.marked",{count:capture.count});paint();};
    const speedLabel=()=>t("touchpadCapture.speed",{mode:getPageSwipeSpeed()?t("touchpadCapture.rate",{rate:getPageSwipeSpeed()}):t("touchpadCapture.baseline")});
    const changeSpeed=()=>{interruptWheel({timeStamp:performance.now()});clearWheelPresentation();cyclePageSwipeSpeed();capture.speed();speedButton.caption.text=speedLabel();paint();};
    const speedButton=new NativeFluentButton(speedLabel(),458,changeSpeed,()=>app.invalidate(),"dark");speedButton.position.set(10,98);panel.addChild(speedButton);
    for(const [index,[label,action]] of ([[t("touchpadCapture.toggle"),toggle],[t("touchpadCapture.mark"),mark],[t("touchpadCapture.export"),exportFile]] as const).entries()){
      const button=new NativeFluentButton(label,146,action,()=>app.invalidate(),"dark");button.position.set(10+index*156,58);panel.addChild(button);
    }
    searchBar.handleKey=event=>{
      if(event.type==="down"&&!event.isComposing&&!event.repeat&&["F6","F7","F8","F9"].includes(event.key??"")){
        if(event.key==="F6")toggle();
        if(event.key==="F7")mark();
        if(event.key==="F9")changeSpeed();
        if(event.key==="F8")exportFile();return true;
      }
      return onKey(event);
    };
    app.stage.on("wheelcapture",event=>{let node=event.target as Container|null;let list=false;while(node){if(node===panel)return;if(node.label==="native-scroll-view")list=true;node=node.parent;}capture.wheel(event,list?"list":getSettingsShell()||management.modal?"control":folderFlow.snapshot().renderedFolder?"folder":"desktop");});
    const offCaptureResize=app.on("resize",paint);
    app.beforeClose(async()=>{exportFile();});
    panel.on("destroyed",()=>{offCaptureResize();setTouchpadCapture(null);});
    console.log("Touchpad capture ready",outputPath);
    if(process.env.LAUNCHPAD_TOUCHPAD_CAPTURE_SELFTEST==="1"){
      await (await import("./nativeTouchpadCaptureSmoke.test.js")).runNativeTouchpadCaptureSelfTest({
        app,
        capture,
        directory,
        outputPath,
        present:description=>present(description),
        requestQuit:()=>requestQuit(),
        searchBar,
        smoke:smoke!,
      });
    }
}
