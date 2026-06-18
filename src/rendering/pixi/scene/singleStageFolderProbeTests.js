import {
  clearIconBoundsRegistry,
  registerFolderPreviewChildTargetBounds,
  registerLaunchIconBounds,
  registerTopLevelFolderThumbBounds,
  registerTopLevelFolderThumbTargetBounds,
  registerTopLevelIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import { getSingleStageFolderProbeOptions, makeSingleStageFolderProbePlan } from "./singleStageFolderProbePlan.js";

export function runSingleStageFolderProbeTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi single-stage folder probe test failed] ${message}`);
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
    desktopStageRect: { height: 640, left: 0, top: 93, width: 1200 },
    stageRect: { height: 800, left: 10, top: 20, width: 1200 },
    width: 1200,
  };
  const iconRect = { height: 96, left: 200, top: 220, width: 96 };
  const thumbRect = { height: 72, left: 212, top: 232, width: 72 };
  const options = getSingleStageFolderProbeOptions({ enabled: true, log: true });

  assert(options.enabled && options.log, "probe options should preserve explicit logging");
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

  assert(makeSingleStageFolderProbePlan(state, { enabled: false }) === null, "disabled probe should not create a plan");

  const plan = makeSingleStageFolderProbePlan(state, { enabled: true });
  assert(plan?.folderId === folder.id, "enabled probe should create a plan for the rendered folder");
  assert(plan.stableFolderCloseTarget?.source === "stable-final-close", "closing probe should capture a stable final close target");
  assert(plan.previewRects.length === 9, "probe should only draw the folder thumbnail preview slots");
  assert(plan.desktopStageRect.top === 93, "probe plan should keep the current desktop stage rect for diagnostics");
  assert(plan.closeThumbRect.left === thumbRect.left, "probe should use the registered stable thumb target");
  assert(plan.closeThumbLocalRect.left === thumbRect.left - state.stageRect.left, "probe should map thumb target into stage-local coordinates");
  assert(plan.closeIconLocalRect.top === iconRect.top - state.stageRect.top, "probe should map icon target into stage-local coordinates");

  clearIconBoundsRegistry();
}
