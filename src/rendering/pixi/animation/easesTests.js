import { folderCloseEase, folderOpenGhostDuration, folderOpenGhostEase, folderPanelCloseDuration } from "./eases.js";

export function runPixiEaseTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi ease test failed] ${message}`);
  };

  assert(typeof folderOpenGhostEase === "function", "folder open ghost ease should be a CustomEase function");
  assert(typeof folderCloseEase === "function", "folder close ease should be a CustomEase function");
  assert(folderOpenGhostEase(0) === 0 && folderOpenGhostEase(1) === 1, "open ghost ease should start and end at rest");
  assert(folderCloseEase(0) === 0 && folderCloseEase(1) === 1, "close ease should start and end at rest");
  assert(folderOpenGhostDuration === 0.36, "open ghost duration should match DOM Motion");
  assert(folderPanelCloseDuration === 0.38, "panel close duration should match DOM Motion");
}
