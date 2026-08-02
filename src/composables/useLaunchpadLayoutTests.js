import { ref } from "vue";
import {
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ROWS,
} from "./launchpadConstants.js";
import { useLaunchpadLayout } from "./useLaunchpadLayout.js";

function makeApps(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `layout-owner-app-${index}`,
    type: "app",
    name: `App ${index}`,
  }));
}

export function runLaunchpadLayoutOwnerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad layout owner test failed] ${message}`);
  };

  const layout = useLaunchpadLayout({ seedEnabled: false });
  const state = layout.presentation;
  assert(state.gridRows.value === DEFAULT_ROWS && state.gridCols.value === DEFAULT_COLS, "desktop grid should use defaults");
  assert(state.folderRows.value === DEFAULT_FOLDER_ROWS && state.folderCols.value === DEFAULT_FOLDER_COLS, "folder grid should use defaults");
  assert(state.iconSize.value === DEFAULT_ICON_SIZE && state.folderIconSize.value === DEFAULT_ICON_SIZE, "icon sizes should use defaults");
  assert(state.pages.value.length === 1 && state.pages.value[0].length === 0, "unseeded layouts should start with one empty page");

  layout.commitPages([makeApps(8), []]);
  layout.commitPageIndex(1);
  const applied = layout.applyConfiguration({
    rows: 2,
    cols: 3,
    folderRows: 2,
    folderCols: 2,
    iconSize: 72,
    folderIconSizeMode: "custom",
    folderIconSize: 80,
  });
  assert(applied.rows === 2 && applied.cols === 3, "configuration should return normalized desktop dimensions");
  assert(state.pages.value.length === 2 && state.pages.value[0].length === 6 && state.pages.value[1].length === 2, "shrinking the grid should carry overflow forward");
  assert(state.pageIndex.value === 1, "configuration should clamp the desktop page index");
  assert(state.pageSize.value === 6 && state.folderPageSize.value === 4, "page sizes should derive from committed configuration");

  const phase = ref("open");
  const folderId = ref("folder-a");
  layout.setFolderPageTurnContextResolver(() => ({
    folderId: folderId.value,
    maxIndex: 3,
    phase: phase.value,
  }));
  const staleToken = layout.requestFolderPageTurn(2);
  const currentToken = layout.requestFolderPageTurn(99);
  assert(layout.presentation.folderPageTurnRequest.value.targetIndex === 3, "folder turn targets should clamp to current bounds");
  assert(!layout.commitFolderPageTurnRequest(staleToken), "superseded folder turn tokens should be rejected");
  assert(layout.commitFolderPageTurnRequest(currentToken), "current folder turn tokens should commit");
  assert(state.folderPageIndex.value === 3 && state.visualFolderPageIndex.value === 3, "folder turn commits should update the owner state");

  layout.documentPersistence.restorePages([[{ id: "restored", type: "app", name: "Restored" }]]);
  assert(state.pages.value[0][0].id === "restored", "persistence restore should replace pages through the owner");
  assert(layout.documentPersistence.capture().pages[0][0].id === "restored", "persistence capture should return a semantic clone");

  const seeded = useLaunchpadLayout({
    seeds: makeApps(7),
  });
  seeded.applyConfiguration({ rows: 2, cols: 3 });
  assert(seeded.presentation.pages.value.length === 2, "seed initialization should use the same owner and grid repack path");
  const snapshot = seeded.documentPersistence.createSnapshot({
    ...seeded.captureConfiguration(),
    gridRows: 2,
    gridCols: 3,
    folderRows: 3,
    folderCols: 4,
    pages: seeded.documentPersistence.capture().pages,
  });
  assert(snapshot.pages[0][0].type === "manualApp", "layout persistence should share the owner operations");
}
