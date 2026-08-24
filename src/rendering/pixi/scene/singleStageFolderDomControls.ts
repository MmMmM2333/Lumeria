import { reloadOnPixiHotUpdate } from "../devHmr.js";

export const SINGLE_STAGE_FOLDER_NAME_INPUT_WIDTH = 360;

export interface SingleStageFolderTitleFrame {
  folderId?: string | null;
  height?: number;
  left: number;
  progress?: unknown;
  top: number;
  width: number;
}

export interface SingleStageFolderNameInputStyleOptions {
  controlsVisible?: boolean;
  folderVisibilityProgress?: unknown;
  frame?: SingleStageFolderTitleFrame | null;
  isInputDisabled?: boolean;
  width?: number;
}

export interface SingleStageFolderNameInputStyle {
  filter?: string;
  left?: string;
  opacity: number;
  pointerEvents: "auto" | "none";
  top?: string;
  transform?: string;
  width?: string;
}

export function isSingleStageFolderTitleFrameCurrent(
  frame: Readonly<{ folderId?: unknown }> | null | undefined,
  folderId: unknown,
): boolean {
  if (!frame || !folderId) return false;
  return frame.folderId === folderId;
}

function clamp01(value: unknown): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function getSingleStageFolderTitleOpacity(
  folderVisibilityProgress: unknown,
): number {
  return clamp01(folderVisibilityProgress);
}

export function makeSingleStageFolderNameInputStyle(
  options: SingleStageFolderNameInputStyleOptions = {},
): SingleStageFolderNameInputStyle {
  const {
    controlsVisible = false,
    folderVisibilityProgress = 0,
    frame = null,
    isInputDisabled = false,
    width = SINGLE_STAGE_FOLDER_NAME_INPUT_WIDTH,
  } = options;
  if (!controlsVisible || !frame) return { opacity: 0, pointerEvents: "none" };
  const opacity = getSingleStageFolderTitleOpacity(folderVisibilityProgress);
  const isInteractive = opacity >= 0.99 && !isInputDisabled;
  return {
    left: `${frame.left + frame.width / 2 - width / 2}px`,
    filter: opacity < 0.98 ? "blur(2px)" : "blur(0px)",
    opacity,
    pointerEvents: isInteractive ? "auto" : "none",
    top: `${frame.top - 44}px`,
    transform: "translate3d(0, 0, 0)",
    width: `${width}px`,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
