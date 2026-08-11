import { Container } from "pixi.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { GROUP_TRANSFER_RUNTIME_MODE } from "./groupTransferRuntimeAdapter.js";
import { GroupReleaseController } from "./GroupReleaseController.js";

function makeEntry(id, mode = GROUP_TRANSFER_RUNTIME_MODE.POINT_HANDOFF, overrides = {}) {
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

function makeState(group, node, nodeId = "app", nodes = null) {
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

function stepUntil(callbacks, predicate, onFrame = () => {}, maxFrames = 240) {
  for (let index = 0; index < maxFrames && !predicate(); index += 1) {
    motionRuntime.step(1 / 60);
    onFrame();
  }
  return callbacks.length;
}

export function runGroupReleaseControllerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Group release controller test failed] ${message}`);
  };

  motionRuntime.reset();
  const layer = new Container();
  const node = new Container();
  node.position.set(20, 30);
  node.scale.set(1);
  node.alpha = 1;
  const callbacks = [];
  let target = {
    point: { x: 300, y: 220 },
    scale: { x: 0.75, y: 0.75 },
  };
  const controller = new GroupReleaseController(layer, {
    onEntryAbort: (payload) => callbacks.push({ ...payload, callback: "abort" }),
    onEntryComplete: (payload) => callbacks.push({ ...payload, callback: "complete" }),
    resolvePointTarget: () => target,
  });
  const plan = {
    entries: [makeEntry("app")],
    key: "plan-point",
    status: "pending",
  };
  const group = {
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
    assert(callbacks[0].callback === "complete", "point handoff should report a settled completion");
    assert(callbacks[0].planKey === "plan-point" && callbacks[0].entryId === "app", "completion should carry the semantic plan identity");
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
    const rejectPlan = {
      entries: [makeEntry("app", GROUP_TRANSFER_RUNTIME_MODE.RETURN, {
        fallback: { x: 100, y: 90 },
        originAlpha: 0.82,
        originScale: 1.08,
      })],
      key: "plan-reject",
      status: "pending",
    };
    const rejectGroup = { ...group, phase: "returning", runtimePlan: rejectPlan };
    controller.update(makeState(rejectGroup, node));
    stepUntil(callbacks, () => callbacks.length > 0, () => controller.renderFrame());
    assert(callbacks.length === 1 && callbacks[0].outcome === "settled", "origin return should settle through the same explicit callback channel");
    assert(
      Math.abs(node.scale.x - 0.834375) < 0.01 && Math.abs(node.alpha - 0.82) < 0.01,
      "origin return should match the live target scale while restoring the source alpha"
    );

    controller.clear("cancel-return-test-reset");
    callbacks.length = 0;
    node.position.set(360, 260);
    const cancelPlan = {
      ...rejectPlan,
      key: "plan-cancel-return",
    };
    const cancelGroup = {
      ...group,
      key: "group-cancel-return",
      phase: "returning",
      runtimePlan: cancelPlan,
    };
    controller.update(makeState(cancelGroup, node));
    assert(controller.lanes.size === 1, "the cancelling phase should create the same origin-return release lane");
    stepUntil(callbacks, () => callbacks.length > 0, () => controller.renderFrame());
    assert(
      callbacks.length === 1 && callbacks[0].outcome === "settled",
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
    const alignmentPlan = {
      entries: [makeEntry("app")],
      key: "plan-render-alignment",
      status: "pending",
    };
    controller.update(makeState({ ...group, runtimePlan: alignmentPlan }, node));
    const alignmentLane = [...controller.lanes.values()][0];
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
      callbacks.length === 1 && callbacks[0].callback === "complete",
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
    const completedTargetPlan = {
      entries: [makeEntry("app", GROUP_TRANSFER_RUNTIME_MODE.RETURN)],
      key: "plan-completed-target-retarget",
      status: "pending",
    };
    const completedTargetGroup = {
      ...group,
      phase: "returning",
      runtimePlan: completedTargetPlan,
    };
    controller.update(makeState(completedTargetGroup, node));
    const completedTargetLane = [...controller.lanes.values()][0];
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
    const missingPlan = {
      entries: [makeEntry("app")],
      key: "plan-missing-target",
      status: "pending",
    };
    controller.update(makeState({ ...group, runtimePlan: missingPlan }, node));
    const missingLane = [...controller.lanes.values()][0];
    assert(missingLane.missingRenderFrames === 0, "state updates must not count as rendered missing-target frames");
    controller.renderFrame();
    assert(
      missingLane.missingRenderFrames === 1 && callbacks.length === 0 && !missingLane.settled,
      "one missing rendered frame should retain the actor for a transient target gap"
    );
    controller.renderFrame();
    assert(missingLane.settled && callbacks.length === 0, "the second missing rendered frame should schedule an explicit abort");
    motionRuntime.step(1 / 60);
    assert(
      callbacks.length === 1 && callbacks[0].callback === "abort" && callbacks[0].reason === "target-unavailable",
      "two consecutive missing rendered frames should abort with target-unavailable"
    );

    controller.clear("created-folder-test-reset");
    callbacks.length = 0;
    const createdNode = new Container();
    createdNode.position.set(40, 50);
    createdNode.scale.set(1);
    createdNode.alpha = 1;
    createdNode.labelText = new Container();
    createdNode.labelText.visible = true;
    createdNode.labelText.alpha = 1;
    createdNode.addChild(createdNode.labelText);
    const createdSecondNode = new Container();
    createdSecondNode.position.set(70, 55);
    createdSecondNode.scale.set(1);
    createdSecondNode.alpha = 1;
    createdSecondNode.labelText = new Container();
    createdSecondNode.labelText.visible = true;
    createdSecondNode.labelText.alpha = 1;
    createdSecondNode.addChild(createdSecondNode.labelText);
    const createdOverflowNode = new Container();
    createdOverflowNode.position.set(100, 60);
    createdOverflowNode.scale.set(1);
    createdOverflowNode.alpha = 1;
    const createdFolderNode = new Container();
    createdFolderNode.item = { id: "new-folder", type: "folder" };
    createdFolderNode.iconSize = 64;
    createdFolderNode.getFolderThumbBounds = () => ({ left: 148, top: 88, width: 64, height: 64 });
    createdFolderNode.getFolderPreviewChildReleasePose = (_relativeTo, slotIndex, options = {}) => ({
      center: { x: slotIndex === 0 ? 180 : 260, y: 120 },
      matrix: { a: 0.25, b: 0, c: 0, d: 0.25 },
      targetChildId: options.expectedChildId,
    });
    const createdPlan = {
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
    const createdGroup = { ...group, key: "group-created-folder", runtimePlan: createdPlan };
    const completedFolderShells = [];
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
      const createdLane = createdLanes[0];
      assert(
        createdLane?.controller?.active?.release?.releaseMode === "created-folder",
        "created-folder releases must retain their dedicated preview-slot controller mode"
      );
      assert(
        createdLane?.controller?.active?.release?.targetPreviewSlotIndex === 0,
        "created-folder releases must pass the committed child slot to the folder controller"
      );
      assert(
        createdLane?.controller?.active?.release?.size?.width === 16,
        "slot releases must use the folder thumbnail child logical size"
      );
      assert(
        createdLane?.controller?.active?.release?.sourceSize === 64,
        "slot releases must retain the full-size source metric for the create frame"
      );
      assert(createdLanes.length === 3, "created-folder release should create one runtime lane per visual actor");
      const createdTargetCenters = createdLanes
        .filter((lane) => lane.kind === "folder")
        .map((lane) => lane.controller.getTargetPose(lane.controller.active)?.center?.x);
      assert(
        createdTargetCenters.includes(180) && createdTargetCenters.includes(260),
        "created-folder pair ghosts should resolve to their distinct committed preview slots"
      );
      assert(
        createdController.folderShellFrame?.visible === true,
        "created-folder release should own a visible folder frame during the pair handoff"
      );
      assert(
        createdNode.labelText.visible === false &&
          createdNode.labelText.alpha === 0 &&
          createdSecondNode.labelText.visible === false &&
          createdSecondNode.labelText.alpha === 0,
        "created-folder release ghosts must hide labels without an alpha reveal/fade"
      );
      const frameStartX = createdController.folderShellFrame.position.x;
      motionRuntime.step(1 / 60);
      createdController.renderFrame();
      assert(
        createdController.folderShellFrame.position.x > frameStartX,
        "created-folder frame should animate from the target app origin toward the committed folder"
      );
      for (let index = 0; index < 30 && completedFolderShells.length === 0; index += 1) {
        motionRuntime.step(1 / 60);
      }
      assert(
        completedFolderShells.length === 1 &&
          completedFolderShells[0].actorKey === "folderShell:new-folder" &&
          completedFolderShells[0].folderId === "new-folder",
        "the created-folder shell should complete as its own visual actor instead of waiting for runtime icon actors"
      );
      assert(
        createdNode.labelText.visible === false &&
          createdNode.labelText.alpha === 0 &&
          createdSecondNode.labelText.visible === false &&
          createdSecondNode.labelText.alpha === 0,
        "created-folder release labels must stay hidden throughout the handoff"
      );
      const oneSettledGroup = {
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
          createdController.folderShellFrame.visible === false,
        "a completed shell actor should stay hidden while preview actors continue handing off independently"
      );
      const previewActorsSettledGroup = {
        ...createdGroup,
        settledActorKeys: ["folderShell:new-folder", "item:created", "item:created-second"],
      };
      createdController.update(makeState(
        previewActorsSettledGroup,
        createdOverflowNode,
        "created-overflow"
      ));
      assert(
        createdController.lanes.size === 1 &&
          createdController.folderShellFrame.visible === false,
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
    const frameNode = new Container();
    frameNode.position.set(10, 20);
    frameNode.scale.set(1);
    frameNode.alpha = 1;
    const frameCallbacks = [];
    const frameController = new GroupReleaseController(frameLayer, {
      onEntryComplete: (payload) => frameCallbacks.push(payload),
      resolvePointTarget: () => ({
        point: { x: 320, y: 240 },
        scale: { x: 0.75, y: 0.75 },
      }),
    });
    try {
      frameController.update(makeState({
        key: `group-fps-${fps}`,
        phase: "releasing",
        reducedMotion: false,
        runtimePlan: {
          entries: [makeEntry("fps-app")],
          key: `plan-fps-${fps}`,
          status: "pending",
        },
      }, frameNode, "fps-app"));
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
