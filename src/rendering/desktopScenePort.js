/**
 * Public desktop-scene capability boundary. Consumers outside the Pixi
 * adapter import scene semantics here; the concrete implementation can later
 * be replaced without changing controller imports.
 */
export * from "./pixi/geometry/iconBoundsRegistry.js";
export * from "./pixi/geometry/stageCoordinates.js";
export * from "./pixi/animation/motionPreferences.js";
export * from "./pixi/animation/motionPresets.js";
export * from "./pixi/animation/motionTween.js";
export * from "./pixi/scene/groupDragPresentation.js";
export * from "./pixi/scene/groupTransferRuntimeAdapter.js";
export * from "./pixi/scene/iconVisualSpec.js";
export * from "./pixi/scene/folderClosingHandoffActivity.js";
export * from "./pixi/scene/singleStagePlan.js";
export * from "./pixi/createPixiApp.js";
export * from "./pixi/pixiText.js";
