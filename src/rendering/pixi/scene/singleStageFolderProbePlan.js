import { getFolderPanelGeometry } from "../geometry/gridGeometry.js";
import { makeStageLocalRect } from "../geometry/stageCoordinates.js";
import { getStableFolderCloseRects, makeFolderThumbPreviewRect } from "./folderOverlayTargets.js";
import { resolveFolderOverlayTargets } from "./folderOverlayTargetResolver.js";

export const SINGLE_STAGE_CHANGED_EVENT = "launchpad-single-stage-change";
export const SINGLE_STAGE_FOLDER_PROBE_CHANGED_EVENT = "launchpad-single-stage-folder-probe-change";
const SINGLE_STAGE_GLOBAL_FLAG = "__LP_SINGLE_STAGE__";
const SINGLE_STAGE_SETTER_GLOBAL = "__LP_SET_SINGLE_STAGE__";
const SINGLE_STAGE_FOLDER_PROBE_GLOBAL_FLAG = "__LP_SINGLE_STAGE_FOLDER__";
const SINGLE_STAGE_FOLDER_PROBE_SETTER_GLOBAL = "__LP_SET_SINGLE_STAGE_FOLDER__";
let singleStageGlobalValue;

function dispatchEvent(name) {
  if (typeof globalThis.dispatchEvent !== "function") return;
  const EventConstructor = globalThis.CustomEvent || globalThis.Event;
  if (!EventConstructor) return;
  globalThis.dispatchEvent(new EventConstructor(name));
}

function dispatchSingleStageChanged() {
  dispatchEvent(SINGLE_STAGE_CHANGED_EVENT);
  dispatchEvent(SINGLE_STAGE_FOLDER_PROBE_CHANGED_EVENT);
}

function readSingleStageGlobalValue() {
  if (singleStageGlobalValue !== undefined) return singleStageGlobalValue;
  if (globalThis[SINGLE_STAGE_GLOBAL_FLAG] !== undefined) return globalThis[SINGLE_STAGE_GLOBAL_FLAG];
  return globalThis[SINGLE_STAGE_FOLDER_PROBE_GLOBAL_FLAG];
}

function installSingleStageGlobalAccessor(name) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  if (descriptor?.get?.__launchpadSingleStage === true) return;
  if (descriptor && descriptor.configurable === false) return;
  if (singleStageGlobalValue === undefined && globalThis[name] !== undefined) {
    singleStageGlobalValue = globalThis[name];
  }
  const getter = function getLaunchpadSingleStageFolderProbeFlag() {
    return singleStageGlobalValue;
  };
  getter.__launchpadSingleStage = true;
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get: getter,
    set(value) {
      singleStageGlobalValue = value;
      dispatchSingleStageChanged();
    },
  });
}

export function installSingleStageGlobalFlag() {
  installSingleStageGlobalAccessor(SINGLE_STAGE_GLOBAL_FLAG);
  installSingleStageGlobalAccessor(SINGLE_STAGE_FOLDER_PROBE_GLOBAL_FLAG);
  globalThis[SINGLE_STAGE_SETTER_GLOBAL] = setSingleStageOptions;
  globalThis[SINGLE_STAGE_FOLDER_PROBE_SETTER_GLOBAL] = setSingleStageFolderProbeOptions;
}

export function installSingleStageFolderProbeGlobalFlag() {
  installSingleStageGlobalFlag();
}

export function getSingleStageOptions(value = readSingleStageGlobalValue()) {
  if (value === true) return { dragPreview: false, enabled: true, folderLayer: false, log: false, probe: true, rootStage: false };
  if (!value || typeof value !== "object") return { dragPreview: false, enabled: false, folderLayer: false, log: false, probe: false, rootStage: false };
  const hasStageOwnership = value.rootStage === true || value.dragPreview === true || value.folderLayer === true;
  const enabled = value.enabled === true || value.probe === true || hasStageOwnership;
  const folderLayer = enabled && value.folderLayer === true;
  const dragPreview = enabled && (value.dragPreview === true || folderLayer);
  return {
    dragPreview,
    enabled,
    folderLayer,
    log: enabled && value.log === true,
    probe: enabled && value.probe !== false,
    rootStage: enabled && (value.rootStage === true || folderLayer || dragPreview),
  };
}

