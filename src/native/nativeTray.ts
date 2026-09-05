import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { t } from "./nativeLocalization.js";
import { logNativeRuntime, nativeLogDirectory } from "./nativeRuntimeLog.js";
import { canRestartNative } from "./nativeRestart.js";

export type LaunchpadTrayMenuItem={type:"separator"}|{type:"normal";label:string;action:string;enabled?:boolean};
type TrayHandle={id:number;setImage(path:string):void;setMenu(items:LaunchpadTrayMenuItem[]):void;remove():void};
export function createLaunchpadTray(options:{show():void;toggle():void;settings():void;quit(restart:boolean):void;icon():string;
  brandingDirectory:string;openPath(path:string):boolean;
  createTray(input:{title:string;image:string;onAction(action:string):void;onError(error:unknown):void}):TrayHandle;
}){
  mkdirSync(nativeLogDirectory,{recursive:true});
  const iconPath=(variant:string)=>{
    const file=join(nativeLogDirectory,`tray-${variant}.ico`);
    // ICO permits an embedded 256px PNG. Reuse the exact existing application icon.
    const png=readFileSync(join(options.brandingDirectory,variant+".png"));
    const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
    header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
    const bytes=Buffer.concat([header,png]);
    if(!existsSync(file)||!readFileSync(file).equals(bytes))writeFileSync(file,bytes);
    return file;
  };
  const dispatch=(action:string)=>{
    logNativeRuntime("tray-action",action);
    if(action==="")options.toggle();
    else if(action==="show")options.show();
    else if(action==="settings")options.settings();
    else if(action==="logs"){if(!options.openPath(nativeLogDirectory))throw new Error("Could not open logs folder");}
    else if(action==="quit"||action==="restart")options.quit(action==="restart");
  };
  const tray=options.createTray({title:"Lumeria",image:iconPath(options.icon()),onAction:dispatch,onError:error=>logNativeRuntime("tray-error",error)});
  const refresh=()=>{
    tray.setImage(iconPath(options.icon()));
    tray.setMenu([
      {type:"normal",label:t("native.tray.show"),action:"show"},{type:"normal",label:t("native.tray.settings"),action:"settings"},
      {type:"normal",label:t("native.tray.logs"),action:"logs"},{type:"separator"},
      {type:"normal",label:t("native.tray.restart"),action:"restart",enabled:canRestartNative()},
      {type:"normal",label:t("native.tray.quit"),action:"quit"},
    ]);
  };
  refresh();logNativeRuntime("tray-created",{id:tray.id});
  return {refresh,remove:()=>tray.remove(),get id(){return tray.id;}};
}
