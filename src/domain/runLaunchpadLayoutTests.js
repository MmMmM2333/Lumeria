import { createLaunchpadLayoutHelpers, makePageSize } from "./launchpadLayout.js";
import { runFolderLayoutStylesTests } from "../composables/useFolderLayoutStylesTests.js";
import { runLaunchpadDragTests } from "../composables/useLaunchpadDragTests.js";
import { runLaunchpadControllerHelpersTests } from "../composables/useLaunchpadControllerHelpersTests.js";
import { runLaunchpadControllerStateTests } from "../composables/useLaunchpadControllerStateTests.js";
import { runLaunchpadFolderFlowTests } from "../composables/useLaunchpadFolderFlowTests.js";
import { runFolderOpenIconGhostsTests } from "../composables/useFolderOpenIconGhostsTests.js";
import { runLaunchpadIconActivationTests } from "../composables/useLaunchpadIconActivationTests.js";
import { runLaunchpadKeyboardTests } from "../composables/useLaunchpadKeyboardTests.js";
import { runLaunchpadLaunchFlowTests } from "../composables/useLaunchpadLaunchFlowTests.js";
import { runLaunchpadLifecycleTests } from "../composables/useLaunchpadLifecycleTests.js";
import { runLaunchpadAppsTests } from "../composables/useLaunchpadAppsTests.js";
import { runLaunchpadNativeTests } from "../composables/useLaunchpadNativeTests.js";
import { runLaunchpadPageCommandsTests } from "../composables/useLaunchpadPageCommandsTests.js";
import { runLaunchpadSearchTests } from "../composables/useLaunchpadSearchTests.js";
import { runLaunchpadSettingsConfigTests } from "../composables/useLaunchpadSettingsConfigTests.js";
import { runSettingsPanelFlowTests } from "../composables/useSettingsPanelFlowTests.js";
import { runLaunchpadSurfaceInteractionsTests } from "../composables/useLaunchpadSurfaceInteractionsTests.js";
import { runLaunchpadViewStateTests } from "../composables/useLaunchpadViewStateTests.js";
import { runLaunchpadDataTests } from "./launchpadDataTests.js";
import { runIconSourceTests } from "./iconSourceTests.js";
import { runLaunchpadHelperTests } from "./launchpadLayoutTests.js";
import { runPageRenderRangeTests } from "../composables/usePageRenderRangeTests.js";
import { runPixiEaseTests } from "../rendering/pixi/animation/easesTests.js";
import { runSpringMotionTests } from "../rendering/pixi/animation/springMotionTests.js";
import { runDisplayObjectBoundsTests } from "../rendering/pixi/geometry/displayObjectBoundsTests.js";
import { runGridGeometryTests } from "../rendering/pixi/geometry/gridGeometryTests.js";
import { runStageCoordinatesTests } from "../rendering/pixi/geometry/stageCoordinatesTests.js";
import { runIconBoundsRegistryTests } from "../rendering/pixi/geometry/iconBoundsRegistryTests.js";
import { runIconTextureCacheTests } from "../rendering/pixi/assets/iconTextureCacheTests.js";
import { runPixiHostMetricsTests } from "../rendering/pixi/pixiHostMetricsTests.js";
import { runIconControlDrawingTests } from "../rendering/pixi/nodes/iconControlDrawingTests.js";
import { runIconInteractionGeometryTests } from "../rendering/pixi/nodes/iconInteractionGeometryTests.js";
import { runIconLabelLayoutTests } from "../rendering/pixi/nodes/iconLabelLayoutTests.js";
import { runIconSelectionFrameTests } from "../rendering/pixi/nodes/iconSelectionFrameTests.js";
import { runFolderThumbDrawingTests } from "../rendering/pixi/nodes/folderThumbDrawingTests.js";
import { runFolderThumbPreviewMotionTests } from "../rendering/pixi/nodes/folderThumbPreviewMotionTests.js";
import { runDragVisibilityTests } from "../rendering/pixi/scene/dragVisibilityTests.js";
import { runFolderFrameGhostTests } from "../rendering/pixi/scene/folderFrameGhostTests.js";
import { runFolderIconGhostMotionTests } from "../rendering/pixi/scene/folderIconGhostMotionTests.js";
import { runFolderOverlayLayerTests } from "../rendering/pixi/scene/FolderOverlayLayerTests.js";
import { runFolderOverlayTargetsTests } from "../rendering/pixi/scene/folderOverlayTargetsTests.js";
import { runIconSceneHelpersTests } from "../rendering/pixi/scene/iconSceneHelpersTests.js";

