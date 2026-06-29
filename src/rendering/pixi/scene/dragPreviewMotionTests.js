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
    compact: true,
    item: { id: "app-1" },
    offset: { x: 10, y: 20 },
    pointer: { x: 220, y: 320 },
    singleLineLabel: true,
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
  assert(layout.compact === true && layout.singleLineLabel === true, "preview layout should preserve source label layout flags");
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
  assert(pendingRelease.compact === true && pendingRelease.singleLineLabel === true, "release motion should preserve source label layout flags");
  assert(pendingRelease.key === "release-1:3:pending", "pending release key should include target state");
  assert(pendingRelease.target.x === pendingRelease.start.x && pendingRelease.target.y === pendingRelease.start.y, "pending release should stay at the pointer placement");
  assert(pendingRelease.targetScale === 1, "pending release should keep neutral target scale");
  assert(pendingRelease.releaseMode === "slot", "pending release should default to slot mode");
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
  assert(targetedRelease.target.x === 216 && targetedRelease.target.y === 230, "targeted release should account for stage origin and the unscaled slot visual offset");
  assert(targetedRelease.targetScale === 1, "slot release should return the preview to the real icon scale");
  assert(targetedRelease.targetAlpha === 1 && targetedRelease.targetLabelAlpha === 1, "slot release should keep icon and label visible");
  assert(!targetedRelease.textless, "release textless override should win over current state");

  const targetSpecRelease = getDragReleaseMotion({
    ...preview,
    targetRect: { height: 56, left: 300, top: 400, width: 56 },
    targetVersion: 8,
    targetVisualSpec: {
      cellHeight: 90,
      cellWidth: 76,
      compact: false,
      iconSize: 56,
      singleLineLabel: false,
      textless: false,
    },
    textless: false,
  }, {
    iconSize: 64,
    stageRect: { left: 100, top: 200 },
  });
  assert(targetSpecRelease.iconSize === 56, "slot release should render with the target icon size when visual spec is available");
  assert(targetSpecRelease.cellWidth === 76 && targetSpecRelease.cellHeight === 90, "slot release should use the target cell dimensions");
  assert(targetSpecRelease.compact === false && targetSpecRelease.singleLineLabel === false, "slot release should use target label layout flags");
  assert(Math.round(targetSpecRelease.startScaleMultiplier * 10000) === 11429, "slot release should compensate source-to-target icon size at the start");
  assert(targetSpecRelease.targetScale === 1, "target-spec slot release should finish at neutral node scale");
  assert(targetSpecRelease.startIconCenter.x === 142 && targetSpecRelease.startIconCenter.y === 132, "target-spec slot release should preserve the source pointer icon center");

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
  assert(stageTargetedRelease.targetScale === 1, "stage layout slot release should still return the preview to the real icon scale");
  assert(stageTargetedRelease.velocity.x === 400 && stageTargetedRelease.velocity.y === 200, "release motion should convert client velocity into stage velocity");

  const folderPreviewRelease = getDragReleaseMotion({
    ...preview,
    releaseMode: "folder-preview-slot",
    targetRect: { height: 18, left: 300, top: 400, width: 18 },
    targetVersion: 6,
  }, {
    iconSize: 56,
    stageRect: { left: 100, top: 200 },
  });
  assert(Math.round(folderPreviewRelease.targetScale * 10000) === 2813, "folder preview release should scale to the preview child rect");
  assert(folderPreviewRelease.targetAlpha === 1, "folder preview release should keep the icon visible");
  assert(folderPreviewRelease.targetLabelAlpha === 0, "folder preview release should fade the label out");

  const folderCenterRelease = getDragReleaseMotion({
    ...preview,
    releaseMode: "folder-center-absorb",
    targetRect: { height: 20, left: 300, top: 400, width: 20 },
    targetVersion: 7,
  }, {
    iconSize: 56,
    stageRect: { left: 100, top: 200 },
  });
  assert(folderCenterRelease.targetScale === 0.1, "folder center absorb release should shrink to a small terminal scale");
  assert(folderCenterRelease.targetAlpha === 0, "folder center absorb release should fade out");
  assert(folderCenterRelease.targetLabelAlpha === 0, "folder center absorb release should hide the label");
}
