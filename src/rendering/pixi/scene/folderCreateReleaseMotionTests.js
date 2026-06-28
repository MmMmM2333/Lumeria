import { getFolderCreateReleaseMotion } from "./folderCreateReleaseMotion.js";

export function runFolderCreateReleaseMotionTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder create release motion test failed] ${message}`);
  };

  {
    const motion = getFolderCreateReleaseMotion({
      draggedApp: { id: "app-a", type: "app" },
      draggedAppSlotStageLayoutRect: { left: 228, top: 210, width: 16, height: 16 },
      duration: 0.18,
      folderId: "folder-created",
      key: "folder-create-release",
      sourceDraggedRect: { left: 20, top: 24, width: 64, height: 64 },
      sourceTargetStageLayoutRect: { left: 100, top: 100, width: 64, height: 64 },
      sourceTargetVisualSpec: { iconSize: 64 },
      targetApp: { id: "app-b", type: "app" },
      targetAppSlotStageLayoutRect: { left: 208, top: 210, width: 16, height: 16 },
      targetThumbStageLayoutRect: { left: 200, top: 200, width: 64, height: 64 },
      targetVersion: 1,
    }, {
      height: 480,
      iconSize: 64,
      stageRect: { left: 0, top: 0, width: 640, height: 480 },
      width: 640,
    });

    assert(motion.hasTarget === true, "motion should be ready when thumb and both slots are available");
    assert(motion.frame.source.scale > 1, "folder-create frame should start from the padded app-create hint size");
    assert(motion.frame.target.x === 232 && motion.frame.target.y === 232, "folder-create frame should target the folder thumb center");
    assert(motion.targetApp.source.scale === 4, "target app ghost should start at app icon size relative to preview slot");
    assert(motion.targetApp.target.x === 216 && motion.targetApp.target.y === 218, "target app ghost should target preview slot 0");
    assert(motion.draggedApp.target.x === 236 && motion.draggedApp.target.y === 218, "dragged app ghost should target preview slot 1");
  }

  {
    const motion = getFolderCreateReleaseMotion({
      draggedApp: { id: "app-a", type: "app" },
      folderId: "folder-created",
      key: "folder-create-release",
      sourceDraggedRect: { left: 20, top: 24, width: 64, height: 64 },
      sourceTargetRect: { left: 100, top: 100, width: 64, height: 64 },
      targetApp: { id: "app-b", type: "app" },
      targetThumbRect: { left: 200, top: 200, width: 64, height: 64 },
      targetVersion: 1,
    }, {
      height: 480,
      iconSize: 64,
      stageRect: { left: 0, top: 0, width: 640, height: 480 },
      width: 640,
    });

    assert(motion.hasTarget === true, "motion should derive preview slots from the folder thumb when explicit child bounds are pending");
    assert(motion.targetApp.targetRect.width > 0 && motion.draggedApp.targetRect.width > 0, "derived preview slot rects should be usable");
  }
}
