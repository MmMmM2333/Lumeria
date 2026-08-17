import {
  createIconBoundsRegistry,
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../geometry/iconBoundsRegistry.js";
import { projectFolderCloseTargetToClient } from "./folderOverlayTargets.js";
import { resolveFolderOverlayTargets } from "./folderOverlayTargetResolver.js";

const K = ICON_BOUNDS_KIND;
const V = ICON_BOUNDS_VARIANT;

function projectedStageMeta(meta = {}) {
  return {
    stageHeight: 400,
    stageRect: { height: 800, left: 100, top: 60, width: 800 },
    stageWidth: 400,
    ...meta,
  };
}

export function runFolderOverlayTargetResolverTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder overlay target resolver test failed] ${message}`);
  };

  const folder = {
    id: "folder-1",
    childPages: [[{ id: "app-a" }, { id: "app-b" }, { id: "app-c" }]],
  };
  const liveIconRect = { height: 90, left: 100, top: 120, width: 90 };
  const liveThumbRect = { height: 72, left: 109, top: 129, width: 72 };
  const targetIconStageRect = { height: 48, left: 50, top: 80, width: 48 };
  const targetThumbStageRect = { height: 40, left: 54, top: 84, width: 40 };
  const targetChildStageRect = { height: 9, left: 58, top: 88, width: 9 };
  const targetIconClientRect = { height: 96, left: 200, top: 220, width: 96 };
  const targetThumbClientRect = { height: 80, left: 208, top: 228, width: 80 };
  const targetChildClientRect = { height: 18, left: 216, top: 236, width: 18 };
  const liveCloseIconRect = { height: 94, left: 260, top: 240, width: 94 };
  const liveCloseThumbRect = { height: 76, left: 269, top: 249, width: 76 };
  const liveCloseChildRect = { height: 16, left: 276, top: 256, width: 16 };
  const capturedIconRect = { height: 88, left: 300, top: 320, width: 88 };
  const capturedThumbRect = { height: 70, left: 309, top: 329, width: 70 };
  const capturedChildRect = { height: 14, left: 316, top: 336, width: 14 };
  const liveChildRect = { height: 13, left: 116, top: 136, width: 13 };

  const registry = createIconBoundsRegistry();
  registry.clearBounds();
  registry.registerBounds(K.LAUNCH, V.RENDERED, { area: "desktop", id: folder.id, pageIndex: 0 }, liveIconRect, { area: "desktop", id: folder.id });
  registry.registerBounds(K.FOLDER_THUMB, V.RENDERED, folder.id, liveThumbRect, { area: "desktop", id: folder.id });
  registry.registerBounds(K.TOP_LEVEL, V.STABLE_STAGE_LAYOUT, folder.id, targetIconStageRect, projectedStageMeta({ area: "desktop", id: folder.id }));
  registry.registerBounds(K.FOLDER_THUMB, V.STABLE_STAGE_LAYOUT, folder.id, targetThumbStageRect, projectedStageMeta({ area: "desktop", id: folder.id }));
  registry.registerBounds(K.PREVIEW_CHILD, V.RENDERED, { childId: "app-b", folderId: folder.id, slotIndex: 1 }, liveChildRect);
  registry.registerBounds(K.PREVIEW_CHILD, V.STABLE_STAGE_LAYOUT, { childId: "app-a", folderId: folder.id, slotIndex: 0 }, targetChildStageRect, projectedStageMeta({ area: "desktop", folderId: folder.id, id: "app-a" }));
  registry.registerBounds(K.TOP_LEVEL, V.LIVE_TARGET, folder.id, liveCloseIconRect, { area: "desktop", id: folder.id });
  registry.registerBounds(K.FOLDER_THUMB, V.LIVE_TARGET, folder.id, liveCloseThumbRect, { area: "desktop", id: folder.id });
  registry.registerBounds(K.PREVIEW_CHILD, V.LIVE_TARGET, { childId: "app-a", folderId: folder.id, slotIndex: 0 }, liveCloseChildRect, { area: "desktop", folderId: folder.id, id: "app-a" });

  const resolved = resolveFolderOverlayTargets({
    folder,
    folderOpeningOriginBounds: {
      folderId: folder.id,
      iconRect: capturedIconRect,
      previewChildRects: [{ childId: "app-b", rect: capturedChildRect, slotIndex: 2 }],
      thumbRect: capturedThumbRect,
    },
    folderPageSize: 9,
    iconBoundsRegistry: registry,
    isClosing: false,
    previousStableFolderCloseTarget: null,
    wasClosing: false,
  });

  assert(resolved.coordinateSpace === "client-visual", "resolver should declare client visual coordinate output");
  assert(resolved.folderClientRect.left === liveIconRect.left, "opening folder rect should prefer the current live desktop bounds when available");
  assert(resolved.folderThumbClientRect.left === liveThumbRect.left, "opening thumb rect should prefer the current live desktop thumb bounds when available");
  assert(resolved.previewSlots[0].id === "app-a", "resolver should expose folder preview slots");
  assert(resolved.stableFolderCloseTarget.source === "stable-target", "stable target capture should describe its source");
  assert(resolved.stableFolderCloseTarget.coordinateSpace === "stage-layout", "stable close target should store stage layout coordinates");
  const projectedStableTarget = projectFolderCloseTargetToClient(resolved.stableFolderCloseTarget);
  assert(projectedStableTarget.iconRect.left === targetIconClientRect.left, "stable close target should project target icon rect to client coordinates at the boundary");
  assert(resolved.stableFolderCloseTarget.iconRect.left === targetIconStageRect.left, "stable close target should retain the stage layout icon rect");
  assert(projectedStableTarget.thumbRect.left === targetThumbClientRect.left, "stable close target should project target thumb rect to client coordinates at the boundary");
  assert(resolved.stableFolderCloseTarget.thumbRect.left === targetThumbStageRect.left, "stable close target should retain the stage layout thumb rect");
  assert(
    projectedStableTarget.previewChildRects.get("app-a:0").left === targetChildClientRect.left,
    "stable close target should project registered preview child bounds to client coordinates at the boundary"
  );
  assert(
    resolved.stableFolderCloseTarget.previewChildRects.get("app-a:0").left === targetChildStageRect.left,
    "stable close target should retain registered stage layout preview child bounds"
  );
  assert(
    resolved.getOpeningPreviewChildClientRect({ id: "app-b" }, 1).left === liveChildRect.left,
    "opening preview lookup should prefer current live child bounds when live source bounds are available"
  );

  const liveClosing = resolveFolderOverlayTargets({
    desktopPageTrackOffset: { liveX: -120, targetX: -400 },
    folder,
    folderPageSize: 9,
    iconBoundsRegistry: registry,
    isClosing: true,
    previousStableFolderCloseTarget: resolved.stableFolderCloseTarget,
    wasClosing: false,
  });
  assert(liveClosing.stableFolderCloseTarget.coordinateSpace === "client-visual", "closing should capture desktop live target in client-visual coordinates");
  assert(liveClosing.stableFolderCloseTarget.source === "live-final-close", "closing should mark the first live close capture as final-close source");
  const projectedLiveTarget = projectFolderCloseTargetToClient(liveClosing.stableFolderCloseTarget);
  assert(projectedLiveTarget.iconRect.left === liveCloseIconRect.left, "client-visual close target should not be projected a second time");
  assert(projectedLiveTarget.thumbRect.left === liveCloseThumbRect.left, "client-visual close thumb target should stay in client coordinates");
  assert(
    projectedLiveTarget.previewChildRects.get("app-a:0").left === liveCloseChildRect.left,
    "client-visual close target should retain live preview child coordinates"
  );

  const reusedLiveClosing = resolveFolderOverlayTargets({
    desktopPageTrackOffset: { liveX: -120, targetX: -400 },
    folder,
    folderPageSize: 9,
    iconBoundsRegistry: registry,
    isClosing: true,
    previousStableFolderCloseTarget: liveClosing.stableFolderCloseTarget,
    wasClosing: true,
  });
  assert(reusedLiveClosing.stableFolderCloseTarget === liveClosing.stableFolderCloseTarget, "resolver should reuse an unchanged live close target");

  const retargetedLiveClosing = resolveFolderOverlayTargets({
    desktopPageTrackOffset: { liveX: -140, targetX: -400 },
    folder,
    folderPageSize: 9,
    iconBoundsRegistry: registry,
    isClosing: true,
    previousStableFolderCloseTarget: liveClosing.stableFolderCloseTarget,
    wasClosing: true,
  });
  assert(retargetedLiveClosing.stableFolderCloseTarget !== liveClosing.stableFolderCloseTarget, "desktop offset changes should refresh the live close target");
  assert(retargetedLiveClosing.stableFolderCloseTarget.source === "live-target", "same closing session live refresh should not claim a new final-close capture");

  registry.clearBounds({ kind: K.TOP_LEVEL, variant: V.LIVE_TARGET });
  registry.clearBounds({ kind: K.FOLDER_THUMB, variant: V.LIVE_TARGET });
  registry.clearBounds({ kind: K.PREVIEW_CHILD, variant: V.LIVE_TARGET });
  const stableFallbackClosing = resolveFolderOverlayTargets({
    desktopPageTrackOffset: { liveX: -160, targetX: -400 },
    folder,
    folderPageSize: 9,
    iconBoundsRegistry: registry,
    isClosing: true,
    previousStableFolderCloseTarget: retargetedLiveClosing.stableFolderCloseTarget,
    wasClosing: true,
  });
  assert(stableFallbackClosing.stableFolderCloseTarget.coordinateSpace === "stage-layout", "missing live close target should fall back to the stable stage-layout target");
  assert(stableFallbackClosing.stableFolderCloseTarget.source === "stable-target", "stable fallback during the same close should keep the stable target source");

  const reusedStableTarget = { coordinateSpace: "stage-layout", folderId: folder.id, iconRect: { left: 1, top: 2, width: 3, height: 4 }, source: "previous" };
  const reused = resolveFolderOverlayTargets({
    folder,
    folderPageSize: 9,
    iconBoundsRegistry: registry,
    isClosing: false,
    previousStableFolderCloseTarget: reusedStableTarget,
    wasClosing: false,
  });
  assert(reused.stableFolderCloseTarget === reusedStableTarget, "resolver should reuse an existing stable close target while not closing");

  registry.clearBounds();
  const capturedOnly = resolveFolderOverlayTargets({
    folder,
    folderOpeningOriginBounds: {
      folderId: folder.id,
      iconRect: capturedIconRect,
      previewChildRects: [{ childId: "app-b", rect: capturedChildRect, slotIndex: 2 }],
      thumbRect: capturedThumbRect,
    },
    folderPageSize: 9,
    iconBoundsRegistry: registry,
    isClosing: false,
    previousStableFolderCloseTarget: null,
    wasClosing: false,
  });
  assert(capturedOnly.folderClientRect.left === capturedIconRect.left, "opening folder rect should fall back to captured origin bounds without live bounds");
  assert(capturedOnly.folderThumbClientRect.left === capturedThumbRect.left, "opening thumb rect should fall back to captured origin thumb bounds without live bounds");
  assert(
    capturedOnly.getOpeningPreviewChildClientRect({ id: "app-b" }, 1).left === capturedChildRect.left,
    "opening preview lookup should fall back to captured child bounds without live bounds"
  );

  registry.clearBounds();
}
