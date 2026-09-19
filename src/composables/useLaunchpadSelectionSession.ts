import { createLaunchpadSelectionSession } from "../application/launchpadSelectionSession.js";
import { vueStateHost } from "./vueStateHost.js";
import type { StateCell } from "../application/stateHost.js";
import type { Ref } from "vue";

export { LAUNCHPAD_SELECTION_PHASE, collectLaunchpadAppIds } from "../application/launchpadSelectionSession.js";
export type {
  LaunchpadSelectionPhase, LaunchpadSelectionScope, LaunchpadSelectionSnapshot,
  LaunchpadSelectionBeginOptions, LaunchpadSelectionToggleOptions,
} from "../application/launchpadSelectionSession.js";

export function useLaunchpadSelectionSession() {
  const session = createLaunchpadSelectionSession(vueStateHost);
  // The adapter owns real Vue refs; the shared core sees only their value contract.
  return session as unknown as {
    [Key in keyof typeof session]: (typeof session)[Key] extends StateCell<infer Value>
      ? Ref<Value> : (typeof session)[Key];
  };
}
