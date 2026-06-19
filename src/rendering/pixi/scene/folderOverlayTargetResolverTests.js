import {
  clearIconBoundsRegistry,
  registerRenderedClientFolderPreviewChildBounds,
  registerRenderedClientLaunchIconBounds,
  registerRenderedClientTopLevelFolderThumbBounds,
  registerStableStageLayoutFolderPreviewChildTargetBounds,
  registerStableStageLayoutTopLevelFolderThumbTargetBounds,
  registerStableStageLayoutTopLevelIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import { resolveFolderOverlayTargets } from "./folderOverlayTargetResolver.js";

function identityStageMeta(meta = {}) {
  return {
    stageHeight: 400,
    stageRect: { height: 400, left: 0, top: 0, width: 400 },
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
    children: [{ id: "app-a" }, { id: "app-b" }, { id: "app-c" }],
  };
  const liveIconRect = { height: 90, left: 100, top: 120, width: 90 };
  const liveThumbRect = { height: 72, left: 109, top: 129, width: 72 };
  const targetIconRect = { height: 96, left: 200, top: 220, width: 96 };
  const targetThumbRect = { height: 80, left: 208, top: 228, width: 80 };
  const targetChildRect = { height: 18, left: 216, top: 236, width: 18 };
  const capturedIconRect = { height: 88, left: 300, top: 320, width: 88 };
  const capturedThumbRect = { height: 70, left: 309, top: 329, width: 70 };
  const capturedChildRect = { height: 14, left: 316, top: 336, width: 14 };
  const liveChildRect = { height: 13, left: 116, top: 136, width: 13 };

  clearIconBoundsRegistry();
  registerRenderedClientLaunchIconBounds({ area: "desktop", id: folder.id, pageIndex: 0 }, liveIconRect, { area: "desktop", id: folder.id });
  registerRenderedClientTopLevelFolderThumbBounds(folder.id, liveThumbRect, { area: "desktop", id: folder.id });
  registerStableStageLayoutTopLevelIconTargetBounds(folder.id, targetIconRect, identityStageMeta({ area: "desktop", id: folder.id }));
  registerStableStageLayoutTopLevelFolderThumbTargetBounds(folder.id, targetThumbRect, identityStageMeta({ area: "desktop", id: folder.id }));
  registerRenderedClientFolderPreviewChildBounds(folder.id, "app-b", 1, liveChildRect);
  registerStableStageLayoutFolderPreviewChildTargetBounds(folder.id, "app-a", 0, targetChildRect, identityStageMeta({ area: "desktop", folderId: folder.id, id: "app-a" }));

  const resolved = resolveFolderOverlayTargets({
    folder,
    folderOpeningOriginBounds: {
      folderId: folder.id,
      iconRect: capturedIconRect,
      previewChildRects: [{ childId: "app-b", rect: capturedChildRect, slotIndex: 2 }],
      thumbRect: capturedThumbRect,
    },
    folderPageSize: 9,
    isClosing: false,
    previousStableFolderCloseTarget: null,
    wasClosing: false,
  });

  assert(resolved.coordinateSpace === "client-visual", "resolver should declare client visual coordinate output");
  assert(resolved.folderClientRect.left === capturedIconRect.left, "opening folder rect should prefer captured origin bounds");
  assert(resolved.folderThumbClientRect.left === capturedThumbRect.left, "opening thumb rect should prefer captured origin thumb bounds");
  assert(resolved.previewSlots[0].id === "app-a", "resolver should expose folder preview slots");
  assert(resolved.stableFolderCloseTarget.source === "stable-target", "stable target capture should describe its source");
  assert(resolved.stableFolderCloseTarget.iconRect.left === targetIconRect.left, "stable close target should prefer target icon rect");
  assert(resolved.stableFolderCloseTarget.thumbRect.left === targetThumbRect.left, "stable close target should prefer target thumb rect");
  assert(
    resolved.stableFolderCloseTarget.previewChildRects.get("app-a:0").left === targetChildRect.left,
    "stable close target should prefer registered target preview child bounds"
  );
  assert(
    resolved.getOpeningPreviewChildClientRect({ id: "app-b" }, 1).left === capturedChildRect.left,
    "opening preview lookup should prefer captured child bounds by child id fallback"
  );

  const reusedStableTarget = { folderId: folder.id, iconRect: { left: 1, top: 2, width: 3, height: 4 }, source: "previous" };
  const reused = resolveFolderOverlayTargets({
    folder,
    folderPageSize: 9,
    isClosing: false,
    previousStableFolderCloseTarget: reusedStableTarget,
    wasClosing: false,
  });
  assert(reused.stableFolderCloseTarget === reusedStableTarget, "resolver should reuse an existing stable close target while not closing");

  clearIconBoundsRegistry();
}
