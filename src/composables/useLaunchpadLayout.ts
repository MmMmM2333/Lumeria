import { appSeeds } from "../mocks/appSeeds.js";
import { createLaunchpadLayoutState, type LaunchpadLayoutOptions } from "../application/launchpadLayoutState.js";
import { vueStateHost } from "./vueStateHost.js";
import type { DeepReadonly, Ref } from "vue";

export type {
  FolderPageTurnPhase,
  FolderPageTurnContext,
  FolderPageTurnContextInput,
  FolderPageTurnRequestOptions,
  FolderPageTurnRequest,
  LaunchpadLayoutConfiguration,
  LaunchpadLayoutConfigurationInput,
  LaunchpadLayoutOptions,
} from "../application/launchpadLayoutState.js";

export function useLaunchpadLayout(options: LaunchpadLayoutOptions) {
  const layout = createLaunchpadLayoutState({ ...options, seeds: options.seeds ?? appSeeds }, vueStateHost);
  type Presentation = typeof layout.presentation;
  // vueStateHost creates real Vue refs; preserve their branded/deep-readonly public types.
  const presentation = layout.presentation as unknown as {
    [Key in keyof Presentation]: DeepReadonly<Ref<Presentation[Key]["value"]>>;
  };
  return { ...layout, presentation };
}
