import { Container } from "pixi.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { FolderReleaseController } from "./folderReleaseController.js";

const CENTER_ABSORB_TEST_DURATION = 0.24;

function nearlyEqual(a, b, epsilon = 0.001) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= epsilon;
}

function readCenter(relativeTo, node) {
  const point = relativeTo.toLocal({ x: 0, y: 0 }, node);
  return { x: point.x, y: point.y };
}

function readPose(relativeTo, node) {
  const center = readCenter(relativeTo, node);
  const xUnit = relativeTo.toLocal({ x: 1, y: 0 }, node);
  const yUnit = relativeTo.toLocal({ x: 0, y: 1 }, node);
  return {
    center,
    matrix: {
      a: xUnit.x - center.x,
      b: xUnit.y - center.y,
      c: yUnit.x - center.x,
      d: yUnit.y - center.y,
    },
  };
}

function makeTargetFolderNode(pose) {
  const node = new Container();
  node.item = { id: "folder-moving", type: "folder" };
  node.getFolderPreviewChildReleasePose = (_relativeTo, slotIndex, options = {}) => {
    if (slotIndex !== 8 || options.expectedChildId !== "app-dragged") return null;
    return {
      center: { ...pose.center },
      matrix: { ...pose.matrix },
      targetChildId: "app-dragged",
    };
  };
  return node;
}

function makeCenterTargetFolderNode(pose) {
  const node = new Container();
  node.iconSize = 64;
  node.item = { id: "folder-moving", type: "folder" };
  node.getFolderCenterReleasePose = () => ({
    center: { ...pose.center },
  });
  return node;
}

