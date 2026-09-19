import { assertLiveDesktopBackgroundSupport, assertLiveDesktopRuntimeStatus, type LiveDesktopRuntimeConfig, type LiveDesktopRuntimeStatus } from "../api/liveDesktopContract.js";
import { DEFAULT_LIVE_DESKTOP_BACKGROUND_SUPPORT } from "../application/launchpadSettingsConfig.js";
import { createBackgroundEffectPlan } from "../domain/backgroundEffectPlan.js";
import { resolveAppearancePreference } from "../domain/appearancePreference.js";
import type { LayoutSettings } from "../domain/layoutDocument.js";

type LiveSettings=Pick<LayoutSettings,"backgroundSource"|"backgroundEffect"|"backgroundAcrylicAppearance"|"backgroundAcrylicLightParams"|"backgroundAcrylicDarkParams"|"backgroundAcrylicBlurStrength"|"backgroundBlurStrength"|"backgroundDarkenStrength"|"backgroundDarkenColor"|"backgroundLiveDesktopOpacity">;
export function nativeLiveDesktopConfig(settings: LiveSettings, appearance:"light"|"dark"):LiveDesktopRuntimeConfig {
  const profile=resolveAppearancePreference(settings.backgroundAcrylicAppearance,appearance);
  const acrylicParams=profile==="light"?settings.backgroundAcrylicLightParams:settings.backgroundAcrylicDarkParams;
  const blurStrength=settings.backgroundEffect==="acrylic"?settings.backgroundAcrylicBlurStrength:settings.backgroundBlurStrength;
  const plan=createBackgroundEffectPlan({acrylicParams,blurStrength,effect:settings.backgroundEffect,opacity:settings.backgroundLiveDesktopOpacity});
  return {effect:settings.backgroundEffect,debugFrameSourceOverride:null,blurStrength,
    darkenStrength:settings.backgroundDarkenStrength,darkenColor:settings.backgroundDarkenColor,
    opacity:settings.backgroundLiveDesktopOpacity,acrylicAppearance:settings.backgroundAcrylicAppearance,acrylicParams,
    effectPlan:{effect:plan.effect,blur:{...plan.blur,kernel:plan.blur.kernel==="gaussian"?"gaussian":"dualKawase"},
      acrylic:{...plan.acrylic,tintColor:[...plan.acrylic.tintColor]}},
    disableMouseRelay:true,skipBlankFrames:false,forceDwmFlush:false};
}

export function createNativeLiveDesktop(options:Readonly<{
  enabled:boolean; windowHandle:()=>number; visible:()=>boolean;
  load:()=>Promise<(request:unknown)=>unknown>;
}>) {
  let request:((request:unknown)=>unknown)|null=null;
  let status:LiveDesktopRuntimeStatus|null=null;
  let disposed=false;
  let appliedConfig="";
  const support={value:{...DEFAULT_LIVE_DESKTOP_BACKGROUND_SUPPORT}};
  const call=(operation:string,extra:Record<string,unknown>={})=>{
    if(!request)throw new Error("Live Desktop library is not initialized");
    status=assertLiveDesktopRuntimeStatus(request({operation,...extra}));
    if(status.phase==="failed"||status.diagnostics.abandonedRendererWorkers>0
      ||status.diagnostics.lastError)throw new Error(status.diagnostics.lastError||status.detail||status.reason);
    return status;
  };
  return {
    support,
    get enabled(){return options.enabled;},
    get loaded(){return request!==null;},
    get status(){return status;},
    async initialize(){
      if(!options.enabled||disposed)return;
      const loaded=await options.load();if(disposed)return;request=loaded;
      support.value=assertLiveDesktopBackgroundSupport(request({operation:"support"}));
    },
    sync(settings:LiveSettings,appearance:"light"|"dark"){
      if(disposed)return;
      if(!options.enabled||settings.backgroundSource!=="windowsLiveDesktop"){
        if(request&&status?.active){call("stop");appliedConfig="";}return;
      }
      if(!support.value.supportsLiveDesktopBackground)throw new Error(support.value.detail||"Live Desktop is unavailable");
      const config=nativeLiveDesktopConfig(settings,appearance),key=JSON.stringify(config);
      if(key!==appliedConfig){call("configure",{config});appliedConfig=key;}
      if(!status?.active){const started=call("start",{windowHandle:options.windowHandle()});if(!started.active)throw new Error(started.detail||"Live Desktop did not start");}
      call("visible",{visible:options.visible()});
    },
    setVisible(visible:boolean){if(!disposed&&request&&status?.active)call("visible",{visible});},
    poll(){return request?call("status"):null;},
    stop(){if(request)call("stop");appliedConfig="";},
    restart(settings:LiveSettings,appearance:"light"|"dark"){
      if(disposed||!status?.active)return;
      call("stop");call("configure",{config:nativeLiveDesktopConfig(settings,appearance)});
      call("start",{windowHandle:options.windowHandle()});call("visible",{visible:options.visible()});
    },
    dispose(){if(disposed)return;disposed=true;if(request)call("stop");},
  };
}
