import {
  createIconBoundsRegistry,
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../geometry/iconBoundsRegistry.js";
import type { IconBoundsMeta } from "../geometry/iconBoundsRegistry.js";
import type { StageProjectionMeta } from "../geometry/stageCoordinates.js";
import { projectFolderCloseTargetToClient } from "./folderOverlayTargets.js";
import type { StableFolderCloseTarget } from "./folderOverlayTargets.js";
import {
  captureFolderOpeningOriginBounds,
  resolveFolderOverlayTargets,
} from "./folderOverlayTargetResolver.js";

const K = ICON_BOUNDS_KIND;
const V = ICON_BOUNDS_VARIANT;

function projectedStageMeta(
  meta: IconBoundsMeta = {}
): IconBoundsMeta & Required<StageProjectionMeta> {
  return {
    stageHeight: 400,
    stageRect: { height: 800, left: 100, top: 60, width: 800 },
    stageWidth: 400,
    ...meta,
  };
}

export function runFolderOverlayTargetResolverTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
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
  const renderedCloseChildRect = { height: 16.55, left: 118, top: 138, width: 16.55 };

  const registry = createIconBoundsRegistry();
  registry.clearBounds();
  registry.registerBounds(K.LAUNCH, V.RENDERED, { area: "desktop", id: folder.id, pageIndex: 2 }, liveIconRect, {
    area: "desktop",
    id: folder.id,
    index: 10,
    pageIndex: 2,
    visualSpec: { iconSize: 64 },
  } as IconBoundsMeta & Readonly<{ visualSpec: Readonly<{ iconSize: number }> }>);
  registry.registerBounds(K.FOLDER_THUMB, V.RENDERED, folder.id, liveThumbRect, { area: "desktop", id: folder.id });
  registry.registerBounds(K.TOP_LEVEL, V.STABLE_STAGE_LAYOUT, folder.id, targetIconStageRect, projectedStageMeta({ area: "desktop", id: folder.id }));
  registry.registerBounds(K.FOLDER_THUMB, V.STABLE_STAGE_LAYOUT, folder.id, targetThumbStageRect, projectedStageMeta({ area: "desktop", id: folder.id }));
  registry.registerBounds(K.PREVIEW_CHILD, V.RENDERED, { childId: "app-b", folderId: folder.id, slotIndex: 1 }, liveChildRect);
  registry.registerBounds(K.PREVIEW_CHILD, V.RENDERED, { childId: "app-a", folderId: folder.id, slotIndex: 0 }, renderedCloseChildRect);
  registry.registerBounds(K.PREVIEW_CHILD, V.STABLE_STAGE_LAYOUT, { childId: "app-a", folderId: folder.id, slotIndex: 0 }, targetChildStageRect, projectedStageMeta({ area: "desktop", folderId: folder.id, id: "app-a" }));
  registry.registerBounds(K.TOP_LEVEL, V.LIVE_TARGET, folder.id, liveCloseIconRect, { area: "desktop", id: folder.id });
  registry.registerBounds(K.FOLDER_THUMB, V.LIVE_TARGET, folder.id, liveCloseThumbRect, { area: "desktop", id: folder.id });
  registry.registerBounds(K.PREVIEW_CHILD, V.LIVE_TARGET, { childId: "app-a", folderId: folder.id, slotIndex: 0 }, liveCloseChildRect, { area: "desktop", folderId: folder.id, id: "app-a" });

  const pointerOrigin = captureFolderOpeningOriginBounds({
    fallbackIconRect: liveIconRect,
    folder,
    folderPageSize: 9,
    iconBoundsRegistry: registry,
  });
  assert(pointerOrigin, "a desktop folder hit should capture an opening origin");
  const expectedIconWidth = liveIconRect.width * targetIconClientRect.width / liveCloseIconRect.width;
  const expectedThumbWidth = liveThumbRect.width * targetThumbClientRect.width / liveCloseThumbRect.width;
  const expectedChildWidth = renderedCloseChildRect.width * targetChildClientRect.width / liveCloseChildRect.width;
  assert(
    Math.abs(pointerOrigin.iconRect.width - expectedIconWidth) < 0.0001 &&
      Math.abs(pointerOrigin.thumbRect.width - expectedThumbWidth) < 0.0001,
    "opening-origin capture should remove the shared desktop transform while retaining the rendered icon pose",
  );
  assert(
    Math.abs(
      (pointerOrigin.previewChildRects.find((entry) => entry.childId === "app-a")?.rect.width || 0) - expectedChildWidth,
    ) < 0.0001,
    "opening-origin capture should normalize preview children through the same stable coordinate frame",
  );

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
  assert(resolved.desktopIconSize === 64, "resolver should expose the canonical desktop icon size independently of rendered press scale");
  assert(resolved.desktopSlot?.index === 10 && resolved.desktopSlot.pageIndex === 2, "resolver should expose the rendered page-local desktop slot for trajectory direction");
  assert(resolved.folderClientRect, "the registered folder should resolve live client bounds");
  assert(resolved.folderThumbClientRect, "the registered folder should resolve live thumb bounds");
  assert(resolved.previewSlots[0], "the folder preview should expose its first item");
  assert(resolved.stableFolderCloseTarget, "stable registry geometry should produce a close target");
  assert(resolved.folderClientRect.left === capturedIconRect.left, "opening folder rect should retain the pointer-time captured bounds when live geometry changes");
  assert(resolved.folderThumbClientRect.left === capturedThumbRect.left, "opening thumb rect should retain the pointer-time captured thumb bounds when live geometry changes");
  assert(resolved.previewSlots[0].id === "app-a", "resolver should expose folder preview slots");
  assert(resolved.stableFolderCloseTarget.source === "stable-target", "stable target capture should describe its source");
  assert(resolved.stableFolderCloseTarget.coordinateSpace === "stage-layout", "stable close target should store stage layout coordinates");
  const projectedStableTarget = projectFolderCloseTargetToClient(resolved.stableFolderCloseTarget);
  assert(projectedStableTarget, "a stable close target should project into client coordinates");
  assert(projectedStableTarget.iconRect.left === targetIconClientRect.left, "stable close target should project target icon rect to client coordinates at the boundary");
  assert(resolved.stableFolderCloseTarget.iconRect.left === targetIconStageRect.left, "stable close target should retain the stage layout icon rect");
  assert(projectedStableTarget.thumbRect.left === targetThumbClientRect.left, "stable close target should project target thumb rect to client coordinates at the boundary");
  assert(resolved.stableFolderCloseTarget.thumbRect.left === targetThumbStageRect.left, "stable close target should retain the stage layout thumb rect");
  assert(
    projectedStableTarget.previewChildRects.get("app-a:0")?.left === targetChildClientRect.left,
    "stable close target should project registered preview child bounds to client coordinates at the boundary"
  );
  assert(
    resolved.stableFolderCloseTarget.previewChildRects.get("app-a:0")?.left === targetChildStageRect.left,
    "stable close target should retain registered stage layout preview child bounds"
  );
  assert(
    resolved.getOpeningPreviewChildClientRect({ id: "app-b" }, 1)?.left === capturedChildRect.left,
    "opening preview lookup should retain the captured child bounds when live source bounds are available"
  );

  const liveClosing = resolveFolderOverlayTargets({
    folder,
    folderPageSize: 9,
    iconBoundsRegistry: registry,
    isClosing: true,
    previousStableFolderCloseTarget: resolved.stableFolderCloseTarget,
    wasClosing: false,
  });
  assert(liveClosing.stableFolderCloseTarget, "rendered closing geometry should produce a close target");
  assert(liveClosing.stableFolderCloseTarget.coordinateSpace === "client-visual", "closing should capture rendered desktop geometry in client-visual coordinates");
  assert(liveClosing.stableFolderCloseTarget.source === "rendered-final-close", "closing should mark the first rendered close capture as final-close source");
  const projectedLiveTarget = projectFolderCloseTargetToClient(liveClosing.stableFolderCloseTarget);
  assert(projectedLiveTarget, "a rendered close target should remain projectable");
  assert(projectedLiveTarget.iconRect.left === liveIconRect.left, "closing should follow the currently rendered desktop icon instead of the pinned LIVE_TARGET");
  assert(projectedLiveTarget.thumbRect.left === liveThumbRect.left, "closing should follow the currently rendered desktop thumb instead of the pinned LIVE_TARGET");
  assert(
    projectedLiveTarget.previewChildRects.get("app-a:0")?.left === renderedCloseChildRect.left,
    "closing should retain the currently rendered preview-child coordinates",
  );

  const reusedLiveClosing = resolveFolderOverlayTargets({
    folder,
    folderPageSize: 9,
    iconBoundsRegistry: registry,
    isClosing: true,
    previousStableFolderCloseTarget: liveClosing.stableFolderCloseTarget,
    wasClosing: true,
  });
  assert(reusedLiveClosing.stableFolderCloseTarget === liveClosing.stableFolderCloseTarget, "desktop page offset metadata alone should not rebuild an unchanged rendered close target");

  const movedRenderedIconRect = { height: 88, left: 96, top: 164, width: 88 };
  const movedRenderedThumbRect = { height: 70, left: 105, top: 173, width: 70 };
  const movedRenderedChildRect = { height: 17.1, left: 114, top: 182, width: 17.1 };
  registry.registerBounds(K.LAUNCH, V.RENDERED, { area: "desktop", id: folder.id, pageIndex: 2 }, movedRenderedIconRect, {
    area: "desktop",
    id: folder.id,
    index: 10,
    pageIndex: 2,
    visualSpec: { iconSize: 64 },
  } as IconBoundsMeta & Readonly<{ visualSpec: Readonly<{ iconSize: number }> }>);
  registry.registerBounds(K.FOLDER_THUMB, V.RENDERED, folder.id, movedRenderedThumbRect, { area: "desktop", id: folder.id });
  registry.registerBounds(K.PREVIEW_CHILD, V.RENDERED, { childId: "app-a", folderId: folder.id, slotIndex: 0 }, movedRenderedChildRect);

  const retargetedLiveClosing = resolveFolderOverlayTargets({
    folder,
    folderPageSize: 9,
    iconBoundsRegistry: registry,
    isClosing: true,
    previousStableFolderCloseTarget: liveClosing.stableFolderCloseTarget,
    wasClosing: true,
  });
  assert(retargetedLiveClosing.stableFolderCloseTarget, "retargeting should keep a close target");
  assert(retargetedLiveClosing.stableFolderCloseTarget !== liveClosing.stableFolderCloseTarget, "rendered world-geometry changes should refresh the close target");
  assert(retargetedLiveClosing.stableFolderCloseTarget.source === "rendered-target", "same closing session rendered refresh should not claim a new final-close capture");
  const projectedRetarget = projectFolderCloseTargetToClient(retargetedLiveClosing.stableFolderCloseTarget);
  assert(projectedRetarget?.iconRect.left === movedRenderedIconRect.left, "refreshed close target should use the moved rendered desktop icon");
  assert(projectedRetarget?.previewChildRects.get("app-a:0")?.left === movedRenderedChildRect.left, "refreshed close target should use the moved rendered preview child");

  registry.clearBounds({ kind: K.TOP_LEVEL, variant: V.RENDERED });
  registry.clearBounds({ kind: K.FOLDER_THUMB, variant: V.RENDERED });
  registry.clearBounds({ kind: K.PREVIEW_CHILD, variant: V.RENDERED });
  const stableFallbackClosing = resolveFolderOverlayTargets({
    folder,
    folderPageSize: 9,
    iconBoundsRegistry: registry,
    isClosing: true,
    previousStableFolderCloseTarget: retargetedLiveClosing.stableFolderCloseTarget,
    wasClosing: true,
  });
  assert(stableFallbackClosing.stableFolderCloseTarget, "stable geometry should remain available as a fallback");
  assert(stableFallbackClosing.stableFolderCloseTarget.coordinateSpace === "stage-layout", "missing rendered close target should fall back to the stable stage-layout target even when LIVE_TARGET exists");
  assert(stableFallbackClosing.stableFolderCloseTarget.source === "stable-target", "stable fallback during the same close should keep the stable target source");

  const reusedStableTarget: StableFolderCloseTarget = {
    coordinateSpace: "stage-layout",
    folderId: folder.id,
    iconRect: { left: 1, top: 2, width: 3, height: 4 },
    previewChildRects: new Map(),
    projection: projectedStageMeta(),
    source: "previous",
    thumbRect: { left: 1, top: 2, width: 3, height: 4 },
    trackingKey: null,
  };
  const reused = resolveFolderOverlayTargets({
    folder,
    folderPageSize: 9,
    iconBoundsRegistry: registry,
    isClosing: false,
    previousStableFolderCloseTarget: reusedStableTarget,
    wasClosing: false,
  });
  assert(reused.stableFolderCloseTarget === reusedStableTarget, "resolver should reuse an existing stable close target while not closing");

  const compactedFolder = { ...folder, childPages: [[{ id: "app-b" }, { id: "app-c" }]] };
  registry.registerBounds(K.TOP_LEVEL, V.RENDERED, folder.id, liveIconRect, { item: compactedFolder } as IconBoundsMeta & {item:typeof compactedFolder});
  registry.registerBounds(K.PREVIEW_CHILD, V.RENDERED, { childId: "app-b", folderId: folder.id, slotIndex: 0 }, liveChildRect);
  const compactedClose = resolveFolderOverlayTargets({folder,folderPageSize:9,iconBoundsRegistry:registry,isClosing:true});
  assert(compactedClose.previewSlots.map(item=>item?.id).filter(Boolean).join(",") === "app-b,app-c",
    "closing must use the committed desktop children instead of the retained panel's old slots");
  assert(compactedClose.stableFolderCloseTarget?.previewChildRects.has("app-b:0"),
    "a surviving child must target its compacted preview slot");
  assert(folder.childPages[0]?.[0]?.id === "app-a", "resolving the destination must preserve the source panel snapshot");
  const unchangedOpen = resolveFolderOverlayTargets({folder,folderPageSize:9,iconBoundsRegistry:registry,isClosing:false});
  assert(unchangedOpen.previewSlots[0]?.id === "app-a", "opening must continue to use its source preview slots");

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
  assert(capturedOnly.folderClientRect, "captured origin bounds should provide a folder rect");
  assert(capturedOnly.folderThumbClientRect, "captured origin bounds should provide a thumb rect");
  assert(capturedOnly.folderClientRect.left === capturedIconRect.left, "opening folder rect should fall back to captured origin bounds without live bounds");
  assert(capturedOnly.folderThumbClientRect.left === capturedThumbRect.left, "opening thumb rect should fall back to captured origin thumb bounds without live bounds");
  assert(
    capturedOnly.getOpeningPreviewChildClientRect({ id: "app-b" }, 1)?.left === capturedChildRect.left,
    "opening preview lookup should fall back to captured child bounds without live bounds"
  );

  registry.clearBounds();
}
