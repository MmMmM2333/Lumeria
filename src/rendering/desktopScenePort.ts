/**
 * Application-facing desktop-scene capabilities.
 *
 * Keep this list explicit: adding a renderer implementation export here is a
 * deliberate boundary change, not an incidental side effect of a new Pixi
 * helper being exported from its implementation module.
 */
export {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
  createIconBoundsRegistry,
} from "./pixi/geometry/iconBoundsRegistry.js";
export { stageLayoutRecordToClientRect } from "./pixi/geometry/stageCoordinates.js";
export { prefersReducedMotion } from "./pixi/animation/motionPreferences.js";
export { motionSprings } from "./pixi/animation/motionPresets.js";
export { killMotionOf, motion } from "./pixi/animation/motionTween.js";
export { appendGroupTrailPoint } from "./pixi/scene/groupDragPresentation.js";
export {
  makeGroupTransferRuntimeEntries,
  makeGroupTransferRuntimeReleasePlan,
} from "./pixi/scene/groupTransferRuntimeAdapter.js";
export { makeIconVisualSpec } from "./pixi/scene/iconVisualSpec.js";
export {
  resolveFolderClosingHandoffId,
  resolveFolderPixiActivityUpdate,
  resolveFolderSourceGhostedIds,
  shouldClearFolderClosingHandoffRetainId,
} from "./pixi/scene/folderClosingHandoffActivity.js";
export {
  getSingleStageDiagnosticsOptions,
  getSingleStageRenderKey,
} from "./pixi/scene/singleStagePlan.js";
