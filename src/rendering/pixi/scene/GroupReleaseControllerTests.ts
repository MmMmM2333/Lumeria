import { Container } from "pixi.js";
import type { StageOrigin } from "../geometry/stageCoordinates.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { GROUP_TRANSFER_RUNTIME_MODE } from "./groupTransferRuntimeAdapter.js";
import { GroupReleaseController } from "./GroupReleaseController.js";
import type { GroupTransferRuntimeMode } from "./groupTransferRuntimeAdapter.js";
import type {
  GroupReleaseActorNode,
  GroupReleaseControllerOptions,
  GroupReleaseEntry,
  GroupReleaseFolderLane,
  GroupReleaseFolderNode,
  GroupReleaseFolderShellPayload,
  GroupReleaseGroup,
  GroupReleaseLane,
  GroupReleasePlan,
  GroupReleasePointLane,
  GroupReleasePointPose,
  GroupReleaseResolverPayload,
  GroupReleaseSettlementPayload,
  GroupReleaseUpdateOptions,
} from "./GroupReleaseController.js";
import type { FolderReleasePreviewPoseOptions } from "./folderReleaseController.js";

type GroupReleasePointResolution = NonNullable<
  ReturnType<NonNullable<GroupReleaseControllerOptions["resolvePointTarget"]>>
>;

type AssertTrue<Value extends true> = Value;
type GroupReleaseLayerIsRequired = AssertTrue<
  null extends ConstructorParameters<typeof GroupReleaseController>[0] ? false : true
>;
type GroupReleaseResolverNodeIsOptional = AssertTrue<
  {} extends Pick<GroupReleaseResolverPayload, "node"> ? true : false
>;
type GroupReleaseResolverNodeRejectsExplicitUndefined = AssertTrue<
  { node: undefined } extends Pick<GroupReleaseResolverPayload, "node"> ? false : true
>;
type GroupReleaseResolverNodeExcludesNull = AssertTrue<
  null extends GroupReleaseResolverPayload["node"] ? false : true
>;
type GroupReleaseRawPointMayBeUnavailable = AssertTrue<
  null extends GroupReleasePointResolution["point" | "scale"] ? true : false
>;
type GroupReleaseNormalizedPointIsAvailable = AssertTrue<
  null extends GroupReleasePointPose["point" | "scale"] ? false : true
>;

type TestSettlement = GroupReleaseSettlementPayload & Readonly<{
  callback: "abort" | "complete";
}>;

function makeActorNode(visibleLabel = false): GroupReleaseActorNode {
  const labelText = new Container();
  labelText.visible = visibleLabel;
  const node = Object.assign(new Container(), { labelText });
  node.addChild(labelText);
  return node;
}

