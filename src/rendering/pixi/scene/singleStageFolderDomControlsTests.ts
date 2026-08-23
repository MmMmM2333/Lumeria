import {
  getSingleStageFolderTitleOpenOpacity,
  getSingleStageFolderTitleOpacity,
  isSingleStageFolderTitleFrameCurrent,
  makeSingleStageFolderNameInputStyle,
} from "./singleStageFolderDomControls.js";

export function runSingleStageFolderDomControlsTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Pixi single-stage folder DOM controls test failed] ${message}`);
  };
  const nearlyEqual = (actual: number, expected: number) => Math.abs(actual - expected) < 0.000001;

  const frame = { folderId: "folder-a", height: 180, left: 320, progress: 1, top: 260, width: 520 };
  assert(isSingleStageFolderTitleFrameCurrent(frame, "folder-a"), "title frame should be accepted for its owning folder");
  assert(!isSingleStageFolderTitleFrameCurrent(frame, "folder-b"), "title frame from a previous folder should be rejected");
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

  const closingOpacity = getSingleStageFolderTitleOpacity({ progress: 0.14 }, { isClosing: true });
  assert(closingOpacity === 0, "closing title should expose one stable CSS transition target");

  const closingInput = makeSingleStageFolderNameInputStyle({ controlsVisible: true, frame, isClosing: true });
  assert(
    closingInput.opacity === 0 && closingInput.pointerEvents === "none",
    "closing input should transition toward hidden without remaining interactive",
  );

}
