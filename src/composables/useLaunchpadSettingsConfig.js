import {
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ROWS,
  ICON_SIZE_MAX,
  ICON_SIZE_MIN,
  ICON_SIZE_STEP,
} from "./launchpadConstants.js";
import { clamp, makePageSize } from "../domain/launchpadLayout.js";

export const FOLDER_ICON_SIZE_MODE_CUSTOM = "custom";
export const FOLDER_ICON_SIZE_MODE_GLOBAL = "global";

export function clampLaunchpadIconSize(value) {
  return clamp(Number(value) || DEFAULT_ICON_SIZE, ICON_SIZE_MIN, ICON_SIZE_MAX);
}

export function normalizeFolderIconSizeMode(value) {
  return value === FOLDER_ICON_SIZE_MODE_CUSTOM ? FOLDER_ICON_SIZE_MODE_CUSTOM : FOLDER_ICON_SIZE_MODE_GLOBAL;
}

export function useLaunchpadSettingsConfig(options) {
  function clampIconSize(value) {
    return clampLaunchpadIconSize(value);
  }

  function changeDraftRows(delta) {
    options.draftRows.value = clamp(Number(options.draftRows.value) + delta || DEFAULT_ROWS, 2, 8);
  }

  function changeDraftCols(delta) {
    options.draftCols.value = clamp(Number(options.draftCols.value) + delta || DEFAULT_COLS, 3, 10);
  }

  function changeDraftFolderRows(delta) {
    options.draftFolderRows.value = clamp(Number(options.draftFolderRows.value) + delta || DEFAULT_FOLDER_ROWS, 2, 6);
  }

  function changeDraftFolderCols(delta) {
    options.draftFolderCols.value = clamp(Number(options.draftFolderCols.value) + delta || DEFAULT_FOLDER_COLS, 2, 8);
  }

  function changeDraftIconSize(direction) {
    options.draftIconSize.value = clampIconSize(options.draftIconSize.value + direction * ICON_SIZE_STEP);
  }

  function changeDraftFolderIconSize(direction) {
    options.draftFolderIconSize.value = clampIconSize(options.draftFolderIconSize.value + direction * ICON_SIZE_STEP);
  }

  function setDraftFolderIconSizeMode(mode) {
    const nextMode = normalizeFolderIconSizeMode(mode);
    if (
      nextMode === FOLDER_ICON_SIZE_MODE_CUSTOM
      && options.draftFolderIconSizeMode.value !== FOLDER_ICON_SIZE_MODE_CUSTOM
      && options.folderIconSizeMode.value !== FOLDER_ICON_SIZE_MODE_CUSTOM
    ) {
      options.draftFolderIconSize.value = clampIconSize(options.draftIconSize.value);
    }
    options.draftFolderIconSizeMode.value = nextMode;
    options.draftFolderIconSize.value = clampIconSize(options.draftFolderIconSize.value);
  }

  function repackPagesForGrid(nextRows, nextCols, nextFolderRows, nextFolderCols) {
    if (options.isDragActive()) return;
    const rows = clamp(Number(nextRows) || DEFAULT_ROWS, 2, 8);
    const cols = clamp(Number(nextCols) || DEFAULT_COLS, 3, 10);
    const nextFolderRowCount = clamp(Number(nextFolderRows) || DEFAULT_FOLDER_ROWS, 2, 6);
    const nextFolderColumnCount = clamp(Number(nextFolderCols) || DEFAULT_FOLDER_COLS, 2, 8);
    const newPageSize = makePageSize(rows, cols);
    const oldPageSize = options.pageSize.value;
    const oldFolderPageSize = options.folderPageSize.value;
    const newFolderPageSize = makePageSize(nextFolderRowCount, nextFolderColumnCount);

    let next = options.clonePages(options.pages.value);

    if (newPageSize < oldPageSize) {
      for (let i = 0; i < next.length; i++) {
        while (next[i].length > newPageSize) {
          const overflow = next[i].pop();
          options.ensurePage(next, i + 1);
          next[i + 1].unshift(overflow);
        }
      }
    }

    next = options.repackFoldersForPageSize(next, oldFolderPageSize, newFolderPageSize);
    const compacted = options.compactPages(next, { folderPageSize: newFolderPageSize });

    options.gridRows.value = rows;
    options.gridCols.value = cols;
    options.folderRows.value = nextFolderRowCount;
    options.folderCols.value = nextFolderColumnCount;
    options.iconSize.value = clampIconSize(options.draftIconSize.value);
    options.folderIconSizeMode.value = normalizeFolderIconSizeMode(options.draftFolderIconSizeMode.value);
    options.folderIconSize.value = clampIconSize(options.draftFolderIconSize.value);
    options.draftRows.value = rows;
    options.draftCols.value = cols;
    options.draftFolderRows.value = nextFolderRowCount;
    options.draftFolderCols.value = nextFolderColumnCount;
    options.draftIconSize.value = options.iconSize.value;
    options.draftFolderIconSizeMode.value = options.folderIconSizeMode.value;
    options.draftFolderIconSize.value = options.folderIconSize.value;
    options.commitPages(compacted);
    options.commitPageIndex(options.pageIndex.value);
    options.commitSearchPageIndex(options.searchPageIndex.value);
    options.commitFolderPageIndex(options.folderPageIndex.value);
  }

  function applyGridConfig() {
    repackPagesForGrid(
      options.draftRows.value,
      options.draftCols.value,
      options.draftFolderRows.value,
      options.draftFolderCols.value,
    );
    options.schedulePageGridMetrics();
  }

  function applySettingsConfig() {
    applyGridConfig();
    options.closeSettingsPanel();
  }

  return {
    applyGridConfig,
    applySettingsConfig,
    changeDraftCols,
    changeDraftFolderCols,
    changeDraftFolderIconSize,
    changeDraftFolderRows,
    changeDraftIconSize,
    changeDraftRows,
    clampIconSize,
    setDraftFolderIconSizeMode,
  };
}
