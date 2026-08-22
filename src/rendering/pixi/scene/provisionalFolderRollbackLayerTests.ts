import {
  ProvisionalFolderRollbackLayer,
  makeProvisionalFolderRollbackVisualFrame,
  makeProvisionalFolderRollbackVisualPlan,
} from "./ProvisionalFolderRollbackLayer.js";
import type {
  ProvisionalFolderRollbackRequest,
  ProvisionalFolderRollbackVisualPlanOptions,
} from "./ProvisionalFolderRollbackLayer.js";

type AssertTrue<Value extends true> = Value;
type RollbackVisualPlanOptionsAreRequired = AssertTrue<
  undefined extends Parameters<typeof makeProvisionalFolderRollbackVisualPlan>[0] ? false : true
>;
type RollbackVisualPlanInputsAreRequired = AssertTrue<
  undefined extends ProvisionalFolderRollbackVisualPlanOptions[
    "folderNode" | "layer" | "targetAppId" | "targetNode"
  ] ? false : true
>;
type RollbackVisualFramePlanIsRequired = AssertTrue<
  undefined extends Parameters<typeof makeProvisionalFolderRollbackVisualFrame>[0] ? false : true
>;
type RollbackStartRequestIsRequired = AssertTrue<
  undefined extends Parameters<ProvisionalFolderRollbackLayer["start"]>[0] ? false : true
>;
type RollbackRequestInputsAreRequired = AssertTrue<
  undefined extends ProvisionalFolderRollbackRequest[
    "folderNode" | "targetAppId" | "targetNode" | "token"
  ] ? false : true
>;

interface TestRollbackNode {
  readonly rollbackPoint: { readonly x: number; readonly y: number };
}

interface TestPreviewRequest {
  readonly expectedChildId?: string | null | undefined;
  readonly previewIconSize: number;
}

export function runProvisionalFolderRollbackLayerTests(): void {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[Provisional folder rollback layer test failed] ${message}`);
  }

  {
    let thrown: unknown = null;
    try {
      Reflect.apply(makeProvisionalFolderRollbackVisualPlan, null, []);
    } catch (error) {
      thrown = error;
    }
    assert(/requires a layer/.test(String(thrown)), "rollback visual planning should reject missing owner inputs explicitly");
  }

  {
    const rollbackLayer = new ProvisionalFolderRollbackLayer();
    let thrown: unknown = null;
    try {
      Reflect.apply(rollbackLayer.start, rollbackLayer, []);
    } catch (error) {
      thrown = error;
    }
    assert(/requires a token/.test(String(thrown)), "rollback start should reject a missing request explicitly");
  }
  const layer = {
    toLocal(_point: unknown, node: TestRollbackNode) {
      return node.rollbackPoint;
    },
  };
  const folderNode = {
    rollbackPoint: { x: 232, y: 192 },
    getFolderPreviewChildReleasePose(
      relativeTo: unknown,
      slotIndex: number,
      options: TestPreviewRequest,
    ) {
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
