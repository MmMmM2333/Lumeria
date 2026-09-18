import { APP_LAUNCH_DURATION } from "../domain/launchpadConstants.js";

export const panelSpring = { duration: 0.34, ease: "power3.out" };
export const homeChromeTransition = { duration: 0.24, ease: "power2.out" };
export const appLaunchGhostTransition = { duration: APP_LAUNCH_DURATION / 1000, ease: "easeOut" };