function makeEntry(
  id: string,
  mode: GroupTransferRuntimeMode = GROUP_TRANSFER_RUNTIME_MODE.POINT_HANDOFF,
  overrides: Partial<GroupReleaseEntry> = {},
): GroupReleaseEntry {
  return {
    delayMs: 0,
    fallback: { x: 300, y: 220 },
    id,
    memberIds: [id],
    mode,
    origin: { x: 20, y: 30 },
    originScale: 1,
    target: { area: "desktop", id, kind: "desktop" },
    velocity: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeState(
  group: GroupReleaseGroup,
  node: GroupReleaseActorNode,
  nodeId = "app",
  nodes: Map<string, GroupReleaseActorNode> | null = null,
): GroupReleaseUpdateOptions {
  return {
    deviceResolution: 1,
    group,
    height: 600,
    iconSize: 64,
    nodes: nodes || new Map([[nodeId, node]]),
    stageRect: { height: 600, left: 0, top: 0, width: 800 },
    visualOffsetY: 0,
    width: 800,
  };
}

function stepUntil(
  callbacks: readonly unknown[],
  predicate: () => boolean,
  onFrame: () => void = () => {},
  maxFrames = 240,
): number {
  for (let index = 0; index < maxFrames && !predicate(); index += 1) {
    motionRuntime.step(1 / 60);
    onFrame();
  }
  return callbacks.length;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[Group release controller test failed] ${message}`);
}

function requirePointLane(lane: GroupReleaseLane | undefined, message: string): GroupReleasePointLane {
  assert(lane?.kind === "point", message);
  return lane;
}

function requireFolderLane(lane: GroupReleaseLane | undefined, message: string): GroupReleaseFolderLane {
  assert(lane?.kind === "folder" && lane.controller, message);
  return lane;
}

function requireFirst<T>(values: readonly T[], message: string): T {
  const value = values[0];
  assert(value !== undefined, message);
  return value;
}

export function runGroupReleaseControllerTests() {
  motionRuntime.reset();

  {
    let thrown: unknown = null;
    try {
      Reflect.construct(GroupReleaseController, [null]);
    } catch (error) {
      thrown = error;
    }
    if (!/requires a release layer/.test(String(thrown))) {
      throw new Error("[Group release controller test failed] group release should reject a missing owner layer explicitly");
    }
  }

  const layer = new Container();
  const node = makeActorNode();
  node.position.set(20, 30);
  node.scale.set(1);
  node.alpha = 1;
  const callbacks: TestSettlement[] = [];
  let target: GroupReleasePointResolution | null = {
    point: { x: 300, y: 220 },
    scale: { x: 0.75, y: 0.75 },
  };
  const controller = new GroupReleaseController(layer, {
    onEntryAbort: (payload) => callbacks.push({ ...payload, callback: "abort" }),
    onEntryComplete: (payload) => callbacks.push({ ...payload, callback: "complete" }),
    resolvePointTarget: () => target,
  });
  const plan: GroupReleasePlan = {
    entries: [makeEntry("app")],
    key: "plan-point",
    status: "pending",
  };
  const group: GroupReleaseGroup = {
    key: "group-point",
    phase: "releasing",
    reducedMotion: false,
    runtimePlan: plan,
  };
  try {
    controller.update(makeState(group, node));
    for (let index = 0; index < 12; index += 1) motionRuntime.step(1 / 60);
    assert(node.position.x > 20 && node.position.x < 300, "point handoff should preserve a continuous in-flight pose");

    target = {
      point: { x: 360, y: 260 },
      scale: { x: 0.625, y: 0.625 },
    };
    controller.update(makeState(group, node));
    stepUntil(callbacks, () => callbacks.length > 0, () => controller.renderFrame());
    assert(callbacks.length === 1, "a retargeted point lane should settle exactly once");
    const pointCallback = requireFirst(callbacks, "point handoff should publish a callback");
    assert(pointCallback.callback === "complete", "point handoff should report a settled completion");
    assert(pointCallback.planKey === "plan-point" && pointCallback.entryId === "app", "completion should carry the semantic plan identity");
    assert(Math.abs(node.position.x - 360) < 0.01 && Math.abs(node.position.y - 260) < 0.01, "retargeted point handoff should snap to the final live target");
    assert(
      Math.abs(node.scale.x - 0.625) < 0.01 && Math.abs(node.scale.y - 0.625) < 0.01,
      "point handoff should finish at the live target's visual scale"
    );

    controller.clear("test-reset");
    callbacks.length = 0;
    target = {
      point: { x: 100, y: 90 },
      scale: { x: 0.834375, y: 0.834375 },
    };
    node.position.set(360, 260);
    node.scale.set(1.08);
    node.alpha = 0.82;
    const rejectPlan: GroupReleasePlan = {
      entries: [makeEntry("app", GROUP_TRANSFER_RUNTIME_MODE.RETURN, {
        fallback: { x: 100, y: 90 },
        originAlpha: 0.82,
        originScale: 1.08,
      })],
      key: "plan-reject",
      status: "pending",
    };
    const rejectGroup: GroupReleaseGroup = { ...group, phase: "returning", runtimePlan: rejectPlan };
    controller.update(makeState(rejectGroup, node));
    stepUntil(callbacks, () => callbacks.length > 0, () => controller.renderFrame());
    assert(
      callbacks.length === 1 && requireFirst(callbacks, "origin return should publish a callback").outcome === "settled",
      "origin return should settle through the same explicit callback channel",
    );
    assert(
      Math.abs(node.scale.x - 0.834375) < 0.01 && Math.abs(node.alpha - 0.82) < 0.01,
      "origin return should match the live target scale while restoring the source alpha"
    );

    controller.clear("cancel-return-test-reset");
    callbacks.length = 0;
    node.position.set(360, 260);
    const cancelPlan: GroupReleasePlan = {
      ...rejectPlan,
      key: "plan-cancel-return",
    };
    const cancelGroup: GroupReleaseGroup = {
      ...group,
      key: "group-cancel-return",
      phase: "returning",
      runtimePlan: cancelPlan,
    };
    controller.update(makeState(cancelGroup, node));
    assert(controller.lanes.size === 1, "the cancelling phase should create the same origin-return release lane");
    stepUntil(callbacks, () => callbacks.length > 0, () => controller.renderFrame());
    assert(
      callbacks.length === 1 && requireFirst(callbacks, "cancel return should publish a callback").outcome === "settled",
      "a user-cancelled release should settle through the normal completion channel"
    );

    controller.clear("render-alignment-test-reset");
    callbacks.length = 0;
    target = {
      point: { x: 240, y: 180 },
      scale: { x: 0.8, y: 0.8 },
    };
    node.position.set(80, 70);
    node.scale.set(1);
    const alignmentPlan: GroupReleasePlan = {
      entries: [makeEntry("app")],
      key: "plan-render-alignment",
      status: "pending",
    };
    controller.update(makeState({ ...group, runtimePlan: alignmentPlan }, node));
    const alignmentLane = requirePointLane(
      [...controller.lanes.values()][0],
      "render alignment should create a point lane",
    );
    for (let index = 0; index < 120 && !alignmentLane.control?.completed; index += 1) {
      motionRuntime.step(1 / 60);
    }
    assert(alignmentLane.control?.completed === true, "point motion should finish before alignment ownership is tested");
    assert(callbacks.length === 0, "motion completion alone must not release visual ownership");
    controller.renderFrame();
    assert(
      callbacks.length === 0 && alignmentLane.alignedRenderFrames === 1 && !alignmentLane.settled,
      "the first aligned rendered frame must retain actor ownership"
    );
    controller.renderFrame();
    assert(
      callbacks.length === 0 && alignmentLane.settled,
      "the second aligned rendered frame should schedule, but not synchronously publish, the handoff"
    );
    motionRuntime.step(1 / 60);
    assert(
      (callbacks.length as number) === 1 &&
        requireFirst(callbacks, "aligned handoff should publish a callback").callback === "complete",
      "the aligned handoff should publish exactly once after the confirmed frame is rendered"
    );

    controller.clear("completed-target-retarget-test-reset");
    callbacks.length = 0;
    target = {
      point: { x: 240, y: 180 },
      scale: { x: 0.8, y: 0.8 },
    };
    node.position.set(80, 70);
    node.scale.set(1);
    const completedTargetPlan: GroupReleasePlan = {
      entries: [makeEntry("app", GROUP_TRANSFER_RUNTIME_MODE.RETURN)],
      key: "plan-completed-target-retarget",
      status: "pending",
    };
    const completedTargetGroup: GroupReleaseGroup = {
      ...group,
      phase: "returning",
      runtimePlan: completedTargetPlan,
    };
    controller.update(makeState(completedTargetGroup, node));
    const completedTargetLane = requirePointLane(
      [...controller.lanes.values()][0],
      "completed-target retarget should create a point lane",
    );
    for (let index = 0; index < 120 && !completedTargetLane.control?.completed; index += 1) {
      motionRuntime.step(1 / 60);
    }
    assert(
      completedTargetLane.control?.completed === true,
      "completed-target setup should finish the first return motion"
    );
    target = {
      point: { x: 240.6, y: 180 },
      scale: { x: 0.8, y: 0.8 },
    };
    controller.update(makeState(completedTargetGroup, node));
    stepUntil(callbacks, () => callbacks.length > 0, () => controller.renderFrame());
    assert(
      callbacks.length === 1 && Math.abs(node.position.x - 240.6) < 0.01,
      "a point lane whose live target moves after motion completion should retarget and settle at the latest rendered pose"
    );

    controller.clear("missing-target-test-reset");
    callbacks.length = 0;
    target = null;
    const missingPlan: GroupReleasePlan = {
      entries: [makeEntry("app")],
      key: "plan-missing-target",
      status: "pending",
    };
    controller.update(makeState({ ...group, runtimePlan: missingPlan }, node));
    const missingLane = requirePointLane(
      [...controller.lanes.values()][0],
      "missing-target flow should create a point lane",
    );
    assert(missingLane.missingRenderFrames === 0, "state updates must not count as rendered missing-target frames");
    controller.renderFrame();
    assert(
      (missingLane.missingRenderFrames as number) === 1 && (callbacks.length as number) === 0 && !missingLane.settled,
      "one missing rendered frame should retain the actor for a transient target gap"
    );
    controller.renderFrame();
    assert(missingLane.settled && callbacks.length === 0, "the second missing rendered frame should schedule an explicit abort");
    motionRuntime.step(1 / 60);
    assert(
      (callbacks.length as number) === 1 &&
        requireFirst(callbacks, "missing target should publish an abort").callback === "abort" &&
        requireFirst(callbacks, "missing target should publish a reason").reason === "target-unavailable",
      "two consecutive missing rendered frames should abort with target-unavailable"
    );

    controller.clear("created-folder-test-reset");
    callbacks.length = 0;
    const createdNode = makeActorNode(true);
    createdNode.position.set(40, 50);
    createdNode.scale.set(1);
    createdNode.alpha = 1;
    createdNode.labelText.alpha = 1;
    const createdSecondNode = makeActorNode(true);
    createdSecondNode.position.set(70, 55);
    createdSecondNode.scale.set(1);
    createdSecondNode.alpha = 1;
    createdSecondNode.labelText.alpha = 1;
    const createdOverflowNode = makeActorNode();
    createdOverflowNode.position.set(100, 60);
    createdOverflowNode.scale.set(1);
    createdOverflowNode.alpha = 1;
    let createdTargetOffset = 0;
    const createdFolderNode: GroupReleaseFolderNode = Object.assign(new Container(), {
      getFolderPreviewChildReleasePose: (
        _relativeTo: Container | null,
        slotIndex: number | null | undefined,
        options: FolderReleasePreviewPoseOptions = {},
      ) => ({
        center: { x: (slotIndex === 0 ? 180 : 260) + createdTargetOffset, y: 120 },
        matrix: { a: 0.25, b: 0, c: 0, d: 0.25 },
        ...(options.expectedChildId === undefined ? {} : { targetChildId: options.expectedChildId }),
      }),
      getFolderThumbBounds: (_stageRect: StageOrigin | null | undefined) => ({
        height: 64,
        left: 148 + createdTargetOffset,
        top: 88,
        width: 64,
      }),
      iconSize: 64,
      item: { id: "new-folder", type: "folder" },
    });
    const createdPlan: GroupReleasePlan = {
      entries: [
        makeEntry("created", GROUP_TRANSFER_RUNTIME_MODE.CREATED_FOLDER, {
          actorKey: "item:created",
          target: {
            expectedChildId: "created",
            folderId: "new-folder",
            kind: "created-folder",
            slotIndex: 0,
          },
        }),
        makeEntry("created-second", GROUP_TRANSFER_RUNTIME_MODE.CREATED_FOLDER, {
          actorKey: "item:created-second",
          target: {
            expectedChildId: "created-second",
            folderId: "new-folder",
            kind: "created-folder",
            slotIndex: 1,
          },
        }),
        makeEntry("created-overflow", GROUP_TRANSFER_RUNTIME_MODE.POINT_HANDOFF, {
          actorKey: "bundle:created-overflow",
          target: { area: "desktop", id: "created-overflow", kind: "desktop" },
        }),
      ],
      key: "plan-created-folder",
      shellActors: [{
        endAnchor: { folderId: "new-folder", kind: "folder-shell" },
        key: "folderShell:new-folder",
        role: "folder-shell",
        zBand: 100,
      }],
      status: "pending",
    };
    const createdGroup: GroupReleaseGroup = {
      ...group,
      key: "group-created-folder",
      runtimePlan: createdPlan,
    };
    const completedFolderShells: GroupReleaseFolderShellPayload[] = [];
    const createdController = new GroupReleaseController(layer, {
      onFolderShellComplete: (payload) => completedFolderShells.push(payload),
      onEntryAbort: (payload) => callbacks.push({ ...payload, callback: "abort" }),
      onEntryComplete: (payload) => callbacks.push({ ...payload, callback: "complete" }),
      resolveFolderNode: () => createdFolderNode,
      resolvePointTarget: () => ({
        point: { x: 212, y: 120 },
        scale: { x: 0.25, y: 0.25 },
      }),
    });
    try {
      createdController.update(makeState(
        createdGroup,
        createdNode,
        "created",
        new Map([
          ["created", createdNode],
          ["created-second", createdSecondNode],
          ["created-overflow", createdOverflowNode],
        ])
      ));
      const createdLanes = [...createdController.lanes.values()];
      const createdLane = requireFolderLane(
        createdLanes[0],
        "created-folder should create a folder release lane",
      );
      const createdFolderController = createdLane.controller;
      assert(createdFolderController, "created-folder lane should retain its controller");
      assert(
        createdFolderController.active?.release.releaseMode === "created-folder",
        "created-folder releases must retain their dedicated preview-slot controller mode"
      );
      assert(
        createdFolderController.active?.release.targetPreviewSlotIndex === 0,
        "created-folder releases must pass the committed child slot to the folder controller"
      );
      assert(
        createdFolderController.active?.release.size?.width === 64 &&
          createdFolderController.active.release.targetVisualIconSize === 16,
        "slot releases must preserve source geometry while declaring the folder thumbnail raster size separately"
      );
      assert(
        createdFolderController.active?.release.sourceSize === 64,
        "slot releases must retain the full-size source metric for the create frame"
      );
      assert(createdLanes.length === 3, "created-folder release should create one runtime lane per visual actor");
      const createdTargetCenters = createdLanes
        .filter((lane): lane is GroupReleaseFolderLane => lane.kind === "folder" && lane.controller !== null)
        .map((lane) => lane.controller?.getTargetPose(lane.controller.active)?.center.x);
      assert(
        createdTargetCenters.length === 2 && createdTargetCenters[0] !== createdTargetCenters[1],
        "created-folder pair ghosts should resolve to distinct slots on the moving shell"
      );
      assert(
        createdController.folderShellFrame?.visible === true,
        "created-folder release should own a visible folder frame during the pair handoff"
      );
      const folderShellFrame = createdController.folderShellFrame;
      assert(folderShellFrame, "created-folder release should retain its shell frame");
      assert(
        createdNode.labelText.visible === false &&
          createdNode.labelText.alpha === 0 &&
          createdSecondNode.labelText.visible === false &&
          createdSecondNode.labelText.alpha === 0,
        "created-folder release ghosts must hide labels without an alpha reveal/fade"
      );
      const frameStartX = folderShellFrame.position.x;
      motionRuntime.step(1 / 60);
      createdController.renderFrame();
      assert(
        folderShellFrame.position.x > frameStartX,
        "created-folder frame should animate from the target app origin toward the committed folder"
      );
      for (let frame = 0; frame < 24; frame++) {
        const before = {x:folderShellFrame.x,y:folderShellFrame.y,scale:folderShellFrame.scale.x};
        createdTargetOffset += 6;
        createdController.renderFrame();
        assert(folderShellFrame.x === before.x && folderShellFrame.y === before.y && folderShellFrame.scale.x === before.scale,
          "changing a moving creation destination must not overwrite the presented shell pose");
        const slots = createdLanes.filter((lane): lane is GroupReleaseFolderLane => lane.kind === "folder" && lane.controller !== null)
          .map(lane => lane.controller!.getTargetPose(lane.controller!.active)!.center.x);
        assert(Math.abs((slots[1]! - slots[0]!) / folderShellFrame.scale.x - 80) < 0.001,
          "preview slots must retain their local separation on the moving shell");
        assert(completedFolderShells.length === 0, "moving target must not hand off an unaligned shell");
        motionRuntime.step(1 / 60);
      }
      for (let index = 0; index < 180 && completedFolderShells.length === 0; index += 1) {
        motionRuntime.step(1 / 60);
        createdController.renderFrame();
      }
      assert(
        completedFolderShells.length === 1 &&
          requireFirst(completedFolderShells, "folder shell should publish completion").actorKey === "folderShell:new-folder" &&
          requireFirst(completedFolderShells, "folder shell should publish its folder id").folderId === "new-folder",
        "the created-folder shell should complete as its own visual actor instead of waiting for runtime icon actors"
      );
      assert(
        createdNode.labelText.visible === false &&
          createdNode.labelText.alpha === 0 &&
          createdSecondNode.labelText.visible === false &&
          createdSecondNode.labelText.alpha === 0,
        "created-folder release labels must stay hidden throughout the handoff"
      );
      const oneSettledGroup: GroupReleaseGroup = {
        ...createdGroup,
        settledActorKeys: ["folderShell:new-folder", "item:created"],
      };
      createdController.update(makeState(
        oneSettledGroup,
        createdSecondNode,
        "created-second",
        new Map([
          ["created-second", createdSecondNode],
          ["created-overflow", createdOverflowNode],
        ])
      ));
      assert(
        createdController.lanes.size === 2 &&
          !createdController.lanes.has("plan-created-folder:created") &&
          (createdController.folderShellFrame?.visible as boolean | undefined) === false,
        "a completed shell actor should stay hidden while preview actors continue handing off independently"
      );
      const previewActorsSettledGroup: GroupReleaseGroup = {
        ...createdGroup,
        settledActorKeys: ["folderShell:new-folder", "item:created", "item:created-second"],
      };
      createdController.update(makeState(
        previewActorsSettledGroup,
        createdOverflowNode,
        "created-overflow"
      ));
      assert(
        (createdController.lanes.size as number) === 1 &&
          (createdController.folderShellFrame?.visible as boolean | undefined) === false,
        "settling later runtime actors must not recreate an already handed-off folder shell"
      );
    } finally {
      createdController.destroy();
    }
  } finally {
    controller.destroy();
    layer.destroy({ children: true });
    motionRuntime.reset();
  }

  for (const fps of [30, 60, 144]) {
    motionRuntime.reset();
    const frameLayer = new Container();
    const frameNode = makeActorNode();
    frameNode.position.set(10, 20);
    frameNode.scale.set(1);
    frameNode.alpha = 1;
    const frameCallbacks: GroupReleaseSettlementPayload[] = [];
    const frameController = new GroupReleaseController(frameLayer, {
      onEntryComplete: (payload) => frameCallbacks.push(payload),
      resolvePointTarget: () => ({
        point: { x: 320, y: 240 },
        scale: { x: 0.75, y: 0.75 },
      }),
    });
    try {
      const frameGroup: GroupReleaseGroup = {
        key: `group-fps-${fps}`,
        phase: "releasing",
        reducedMotion: false,
        runtimePlan: {
          entries: [makeEntry("fps-app")],
          key: `plan-fps-${fps}`,
          status: "pending",
        },
      };
      frameController.update(makeState(frameGroup, frameNode, "fps-app"));
      for (let index = 0; index < fps * 2 && frameCallbacks.length === 0; index += 1) {
        motionRuntime.step(1 / fps);
        frameController.renderFrame();
      }
      assert(
        frameCallbacks.length === 1 &&
          Math.abs(frameNode.position.x - 320) < 0.01 &&
          Math.abs(frameNode.position.y - 240) < 0.01,
        `${fps} FPS should reach the same aligned point handoff without a timing-dependent seam`
      );
    } finally {
      frameController.destroy();
      frameLayer.destroy({ children: true });
    }
  }
  motionRuntime.reset();
}
