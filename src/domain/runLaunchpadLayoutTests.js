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
import { runSpringMotionTests } from "../rendering/pixi/animation/springMotionTests.js";
import { runStageCoordinatesTests } from "../rendering/pixi/geometry/stageCoordinatesTests.js";

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
runSpringMotionTests();
runStageCoordinatesTests();

console.info("Launchpad layout helper tests passed");
