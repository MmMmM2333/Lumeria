import { APP_LAUNCH_DURATION } from "./launchpadConstants.js";

export const springRest = { restDelta: 0.01, restSpeed: 0.01 };
export const panelSpring = { type: "spring", stiffness: 340, damping: 31, mass: 0.9, ...springRest };
export const homeChromeTransition = { type: "spring", stiffness: 260, damping: 29, mass: 0.85, ...springRest };
export const appLaunchGhostTransition = { duration: APP_LAUNCH_DURATION / 1000, ease: "easeOut" };
