import { createLaunchpadLayoutHelpers, makePageSize } from "./launchpadLayout.js";
import { runFolderLayoutStylesTests } from "../composables/useFolderLayoutStylesTests.js";
import { runLaunchpadDragTests } from "../composables/useLaunchpadDragTests.js";
import { runLaunchpadFolderFlowTests } from "../composables/useLaunchpadFolderFlowTests.js";
import { runLaunchpadIconActivationTests } from "../composables/useLaunchpadIconActivationTests.js";
import { runLaunchpadLaunchFlowTests } from "../composables/useLaunchpadLaunchFlowTests.js";
import { runLaunchpadSearchTests } from "../composables/useLaunchpadSearchTests.js";
import { runLaunchpadSettingsConfigTests } from "../composables/useLaunchpadSettingsConfigTests.js";
import { runLaunchpadDataTests } from "./launchpadDataTests.js";
import { runLaunchpadHelperTests } from "./launchpadLayoutTests.js";
import { runPageRenderRangeTests } from "../composables/usePageRenderRangeTests.js";

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
runLaunchpadDragTests();
runLaunchpadFolderFlowTests();
runLaunchpadIconActivationTests();
await runLaunchpadLaunchFlowTests();
runFolderLayoutStylesTests();
runLaunchpadSettingsConfigTests();
await runLaunchpadSearchTests();
await runPageRenderRangeTests();

console.info("Launchpad layout helper tests passed");
