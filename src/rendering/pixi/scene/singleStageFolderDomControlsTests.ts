import {
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

  const openingOpacity = getSingleStageFolderTitleOpacity(0.32);
  assert(nearlyEqual(openingOpacity, 0.32), "opening title opacity should follow the folder visibility progress");

  const openingInput = makeSingleStageFolderNameInputStyle({
    controlsVisible: true,
    folderVisibilityProgress: 0.32,
    frame: { ...frame, progress: 0.8 },
  });
  assert(openingInput.left === "400px", "name input should stay centered over the panel frame");
  assert(openingInput.top === "216px", "name input should sit above the panel frame");
  assert(nearlyEqual(openingInput.opacity, 0.32), "name input opacity should not depend on the geometry progress");
  assert(openingInput.pointerEvents === "none", "partially visible input should not receive pointer events");
  assert(openingInput.filter === "blur(2px)", "partially visible input should use the blur transition");

  const readyInput = makeSingleStageFolderNameInputStyle({ controlsVisible: true, folderVisibilityProgress: 1, frame });
  assert(readyInput.opacity === 1, "fully open input should be opaque");
  assert(readyInput.pointerEvents === "auto", "fully open input should receive pointer events");
  assert(readyInput.filter === "blur(0px)", "fully open input should clear the blur");

  const disabledInput = makeSingleStageFolderNameInputStyle({
    controlsVisible: true,
    folderVisibilityProgress: 1,
    frame,
    isInputDisabled: true,
  });
  assert(disabledInput.pointerEvents === "none", "disabled input should not receive pointer events");

  const closingOpacity = getSingleStageFolderTitleOpacity(0.14);
  assert(nearlyEqual(closingOpacity, 0.14), "closing title should keep following the folder visibility progress");

  const closingInput = makeSingleStageFolderNameInputStyle({
    controlsVisible: true,
    folderVisibilityProgress: 0.14,
    frame,
  });
  assert(
    nearlyEqual(closingInput.opacity, 0.14) && closingInput.pointerEvents === "none",
    "closing input should expose the in-flight opacity without remaining interactive",
  );

  const interruptedOpeningOpacities = [0.62, 0.4, 0.18, 0].map((folderVisibilityProgress) => (
    makeSingleStageFolderNameInputStyle({ controlsVisible: true, folderVisibilityProgress, frame }).opacity
  ));
  assert(
    interruptedOpeningOpacities.every((opacity, index) => (
      nearlyEqual(opacity, [0.62, 0.4, 0.18, 0][index]!) &&
      (index === 0 || opacity <= interruptedOpeningOpacities[index - 1]!)
    )),
    "interrupted opening should reverse the same title progress monotonically instead of snapping to a CSS target",
  );

}
