import { Container } from "pixi.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { GROUP_RELEASE_MODE } from "../../../domain/groupReleasePlan.js";
import { GroupReleaseController } from "./GroupReleaseController.js";

function makeEntry(id, mode = GROUP_RELEASE_MODE.POINT_HANDOFF, overrides = {}) {
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

function stepUntil(callbacks, predicate, maxFrames = 240) {
  for (let index = 0; index < maxFrames && !predicate(); index += 1) {
    motionRuntime.step(1 / 60);
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
    phase: "accepted",
    reducedMotion: false,
    releasePlan: plan,
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
    stepUntil(callbacks, () => callbacks.length > 0);
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
      entries: [makeEntry("app", GROUP_RELEASE_MODE.RETURN_TO_ORIGIN, {
        fallback: { x: 100, y: 90 },
        originAlpha: 0.82,
        originScale: 1.08,
      })],
      key: "plan-reject",
      status: "pending",
    };
    const rejectGroup = { ...group, phase: "rejected", releasePlan: rejectPlan };
    controller.update(makeState(rejectGroup, node));
    stepUntil(callbacks, () => callbacks.length > 0);
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
      phase: "cancelling",
      releasePlan: cancelPlan,
    };
    controller.update(makeState(cancelGroup, node));
    assert(controller.lanes.size === 1, "the cancelling phase should create the same origin-return release lane");
    stepUntil(callbacks, () => callbacks.length > 0);
    assert(
      callbacks.length === 1 && callbacks[0].outcome === "settled",
      "a user-cancelled release should settle through the normal completion channel"
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
        makeEntry("created", GROUP_RELEASE_MODE.CREATED_FOLDER, {
          target: {
            expectedChildId: "created",
            folderId: "new-folder",
            kind: "created-folder",
            slotIndex: 0,
          },
        }),
        makeEntry("created-second", GROUP_RELEASE_MODE.CREATED_FOLDER, {
          target: {
            expectedChildId: "created-second",
            folderId: "new-folder",
            kind: "created-folder",
            slotIndex: 1,
          },
        }),
      ],
      key: "plan-created-folder",
      status: "pending",
    };
    const createdGroup = { ...group, key: "group-created-folder", releasePlan: createdPlan };
    const createdController = new GroupReleaseController(layer, {
      onEntryAbort: (payload) => callbacks.push({ ...payload, callback: "abort" }),
      onEntryComplete: (payload) => callbacks.push({ ...payload, callback: "complete" }),
      resolveFolderNode: () => createdFolderNode,
    });
    try {
      createdController.update(makeState(
        createdGroup,
        createdNode,
        "created",
        new Map([
          ["created", createdNode],
          ["created-second", createdSecondNode],
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
      assert(createdLanes.length === 2, "created-folder pair release should create one folder lane per ghost");
      const createdTargetCenters = createdLanes.map((lane) => lane.controller.getTargetPose(lane.controller.active)?.center?.x);
      assert(
        createdTargetCenters.includes(180) && createdTargetCenters.includes(260),
        "created-folder pair ghosts should resolve to their distinct committed preview slots"
      );
      assert(
        createdController.createdFolderFrame?.visible === true,
        "created-folder release should own a visible folder frame during the pair handoff"
      );
      assert(
        createdNode.labelText.visible === false &&
          createdNode.labelText.alpha === 0 &&
          createdSecondNode.labelText.visible === false &&
          createdSecondNode.labelText.alpha === 0,
        "created-folder release ghosts must hide labels without an alpha reveal/fade"
      );
      const frameStartX = createdController.createdFolderFrame.position.x;
      motionRuntime.step(1 / 60);
      createdController.renderFrame();
      assert(
        createdController.createdFolderFrame.position.x > frameStartX,
        "created-folder frame should animate from the target app origin toward the committed folder"
      );
      for (let index = 0; index < 8; index += 1) motionRuntime.step(1 / 60);
      assert(
        createdNode.labelText.visible === false &&
          createdNode.labelText.alpha === 0 &&
          createdSecondNode.labelText.visible === false &&
          createdSecondNode.labelText.alpha === 0,
        "created-folder release labels must stay hidden throughout the handoff"
      );
    } finally {
      createdController.destroy();
    }
  } finally {
    controller.destroy();
    layer.destroy({ children: true });
    motionRuntime.reset();
  }
}