export function getSingleStageFolderProbeOptions(value = readSingleStageGlobalValue()) {
  return getSingleStageOptions(value);
}

export function getSingleStageOptionsKey(options = getSingleStageOptions()) {
  return [
    options.dragPreview ? "1" : "0",
    options.enabled ? "1" : "0",
    options.folderLayer ? "1" : "0",
    options.log ? "1" : "0",
    options.probe ? "1" : "0",
    options.rootStage ? "1" : "0",
  ].join("");
}

export function getSingleStageFolderProbeOptionsKey(options = getSingleStageFolderProbeOptions()) {
  return getSingleStageOptionsKey(options);
}

export function getSingleStageRenderKey(options = getSingleStageOptions()) {
  return [
    options.dragPreview ? "1" : "0",
    options.folderLayer ? "1" : "0",
    options.rootStage ? "1" : "0",
  ].join("");
}

export function getSingleStageFolderProbeRenderKey(options = getSingleStageFolderProbeOptions()) {
  return getSingleStageRenderKey(options);
}

export function setSingleStageOptions(value) {
  installSingleStageGlobalFlag();
  globalThis[SINGLE_STAGE_GLOBAL_FLAG] = value;
  return getSingleStageOptions(value);
}

export function setSingleStageFolderProbeOptions(value) {
  installSingleStageGlobalFlag();
  globalThis[SINGLE_STAGE_FOLDER_PROBE_GLOBAL_FLAG] = value;
  return getSingleStageOptions(value);
}

export function isSingleStageDiagnosticsEnabled(value = readSingleStageGlobalValue()) {
  return getSingleStageOptions(value).probe;
}

export function isSingleStageFolderProbeEnabled(value = readSingleStageGlobalValue()) {
  return isSingleStageDiagnosticsEnabled(value);
}

export function makeSingleStageFolderProbePlan(state, options = {}) {
  const enabled = options.enabled == null
    ? isSingleStageFolderProbeEnabled()
    : isSingleStageFolderProbeEnabled(options.enabled);
  if (!enabled || !state?.renderedFolder) return null;
  const geometry = getFolderPanelGeometry({
    height: state.height,
    panelStyle: state.folderPanelStyle,
    width: state.width,
  });
  const folderId = state.renderedFolder.id;
  const isClosing = Boolean(state.isFolderClosing || state.isFolderAppLaunchClosing);
  const overlayTargets = resolveFolderOverlayTargets({
    folder: state.renderedFolder,
    folderOpeningOriginBounds: state.folderOpeningOriginBounds,
    folderPageSize: state.folderPageSize,
    isClosing,
    previousStableFolderCloseTarget: options.previousStableFolderCloseTarget,
    wasClosing: options.wasClosing,
  });
  const closeRects = getStableFolderCloseRects({
    folderId,
    folderRect: overlayTargets.folderRect,
    folderThumbRect: overlayTargets.folderThumbRect,
    isClosing,
    stableFolderCloseTarget: overlayTargets.stableFolderCloseTarget,
  });
  const previewRects = (overlayTargets.previewSlots || []).slice(0, 9).map((item, slotIndex) => {
    if (!item?.id || !closeRects.closeThumbRect) return null;
    const rect = makeFolderThumbPreviewRect(closeRects.closeThumbRect, slotIndex);
    return {
      itemId: item.id,
      rect,
      localRect: makeStageLocalRect(rect, state.stageRect),
      slotIndex,
    };
  }).filter(Boolean);
  return {
    canvasStageRect: state.canvasStageRect || null,
    closeIconRect: closeRects.closeIconRect,
    closeIconLocalRect: makeStageLocalRect(closeRects.closeIconRect, state.stageRect),
    closeThumbRect: closeRects.closeThumbRect,
    closeThumbLocalRect: makeStageLocalRect(closeRects.closeThumbRect, state.stageRect),
    desktopFrame: state.desktopFrame || null,
    desktopStageRect: state.desktopStageRect || null,
    folderId,
    folderRect: overlayTargets.folderRect,
    folderLocalRect: makeStageLocalRect(overlayTargets.folderRect, state.stageRect),
    geometry,
    panelRect: geometry.panel,
    previewRects,
    stableFolderCloseTarget: overlayTargets.stableFolderCloseTarget,
    stageRect: state.stageRect,
  };
}