const state = {
  searchQuery: { value: "" },
  gridRows: { value: 4 },
  gridCols: { value: 6 },
  folderRows: { value: 3 },
  folderCols: { value: 4 },
};

const pageSize = {
  get value() {
    return makePageSize(state.gridRows.value, state.gridCols.value);
  },
};

const folderPageSize = {
  get value() {
    return makePageSize(state.folderRows.value, state.folderCols.value);
  },
};

const helpers = createLaunchpadLayoutHelpers({
  getPageSize: () => pageSize.value,
  getFolderPageSize: () => folderPageSize.value,
});

function getPageGridStyle() {
  return {
    gridTemplateRows: `repeat(${state.gridRows.value}, minmax(0, 1fr))`,
    gridTemplateColumns: `repeat(${state.gridCols.value}, minmax(0, 1fr))`,
  };
}

function getActivePageGridStyle(page) {
  const visibleCount = helpers.getVisibleDesktopPage(page).length;
  if (state.searchQuery.value.trim() && visibleCount > 0 && visibleCount < state.gridCols.value) {
    return {
      ...getPageGridStyle(),
      gridTemplateColumns: `repeat(${visibleCount}, minmax(82px, 108px))`,
      justifyContent: "center",
      columnGap: "30px",
      rowGap: "16px",
    };
  }
  return getPageGridStyle();
}

runLaunchpadHelperTests({
  helpers,
  pageSize,
  folderPageSize,
  searchQuery: state.searchQuery,
  gridRows: state.gridRows,
  gridCols: state.gridCols,
  getActivePageGridStyle,
});
runLaunchpadDataTests();
runIconSourceTests();
await runLaunchpadDragTests();
runLaunchpadControllerHelpersTests();
runLaunchpadControllerStateTests();
runLaunchpadFolderFlowTests();
await runFolderOpenIconGhostsTests();
runLaunchpadIconActivationTests();
runLaunchpadKeyboardTests();
await runLaunchpadLaunchFlowTests();
await runLaunchpadLifecycleTests();
await runLaunchpadAppsTests();
await runLaunchpadNativeTests();
runLaunchpadPageCommandsTests();
runLaunchpadSurfaceInteractionsTests();
runLaunchpadViewStateTests();
runFolderLayoutStylesTests();
runLaunchpadSettingsConfigTests();
runSettingsPanelFlowTests();
await runLaunchpadSearchTests();
await runPageRenderRangeTests();
runPixiEaseTests();
runSpringMotionTests();
runDisplayObjectBoundsTests();
runGridGeometryTests();
runStageCoordinatesTests();
runIconBoundsRegistryTests();
runPixiHostMetricsTests();
runIconControlDrawingTests();
runIconInteractionGeometryTests();
runIconLabelLayoutTests();
runIconSelectionFrameTests();
runFolderThumbDrawingTests();
runFolderThumbPreviewMotionTests();
runDragVisibilityTests();
runFolderFrameGhostTests();
runFolderIconGhostMotionTests();
runFolderOverlayLayerTests();
runFolderOverlayTargetsTests();
runIconSceneHelpersTests();
await runIconTextureCacheTests();

console.info("Launchpad layout helper tests passed");
