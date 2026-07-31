import { Container } from "pixi.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { FolderPreviewSlotReleaseController } from "./folderPreviewSlotReleaseController.js";

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

export function runFolderPreviewSlotReleaseControllerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder preview slot release controller test failed] ${message}`);
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
    const controller = new FolderPreviewSlotReleaseController(layer, {
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
      const relativeBeforeMove = {
        x: ghostBeforeMove.x - targetPose.center.x,
        y: ghostBeforeMove.y - targetPose.center.y,
      };
      const crossRowShift = { x: 1161.6, y: -218.4 };
      targetPose.center.x += crossRowShift.x;
      targetPose.center.y += crossRowShift.y;
      layer.onRender?.();

      const ghostAfterMove = readCenter(layer, previewNode.visualWrap);
      assert(
        nearlyEqual(ghostAfterMove.x - ghostBeforeMove.x, crossRowShift.x) &&
          nearlyEqual(ghostAfterMove.y - ghostBeforeMove.y, crossRowShift.y),
        "the release ghost should inherit the target folder's full cross-row movement in the same render frame"
      );
      assert(
        nearlyEqual(ghostAfterMove.x - targetPose.center.x, relativeBeforeMove.x) &&
          nearlyEqual(ghostAfterMove.y - targetPose.center.y, relativeBeforeMove.y),
        "moving the target folder must not restart or distort the ghost's relative approach trajectory"
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
    previewNode.labelText = new Container();
    previewNode.addChild(previewNode.labelText);
    previewNode.position.set(120, 160);
    layer.addChild(previewNode);
    const aborts = [];
    const controller = new FolderPreviewSlotReleaseController(layer, {
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
    const controller = new FolderPreviewSlotReleaseController(layer, {
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
      const controller = new FolderPreviewSlotReleaseController(layer, {
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
}
