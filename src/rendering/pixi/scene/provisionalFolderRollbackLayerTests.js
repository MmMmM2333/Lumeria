import {
  makeProvisionalFolderRollbackVisualFrame,
  makeProvisionalFolderRollbackVisualPlan,
} from "./ProvisionalFolderRollbackLayer.js";

export function runProvisionalFolderRollbackLayerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Provisional folder rollback layer test failed] ${message}`);
  };
  const layer = {
    toLocal(_point, node) {
      return node.rollbackPoint;
    },
  };
  const folderNode = {
    rollbackPoint: { x: 232, y: 192 },
    getFolderPreviewChildReleasePose(relativeTo, slotIndex, options) {
      assert(relativeTo === layer, "folder child pose should be resolved in the rollback owner");
      assert(slotIndex === 0, "the projected target should use its preview slot");
      assert(options.expectedChildId === "target-app", "the release pose must belong to the target app");
      return {
        center: { x: 220, y: 180 },
        matrix: { a: 0.28, b: 0, c: 0, d: 0.28 },
        targetChildId: "target-app",
      };
    },
  };
  const targetNode = {
    iconSize: 64,
    rollbackPoint: { x: 232, y: 192 },
    scale: { x: 1, y: 1 },
  };
  const plan = makeProvisionalFolderRollbackVisualPlan({
    folderNode,
    handoffVelocity: 0.75,
    layer,
    previewSlotIndex: 0,
    reducedMotion: false,
    targetAppId: "target-app",
    targetNode,
  });
  assert(
    plan.targetActor.from.x === 220 &&
      plan.targetActor.from.scaleX === 0.28 &&
      plan.targetActor.to.x === 232 &&
      plan.targetActor.to.scaleX === 1,
    "the target actor should expand from the real folder thumbnail child to its live desktop pose"
  );
  assert(
    plan.folderShell.to.alpha === 0 && plan.folderShell.to.scale === 0.76,
    "the handed-off folder shell should shrink and disappear while the app exits"
  );
  assert(plan.duration > 0, "normal motion should retain a visible dissolve duration");
  assert(plan.handoffVelocity === 0.75, "the visual plan should retain the closing momentum");

  const firstFrameProgress = plan.ease((1 / 60) / plan.duration);
  const firstFrame = makeProvisionalFolderRollbackVisualFrame(plan, firstFrameProgress, 1);
  const targetTravel = (firstFrame.targetActor.x - plan.targetActor.from.x) /
    (plan.targetActor.to.x - plan.targetActor.from.x);
  const shellFade = 1 - firstFrame.folderShell.alpha;
  assert(
    firstFrameProgress > 0 && firstFrameProgress < 0.04,
    "the handoff should preserve a restrained first-frame speed instead of restarting at maximum velocity"
  );
  assert(
    Math.abs(targetTravel - firstFrameProgress) < 0.000001 &&
      Math.abs(shellFade - firstFrameProgress) < 0.000001 &&
      Math.abs(firstFrame.targetLabelAlpha - firstFrameProgress) < 0.000001,
    "the target, shell, and label should share one momentum-bearing progress clock"
  );

  const reduced = makeProvisionalFolderRollbackVisualPlan({
    folderNode,
    layer,
    previewSlotIndex: 0,
    reducedMotion: true,
    targetAppId: "target-app",
    targetNode,
  });
  assert(reduced.duration === 0, "reduced motion should preserve ownership handoff without animation time");
}
