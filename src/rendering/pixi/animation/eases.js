import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { motionPresets } from "./motionPresets.js";

export const layoutEase = "power3.out";
export const folderOpenEase = motionPresets.folderOpen.ease;
export const folderOpenGhostEase = motionPresets.folderOpenGhost.ease;
export const folderCloseEase = motionPresets.folderClose.ease;
export const folderPreviewSettleEase = motionPresets.folderPreviewSettle.ease;
export const quickEase = motionPresets.fade.ease;

export const layoutDuration = 0.34;
export const folderOpenDuration = motionPresets.folderOpen.duration;
export const folderOpenGhostDuration = motionPresets.folderOpenGhost.duration;
export const folderCloseDuration = motionPresets.folderClose.duration;
export const folderPanelCloseDuration = motionPresets.folderPanelClose.duration;
export const quickDuration = motionPresets.fade.duration;

reloadOnPixiHotUpdate(import.meta.hot);
