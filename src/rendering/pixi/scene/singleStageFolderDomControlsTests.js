import {
  FOLDER_PAGE_DOTS_REVEAL_PROGRESS,
  getSingleStageFolderTitleOpenOpacity,
  getSingleStageFolderTitleOpacity,
  isSingleStageFolderPageDotsReady,
  makeSingleStageFolderNameInputStyle,
  makeSingleStageFolderPageDotsStyle,
} from "./singleStageFolderDomControls.js";

export function runSingleStageFolderDomControlsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi single-stage folder DOM controls test failed] ${message}`);
  };
  const nearlyEqual = (actual, expected) => Math.abs(actual - expected) < 0.000001;

  const frame = { height: 180, left: 320, progress: 1, top: 260, width: 520 };
  const hiddenInput = makeSingleStageFolderNameInputStyle({ controlsVisible: false, frame });
  assert(hiddenInput.opacity === 0 && hiddenInput.pointerEvents === "none", "hidden controls should disable the name input");

  const openingOpacity = getSingleStageFolderTitleOpenOpacity({ progress: 0.32 });
  assert(nearlyEqual(openingOpacity, 0.5), "opening title opacity should ramp from the panel progress");

  const openingInput = makeSingleStageFolderNameInputStyle({ controlsVisible: true, frame: { ...frame, progress: 0.32 } });
  assert(openingInput.left === "400px", "name input should stay centered over the panel frame");
  assert(openingInput.top === "216px", "name input should sit above the panel frame");
  assert(nearlyEqual(openingInput.opacity, 0.5), "name input opacity should follow the title progress");
  assert(openingInput.pointerEvents === "none", "partially visible input should not receive pointer events");
  assert(openingInput.filter === "blur(2px)", "partially visible input should use the blur transition");

  const readyInput = makeSingleStageFolderNameInputStyle({ controlsVisible: true, frame });
  assert(readyInput.opacity === 1, "fully open input should be opaque");
  assert(readyInput.pointerEvents === "auto", "fully open input should receive pointer events");
  assert(readyInput.filter === "blur(0px)", "fully open input should clear the blur");

  const disabledInput = makeSingleStageFolderNameInputStyle({ controlsVisible: true, frame, isInputDisabled: true });
  assert(disabledInput.pointerEvents === "none", "disabled input should not receive pointer events");

  const closingOpacity = getSingleStageFolderTitleOpacity({ progress: 0.14 }, {
    closingStartOpacity: 0.8,
    isClosing: true,
  });
  assert(nearlyEqual(closingOpacity, 0.4), "closing title opacity should fade from the captured start opacity");

  assert(!isSingleStageFolderPageDotsReady({ progress: FOLDER_PAGE_DOTS_REVEAL_PROGRESS - 0.001 }), "page dots should wait for the reveal threshold");
  assert(isSingleStageFolderPageDotsReady({ progress: FOLDER_PAGE_DOTS_REVEAL_PROGRESS }), "page dots should reveal at the threshold");

  const panel = { height: 360, left: 180, top: 200, width: 800 };
  const grid = { height: 240, left: 220, top: 270, width: 720 };
  const dots = makeSingleStageFolderPageDotsStyle({ controlsVisible: true, grid, hidden: false, panel });
  assert(dots.left === "180px" && dots.width === "800px", "page dots should span the panel width");
  assert(dots.top === "525px", "page dots should sit in the lower panel padding below the grid");
  assert(dots.height === "20px", "page dots should keep a stable height");
  assert(dots.opacity === 1 && dots.pointerEvents === "auto", "visible page dots should receive pointer events");

  const hiddenDots = makeSingleStageFolderPageDotsStyle({ controlsVisible: true, grid, hidden: true, panel });
  assert(hiddenDots.opacity === 0 && hiddenDots.pointerEvents === "none", "hidden page dots should not receive pointer events");

  const fallbackDots = makeSingleStageFolderPageDotsStyle({ controlsVisible: true, hidden: false, panel });
  assert(fallbackDots.top === "523px", "page dots should have a panel-only fallback position");
}
