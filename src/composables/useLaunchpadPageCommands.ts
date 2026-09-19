import { nextTick } from "vue";
import { createLaunchpadPageCommands, type LaunchpadPageCommandsOptions } from "../application/launchpadPageCommands.js";

export { shouldAssertLaunchpadLayout } from "../application/launchpadPageCommands.js";
export type { LaunchpadPageCommandsOptions, LaunchpadWarningDialogConfig } from "../application/launchpadPageCommands.js";

/** Browser scheduling adapter; all page mutations and confirmations are shared. */
export function useLaunchpadPageCommands(options: LaunchpadPageCommandsOptions) {
  return createLaunchpadPageCommands({
    ...options,
    scheduleChromePageIndexCommit: options.scheduleChromePageIndexCommit ?? (callback => {
      void nextTick(() => {
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(callback);
        } else callback();
      });
    }),
  });
}
