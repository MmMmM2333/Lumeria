import { reloadOnPixiHotUpdate } from "../devHmr.js";

export const FOLDER_PAGE_DOTS_REVEAL_PROGRESS = 0.995;
export const SINGLE_STAGE_FOLDER_NAME_INPUT_WIDTH = 360;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function getSingleStageFolderTitleOpenOpacity(frame) {
  const progress = clamp01(frame?.progress ?? 1);
  return clamp01((progress - 0.18) / 0.28);
}

export function getSingleStageFolderTitleOpacity(frame, options = {}) {
  if (!options.isClosing) return getSingleStageFolderTitleOpenOpacity(frame);
  const progress = clamp01(frame?.progress ?? 0);
  const closingStartOpacity = clamp01(options.closingStartOpacity ?? 1);
  return closingStartOpacity * clamp01(1 - progress / 0.28);
}

export function isSingleStageFolderPageDotsReady(frame) {
  return clamp01(frame?.progress ?? 0) >= FOLDER_PAGE_DOTS_REVEAL_PROGRESS;
}

export function makeSingleStageFolderNameInputStyle(options = {}) {
  const {
    closingStartOpacity = 1,
    controlsVisible = false,
    frame = null,
    isClosing = false,
    isInputDisabled = false,
    width = SINGLE_STAGE_FOLDER_NAME_INPUT_WIDTH,
  } = options;
  if (!controlsVisible || !frame) return { opacity: 0, pointerEvents: "none" };
  const opacity = getSingleStageFolderTitleOpacity(frame, { closingStartOpacity, isClosing });
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
