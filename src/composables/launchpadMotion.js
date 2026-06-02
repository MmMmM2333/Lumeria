import { APP_LAUNCH_DURATION } from "./launchpadConstants.js";

export const springRest = { restDelta: 0.01, restSpeed: 0.01 };
export const layoutSpring = { layout: { type: "spring", stiffness: 520, damping: 34, mass: 0.75, ...springRest } };
export const desktopTrackTransition = { type: "spring", stiffness: 190, damping: 28, mass: 0.9, ...springRest };
export const panelSpring = { type: "spring", stiffness: 340, damping: 31, mass: 0.9, ...springRest };
export const homeShellTransition = { type: "spring", stiffness: 260, damping: 29, mass: 0.85, ...springRest };
export const folderContentTransition = { duration: 0.16, ease: "easeOut" };
export const folderPanelCloseTransition = { duration: 0.38, ease: [0.4, 0, 0.2, 1] };
export const folderContentCloseTransition = { duration: 0.34, ease: [0.4, 0, 0.2, 1] };
export const instantTrackTransition = { duration: 0 };
export const dragPreviewSpring = { duration: 0.08 };
export const appLaunchGhostTransition = { duration: APP_LAUNCH_DURATION / 1000, ease: "easeOut" };
