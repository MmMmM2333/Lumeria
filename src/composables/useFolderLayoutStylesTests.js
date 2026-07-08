import { ref } from "vue";
import { useFolderLayoutStyles } from "./useFolderLayoutStyles.js";

function makeItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `folder-test-${index}`,
    type: "app",
    name: `Folder Test ${index}`,
    emoji: "T",
  }));
}

function createFolderLayoutStyles(overrides = {}) {
  const folderRows = ref(overrides.folderRows ?? 7);
  const folderCols = ref(overrides.folderCols ?? 5);
  const folderPages = ref(overrides.folderPages ?? [makeItems(5)]);
  const folderIconSizeMode = ref(overrides.folderIconSizeMode ?? "match");
  const folderIconSize = ref(overrides.folderIconSize ?? 88);
  const iconSize = ref(overrides.iconSize ?? 72);
  const folderViewportHeight = ref(overrides.folderViewportHeight ?? 320);

  return useFolderLayoutStyles({
    customFolderIconSizeMode: "custom",
    folderCols,
    folderIconSize,
    folderIconSizeMode,
    folderPages,
    folderRows,
    folderViewportHeight,
    getVisibleFolderPage: (page) => (page || []).slice(0, folderRows.value * folderCols.value),
    iconSize,
  });
}

export function runFolderLayoutStylesTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder layout styles test failed] ${message}`);
  };

  const singleRow = createFolderLayoutStyles({
    folderPages: [makeItems(5)],
    folderViewportHeight: 320,
  });
  assert(singleRow.visibleFolderRowCount.value === 1, "single-row folders should use one visible row");
  assert(
    singleRow.folderGridStyle.value.gridTemplateRows === "repeat(1, var(--folder-icon-cell-height))",
    "single-row folders should use fixed cell rows instead of stretching tracks",
  );
  assert(!singleRow.folderGridStyle.value.gridTemplateRows.includes("1fr"), "folder rows should not use fractional height tracks");
  assert(singleRow.folderPanelStyle.value["--folder-icon-cell-height"] === "128px", "default folder icon cell height should include label space");

  const twoRows = createFolderLayoutStyles({
    folderPages: [makeItems(6)],
    folderViewportHeight: 500,
  });
  assert(twoRows.visibleFolderRowCount.value === 2, "partial second rows should increase the visible row count");
  assert(
    twoRows.folderGridStyle.value.gridTemplateRows === "repeat(2, var(--folder-icon-cell-height))",
    "multi-row folders should share the same fixed row template",
  );

  const fullPage = createFolderLayoutStyles({
    folderPages: [makeItems(35)],
    folderViewportHeight: 1200,
  });
  assert(fullPage.visibleFolderRowCount.value === 7, "full 5x7 folder pages should use all configured rows");
  assert(
    fullPage.folderGridStyle.value.gridTemplateRows === "repeat(7, var(--folder-icon-cell-height))",
    "full folder pages should keep fixed row sizing",
  );

  const customSize = createFolderLayoutStyles({
    folderIconSizeMode: "custom",
    folderIconSize: 88,
    folderPages: [makeItems(5)],
    folderViewportHeight: 360,
  });
  assert(customSize.effectiveFolderIconSize.value === 88, "custom folder icon mode should use the folder icon size");
  assert(customSize.folderPanelStyle.value["--folder-icon-size"] === "88px", "custom folder icon size should be exposed as CSS");
  assert(customSize.folderPanelStyle.value["--folder-icon-cell-height"] === "144px", "custom folder cells should still reserve label height");

  const originalWindowBeforeGrowth = globalThis.window;
  globalThis.window = { innerHeight: 746 };
  try {
    const rowGrowthWithStaleViewport = createFolderLayoutStyles({
      folderIconSizeMode: "custom",
      folderIconSize: 128,
      folderPages: [makeItems(6)],
      folderViewportHeight: 280,
    });
    assert(
      rowGrowthWithStaleViewport.folderPanelStyle.value["--folder-icon-size"] === "128px",
      "folder row growth should ignore a stale shorter viewport before compressing icons",
    );
    assert(
      rowGrowthWithStaleViewport.folderPanelStyle.value["--folder-icon-cell-height"] === "184px",
      "folder row growth should preserve the projected final cell height",
    );
  } finally {
    if (originalWindowBeforeGrowth === undefined) delete globalThis.window;
    else globalThis.window = originalWindowBeforeGrowth;
  }

  const compressed = createFolderLayoutStyles({
    folderPages: [makeItems(35)],
    folderViewportHeight: 420,
  });
  const compressedCellHeight = Number.parseFloat(compressed.folderPanelStyle.value["--folder-icon-cell-height"]);
  const compressedIconSize = Number.parseFloat(compressed.folderPanelStyle.value["--folder-icon-size"]);
  assert(compressedCellHeight < 128, "constrained folders should compress the icon cell height");
  assert(compressedIconSize < 72, "constrained folders should compress the icon size");
  assert(compressedIconSize >= 20, "folder compression should preserve the minimum effective icon size");

  const originalWindow = globalThis.window;
  globalThis.window = { innerHeight: 620 };
  try {
    const initiallyMeasured = createFolderLayoutStyles({
      folderPages: [makeItems(35)],
      folderViewportHeight: 0,
    });
    const initiallyMeasuredIconSize = Number.parseFloat(initiallyMeasured.folderPanelStyle.value["--folder-icon-size"]);
    assert(initiallyMeasuredIconSize < 72, "unmeasured constrained folders should use the viewport estimate instead of flashing at full size");
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}
