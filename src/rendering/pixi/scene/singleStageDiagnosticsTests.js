import {
  createIconBoundsRegistry,
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../geometry/iconBoundsRegistry.js";
import {
  getSingleStageDiagnosticsOptions,
  getSingleStageRenderKey,
  isSingleStageDiagnosticsEnabled,
  makeSingleStageDiagnosticsPlan,
} from "./singleStagePlan.js";

const K = ICON_BOUNDS_KIND;
const V = ICON_BOUNDS_VARIANT;

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
  const defaultOptions = getSingleStageDiagnosticsOptions(undefined);
  assert(!("enabled" in defaultOptions), "diagnostics options should not expose structural enabled flags");
  assert(!("rootStage" in defaultOptions), "diagnostics options should not expose root-stage migration flags");
  assert(!("folderLayer" in defaultOptions), "diagnostics options should not expose folder-layer migration flags");
  assert(!("dragPreview" in defaultOptions), "diagnostics options should not expose drag-preview migration flags");
  assert(!defaultOptions.diagnostics && !defaultOptions.log && !defaultOptions.probe, "single-stage diagnostics should default off");
  assert(getSingleStageRenderKey() === "single-stage", "single-stage render key should be fixed");

  const disabledOptions = getSingleStageDiagnosticsOptions(false);
  assert(!disabledOptions.diagnostics && !disabledOptions.log && !disabledOptions.probe, "explicit false should keep diagnostics disabled");

  const diagnosticsOptions = getSingleStageDiagnosticsOptions(true);
  assert(diagnosticsOptions.diagnostics && diagnosticsOptions.probe && !diagnosticsOptions.log, "explicit true should enable diagnostics and probe");

  const formalDiagnosticsOptions = getSingleStageDiagnosticsOptions({ diagnostics: true, log: true });
  assert(formalDiagnosticsOptions.diagnostics && formalDiagnosticsOptions.probe && formalDiagnosticsOptions.log, "formal diagnostics option should preserve logging");

  const probeDiagnosticsOptions = getSingleStageDiagnosticsOptions({ probe: true, log: false });
  assert(probeDiagnosticsOptions.diagnostics && probeDiagnosticsOptions.probe && !probeDiagnosticsOptions.log, "probe true should enable diagnostics");

  const formalDiagnosticsDisabledOptions = getSingleStageDiagnosticsOptions({ diagnostics: false, log: true, probe: true });
  assert(!formalDiagnosticsDisabledOptions.diagnostics && !formalDiagnosticsDisabledOptions.probe && formalDiagnosticsDisabledOptions.log, "formal diagnostics false should override probe");
  assert(isSingleStageDiagnosticsEnabled({ diagnostics: true }), "diagnostics helper should read enabled diagnostics");
  assert(!isSingleStageDiagnosticsEnabled({ probe: false }), "diagnostics helper should read disabled probe");

  const iconBoundsRegistry = createIconBoundsRegistry();
  iconBoundsRegistry.clearBounds();
  iconBoundsRegistry.registerBounds(K.LAUNCH, V.RENDERED, { area: "desktop", id: folder.id, pageIndex: 0 }, iconRect, { area: "desktop", id: folder.id });
  iconBoundsRegistry.registerBounds(K.FOLDER_THUMB, V.RENDERED, folder.id, thumbRect, { area: "desktop", id: folder.id });
  iconBoundsRegistry.registerBounds(K.TOP_LEVEL, V.STABLE_STAGE_LAYOUT, folder.id, iconRect, identityStageMeta({ area: "desktop", id: folder.id }));
  iconBoundsRegistry.registerBounds(K.FOLDER_THUMB, V.STABLE_STAGE_LAYOUT, folder.id, thumbRect, identityStageMeta({ area: "desktop", id: folder.id }));
  for (let index = 0; index < 9; index += 1) {
    iconBoundsRegistry.registerBounds(K.PREVIEW_CHILD, V.STABLE_STAGE_LAYOUT, { childId: `app-${index}`, folderId: folder.id, slotIndex: index }, {
      height: 16,
      left: thumbRect.left + index,
      top: thumbRect.top + index,
      width: 16,
    }, identityStageMeta({ area: "desktop", folderId: folder.id, id: `app-${index}` }));
  }

  assert(makeSingleStageDiagnosticsPlan(state, { enabled: false }) === null, "disabled diagnostics should not create a plan");

  const plan = makeSingleStageDiagnosticsPlan(state, { enabled: true, iconBoundsRegistry });
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

  iconBoundsRegistry.clearBounds();
}
