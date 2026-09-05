import type { DeepReadonly, Ref } from "vue";
import { createLaunchpadSettings, type LaunchpadSettingsOptions as CoreOptions } from "../application/launchpadSettings.js";
import { backgroundAssetPort, autostartPort, launchpadIconPort, localeRuntimePort } from "../platform/launchpadPorts.js";
import { vueStateHost } from "./vueStateHost.js";

export type { LaunchpadSettingsRuntimeOptions, LaunchpadSettingsFragment, MainWindowShortcutOutcome, LaunchpadSettingsMainWindow, LaunchpadSettingsFailure } from "../application/launchpadSettings.js";
type PortKeys = "backgroundAssetPort" | "autostartPort" | "launchpadIconPort" | "localeRuntime";
export type LaunchpadSettingsOptions = Omit<CoreOptions, PortKeys> & Partial<Pick<CoreOptions, PortKeys>>;

export function useLaunchpadSettings(options: LaunchpadSettingsOptions) {
  const settings = createLaunchpadSettings({
    ...options,
    backgroundAssetPort: options.backgroundAssetPort ?? backgroundAssetPort,
    autostartPort: options.autostartPort ?? autostartPort,
    launchpadIconPort: options.launchpadIconPort ?? launchpadIconPort,
    localeRuntime: options.localeRuntime ?? localeRuntimePort,
  }, vueStateHost);
  type Presentation = typeof settings.presentation;
  type Draft = typeof settings.draft;
  return {
    ...settings,
    presentation: settings.presentation as unknown as { [Key in keyof Presentation]: DeepReadonly<Ref<Presentation[Key]["value"]>> },
    draft: settings.draft as { [Key in keyof Draft]: Ref<Draft[Key]["value"]> },
  };
}
