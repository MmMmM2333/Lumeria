import {
  clearIconBoundsRegistry,
  registerRenderedClientLaunchIconBounds,
  registerRenderedClientTopLevelFolderThumbBounds,
  registerStableStageLayoutFolderPreviewChildTargetBounds,
  registerStableStageLayoutTopLevelFolderThumbTargetBounds,
  registerStableStageLayoutTopLevelIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import {
  getSingleStageOptions,
  getSingleStageOptionsKey,
  getSingleStageRenderKey,
  installSingleStageGlobalFlag,
  makeSingleStageDiagnosticsPlan,
  makeSingleStageRuntimeProbe,
  makeSingleStageRuntimePlan,
  setSingleStageOptions,
  SINGLE_STAGE_CHANGED_EVENT,
  SINGLE_STAGE_DIAGNOSTICS_CHANGED_EVENT,
} from "./singleStagePlan.js";

function identityStageMeta(meta = {}) {
  return {
    stageHeight: 800,
    stageRect: { height: 800, left: 0, top: 0, width: 1200 },
    stageWidth: 1200,
    ...meta,
  };
}

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
  assert(defaultRuntimePlan.renderKey === "single-stage", "runtime plan should expose a fixed single-stage render key");
  const stableRuntimeProbeState = {
    canvasCount: 1,
    rootStageHost: true,
    rootStageMain: true,
    stableStageIsUnified: true,
  };
  const stableRuntimeProbe = makeSingleStageRuntimeProbe(defaultRuntimePlan, stableRuntimeProbeState);
  assert(stableRuntimeProbe.isSingleStageStable, "default single-stage runtime probe should pass when root stage and fallback state are clean");
  assert(stableRuntimeProbe.unifiedStageCoordinates, "default single-stage runtime probe should require unified stage coordinates");
  assert(!("fallbackFolderMounted" in stableRuntimeProbe) && !("fallbackDragPreviewMounted" in stableRuntimeProbe), "runtime probe should not expose fallback overlay fields");
  const runtimeFailureCases = [
    { failure: "canvas-count", state: { canvasCount: 2 } },
    { failure: "root-stage-host", state: { rootStageHost: false } },
    { failure: "root-stage-main", state: { rootStageMain: false } },
    { failure: "stable-stage-unified", state: { stableStageIsUnified: false } },
  ];
  for (const { failure, state: override } of runtimeFailureCases) {
    const probe = makeSingleStageRuntimeProbe(defaultRuntimePlan, { ...stableRuntimeProbeState, ...override });
    assert(!probe.isSingleStageStable, `runtime probe should fail on ${failure}`);
    assert(probe.failures.includes(failure), `runtime probe should report ${failure}`);
  }
  const disabledOptions = getSingleStageOptions(false);
  assert(disabledOptions.enabled && disabledOptions.rootStage && disabledOptions.dragPreview, "explicit false should not disable single-stage ownership");
  assert(disabledOptions.folderLayer && !disabledOptions.diagnostics && !disabledOptions.probe, "explicit false should only disable diagnostics");
  const disabledRuntimePlan = makeSingleStageRuntimePlan(disabledOptions);
  assert(disabledRuntimePlan.useRootStage && disabledRuntimePlan.useFolderLayer && disabledRuntimePlan.useDragPreview, "runtime plan should always claim single-stage ownership");
  assert(!makeSingleStageRuntimeProbe(disabledRuntimePlan, {
    canvasCount: 1,
    rootStageHost: false,
    rootStageMain: false,
    stableStageIsUnified: false,
  }).isSingleStageStable, "single-stage runtime probe should fail when required root-stage invariants are missing");
  const diagnosticsOptions = getSingleStageOptions(true);
  assert(diagnosticsOptions.diagnostics && diagnosticsOptions.probe && diagnosticsOptions.rootStage && diagnosticsOptions.dragPreview, "explicit true should enable diagnostics on the default single-stage base");
  assert(diagnosticsOptions.folderLayer, "explicit true should keep the default folder layer ownership");
  const formalDiagnosticsOptions = getSingleStageOptions({ diagnostics: true, folderLayer: true });
  assert(formalDiagnosticsOptions.diagnostics && formalDiagnosticsOptions.probe, "formal diagnostics option should mirror the probe flag");
  const formalDiagnosticsDisabledOptions = getSingleStageOptions({ diagnostics: false, folderLayer: true });
  assert(formalDiagnosticsDisabledOptions.folderLayer && !formalDiagnosticsDisabledOptions.diagnostics && !formalDiagnosticsDisabledOptions.probe, "formal diagnostics false should keep stage ownership without enabling diagnostics");

  const options = getSingleStageOptions({ enabled: true, folderLayer: true, log: true });

  assert(options.enabled && options.log, "single-stage options should preserve explicit logging");
  assert(options.folderLayer, "single-stage options should preserve the folder layer flag");
  assert(options.dragPreview, "folder layer should enable the single-stage drag preview");
  assert(options.rootStage, "single-stage options should preserve the root-stage canvas flag");
  assert(getSingleStageOptionsKey(options) === "10", "single-stage option key should only reflect mutable diagnostics flags");
  assert(getSingleStageRenderKey(options) === "single-stage", "single-stage render key should be fixed");
  const renderKeyWithoutDiagnostics = getSingleStageRenderKey(
    getSingleStageOptions({ enabled: true, folderLayer: true, log: false, probe: false })
  );
  const renderKeyWithDiagnostics = getSingleStageRenderKey(
    getSingleStageOptions({ enabled: true, folderLayer: true, log: true, probe: true })
  );
  assert(
    renderKeyWithoutDiagnostics === renderKeyWithDiagnostics,
    "diagnostic flags should not change the render key"
  );
  const rootStageOnlyOptions = getSingleStageOptions({ probe: false, rootStage: true });
  assert(rootStageOnlyOptions.enabled && rootStageOnlyOptions.rootStage && rootStageOnlyOptions.dragPreview, "root-stage legacy flags should not disable drag preview ownership");
  const dragPreviewOnlyOptions = getSingleStageOptions({ dragPreview: true, probe: false });
  assert(dragPreviewOnlyOptions.rootStage && dragPreviewOnlyOptions.dragPreview, "drag preview should request the root-stage host");
  const folderLayerOnlyOptions = getSingleStageOptions({ folderLayer: true, probe: false });
  assert(folderLayerOnlyOptions.enabled && folderLayerOnlyOptions.folderLayer && folderLayerOnlyOptions.dragPreview && folderLayerOnlyOptions.rootStage, "folder layer ownership should enable the dependent single-stage layers");

  const flagName = "__LP_SINGLE_STAGE__";
  const setterName = "__LP_SET_SINGLE_STAGE__";
  const previousFlagDescriptor = Object.getOwnPropertyDescriptor(globalThis, flagName);
  const previousSetterDescriptor = Object.getOwnPropertyDescriptor(globalThis, setterName);
  let changeCount = 0;
  let diagnosticsChangeCount = 0;
  const handleFlagChange = () => { changeCount += 1; };
  const handleDiagnosticsFlagChange = () => { diagnosticsChangeCount += 1; };
  try {
    installSingleStageGlobalFlag();
    globalThis.addEventListener?.(SINGLE_STAGE_CHANGED_EVENT, handleFlagChange);
    globalThis.addEventListener?.(SINGLE_STAGE_DIAGNOSTICS_CHANGED_EVENT, handleDiagnosticsFlagChange);
    globalThis[flagName] = { rootStage: false, probe: false };
    assert(getSingleStageOptions().rootStage, "direct global flag assignment should update root-stage options");
    globalThis[flagName] = { dragPreview: false, probe: false };
    assert(getSingleStageOptions().dragPreview && globalThis[flagName]?.dragPreview === false, "direct global flag assignment should preserve input while normalized options keep drag preview ownership");
    assert(getSingleStageOptions({ dragPreview: false, probe: false }).rootStage, "legacy drag preview false should keep a root-stage canvas");
    const normalized = setSingleStageOptions({ folderLayer: false, probe: false });
    assert(normalized.rootStage && normalized.dragPreview && !normalized.probe, "global flag setter should return normalized options");
    assert(typeof globalThis[setterName] === "function", "formal global setter should be installed");
    if (typeof globalThis.addEventListener === "function") {
      assert(changeCount >= 3, "global flag changes should dispatch formal change events");
      assert(diagnosticsChangeCount >= 3, "global flag changes should dispatch formal diagnostics change events");
    }
  } finally {
    globalThis.removeEventListener?.(SINGLE_STAGE_DIAGNOSTICS_CHANGED_EVENT, handleDiagnosticsFlagChange);
    globalThis.removeEventListener?.(SINGLE_STAGE_CHANGED_EVENT, handleFlagChange);
    if (previousFlagDescriptor) Object.defineProperty(globalThis, flagName, previousFlagDescriptor);
    else delete globalThis[flagName];
    if (previousSetterDescriptor) Object.defineProperty(globalThis, setterName, previousSetterDescriptor);
    else delete globalThis[setterName];
  }

  clearIconBoundsRegistry();
  registerRenderedClientLaunchIconBounds({ area: "desktop", id: folder.id, pageIndex: 0 }, iconRect, { area: "desktop", id: folder.id });
  registerRenderedClientTopLevelFolderThumbBounds(folder.id, thumbRect, { area: "desktop", id: folder.id });
  registerStableStageLayoutTopLevelIconTargetBounds(folder.id, iconRect, identityStageMeta({ area: "desktop", id: folder.id }));
  registerStableStageLayoutTopLevelFolderThumbTargetBounds(folder.id, thumbRect, identityStageMeta({ area: "desktop", id: folder.id }));
  for (let index = 0; index < 9; index += 1) {
    registerStableStageLayoutFolderPreviewChildTargetBounds(folder.id, `app-${index}`, index, {
      height: 16,
      left: thumbRect.left + index,
      top: thumbRect.top + index,
      width: 16,
    }, identityStageMeta({ area: "desktop", folderId: folder.id, id: `app-${index}` }));
  }

  assert(makeSingleStageDiagnosticsPlan(state, { enabled: false }) === null, "disabled diagnostics should not create a plan");

  const plan = makeSingleStageDiagnosticsPlan(state, { enabled: true });
  assert(plan?.folderId === folder.id, "enabled diagnostics should create a plan for the rendered folder");
  assert(plan.stableFolderCloseTarget?.source === "stable-final-close", "closing diagnostics should capture a stable final close target");
  assert(plan.previewRects.length === 9, "diagnostics should only draw the folder thumbnail preview slots");
  assert(plan.desktopFrame.top === 93, "diagnostics plan should keep the desktop frame inside root stage");
  assert(plan.desktopStageRect.top === 93, "diagnostics plan should keep the current desktop stage rect");
  assert(plan.closeThumbRect.left === thumbRect.left, "diagnostics should use the registered stable thumb target");
  assert(plan.closeThumbLocalRect.left === thumbRect.left - state.stageRect.left, "diagnostics should map thumb target into stage-local coordinates");
  assert(plan.closeIconLocalRect.top === iconRect.top - state.stageRect.top, "diagnostics should map icon target into stage-local coordinates");
  assert(plan.stableCloseStageLayoutRect.left === iconRect.left, "diagnostics should expose the stable close stage layout rect");
  assert(plan.stableCloseClientRect.left === iconRect.left, "diagnostics should expose the stable close client rect");
  assert(plan.stableCloseLocalRect.top === iconRect.top - state.stageRect.top, "diagnostics should expose the stable close local rect");
  assert(plan.stableCloseThumbStageLayoutRect.left === thumbRect.left, "diagnostics should expose the stable thumb stage layout rect");
  assert(plan.stableCloseThumbClientRect.left === thumbRect.left, "diagnostics should expose the stable thumb client rect");
  assert(plan.previewRects[0].stageLayoutRect.left === thumbRect.left, "diagnostics should retain preview child stage layout rects");

  clearIconBoundsRegistry();
}
