import {
  clearIconBoundsRegistry,
  registerFolderPreviewChildTargetBounds,
  registerLaunchIconBounds,
  registerTopLevelFolderThumbBounds,
  registerTopLevelFolderThumbTargetBounds,
  registerTopLevelIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import {
  getSingleStageOptions,
  getSingleStageOptionsKey,
  getSingleStageRenderKey,
  getSingleStageFolderProbeOptions,
  getSingleStageFolderProbeOptionsKey,
  getSingleStageFolderProbeRenderKey,
  installSingleStageGlobalFlag,
  installSingleStageFolderProbeGlobalFlag,
  makeSingleStageDiagnosticsPlan,
  makeSingleStageFolderProbePlan,
  makeSingleStageRuntimeProbe,
  makeSingleStageRuntimePlan,
  setSingleStageOptions,
  setSingleStageFolderProbeOptions,
  SINGLE_STAGE_CHANGED_EVENT,
  SINGLE_STAGE_DIAGNOSTICS_CHANGED_EVENT,
  SINGLE_STAGE_FOLDER_PROBE_CHANGED_EVENT,
} from "./singleStagePlan.js";

export function runSingleStageDiagnosticsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi single-stage diagnostics test failed] ${message}`);
  };

  const folder = {
    id: "folder-1",
    children: Array.from({ length: 10 }, (_, index) => ({ id: `app-${index}` })),
  };
  const state = {
    folderPageSize: 10,
    folderPanelStyle: {},
    height: 800,
    isFolderClosing: true,
    renderedFolder: folder,
    desktopFrame: { height: 640, left: 0, top: 93, width: 1200 },
    desktopStageRect: { height: 640, left: 0, top: 93, width: 1200 },
    stageRect: { height: 800, left: 10, top: 20, width: 1200 },
    width: 1200,
  };
  const iconRect = { height: 96, left: 200, top: 220, width: 96 };
  const thumbRect = { height: 72, left: 212, top: 232, width: 72 };
  const defaultOptions = getSingleStageOptions(undefined);
  assert(defaultOptions.enabled && defaultOptions.rootStage && defaultOptions.dragPreview, "single-stage should default to root-stage drag preview ownership");
  assert(defaultOptions.folderLayer && !defaultOptions.diagnostics && !defaultOptions.probe, "single-stage should default to folder layer ownership without diagnostics");
  const defaultRuntimePlan = makeSingleStageRuntimePlan(defaultOptions);
  assert(defaultRuntimePlan.useRootStage && defaultRuntimePlan.useFolderLayer && defaultRuntimePlan.useDragPreview, "default runtime plan should use full single-stage ownership");
  assert(defaultRuntimePlan.renderKey === "111", "default runtime plan should expose the structural render key");
  const stableRuntimeProbe = makeSingleStageRuntimeProbe(defaultRuntimePlan, {
    canvasCount: 1,
    fallbackDragPreviewMounted: false,
    fallbackFolderMounted: false,
    rootStageHost: true,
    rootStageMain: true,
    stableStageIsUnified: true,
  });
  assert(stableRuntimeProbe.isSingleStageStable, "default single-stage runtime probe should pass when root stage and fallback state are clean");
  const mountedFallbackProbe = makeSingleStageRuntimeProbe(defaultRuntimePlan, {
    canvasCount: 1,
    fallbackDragPreviewMounted: true,
    fallbackFolderMounted: true,
    rootStageHost: true,
    rootStageMain: true,
    stableStageIsUnified: true,
  });
  assert(!mountedFallbackProbe.isSingleStageStable, "runtime probe should fail when fallback overlays are mounted");
  assert(mountedFallbackProbe.failures.includes("fallback-folder-mounted"), "runtime probe should report mounted fallback folder");
  assert(mountedFallbackProbe.failures.includes("fallback-drag-preview-mounted"), "runtime probe should report mounted fallback drag preview");
  const disabledOptions = getSingleStageOptions(false);
  assert(!disabledOptions.enabled && !disabledOptions.rootStage && !disabledOptions.dragPreview, "explicit false should disable single-stage ownership");
  const disabledRuntimePlan = makeSingleStageRuntimePlan(disabledOptions);
  assert(!disabledRuntimePlan.useRootStage && !disabledRuntimePlan.useFolderLayer && !disabledRuntimePlan.useDragPreview, "disabled runtime plan should not claim single-stage ownership");
  assert(!makeSingleStageRuntimeProbe(disabledRuntimePlan, {
    canvasCount: 1,
    rootStageHost: false,
    rootStageMain: false,
    stableStageIsUnified: false,
  }).isSingleStageStable, "disabled single-stage runtime probe should not report stable single-stage");
  const diagnosticsOptions = getSingleStageOptions(true);
  assert(diagnosticsOptions.diagnostics && diagnosticsOptions.probe && diagnosticsOptions.rootStage && diagnosticsOptions.dragPreview, "explicit true should enable diagnostics on the default single-stage base");
  assert(diagnosticsOptions.folderLayer, "explicit true should keep the default folder layer ownership");
  const formalDiagnosticsOptions = getSingleStageOptions({ diagnostics: true, folderLayer: true });
  assert(formalDiagnosticsOptions.diagnostics && formalDiagnosticsOptions.probe, "formal diagnostics option should mirror the legacy probe flag");
  const formalDiagnosticsDisabledOptions = getSingleStageOptions({ diagnostics: false, folderLayer: true });
  assert(formalDiagnosticsDisabledOptions.folderLayer && !formalDiagnosticsDisabledOptions.diagnostics && !formalDiagnosticsDisabledOptions.probe, "formal diagnostics false should keep stage ownership without enabling diagnostics");

  const options = getSingleStageOptions({ enabled: true, folderLayer: true, log: true });

  assert(options.enabled && options.log, "single-stage options should preserve explicit logging");
  assert(options.folderLayer, "single-stage options should preserve the folder layer flag");
  assert(options.dragPreview, "folder layer should enable the single-stage drag preview");
  assert(options.rootStage, "single-stage options should preserve the root-stage canvas flag");
  assert(getSingleStageFolderProbeOptions({ enabled: true, folderLayer: true, log: true }).rootStage, "legacy probe option helper should preserve root-stage behavior");
  assert(getSingleStageOptionsKey(options) === "111111", "single-stage option key should reflect enabled flags");
  assert(getSingleStageFolderProbeOptionsKey(options) === "111111", "legacy probe option key should reflect enabled flags");
  assert(getSingleStageRenderKey(options) === "111", "single-stage render key should reflect only structural stage ownership flags");
  assert(getSingleStageFolderProbeRenderKey(options) === "111", "legacy probe render key should reflect only structural stage ownership flags");
  const renderKeyWithoutDiagnostics = getSingleStageFolderProbeRenderKey(
    getSingleStageFolderProbeOptions({ enabled: true, folderLayer: true, log: false, probe: false })
  );
  const renderKeyWithDiagnostics = getSingleStageFolderProbeRenderKey(
    getSingleStageFolderProbeOptions({ enabled: true, folderLayer: true, log: true, probe: true })
  );
  assert(
    renderKeyWithoutDiagnostics === renderKeyWithDiagnostics,
    "diagnostic flags should not change the render key"
  );
  const rootStageOnlyOptions = getSingleStageFolderProbeOptions({ probe: false, rootStage: true });
  assert(rootStageOnlyOptions.enabled && rootStageOnlyOptions.rootStage && !rootStageOnlyOptions.dragPreview, "root-stage ownership should enable the root-stage host without drag preview ownership");
  const dragPreviewOnlyOptions = getSingleStageFolderProbeOptions({ dragPreview: true, probe: false });
  assert(dragPreviewOnlyOptions.rootStage && dragPreviewOnlyOptions.dragPreview, "drag preview should request the root-stage host");
  const folderLayerOnlyOptions = getSingleStageFolderProbeOptions({ folderLayer: true, probe: false });
  assert(folderLayerOnlyOptions.enabled && folderLayerOnlyOptions.folderLayer && folderLayerOnlyOptions.dragPreview && folderLayerOnlyOptions.rootStage, "folder layer ownership should enable the dependent single-stage layers");

  const flagName = "__LP_SINGLE_STAGE__";
  const setterName = "__LP_SET_SINGLE_STAGE__";
  const legacyFlagName = "__LP_SINGLE_STAGE_FOLDER__";
  const legacySetterName = "__LP_SET_SINGLE_STAGE_FOLDER__";
  const previousFlagDescriptor = Object.getOwnPropertyDescriptor(globalThis, flagName);
  const previousSetterDescriptor = Object.getOwnPropertyDescriptor(globalThis, setterName);
  const previousLegacyFlagDescriptor = Object.getOwnPropertyDescriptor(globalThis, legacyFlagName);
  const previousLegacySetterDescriptor = Object.getOwnPropertyDescriptor(globalThis, legacySetterName);
  let changeCount = 0;
  let diagnosticsChangeCount = 0;
  let legacyChangeCount = 0;
  const handleFlagChange = () => { changeCount += 1; };
  const handleDiagnosticsFlagChange = () => { diagnosticsChangeCount += 1; };
  const handleLegacyFlagChange = () => { legacyChangeCount += 1; };
  try {
    installSingleStageGlobalFlag();
    installSingleStageFolderProbeGlobalFlag();
    globalThis.addEventListener?.(SINGLE_STAGE_CHANGED_EVENT, handleFlagChange);
    globalThis.addEventListener?.(SINGLE_STAGE_DIAGNOSTICS_CHANGED_EVENT, handleDiagnosticsFlagChange);
    globalThis.addEventListener?.(SINGLE_STAGE_FOLDER_PROBE_CHANGED_EVENT, handleLegacyFlagChange);
    globalThis[flagName] = { rootStage: true, probe: false };
    assert(getSingleStageOptions().rootStage, "direct global flag assignment should update root-stage options");
    assert(globalThis[legacyFlagName]?.rootStage, "legacy global flag should mirror the formal global flag");
    globalThis[legacyFlagName] = { dragPreview: true, probe: false };
    assert(getSingleStageOptions().dragPreview && globalThis[flagName]?.dragPreview, "legacy global flag assignment should update formal options");
    assert(getSingleStageFolderProbeOptions({ dragPreview: true, probe: false }).rootStage, "drag preview should request a root-stage canvas");
    const normalized = setSingleStageOptions({ folderLayer: true, probe: false });
    const legacyNormalized = setSingleStageFolderProbeOptions({ folderLayer: true, probe: false });
    assert(normalized.rootStage && normalized.dragPreview && !normalized.probe, "global flag setter should return normalized options");
    assert(legacyNormalized.rootStage && legacyNormalized.dragPreview && !legacyNormalized.probe, "legacy global flag setter should return normalized options");
    assert(typeof globalThis[setterName] === "function", "formal global setter should be installed");
    assert(typeof globalThis[legacySetterName] === "function", "legacy global setter should be installed");
    if (typeof globalThis.addEventListener === "function") {
      assert(changeCount >= 4, "global flag changes should dispatch formal change events");
      assert(diagnosticsChangeCount >= 4, "global flag changes should dispatch formal diagnostics change events");
      assert(legacyChangeCount >= 4, "global flag changes should dispatch legacy change events");
    }
  } finally {
    globalThis.removeEventListener?.(SINGLE_STAGE_DIAGNOSTICS_CHANGED_EVENT, handleDiagnosticsFlagChange);
    globalThis.removeEventListener?.(SINGLE_STAGE_FOLDER_PROBE_CHANGED_EVENT, handleLegacyFlagChange);
    globalThis.removeEventListener?.(SINGLE_STAGE_CHANGED_EVENT, handleFlagChange);
    if (previousFlagDescriptor) Object.defineProperty(globalThis, flagName, previousFlagDescriptor);
    else delete globalThis[flagName];
    if (previousSetterDescriptor) Object.defineProperty(globalThis, setterName, previousSetterDescriptor);
    else delete globalThis[setterName];
    if (previousLegacyFlagDescriptor) Object.defineProperty(globalThis, legacyFlagName, previousLegacyFlagDescriptor);
    else delete globalThis[legacyFlagName];
    if (previousLegacySetterDescriptor) Object.defineProperty(globalThis, legacySetterName, previousLegacySetterDescriptor);
    else delete globalThis[legacySetterName];
  }

  clearIconBoundsRegistry();
  registerLaunchIconBounds({ area: "desktop", id: folder.id, pageIndex: 0 }, iconRect, { area: "desktop", id: folder.id });
  registerTopLevelFolderThumbBounds(folder.id, thumbRect, { area: "desktop", id: folder.id });
  registerTopLevelIconTargetBounds(folder.id, iconRect, { area: "desktop", id: folder.id });
  registerTopLevelFolderThumbTargetBounds(folder.id, thumbRect, { area: "desktop", id: folder.id });
  for (let index = 0; index < 9; index += 1) {
    registerFolderPreviewChildTargetBounds(folder.id, `app-${index}`, index, {
      height: 16,
      left: thumbRect.left + index,
      top: thumbRect.top + index,
      width: 16,
    });
  }

  assert(makeSingleStageDiagnosticsPlan(state, { enabled: false }) === null, "disabled diagnostics should not create a plan");

  const plan = makeSingleStageDiagnosticsPlan(state, { enabled: true });
  assert(plan?.folderId === folder.id, "enabled diagnostics should create a plan for the rendered folder");
  assert(makeSingleStageFolderProbePlan(state, { enabled: true })?.folderId === folder.id, "legacy probe plan helper should remain available");
  assert(plan.stableFolderCloseTarget?.source === "stable-final-close", "closing diagnostics should capture a stable final close target");
  assert(plan.previewRects.length === 9, "diagnostics should only draw the folder thumbnail preview slots");
  assert(plan.desktopFrame.top === 93, "diagnostics plan should keep the desktop frame inside root stage");
  assert(plan.desktopStageRect.top === 93, "diagnostics plan should keep the current desktop stage rect");
  assert(plan.closeThumbRect.left === thumbRect.left, "diagnostics should use the registered stable thumb target");
  assert(plan.closeThumbLocalRect.left === thumbRect.left - state.stageRect.left, "diagnostics should map thumb target into stage-local coordinates");
  assert(plan.closeIconLocalRect.top === iconRect.top - state.stageRect.top, "diagnostics should map icon target into stage-local coordinates");

  clearIconBoundsRegistry();
}
