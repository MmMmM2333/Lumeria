import { createProvisionalFolderRollback, type ProvisionalFolderRollbackOptions } from "../application/provisionalFolderRollback.js";
import { vueStateHost } from "./vueStateHost.js";
import type { StateCell } from "../application/stateHost.js";
import type { Ref } from "vue";
export type { ProvisionalFolderRollbackOptions, ProvisionalFolderRollbackPresentation, ProvisionalFolderRollbackRequest } from "../application/provisionalFolderRollback.js";
export function useProvisionalFolderRollback(options: ProvisionalFolderRollbackOptions) {
  const state = createProvisionalFolderRollback(options, vueStateHost);
  return state as unknown as { [Key in keyof typeof state]: (typeof state)[Key] extends StateCell<infer Value> ? Ref<Value> : (typeof state)[Key] };
}
