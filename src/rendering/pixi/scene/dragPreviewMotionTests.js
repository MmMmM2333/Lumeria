import {
  DRAG_PREVIEW_FOLDER_HOVER_SCALE,
  DRAG_PREVIEW_SCALE,
  getDragPreviewLayout,
  getDragPreviewTargetScale,
  getDragReleaseMotion,
  makeDragPreviewKey,
} from "./dragPreviewMotion.js";

export function runDragPreviewMotionTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi drag preview motion test failed] ${message}`);
  };

  const preview = {
    cellSize: { height: 96, width: 88 },
    item: { id: "app-1" },
    offset: { x: 10, y: 20 },
    pointer: { x: 220, y: 320 },
    size: { height: 64, width: 64 },
    source: { folderId: "folder-1", index: 2, pageIndex: 1, type: "folder" },
  };

  assert(makeDragPreviewKey(preview) === "app-1:folder:folder-1:1:2", "preview key should include item and source identity");
  assert(getDragPreviewTargetScale({ phase: "hover", targetType: "folder" }) === DRAG_PREVIEW_FOLDER_HOVER_SCALE, "folder hover should shrink the drag preview");
  assert(getDragPreviewTargetScale({ phase: "flash", targetType: "folder" }) === DRAG_PREVIEW_FOLDER_HOVER_SCALE, "folder flash should keep the hover scale");
  assert(getDragPreviewTargetScale({ phase: "hover", targetType: "app" }) === DRAG_PREVIEW_SCALE, "non-folder hover should keep the default scale");

  const layout = getDragPreviewLayout(preview, {
    folderHoverState: { phase: "hover", targetType: "folder" },
    iconSize: 56,
    isTextlessMode: false,
    stageRect: { left: 100, top: 200 },
  });
  assert(layout.iconSize === 64, "preview layout should prefer the dragged icon size");
  assert(layout.cellWidth === 88 && layout.cellHeight === 96, "preview layout should preserve larger cell dimensions");
  assert(layout.position.x === 142 && layout.position.y === 146, "preview layout should account for pointer offset, stage origin, and visual offset");
  assert(layout.scaleKey === "app-1:folder:folder-1:1:2:0.92", "preview layout should include target scale in the scale key");

  const pendingRelease = getDragReleaseMotion({
    ...preview,
    key: "release-1",
    targetVersion: 3,
    velocity: { x: 120, y: -60 },
  }, {
    iconSize: 56,
    isTextlessMode: false,
    height: 600,
    stageRect: { left: 100, top: 200 },
    width: 1200,
  });
  assert(!pendingRelease.hasTargetRect, "release motion should allow pending target rects");
  assert(pendingRelease.key === "release-1:3:pending", "pending release key should include target state");
  assert(pendingRelease.target.x === pendingRelease.start.x && pendingRelease.target.y === pendingRelease.start.y, "pending release should stay at the pointer placement");
  assert(pendingRelease.targetScale === 1, "pending release should keep neutral target scale");
  assert(pendingRelease.velocity.x === 120 && pendingRelease.velocity.y === -60, "release motion should preserve velocity when stage scale is neutral");

  const targetedRelease = getDragReleaseMotion({
    ...preview,
    targetRect: { height: 32, left: 300, top: 400, width: 32 },
    targetVersion: 4,
    textless: false,
  }, {
    iconSize: 56,
    isTextlessMode: true,
    stageRect: { left: 100, top: 200 },
  });
  assert(targetedRelease.hasTargetRect, "release motion should detect available target rects");
  assert(targetedRelease.key === "app-1:folder:folder-1:1:2:4:target", "targeted release key should include target state");
  assert(targetedRelease.target.x === 216 && targetedRelease.target.y === 230, "targeted release should account for stage origin and visual offset");
  assert(targetedRelease.targetScale === 0.5, "targeted release should scale to the target rect width");
  assert(!targetedRelease.textless, "release textless override should win over current state");

  const stageTargetedRelease = getDragReleaseMotion({
    ...preview,
    targetRect: { height: 32, left: 300, top: 400, width: 32 },
    targetStageLayoutRect: { height: 40, left: 40, top: 50, width: 40 },
    targetVersion: 5,
    textless: false,
    velocity: { x: 200, y: 100 },
  }, {
    height: 1000,
    iconSize: 56,
    isTextlessMode: true,
    stageRect: { left: 100, top: 200, width: 500, height: 500 },
    width: 1000,
  });
  assert(stageTargetedRelease.hasStageLayoutTargetRect, "release motion should detect stage layout target rects");
  assert(stageTargetedRelease.target.x === 60 && stageTargetedRelease.target.y === 84, "release motion should prefer stage layout target rects over client rect projection");
  assert(Math.round(stageTargetedRelease.targetScale * 1000) === 625, "stage layout release target should scale from stage layout width");
  assert(stageTargetedRelease.velocity.x === 400 && stageTargetedRelease.velocity.y === 200, "release motion should convert client velocity into stage velocity");
}
