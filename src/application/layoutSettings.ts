import type {StateHost} from "./stateHost.js";
import type {createLaunchpadLayoutState} from "./launchpadLayoutState.js";
import type {LayoutSettings} from "../domain/layoutDocument.js";
import {DEFAULT_ROWS,DEFAULT_COLS,DEFAULT_FOLDER_ROWS,DEFAULT_FOLDER_COLS,ICON_SIZE_STEP} from "../domain/launchpadConstants.js";
import {clampLaunchpadIconSize,normalizeFolderIconSizeMode,FOLDER_ICON_SIZE_MODE_CUSTOM} from "../domain/layoutConfiguration.js";
import {clamp} from "../domain/launchpadLayout.js";
type LaunchpadSettingsRuntimeOptions = {reclampPageIndices?:()=>void;schedulePageGridMetrics?:()=>void};
export function createLayoutSettings(options:{layout:Pick<ReturnType<typeof createLaunchpadLayoutState>,"captureConfiguration"|"applyConfiguration">;isDragActive?:()=>boolean},host:StateHost){
  const layout=options.layout,{cell:ref}=host;
  const isTextlessModeState=ref(false);
  const draftRows = ref(DEFAULT_ROWS);
  const draftCols = ref(DEFAULT_COLS);
  const draftFolderRows = ref(DEFAULT_FOLDER_ROWS);
  const draftFolderCols = ref(DEFAULT_FOLDER_COLS);
  const draftIconSize = ref(clampLaunchpadIconSize(null));
  const draftFolderIconSizeMode = ref<LayoutSettings["folderIconSizeMode"]>(normalizeFolderIconSizeMode(null));
  const draftFolderIconSize = ref(clampLaunchpadIconSize(null));
  const draftIsTextlessMode = ref(false);

  function syncDraftsFromCommitted(){
    const currentLayout = layout.captureConfiguration();
    draftRows.value = currentLayout.rows;
    draftCols.value = currentLayout.cols;
    draftFolderRows.value = currentLayout.folderRows;
    draftFolderCols.value = currentLayout.folderCols;
    draftIconSize.value = currentLayout.iconSize;
    draftFolderIconSizeMode.value = currentLayout.folderIconSizeMode;
    draftFolderIconSize.value = currentLayout.folderIconSize;
    draftIsTextlessMode.value = isTextlessModeState.value;
  }
  function changeDraftRows(delta: number): void {
    draftRows.value = clamp(Number(draftRows.value) + delta || DEFAULT_ROWS, 2, 8);
  }

  function changeDraftCols(delta: number): void {
    draftCols.value = clamp(Number(draftCols.value) + delta || DEFAULT_COLS, 3, 10);
  }

  function changeDraftFolderRows(delta: number): void {
    draftFolderRows.value = clamp(Number(draftFolderRows.value) + delta || DEFAULT_FOLDER_ROWS, 2, 6);
  }

  function changeDraftFolderCols(delta: number): void {
    draftFolderCols.value = clamp(Number(draftFolderCols.value) + delta || DEFAULT_FOLDER_COLS, 2, 8);
  }

  function changeDraftIconSize(direction: number): void {
    draftIconSize.value = clampLaunchpadIconSize(draftIconSize.value + direction * ICON_SIZE_STEP);
  }

  function changeDraftFolderIconSize(direction: number): void {
    draftFolderIconSize.value = clampLaunchpadIconSize(draftFolderIconSize.value + direction * ICON_SIZE_STEP);
  }

  function setDraftFolderIconSizeMode(mode: unknown): void {
    const nextMode = normalizeFolderIconSizeMode(mode);
    if (
      nextMode === FOLDER_ICON_SIZE_MODE_CUSTOM
      && draftFolderIconSizeMode.value !== FOLDER_ICON_SIZE_MODE_CUSTOM
      && layout.captureConfiguration().folderIconSizeMode !== FOLDER_ICON_SIZE_MODE_CUSTOM
    ) {
      draftFolderIconSize.value = clampLaunchpadIconSize(draftIconSize.value);
    }
    draftFolderIconSizeMode.value = nextMode;
    draftFolderIconSize.value = clampLaunchpadIconSize(draftFolderIconSize.value);
  }


  function applyLayoutEdit(runtimeOptions: LaunchpadSettingsRuntimeOptions = {}) {
    let appliedLayout = layout.captureConfiguration();
    if (!options.isDragActive?.()) {
      appliedLayout = layout.applyConfiguration({
        rows: draftRows.value,
        cols: draftCols.value,
        folderRows: draftFolderRows.value,
        folderCols: draftFolderCols.value,
        iconSize: draftIconSize.value,
        folderIconSizeMode: draftFolderIconSizeMode.value,
        folderIconSize: draftFolderIconSize.value,
      });
      runtimeOptions.reclampPageIndices?.();
      isTextlessModeState.value = Boolean(draftIsTextlessMode.value);
    }
    runtimeOptions.schedulePageGridMetrics?.();
    return appliedLayout;
  }


  syncDraftsFromCommitted();
  return {isTextlessModeState,draftRows,draftCols,draftFolderRows,draftFolderCols,draftIconSize,draftFolderIconSizeMode,draftFolderIconSize,draftIsTextlessMode,changeDraftRows,changeDraftCols,changeDraftFolderRows,changeDraftFolderCols,changeDraftIconSize,changeDraftFolderIconSize,setDraftFolderIconSizeMode,syncDraftsFromCommitted,applyLayoutEdit};
}

