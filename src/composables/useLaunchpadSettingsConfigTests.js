import { createLaunchpadLayoutHelpers, makePageSize } from "../domain/launchpadLayout.js";
import {
  FOLDER_ICON_SIZE_MODE_CUSTOM,
  FOLDER_ICON_SIZE_MODE_GLOBAL,
  clampLaunchpadIconSize,
  normalizeFolderIconSizeMode,
  useLaunchpadSettingsConfig,
} from "./useLaunchpadSettingsConfig.js";

function refValue(value) {
  return { value };
}

function makeItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `settings-test-${index}`,
    type: "app",
    name: `Settings Test ${index}`,
    emoji: "S",
  }));
}

function createSettingsConfig(overrides = {}) {
  const state = {
    gridRows: refValue(overrides.gridRows ?? 2),
    gridCols: refValue(overrides.gridCols ?? 3),
    folderRows: refValue(overrides.folderRows ?? 2),
    folderCols: refValue(overrides.folderCols ?? 3),
    draftRows: refValue(overrides.draftRows ?? 2),
    draftCols: refValue(overrides.draftCols ?? 2),
    draftFolderRows: refValue(overrides.draftFolderRows ?? 2),
    draftFolderCols: refValue(overrides.draftFolderCols ?? 2),
    iconSize: refValue(overrides.iconSize ?? 64),
    folderIconSizeMode: refValue(overrides.folderIconSizeMode ?? FOLDER_ICON_SIZE_MODE_GLOBAL),
    folderIconSize: refValue(overrides.folderIconSize ?? 64),
    draftIconSize: refValue(overrides.draftIconSize ?? 72),
    draftFolderIconSizeMode: refValue(overrides.draftFolderIconSizeMode ?? FOLDER_ICON_SIZE_MODE_CUSTOM),
    draftFolderIconSize: refValue(overrides.draftFolderIconSize ?? 80),
    pages: refValue(overrides.pages ?? [makeItems(6)]),
    pageIndex: refValue(overrides.pageIndex ?? 2),
    searchPageIndex: refValue(overrides.searchPageIndex ?? 1),
    folderPageIndex: refValue(overrides.folderPageIndex ?? 1),
  };
  const calls = {
    closeSettingsPanel: 0,
    commitFolderPageIndex: [],
    commitPageIndex: [],
    commitPages: [],
    commitSearchPageIndex: [],
    schedulePageGridMetrics: 0,
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
  const config = useLaunchpadSettingsConfig({
    clonePages: helpers.clonePages,
    closeSettingsPanel: () => {
      calls.closeSettingsPanel += 1;
    },
    commitFolderPageIndex: (value) => calls.commitFolderPageIndex.push(value),
    commitPageIndex: (value) => calls.commitPageIndex.push(value),
    commitPages: (next) => {
      calls.commitPages.push(next);
      state.pages.value = next;
    },
    commitSearchPageIndex: (value) => calls.commitSearchPageIndex.push(value),
    compactPages: helpers.compactPages,
    draftCols: state.draftCols,
    draftFolderCols: state.draftFolderCols,
    draftFolderIconSize: state.draftFolderIconSize,
    draftFolderIconSizeMode: state.draftFolderIconSizeMode,
    draftFolderRows: state.draftFolderRows,
    draftIconSize: state.draftIconSize,
    draftRows: state.draftRows,
    ensurePage: helpers.ensurePage,
    folderCols: state.folderCols,
    folderIconSize: state.folderIconSize,
    folderIconSizeMode: state.folderIconSizeMode,
    folderPageIndex: state.folderPageIndex,
    folderPageSize,
    folderRows: state.folderRows,
    gridCols: state.gridCols,
    gridRows: state.gridRows,
    iconSize: state.iconSize,
    isDragActive: () => Boolean(overrides.isDragActive),
    pageIndex: state.pageIndex,
    pageSize,
    pages: state.pages,
    repackFoldersForPageSize: helpers.repackFoldersForPageSize,
    schedulePageGridMetrics: () => {
      calls.schedulePageGridMetrics += 1;
    },
    searchPageIndex: state.searchPageIndex,
  });

  return { calls, config, state };
}

export function runLaunchpadSettingsConfigTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad settings config test failed] ${message}`);
  };

  assert(clampLaunchpadIconSize(8) === 32, "icon size clamp should enforce the minimum");
  assert(clampLaunchpadIconSize(160) === 128, "icon size clamp should enforce the maximum");
  assert(clampLaunchpadIconSize("bad") === 64, "icon size clamp should fall back to the default");
  assert(normalizeFolderIconSizeMode(FOLDER_ICON_SIZE_MODE_CUSTOM) === FOLDER_ICON_SIZE_MODE_CUSTOM, "custom folder icon mode should be preserved");
  assert(normalizeFolderIconSizeMode("unknown") === FOLDER_ICON_SIZE_MODE_GLOBAL, "unknown folder icon modes should fall back to global");

  const draft = createSettingsConfig({
    draftCols: 10,
    draftFolderCols: 8,
    draftFolderRows: 6,
    draftRows: 8,
  });
  draft.config.changeDraftRows(1);
  draft.config.changeDraftCols(1);
  draft.config.changeDraftFolderRows(1);
  draft.config.changeDraftFolderCols(1);
  assert(draft.state.draftRows.value === 8, "draft desktop rows should clamp to the maximum");
  assert(draft.state.draftCols.value === 10, "draft desktop columns should clamp to the maximum");
  assert(draft.state.draftFolderRows.value === 6, "draft folder rows should clamp to the maximum");
  assert(draft.state.draftFolderCols.value === 8, "draft folder columns should clamp to the maximum");

  const folderIconMode = createSettingsConfig({
    draftFolderIconSizeMode: FOLDER_ICON_SIZE_MODE_GLOBAL,
    draftIconSize: 96,
    folderIconSizeMode: FOLDER_ICON_SIZE_MODE_GLOBAL,
  });
  folderIconMode.config.setDraftFolderIconSizeMode(FOLDER_ICON_SIZE_MODE_CUSTOM);
  assert(folderIconMode.state.draftFolderIconSizeMode.value === FOLDER_ICON_SIZE_MODE_CUSTOM, "folder icon draft mode should switch to custom");
  assert(folderIconMode.state.draftFolderIconSize.value === 96, "switching to custom should seed from the desktop draft size");
  folderIconMode.config.changeDraftFolderIconSize(10);
  assert(folderIconMode.state.draftFolderIconSize.value === 128, "folder icon draft size should clamp after step changes");

  const apply = createSettingsConfig({
    gridCols: 3,
    gridRows: 3,
    draftCols: 3,
    draftRows: 2,
    pages: [makeItems(7)],
  });
  apply.config.applySettingsConfig();
  assert(apply.state.gridRows.value === 2 && apply.state.gridCols.value === 3, "desktop grid dimensions should apply from drafts");
  assert(apply.state.folderRows.value === 2 && apply.state.folderCols.value === 2, "folder grid dimensions should apply from drafts");
  assert(apply.state.iconSize.value === 72, "desktop icon size should apply from the draft value");
  assert(apply.state.folderIconSizeMode.value === FOLDER_ICON_SIZE_MODE_CUSTOM, "folder icon mode should apply from the draft value");
  assert(apply.state.folderIconSize.value === 80, "folder icon size should apply from the draft value");
  assert(apply.calls.commitPages.length === 1, "applying settings should commit repacked pages");
  assert(apply.calls.commitPages[0].length === 2, "shrinking page capacity should overflow items to another page");
  assert(apply.calls.commitPageIndex.join(",") === "2", "applying settings should reclamp the desktop page index");
  assert(apply.calls.commitSearchPageIndex.join(",") === "1", "applying settings should reclamp the search page index");
  assert(apply.calls.commitFolderPageIndex.join(",") === "1", "applying settings should reclamp the folder page index");
  assert(apply.calls.schedulePageGridMetrics === 1, "applying settings should schedule page metrics");
  assert(apply.calls.closeSettingsPanel === 1, "applying settings from the panel should close it");

  const dragActive = createSettingsConfig({ isDragActive: true });
  dragActive.config.applyGridConfig();
  assert(dragActive.calls.commitPages.length === 0, "drag-active settings apply should not repack pages");
  assert(dragActive.calls.schedulePageGridMetrics === 1, "drag-active settings apply should still request metrics refresh");
}
