import { nextTick, type Ref } from "vue";
import { createLaunchpadLaunchFlow, type LaunchpadLaunchFlowOptions } from "../application/launchpadLaunchFlow.js";
import { vueStateHost } from "./vueStateHost.js";

export type { LaunchTargetStatus, LaunchIconFocus, LaunchSourceInput, LaunchErrorDialog, LaunchGhost, LaunchpadLaunchFlowOptions } from "../application/launchpadLaunchFlow.js";

export function useLaunchpadLaunchFlow(options: LaunchpadLaunchFlowOptions) {
  const flow=createLaunchpadLaunchFlow(options,vueStateHost,{
    setTimeout:(callback,delay)=>window.setTimeout(callback,delay),
    clearTimeout:id=>window.clearTimeout(id),
    afterCommit:callback=>{void nextTick(callback);},
  });
  type Flow=typeof flow;
  return flow as unknown as {
    [Key in keyof Flow]: Flow[Key] extends {value:infer Value} ? Ref<Value> : Flow[Key];
  };
}