export function runFolderReleaseControllerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder release controller test failed] ${message}`);
  };

  {
    motionRuntime.reset();
    const layer = new Container();
    const previewNode = new Container();
    previewNode.visualWrap = new Container();
    previewNode.visualWrap.position.set(0, -14);
    previewNode.labelText = new Container();
    previewNode.addChild(previewNode.visualWrap, previewNode.labelText);
    previewNode.position.set(160, 520);
    previewNode.scale.set(1.12);
    layer.addChild(previewNode);

    const targetPose = {
      center: { x: 420, y: 520 },
      matrix: { a: 0.28, b: 0, c: 0, d: 0.28 },
    };
    const targetFolderNode = makeTargetFolderNode(targetPose);
    const completions = [];
    const samples = [];
    const controller = new FolderReleaseController(layer, {
      onReleaseComplete: (release) => {
        completions.push(release.key);
        samples.push({
          ghost: readCenter(layer, previewNode.visualWrap),
          target: { ...targetPose.center },
        });
      },
    });
    const release = {
      item: { id: "app-dragged", name: "Dragged App", type: "app" },
      key: "release-moving-folder",
      releaseMode: "folder-preview-slot",
      size: { height: 64, width: 64 },
      suppressFolderPreviewChildId: "app-dragged",
      suppressFolderPreviewFolderId: "folder-moving",
      targetFolderId: "folder-moving",
      targetPreviewSlotIndex: 8,
      velocity: { x: 0, y: 0 },
    };

    try {
      controller.update({
        deviceResolution: 2,
        height: 800,
        previewNode,
        release,
        stageRect: { height: 800, left: 0, top: 0, width: 1400 },
        targetFolderNode,
        width: 1400,
      });

      const ghostBeforeMove = readCenter(layer, previewNode.visualWrap);
      const crossRowShift = { x: 1161.6, y: -218.4 };
      targetPose.center.x += crossRowShift.x;
      targetPose.center.y += crossRowShift.y;
      layer.onRender?.();

      const ghostAfterMove = readCenter(layer, previewNode.visualWrap);
      assert(
        nearlyEqual(ghostAfterMove.x, ghostBeforeMove.x) &&
          nearlyEqual(ghostAfterMove.y, ghostBeforeMove.y),
        "a target reflow at zero approach progress must not teleport the release ghost with the folder"
      );

      for (let frame = 0; frame < 6; frame += 1) {
        motionRuntime.step(1 / 60);
        layer.onRender?.();
      }
      const ghostBeforeProgressedMove = readCenter(layer, previewNode.visualWrap);
      const followProgress = controller.poseProgress.value;
      const progressedShift = { x: 120, y: -36 };
      targetPose.center.x += progressedShift.x;
      targetPose.center.y += progressedShift.y;
      layer.onRender?.();
      const ghostAfterProgressedMove = readCenter(layer, previewNode.visualWrap);
      assert(
        nearlyEqual(
          ghostAfterProgressedMove.x - ghostBeforeProgressedMove.x,
          progressedShift.x * followProgress,
          0.01
        ) &&
          nearlyEqual(
            ghostAfterProgressedMove.y - ghostBeforeProgressedMove.y,
            progressedShift.y * followProgress,
            0.01
          ),
        "a moving folder should influence the release ghost only in proportion to its current approach progress"
      );

      let previousSample = null;
      let completionVelocitySample = null;
      for (let frame = 0; frame < 240 && completions.length === 0; frame += 1) {
        targetPose.center.x += 3.25;
        targetPose.center.y -= 0.75;
        const angle = Math.sin(frame / 5) * 0.032;
        const cos = Math.cos(angle) * 0.28;
        const sin = Math.sin(angle) * 0.28;
        targetPose.matrix = { a: cos, b: sin, c: -sin, d: cos };
        motionRuntime.step(1 / 60);
        layer.onRender?.();
        const currentSample = {
          ghost: readCenter(layer, previewNode.visualWrap),
          target: { ...targetPose.center },
        };
        if (completions.length && previousSample) {
          completionVelocitySample = {
            ghost: {
              x: currentSample.ghost.x - previousSample.ghost.x,
              y: currentSample.ghost.y - previousSample.ghost.y,
            },
            target: {
              x: currentSample.target.x - previousSample.target.x,
              y: currentSample.target.y - previousSample.target.y,
            },
          };
        }
        previousSample = currentSample;
      }

      assert(completions.join(",") === "release-moving-folder", "a moving target release should complete exactly once");
      assert(
        nearlyEqual(samples[0].ghost.x, samples[0].target.x, 0.25) &&
          nearlyEqual(samples[0].ghost.y, samples[0].target.y, 0.25),
        "the ghost and the real preview child should be center-aligned before visual ownership transfers"
      );
      assert(
        completionVelocitySample &&
          nearlyEqual(completionVelocitySample.ghost.x, completionVelocitySample.target.x, 0.025) &&
          nearlyEqual(completionVelocitySample.ghost.y, completionVelocitySample.target.y, 0.025),
        "the ghost should inherit target velocity at the ownership handoff frame"
      );
      const terminalPose = readPose(layer, previewNode.visualWrap);
      assert(
        nearlyEqual(terminalPose.matrix.a, targetPose.matrix.a, 0.0001) &&
          nearlyEqual(terminalPose.matrix.b, targetPose.matrix.b, 0.0001) &&
          nearlyEqual(terminalPose.matrix.c, targetPose.matrix.c, 0.0001) &&
          nearlyEqual(terminalPose.matrix.d, targetPose.matrix.d, 0.0001),
        "the ghost should match the target child's live scale, rotation, and skew basis before ownership transfers"
      );

      motionRuntime.step(1);
      layer.onRender?.();
      assert(completions.length === 1, "release completion must remain idempotent after later frames");
    } finally {
      controller.destroy();
      if (!layer.destroyed) layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new Container();
    const previewNode = new Container();
    previewNode.visualWrap = new Container();
    previewNode.labelText = new Container();
    previewNode.addChild(previewNode.visualWrap, previewNode.labelText);
    previewNode.position.set(160, 520);
    layer.addChild(previewNode);
    const targetFolderNode = makeTargetFolderNode({
      center: { x: 420, y: 520 },
      matrix: { a: 0.28, b: 0, c: 0, d: 0.28 },
    });
    const aborts = [];
    const controller = new FolderReleaseController(layer, {
      onReleaseAbort: (_release, reason) => aborts.push(reason),
    });
    const release = {
      item: { id: "app-dragged", type: "app" },
      key: "release-parent-ownership-lost",
      releaseMode: "folder-preview-slot",
      size: { height: 64, width: 64 },
      targetFolderId: "folder-moving",
      targetPreviewSlotIndex: 8,
      velocity: { x: 0, y: 0 },
    };

    try {
      controller.update({
        height: 800,
        previewNode,
        release,
        stageRect: { height: 800, left: 0, top: 0, width: 1400 },
        targetFolderNode,
        width: 1400,
      });
      layer.reparentChild(previewNode);
      controller.renderFrame();
      assert(
        aborts.join(",") === "actor-parent-ownership-lost",
        "a folder release must abort explicitly when another scene owner reparents its actor"
      );
    } finally {
      controller.destroy();
      if (!layer.destroyed) layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new Container();
    const previewNode = new Container();
    previewNode.visualWrap = new Container();
    previewNode.labelText = new Container();
    previewNode.addChild(previewNode.visualWrap, previewNode.labelText);
    previewNode.position.set(120, 180);
    layer.addChild(previewNode);
    const targetFolderNode = new Container();
    targetFolderNode.item = { id: "folder-created", type: "folder" };
    targetFolderNode.getFolderPreviewChildReleasePose = () => null;
    targetFolderNode.getFolderPreviewChildBounds = (_stageRect, slotIndex) => ({
      left: slotIndex === 1 ? 300 : 280,
      top: 240,
      width: 16,
      height: 16,
    });
    const completions = [];
    const aborts = [];
    const controller = new FolderReleaseController(layer, {
      onReleaseAbort: (_release, reason) => aborts.push(reason),
      onReleaseComplete: (release) => completions.push(release.key),
    });
    const release = {
      item: { id: "app-dragged", type: "app" },
      key: "release-created-folder-fallback-slot",
      releaseMode: "created-folder",
      size: { height: 64, width: 64 },
      targetFolderId: "folder-created",
      targetPreviewSlotIndex: 1,
      velocity: { x: 0, y: 0 },
    };
    try {
      controller.update({
        deviceResolution: 1,
        height: 600,
        previewNode,
        release,
        stageRect: { height: 600, left: 0, top: 0, width: 900 },
        targetFolderNode,
        width: 900,
      });
      for (let frame = 0; frame < 120 && !completions.length && !aborts.length; frame += 1) {
        motionRuntime.step(1 / 60);
        layer.onRender?.();
      }
      const terminal = readPose(layer, previewNode.visualWrap);
      assert(aborts.length === 0 && completions.length === 1, "created-folder release should use deterministic slot geometry while the child is hidden");
      assert(
        nearlyEqual(terminal.center.x, 308, 0.25) && nearlyEqual(terminal.center.y, 248, 0.25),
        "created-folder fallback should land the ghost in the committed preview slot"
      );
    } finally {
      controller.destroy();
      if (!layer.destroyed) layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new Container();
    const previewNode = new Container();
    previewNode.labelText = new Container();
    previewNode.addChild(previewNode.labelText);
    previewNode.position.set(120, 160);
    layer.addChild(previewNode);
    const aborts = [];
    const controller = new FolderReleaseController(layer, {
      onReleaseAbort: (release, reason) => aborts.push(`${release.key}:${reason}`),
    });
    const release = {
      item: { id: "app-dragged", type: "app" },
      key: "release-missing-center-target",
      releaseMode: "folder-center-absorb",
      size: { height: 64, width: 64 },
      targetFolderId: "folder-moving",
    };
    const targetFolderNode = makeCenterTargetFolderNode({
      center: { x: Number.NaN, y: Number.NaN },
    });

    try {
      controller.update({
        height: 600,
        previewNode,
        release,
        stageRect: { height: 600, left: 0, top: 0, width: 800 },
        targetFolderNode,
        width: 800,
      });
      layer.onRender?.();
      assert(aborts.length === 0, "a center target may be absent during the first two rendered reconciliation frames");
      layer.onRender?.();
      assert(
        aborts.join(",") === "release-missing-center-target:target-unavailable",
        "a center target that never materializes should abort explicitly after two rendered frames"
      );
    } finally {
      controller.destroy();
      if (!layer.destroyed) layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new Container();
    const previewNode = new Container();
    previewNode.visualWrap = new Container();
    previewNode.visualWrap.position.set(0, -14);
    previewNode.labelText = new Container();
    previewNode.addChild(previewNode.visualWrap, previewNode.labelText);
    previewNode.position.set(160, 520);
    previewNode.scale.set(1.12);
    layer.addChild(previewNode);

    const targetPose = { center: { x: 420, y: 520 } };
    const targetFolderNode = makeCenterTargetFolderNode(targetPose);
    const controller = new FolderReleaseController(layer);
    const release = {
      item: { id: "app-dragged", name: "Dragged App", type: "app" },
      key: "release-moving-folder-center",
      releaseMode: "folder-center-absorb",
      size: { height: 64, width: 64 },
      targetFolderId: "folder-moving",
      velocity: { x: 0, y: 0 },
    };

    try {
      const initialGhostCenter = readCenter(layer, previewNode.visualWrap);
      controller.update({
        deviceResolution: 2,
        height: 800,
        previewNode,
        release,
        stageRect: { height: 800, left: 0, top: 0, width: 1400 },
        targetFolderNode,
        width: 1400,
      });
      const reboundGhostCenter = readCenter(layer, previewNode.visualWrap);
      assert(
        nearlyEqual(reboundGhostCenter.x, initialGhostCenter.x) &&
          nearlyEqual(reboundGhostCenter.y, initialGhostCenter.y),
        "starting a center absorb should preserve the currently rendered ghost center"
      );

      const crossRowShift = { x: 1161.6, y: -218.4 };
      targetPose.center.x += crossRowShift.x;
      targetPose.center.y += crossRowShift.y;
      layer.onRender?.();

      const ghostAfterMove = readCenter(layer, previewNode.visualWrap);
      assert(
        nearlyEqual(ghostAfterMove.x, reboundGhostCenter.x) &&
          nearlyEqual(ghostAfterMove.y, reboundGhostCenter.y),
        "a center target reflow at zero approach progress must not teleport the absorbing ghost"
      );

      for (let frame = 0; frame < 5; frame += 1) {
        motionRuntime.step(1 / 60);
        layer.onRender?.();
      }
      const ghostBeforeProgressedMove = readCenter(layer, previewNode.visualWrap);
      const followProgress = controller.poseProgress.value;
      const progressedShift = { x: 96, y: -24 };
      targetPose.center.x += progressedShift.x;
      targetPose.center.y += progressedShift.y;
      layer.onRender?.();
      const ghostAfterProgressedMove = readCenter(layer, previewNode.visualWrap);
      assert(
        nearlyEqual(
          ghostAfterProgressedMove.x - ghostBeforeProgressedMove.x,
          progressedShift.x * followProgress,
          0.01
        ) &&
          nearlyEqual(
            ghostAfterProgressedMove.y - ghostBeforeProgressedMove.y,
            progressedShift.y * followProgress,
            0.01
          ),
        "a moving center target should influence the absorbing ghost only in proportion to approach progress"
      );
    } finally {
      controller.destroy();
      if (!layer.destroyed) layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new Container();
    const previewNode = new Container();
    previewNode.labelText = new Container();
    previewNode.addChild(previewNode.labelText);
    previewNode.position.set(120, 160);
    layer.addChild(previewNode);
    const aborts = [];
    const controller = new FolderReleaseController(layer, {
      onReleaseAbort: (release, reason) => aborts.push(`${release.key}:${reason}`),
    });
    const release = {
      item: { id: "app-dragged", type: "app" },
      key: "release-missing-target",
      releaseMode: "folder-preview-slot",
      size: { height: 64, width: 64 },
      targetFolderId: "folder-moving",
      targetPreviewSlotIndex: 8,
    };
    const targetFolderNode = makeTargetFolderNode({
      center: { x: Number.NaN, y: Number.NaN },
      matrix: { a: 0.28, b: 0, c: 0, d: 0.28 },
    });

    try {
      controller.update({
        height: 600,
        previewNode,
        release,
        stageRect: { height: 600, left: 0, top: 0, width: 800 },
        targetFolderNode,
        width: 800,
      });
      layer.onRender?.();
      assert(aborts.length === 0, "a target may be absent during the first two rendered reconciliation frames");
      layer.onRender?.();
      assert(
        aborts.join(",") === "release-missing-target:target-unavailable",
        "a target that never materializes should abort explicitly after two rendered frames"
      );
    } finally {
      controller.destroy();
      if (!layer.destroyed) layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new Container();
    const previewNode = new Container();
    previewNode.labelText = new Container();
    previewNode.addChild(previewNode.labelText);
    previewNode.position.set(180, 420);
    previewNode.scale.set(1.12);
    layer.addChild(previewNode);
    const release = {
      item: { id: "app-dragged", type: "app" },
      key: "release-rebuilt-target",
      releaseMode: "folder-preview-slot",
      size: { height: 64, width: 64 },
      targetFolderId: "folder-moving",
      targetPreviewSlotIndex: 8,
      velocity: { x: 0, y: 0 },
    };
    const firstPose = {
      center: { x: 520, y: 420 },
      matrix: { a: 0.28, b: 0, c: 0, d: 0.28 },
    };
    const rebuiltPose = {
      center: { x: 860, y: 260 },
      matrix: { a: 0.3, b: 0.01, c: -0.01, d: 0.3 },
    };
    const firstTargetNode = makeTargetFolderNode(firstPose);
    const rebuiltTargetNode = makeTargetFolderNode(rebuiltPose);
    const completions = [];
    const controller = new FolderReleaseController(layer, {
      onReleaseComplete: (completedRelease) => completions.push(completedRelease.key),
    });
    const makeUpdate = (targetFolderNode) => ({
      deviceResolution: 1.5,
      height: 600,
      previewNode,
      release,
      stageRect: { height: 600, left: 0, top: 0, width: 1000 },
      targetFolderNode,
      width: 1000,
    });

    try {
      controller.update(makeUpdate(firstTargetNode));
      for (let frame = 0; frame < 12; frame += 1) {
        motionRuntime.step(1 / 60);
        layer.onRender?.();
      }
      const beforeRebind = readCenter(layer, previewNode);
      controller.update(makeUpdate(rebuiltTargetNode));
      const afterRebind = readCenter(layer, previewNode);
      assert(
        nearlyEqual(afterRebind.x, beforeRebind.x) && nearlyEqual(afterRebind.y, beforeRebind.y),
        "rebinding a rebuilt target node should continue from the currently rendered ghost pose without a jump"
      );

      for (let frame = 0; frame < 240 && completions.length === 0; frame += 1) {
        rebuiltPose.center.x += 0.75;
        rebuiltPose.center.y -= 0.2;
        motionRuntime.step(1 / 60);
        layer.onRender?.();
      }
      assert(completions.join(",") === "release-rebuilt-target", "a rebound release should still complete against the rebuilt target node");
      const terminalCenter = readCenter(layer, previewNode);
      assert(
        nearlyEqual(terminalCenter.x, rebuiltPose.center.x, 0.25) &&
          nearlyEqual(terminalCenter.y, rebuiltPose.center.y, 0.25),
        "a rebound release should transfer ownership at the rebuilt target's live position"
      );
    } finally {
      controller.destroy();
      if (!layer.destroyed) layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new Container();
    const previewNode = new Container();
    previewNode.visualWrap = new Container();
    previewNode.visualWrap.position.set(0, -14);
    previewNode.labelText = new Container();
    previewNode.addChild(previewNode.visualWrap, previewNode.labelText);
    previewNode.position.set(180, 420);
    previewNode.scale.set(1.12);
    layer.addChild(previewNode);
    const release = {
      item: { id: "app-dragged", type: "app" },
      key: "release-rebuilt-center-target",
      releaseMode: "folder-center-absorb",
      size: { height: 64, width: 64 },
      targetFolderId: "folder-moving",
      velocity: { x: 0, y: 0 },
    };
    const firstPose = { center: { x: 520, y: 420 } };
    const rebuiltPose = { center: { x: 860, y: 260 } };
    const firstTargetNode = makeCenterTargetFolderNode(firstPose);
    const rebuiltTargetNode = makeCenterTargetFolderNode(rebuiltPose);
    const completions = [];
    const controller = new FolderReleaseController(layer, {
      onReleaseComplete: (completedRelease) => completions.push(completedRelease.key),
    });
    const makeUpdate = (targetFolderNode) => ({
      deviceResolution: 1.5,
      height: 600,
      previewNode,
      release,
      stageRect: { height: 600, left: 0, top: 0, width: 1000 },
      targetFolderNode,
      width: 1000,
    });

    try {
      controller.update(makeUpdate(firstTargetNode));
      for (let frame = 0; frame < 10; frame += 1) {
        motionRuntime.step(1 / 60);
        layer.onRender?.();
      }
      const beforeRebind = readCenter(layer, previewNode.visualWrap);
      const alphaBeforeRebind = previewNode.alpha;
      controller.update(makeUpdate(rebuiltTargetNode));
      const afterRebind = readCenter(layer, previewNode.visualWrap);
      assert(
        nearlyEqual(afterRebind.x, beforeRebind.x) && nearlyEqual(afterRebind.y, beforeRebind.y),
        "rebinding a center-absorb target should preserve the currently rendered ghost center"
      );
      assert(
        previewNode.alpha <= alphaBeforeRebind + 0.0001,
        "rebinding a center-absorb target must not resurrect an already fading ghost"
      );

      let remainingFrames = 0;
      for (; remainingFrames < 30 && completions.length === 0; remainingFrames += 1) {
        rebuiltPose.center.x += 0.75;
        rebuiltPose.center.y -= 0.2;
        motionRuntime.step(1 / 60);
        layer.onRender?.();
      }
      assert(completions.join(",") === "release-rebuilt-center-target", "a rebound center absorb should still complete");
      assert(
        remainingFrames <= 9,
        "rebinding a center absorb should keep the original remaining duration instead of restarting the full tween"
      );
      const terminalCenter = readCenter(layer, previewNode.visualWrap);
      assert(
        nearlyEqual(terminalCenter.x, rebuiltPose.center.x, 0.25) &&
          nearlyEqual(terminalCenter.y, rebuiltPose.center.y, 0.25),
        "a rebound center absorb should finish at the rebuilt target's live center"
      );
    } finally {
      controller.destroy();
      if (!layer.destroyed) layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  for (const framesPerSecond of [30, 60, 120]) {
    for (const deviceResolution of [1, 1.25, 1.5, 2]) {
      motionRuntime.reset();
      const layer = new Container();
      const previewNode = new Container();
      previewNode.labelText = new Container();
      previewNode.addChild(previewNode.labelText);
      previewNode.position.set(140, 360);
      previewNode.scale.set(1.12);
      layer.addChild(previewNode);
      const targetPose = {
        center: { x: 620, y: 280 },
        matrix: { a: 0.27, b: 0.02, c: -0.015, d: 0.29 },
      };
      const targetFolderNode = makeTargetFolderNode(targetPose);
      const completions = [];
      const controller = new FolderReleaseController(layer, {
        onReleaseComplete: (release) => completions.push(release.key),
      });
      const release = {
        item: { id: "app-dragged", type: "app" },
        key: `release-${framesPerSecond}fps-${deviceResolution}x`,
        releaseMode: "folder-preview-slot",
        size: { height: 64, width: 64 },
        targetFolderId: "folder-moving",
        targetPreviewSlotIndex: 8,
        velocity: { x: 0, y: 0 },
      };

      try {
        controller.update({
          deviceResolution,
          height: 600,
          previewNode,
          release,
          stageRect: { height: 600, left: 0, top: 0, width: 900 },
          targetFolderNode,
          width: 900,
        });
        const maxFrames = framesPerSecond * 3;
        for (let frame = 0; frame < maxFrames && completions.length === 0; frame += 1) {
          motionRuntime.step(1 / framesPerSecond);
          layer.onRender?.();
        }
        const terminal = readPose(layer, previewNode);
        const centerErrorInDevicePixels = Math.max(
          Math.abs(terminal.center.x - targetPose.center.x),
          Math.abs(terminal.center.y - targetPose.center.y)
        ) * deviceResolution;
        assert(
          completions.length === 1 && centerErrorInDevicePixels <= 0.5,
          `release should hand off within half a device pixel at ${framesPerSecond}fps and ${deviceResolution}x resolution`
        );
      } finally {
        controller.destroy();
        if (!layer.destroyed) layer.destroy({ children: true });
        motionRuntime.reset();
      }
    }
  }

  for (const framesPerSecond of [30, 60, 120]) {
    for (const deviceResolution of [1, 1.25, 1.5, 2]) {
      motionRuntime.reset();
      const layer = new Container();
      const previewNode = new Container();
      previewNode.visualWrap = new Container();
      previewNode.visualWrap.position.set(0, -14);
      previewNode.labelText = new Container();
      previewNode.addChild(previewNode.visualWrap, previewNode.labelText);
      previewNode.position.set(140, 360);
      previewNode.scale.set(1.12);
      layer.addChild(previewNode);
      const targetPose = { center: { x: 620, y: 280 } };
      const targetFolderNode = makeCenterTargetFolderNode(targetPose);
      const completions = [];
      const controller = new FolderReleaseController(layer, {
        onReleaseComplete: (release) => completions.push(release.key),
      });
      const release = {
        item: { id: "app-dragged", type: "app" },
        key: `center-release-${framesPerSecond}fps-${deviceResolution}x`,
        releaseMode: "folder-center-absorb",
        size: { height: 64, width: 64 },
        targetFolderId: "folder-moving",
        velocity: { x: 0, y: 0 },
      };

      try {
        controller.update({
          deviceResolution,
          height: 600,
          previewNode,
          release,
          stageRect: { height: 600, left: 0, top: 0, width: 900 },
          targetFolderNode,
          width: 900,
        });
        const maxFrames = framesPerSecond * 2;
        let frame = 0;
        for (; frame < maxFrames && completions.length === 0; frame += 1) {
          targetPose.center.x += 90 / framesPerSecond;
          targetPose.center.y -= 24 / framesPerSecond;
          motionRuntime.step(1 / framesPerSecond);
          layer.onRender?.();
        }
        const terminal = readPose(layer, previewNode.visualWrap);
        const centerErrorInDevicePixels = Math.max(
          Math.abs(terminal.center.x - targetPose.center.x),
          Math.abs(terminal.center.y - targetPose.center.y)
        ) * deviceResolution;
        assert(
          completions.length === 1 && centerErrorInDevicePixels <= 0.5,
          `center absorb should finish within half a device pixel at ${framesPerSecond}fps and ${deviceResolution}x resolution`
        );
        assert(
          frame <= Math.ceil(CENTER_ABSORB_TEST_DURATION * framesPerSecond) + 3,
          `center absorb should keep its finite duration at ${framesPerSecond}fps`
        );
        assert(previewNode.alpha <= 0.001, "center absorb should be fully transparent before completion");
        assert(
          nearlyEqual(terminal.matrix.a, 0.1, 0.0001) &&
            nearlyEqual(terminal.matrix.b, 0, 0.0001) &&
            nearlyEqual(terminal.matrix.c, 0, 0.0001) &&
            nearlyEqual(terminal.matrix.d, 0.1, 0.0001),
          "center absorb should finish at the configured tiny visual scale"
        );
      } finally {
        controller.destroy();
        if (!layer.destroyed) layer.destroy({ children: true });
        motionRuntime.reset();
      }
    }
  }
}
