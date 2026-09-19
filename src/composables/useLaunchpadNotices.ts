import type { Ref } from "vue";
import { createLaunchpadNotices, type LaunchpadNoticesOptions } from "../application/launchpadNotices.js";
import { vueStateHost } from "./vueStateHost.js";
export type * from "../application/launchpadNotices.js";
type VueState<T> = T extends (...args:never[])=>unknown ? T : T extends {value:infer V} ? Ref<V> : T extends readonly unknown[] ? T : T extends object ? {[K in keyof T]:VueState<T[K]>} : T;
export function useLaunchpadNotices(options:LaunchpadNoticesOptions){
  return createLaunchpadNotices(options,vueStateHost) as VueState<ReturnType<typeof createLaunchpadNotices>>;
}
