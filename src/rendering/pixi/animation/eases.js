import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

gsap.registerPlugin(CustomEase);

export const layoutEase = "power3.out";
export const folderOpenEase = "power3.out";
export const folderOpenGhostEase = CustomEase.create("pixiFolderOpenGhostEase", "0.22,1,0.36,1");
export const folderCloseEase = CustomEase.create("pixiFolderCloseEase", "0.4,0,0.2,1");
export const folderCloseFrameEase = CustomEase.create("pixiFolderCloseFrameEase", "0.16,1,0.3,1");
export const quickEase = "power2.out";

export const layoutDuration = 0.34;
export const folderOpenDuration = 0.38;
export const folderOpenGhostDuration = 0.36;
export const folderCloseDuration = 0.34;
export const folderPanelCloseDuration = 0.38;
export const quickDuration = 0.16;

reloadOnPixiHotUpdate(import.meta.hot);
