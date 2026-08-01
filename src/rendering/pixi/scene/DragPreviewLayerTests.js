import { motionRuntime } from "../animation/motionRuntime.js";

function runUntil(condition, maxSteps = 600) {
  for (let index = 0; index < maxSteps; index += 1) {
    motionRuntime.step(1 / 60);
    if (condition()) return true;
  }
  return false;
}

function readNodeCenter(relativeTo, node) {
  const point = relativeTo.toLocal({ x: 0, y: 0 }, node);
  return { x: point.x, y: point.y };
}

function installPixiTextTestDom() {
  if (!("CanvasRenderingContext2D" in globalThis)) {
    globalThis.CanvasRenderingContext2D = class CanvasRenderingContext2D {};
  }
  if ("document" in globalThis) return;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      baseURI: "http://localhost/",
      fonts: null,
      createElement(tagName) {
        if (tagName !== "canvas") return {};
        const context = Object.create(globalThis.CanvasRenderingContext2D.prototype);
        Object.assign(context, {
          canvas: null,
          clearRect: () => {},
          fillRect: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(4) }),
          measureText: (text) => ({
            actualBoundingBoxAscent: 10,
            actualBoundingBoxDescent: 3,
            width: String(text || "").length * 8,
          }),
          restore: () => {},
          save: () => {},
          scale: () => {},
          setTransform: () => {},
          strokeText: () => {},
          fillText: () => {},
        });
        const canvas = {
          height: 0,
          width: 0,
          getContext: () => context,
        };
        context.canvas = canvas;
        return canvas;
      },
    },
  });
}

export async function runDragPreviewLayerTests() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node.js" },
    });
  }
  installPixiTextTestDom();
  const { DragPreviewLayer } = await import("./DragPreviewLayer.js");
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi drag preview layer test failed] ${message}`);
  };

  {
    const calls = [];
    const layer = new DragPreviewLayer({
      onReleaseComplete: (release) => calls.push(release.key),
    });
    const releaseState = {
      cellSize: { height: 80, width: 80 },
      item: { id: "app-a", name: "App A", type: "app" },
      key: "release-1-app-a",
      offset: { x: 32, y: 32 },
      pointer: { x: 180, y: 220 },
      size: { height: 64, width: 64 },
      source: { index: 0, pageIndex: 0, type: "page" },
      targetRect: { height: 64, left: 240, top: 260, width: 64 },
      targetVersion: 1,
      velocity: { x: 200, y: -120 },
    };

    try {
      layer.update({
        folderPageSize: 9,
        height: 600,
        iconSize: 64,
        isTextlessMode: false,
        launchTargetStatusById: {},
        releaseState,
        showMissingLaunchTargetBadge: true,
        stageRect: { height: 600, left: 0, top: 0, width: 800 },
        width: 800,
      });

      assert(calls.length === 0, "release completion should wait for the motion to settle");
      assert(runUntil(() => calls.length === 1), "release completion should fire after x/y springs complete");
      layer.update({
        folderPageSize: 9,
        height: 600,
        iconSize: 64,
        isTextlessMode: false,
        launchTargetStatusById: {},
        releaseState,
        showMissingLaunchTargetBadge: true,
        stageRect: { height: 600, left: 0, top: 0, width: 800 },
        width: 800,
      });
      motionRuntime.step(1);
      assert(calls.join(",") === "release-1-app-a", "release completion should fire once per release key");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const calls = [];
    const layer = new DragPreviewLayer({
      onReleaseComplete: (release) => calls.push(release.key),
    });
    const previewState = {
      cellSize: { height: 80, width: 80 },
      item: { id: "app-preview-slot", name: "Preview Slot App", type: "app" },
      offset: { x: 32, y: 32 },
      pointer: { x: 180, y: 220 },
      size: { height: 64, width: 64 },
      source: { index: 0, pageIndex: 0, type: "page" },
    };
    const releaseState = {
      ...previewState,
      key: "release-folder-preview-slot",
      releaseMode: "folder-preview-slot",
      suppressFolderPreviewChildId: "app-preview-slot",
      suppressFolderPreviewFolderId: "folder-preview-slot",
      targetFolderId: "folder-preview-slot",
      targetPreviewSlotIndex: 8,
      velocity: { x: 0, y: 0 },
    };
    const targetPose = {
      center: { x: 480, y: 360 },
      matrix: { a: 0.28, b: 0, c: 0, d: 0.28 },
    };
    const targetFolderNode = {
      destroyed: false,
      item: { id: "folder-preview-slot", type: "folder" },
      getFolderPreviewChildReleasePose(_relativeTo, slotIndex, options = {}) {
        if (slotIndex !== 8 || options.expectedChildId !== "app-preview-slot") return null;
        return {
          center: { ...targetPose.center },
          matrix: { ...targetPose.matrix },
          targetChildId: "app-preview-slot",
        };
      },
    };
    const baseState = {
      deviceResolution: 2,
      folderPageSize: 9,
      height: 600,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      showMissingLaunchTargetBadge: true,
      stageRect: { height: 600, left: 0, top: 0, width: 800 },
      targetFolderNode,
      width: 800,
    };

    try {
      layer.update({ ...baseState, previewState });
      layer.update({ ...baseState, releaseState });
      assert(!("targetRect" in releaseState), "test setup should exercise the semantic release path without a target rectangle");
      const beforeMove = readNodeCenter(layer, layer.previewNode.visualWrap);
      targetPose.center.x += 387.2;
      targetPose.center.y -= 218.4;
      layer.onRender?.();
      const afterMove = readNodeCenter(layer, layer.previewNode.visualWrap);
      assert(
        Math.abs(afterMove.x - beforeMove.x - 387.2) < 0.001 &&
          Math.abs(afterMove.y - beforeMove.y + 218.4) < 0.001,
        "folder preview slot releases should inherit the live target node movement instead of waiting for a target rectangle"
      );

      for (let frame = 0; frame < 240 && calls.length === 0; frame += 1) {
        targetPose.center.x += 1.5;
        targetPose.center.y -= 0.25;
        motionRuntime.step(1 / 60);
        layer.onRender?.();
      }
      assert(calls.join(",") === "release-folder-preview-slot", "semantic folder preview slot release should complete through DragPreviewLayer");
      const terminalCenter = readNodeCenter(layer, layer.previewNode.visualWrap);
      assert(
        Math.abs(terminalCenter.x - targetPose.center.x) < 0.25 &&
          Math.abs(terminalCenter.y - targetPose.center.y) < 0.25,
        "DragPreviewLayer should transfer visual ownership only after the ghost reaches the live target child"
      );
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const calls = [];
    const layer = new DragPreviewLayer({
      onReleaseComplete: (release) => calls.push(release.key),
    });
    const releaseState = {
      cellSize: { height: 80, width: 80 },
      item: { id: "app-provisional", name: "App Provisional", type: "app" },
      key: "release-provisional",
      offset: { x: 32, y: 32 },
      pointer: { x: 180, y: 220 },
      provisionalLayoutTarget: true,
      size: { height: 64, width: 64 },
      source: { index: 0, pageIndex: 0, type: "page" },
      targetRect: { height: 64, left: 240, top: 260, width: 64 },
      targetVersion: 1,
      velocity: { x: 0, y: 0 },
    };
    const baseState = {
      folderPageSize: 9,
      height: 600,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      showMissingLaunchTargetBadge: true,
      stageRect: { height: 600, left: 0, top: 0, width: 800 },
      width: 800,
    };

    try {
      layer.update({ ...baseState, releaseState });
      assert(runUntil(() => Math.abs(layer.previewNode.x - 272) < 0.5), "provisional release should still fly to the current target");
      assert(calls.length === 0, "provisional release targets should not complete the release handoff");
      assert(layer.previewNode.visible === true, "provisional release should keep the ghost visible while it waits for the final layout");

      layer.update({
        ...baseState,
        releaseState: {
          ...releaseState,
          provisionalLayoutTarget: false,
          targetVersion: 2,
        },
      });
      assert(runUntil(() => calls.length === 1), "final release target should complete after a provisional target settles");
      assert(calls.join(",") === "release-provisional", "final release target should complete the original release key");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const calls = [];
    const layer = new DragPreviewLayer({
      onReleaseComplete: (release) => calls.push(release.key),
    });
    const releaseState = {
      cellSize: { height: 80, width: 80 },
      item: { id: "app-finalize", name: "App Finalize", type: "app" },
      key: "release-finalize-without-retarget",
      offset: { x: 32, y: 32 },
      pointer: { x: 180, y: 220 },
      provisionalLayoutTarget: true,
      size: { height: 64, width: 64 },
      source: { index: 0, pageIndex: 0, type: "page" },
      targetRect: { height: 64, left: 520, top: 420, width: 64 },
      targetVersion: 1,
      velocity: { x: 0, y: 0 },
    };
    const baseState = {
      folderPageSize: 9,
      height: 600,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      showMissingLaunchTargetBadge: true,
      stageRect: { height: 600, left: 0, top: 0, width: 800 },
      width: 800,
    };

    try {
      layer.update({ ...baseState, releaseState });
      motionRuntime.step(1 / 60);
      const xChannel = motionRuntime.getChannel(layer.previewNode, "x");
      const xMotionBefore = Array.from(xChannel?.base?.values?.() || [])[0] || null;
      assert(xMotionBefore && Math.abs(xMotionBefore.velocity) > 0, "test setup should have an in-flight provisional release x motion");
      const fromBefore = xMotionBefore.from;
      const xBefore = layer.previewNode.x;

      layer.update({
        ...baseState,
        releaseState: {
          ...releaseState,
          provisionalLayoutTarget: false,
          targetVersion: 2,
        },
      });

      const xMotionAfter = Array.from(motionRuntime.getChannel(layer.previewNode, "x")?.base?.values?.() || [])[0] || null;
      assert(xMotionAfter === xMotionBefore, "finalizing a provisional target with the same geometry should keep the existing release x motion");
      assert(xMotionAfter.from === fromBefore, "finalizing a provisional target with the same geometry should not restart the release spring");
      assert(layer.previewNode.x === xBefore, "finalizing a provisional target with the same geometry should not snap the ghost position");
      assert(runUntil(() => calls.length === 1), "finalized same-geometry release should still complete after the existing motion settles");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const calls = [];
    const layer = new DragPreviewLayer({
      onReleaseComplete: (release) => calls.push(release.key),
    });
    const releaseState = {
      cellSize: { height: 64, width: 64 },
      item: { id: "app-finalize-equivalent", name: "App Finalize Equivalent", type: "app" },
      key: "release-finalize-equivalent",
      offset: { x: 32, y: 32 },
      pointer: { x: 420, y: 420 },
      provisionalLayoutTarget: true,
      size: { height: 64, width: 64 },
      source: { folderId: "folder-a", index: 18, pageIndex: 0, type: "folder" },
      targetRect: { height: 63.75, left: 1098.125, top: 206.125, width: 63.75 },
      targetVersion: 1,
      targetVisualSpec: {
        cellHeight: 119.53,
        cellWidth: 172,
        compact: false,
        iconSize: 63.75,
        singleLineLabel: false,
        textless: false,
      },
      velocity: { x: 0, y: 0 },
    };
    const baseState = {
      folderPageSize: 30,
      height: 760,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      showMissingLaunchTargetBadge: true,
      stageRect: { height: 760, left: 0, top: 0, width: 1400 },
      width: 1400,
    };

    try {
      layer.update({ ...baseState, releaseState });
      assert(runUntil(() => layer.releaseMotionControl?.completed === true), "test setup should settle the provisional release motion");
      assert(calls.length === 0, "settled provisional release should still wait for the stable target");
      const iconSizeBefore = layer.previewNode.state.iconSize;
      const labelSigBefore = layer.previewNode.labelRenderSig;
      const xChannelBefore = motionRuntime.getChannel(layer.previewNode, "x");
      const xMotionBefore = Array.from(xChannelBefore?.base?.values?.() || [])[0] || null;
      assert(!xMotionBefore, "test setup should have no active x spring before finalization");

      layer.update({
        ...baseState,
        releaseState: {
          ...releaseState,
          provisionalLayoutTarget: false,
          targetRect: { height: 64, left: 1098, top: 206, width: 64 },
          targetVersion: 2,
          targetVisualSpec: {
            ...releaseState.targetVisualSpec,
            cellHeight: 120,
            iconSize: 64,
          },
        },
      });

      const xMotionAfter = Array.from(motionRuntime.getChannel(layer.previewNode, "x")?.base?.values?.() || [])[0] || null;
      assert(calls.join(",") === "release-finalize-equivalent", "visually equivalent stable target should complete immediately after the provisional motion has settled");
      assert(!xMotionAfter, "visually equivalent stable target should not start a second release spring");
      assert(layer.previewNode.state.iconSize === iconSizeBefore, "visually equivalent stable target should not rerender the preview icon for a sub-pixel finalization");
      assert(layer.previewNode.labelRenderSig === labelSigBefore, "visually equivalent stable target should not rerender the preview label for a sub-pixel finalization");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new DragPreviewLayer();
    const previewState = {
      cellSize: { height: 80, width: 80 },
      item: { id: "app-folder-hover", name: "Spreadsheet Compare", type: "app" },
      offset: { x: 32, y: 32 },
      pointer: { x: 180, y: 220 },
      size: { height: 64, width: 64 },
      source: { folderId: "folder-a", index: 0, pageIndex: 0, type: "folder" },
    };
    const baseState = {
      folderPageSize: 9,
      height: 600,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      previewState,
      showMissingLaunchTargetBadge: true,
      stageRect: { height: 600, left: 0, top: 0, width: 800 },
      width: 800,
    };
    try {
      layer.update({
        ...baseState,
        folderHoverState: { key: "folder-hover", phase: "hover", targetId: "folder-a", targetType: "folder" },
      });

      assert(runUntil(() => layer.previewNode.scale.x < 1), "folder hover should shrink the drag preview away from the target folder");
      assert(layer.previewNode.labelText.alpha < 0.001, "folder hover should hide the drag preview label so it cannot cover the target folder");
      assert(layer.previewNode.labelText.scale.x < 1, "folder hover should shrink the hidden preview label");

      layer.update({ ...baseState, folderHoverState: null });
      assert(runUntil(() => layer.previewNode.labelText.alpha > 0.98), "leaving folder hover should restore the drag preview label");
      assert(runUntil(() => layer.previewNode.labelText.scale.x > 0.98), "leaving folder hover should restore the drag preview label scale");

      layer.update({
        ...baseState,
        folderHoverState: { key: "folder-hover-release", phase: "hover", targetId: "folder-a", targetType: "folder" },
      });
      assert(layer.previewNode.labelText.alpha < 0.001, "folder hover re-entry should hide the drag preview label immediately");
      layer.update({
        ...baseState,
        releaseState: {
          ...previewState,
          key: "release-folder-hover",
          releaseMode: "folder-center-absorb",
          targetFolderId: "folder-a",
          velocity: { x: 0, y: 0 },
        },
        targetFolderNode: {
          destroyed: false,
          iconSize: 64,
          item: { id: "folder-a", type: "folder" },
          getFolderCenterReleasePose: () => ({ center: { x: 248, y: 268 } }),
        },
      });
      assert(layer.previewNode.labelText.alpha < 0.001, "folder release should not resurrect a hidden drag preview label over the target folder");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new DragPreviewLayer();
    const releaseState = {
      cellSize: { height: 80, width: 80 },
      item: { id: "app-hover", name: "App Hover", type: "app" },
      key: "release-hover-scale",
      offset: { x: 32, y: 32 },
      pointer: { x: 180, y: 220 },
      size: { height: 64, width: 64 },
      source: { index: 0, pageIndex: 0, type: "page" },
      targetRect: { height: 64, left: 240, top: 260, width: 64 },
      targetVersion: 1,
      velocity: { x: 0, y: 0 },
    };
    try {
      layer.previewNode.scale.set(0.92);
      layer.update({
        folderPageSize: 9,
        height: 600,
        iconSize: 64,
        isTextlessMode: false,
        launchTargetStatusById: {},
        releaseState,
        showMissingLaunchTargetBadge: true,
        stageRect: { height: 600, left: 0, top: 0, width: 800 },
        width: 800,
      });

      assert(Math.abs(layer.previewNode.scale.x - 0.92) < 0.0001, "drag release should start from the current preview scale without jumping to the default drag scale");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new DragPreviewLayer();
    const previewState = {
      cellSize: { height: 80, width: 80 },
      item: { id: "app-release-preserve", name: "App Preserve", type: "app" },
      offset: { x: 32, y: 32 },
      pointer: { x: 520, y: 440 },
      size: { height: 64, width: 64 },
      source: { index: 0, pageIndex: 0, type: "page" },
    };
    const baseState = {
      folderPageSize: 9,
      height: 600,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      showMissingLaunchTargetBadge: true,
      stageRect: { height: 600, left: 0, top: 0, width: 800 },
      width: 800,
    };
    try {
      layer.update({ ...baseState, previewState });
      layer.previewNode.position.set(510, 422);
      layer.previewNode.scale.set(1.12);

      layer.update({
        ...baseState,
        releaseState: {
          ...previewState,
          key: "release-preserve-visible-preview",
          pointer: { x: 120, y: 160 },
          targetRect: null,
          targetVersion: 0,
          velocity: { x: 0, y: 0 },
        },
      });

      assert(Math.abs(layer.previewNode.x - 510) < 0.0001 && Math.abs(layer.previewNode.y - 422) < 0.0001, "new release should preserve the currently visible preview pose instead of snapping back to the pointer-derived start");
      assert(Math.abs(layer.previewNode.scale.x - 1.12) < 0.0001, "new release should preserve the visible preview scale when target metrics have not changed");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new DragPreviewLayer();
    const previewState = {
      cellSize: { height: 80, width: 80 },
      item: { id: "app-release-start-pose", name: "App Start Pose", type: "app" },
      offset: { x: 32, y: 32 },
      pointer: { x: 220, y: 240 },
      size: { height: 64, width: 64 },
      source: { index: 0, pageIndex: 0, type: "page" },
    };
    const baseState = {
      folderPageSize: 9,
      height: 600,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      showMissingLaunchTargetBadge: true,
      stageRect: { height: 600, left: 0, top: 0, width: 800 },
      width: 800,
    };
    try {
      layer.update({ ...baseState, previewState });
      layer.previewNode.position.set(510, 422);
      layer.previewNode.scale.set(1.08);

      layer.update({
        ...baseState,
        releaseState: {
          ...previewState,
          key: "release-explicit-start-pose",
          pointer: { x: 120, y: 160 },
          startPose: { pointer: { x: 520, y: 440 } },
          targetRect: null,
          targetVersion: 0,
          velocity: { x: 0, y: 0 },
        },
      });

      assert(Math.abs(layer.previewNode.x - 520) < 0.0001 && Math.abs(layer.previewNode.y - 454) < 0.0001, "explicit release start pose should win over the stale rendered preview position");
      assert(Math.abs(layer.previewNode.scale.x - 1.08) < 0.0001, "explicit release start pose should still preserve the rendered preview scale");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new DragPreviewLayer();
    const releaseState = {
      cellSize: { height: 80, width: 80 },
      item: { id: "app-target-spec", name: "App Target Spec", type: "app" },
      key: "release-target-spec",
      offset: { x: 32, y: 32 },
      pointer: { x: 180, y: 220 },
      size: { height: 64, width: 64 },
      source: { index: 0, pageIndex: 0, type: "page" },
      targetRect: { height: 56, left: 240, top: 260, width: 56 },
      targetVersion: 1,
      targetVisualSpec: {
        cellHeight: 90,
        cellWidth: 76,
        compact: false,
        iconSize: 56,
        singleLineLabel: false,
        textless: false,
      },
      velocity: { x: 0, y: 0 },
    };
    try {
      layer.previewNode.scale.set(1.12);
      layer.update({
        folderPageSize: 9,
        height: 600,
        iconSize: 64,
        isTextlessMode: false,
        launchTargetStatusById: {},
        releaseState,
        showMissingLaunchTargetBadge: true,
        stageRect: { height: 600, left: 0, top: 0, width: 800 },
        width: 800,
      });

      assert(layer.previewNode.state.iconSize === 56, "target-spec release should render the ghost with the target icon size");
      assert(layer.previewNode.state.cellWidth === 76 && layer.previewNode.state.cellHeight === 90, "target-spec release should render with the target cell dimensions");
      assert(Math.abs(layer.previewNode.scale.x - 1.28) < 0.0001, "target-spec release should compensate the current drag scale by the source-to-target icon ratio");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const layer = new DragPreviewLayer();
    const pendingReleaseState = {
      cellSize: { height: 80, width: 80 },
      item: { id: "app-retarget", name: "App Retarget", type: "app" },
      key: "release-retarget",
      offset: { x: 32, y: 32 },
      pointer: { x: 180, y: 220 },
      size: { height: 64, width: 64 },
      source: { index: 0, pageIndex: 0, type: "page" },
      targetRect: null,
      targetVersion: 0,
      velocity: { x: 0, y: 0 },
    };
    const baseState = {
      folderPageSize: 9,
      height: 600,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      showMissingLaunchTargetBadge: true,
      stageRect: { height: 600, left: 0, top: 0, width: 800 },
      width: 800,
    };
    try {
      layer.update({ ...baseState, releaseState: pendingReleaseState });
      layer.previewNode.position.set(210, 230);
      layer.update({
        ...baseState,
        releaseState: {
          ...pendingReleaseState,
          targetRect: { height: 56, left: 300, top: 320, width: 56 },
          targetVersion: 1,
          targetVisualSpec: {
            cellHeight: 90,
            cellWidth: 76,
            compact: false,
            iconSize: 56,
            singleLineLabel: false,
            textless: false,
          },
        },
      });

      assert(Math.abs(layer.previewNode.x - 210) < 0.0001 && Math.abs(layer.previewNode.y - 230) < 0.0001, "release retarget should continue from the current ghost position");
      assert(Math.abs(layer.previewNode.scale.x - 64 / 56) < 0.0001, "release retarget should preserve visual size when target icon metrics arrive");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const calls = [];
    const layer = new DragPreviewLayer({
      onReleaseComplete: (release) => calls.push(release.key),
    });
    const releaseState = {
      cellSize: { height: 80, width: 80 },
      item: { id: "app-absorb", name: "App Absorb", type: "app" },
      key: "release-center-absorb",
      offset: { x: 32, y: 32 },
      pointer: { x: 180, y: 220 },
      releaseMode: "folder-center-absorb",
      size: { height: 64, width: 64 },
      source: { index: 0, pageIndex: 0, type: "page" },
      targetFolderId: "folder-absorb",
      velocity: { x: 0, y: 0 },
    };
    const targetPose = { center: { x: 248, y: 268 } };
    const targetFolderNode = {
      destroyed: false,
      iconSize: 64,
      item: { id: "folder-absorb", type: "folder" },
      getFolderCenterReleasePose() {
        return { center: { ...targetPose.center } };
      },
    };
    const baseState = {
      deviceResolution: 2,
      folderPageSize: 9,
      height: 600,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      releaseState,
      showMissingLaunchTargetBadge: true,
      stageRect: { height: 600, left: 0, top: 0, width: 800 },
      targetFolderNode,
      width: 800,
    };
    try {
      layer.update(baseState);
      assert(!("targetRect" in releaseState), "center absorb should be driven by semantic target identity without a target rectangle");
      const beforeMove = readNodeCenter(layer, layer.previewNode.visualWrap);
      targetPose.center.x += 180;
      targetPose.center.y -= 120;
      layer.onRender?.();
      const afterMove = readNodeCenter(layer, layer.previewNode.visualWrap);
      assert(
        Math.abs(afterMove.x - beforeMove.x - 180) < 0.001 &&
          Math.abs(afterMove.y - beforeMove.y + 120) < 0.001,
        "center absorb should follow the live folder center in the same render frame"
      );

      let completionSteps = 0;
      while (!calls.length && completionSteps < 120) {
        targetPose.center.x += 0.75;
        targetPose.center.y -= 0.2;
        motionRuntime.step(1 / 60);
        layer.onRender?.();
        completionSteps += 1;
      }
      assert(calls.length === 1, "center absorb release should complete");
      assert(completionSteps <= 20, "center absorb should not wait on a long invisible spring tail");
      assert(layer.previewNode.alpha < 0.001, "center absorb should fade the ghost completely before completion");
      const fadedAlpha = layer.previewNode.alpha;
      layer.update(baseState);
      assert(layer.previewNode.alpha <= fadedAlpha + 0.001, "re-rendering a faded center absorb must not restore the ghost alpha");

      const terminalPose = readNodeCenter(layer, layer.previewNode.visualWrap);
      assert(
        Math.abs(terminalPose.x - targetPose.center.x) < 0.25 &&
          Math.abs(terminalPose.y - targetPose.center.y) < 0.25,
        "center absorb should finish at the live folder center"
      );
      assert(Math.abs(layer.previewNode.visualWrap.getGlobalTransform().a - 0.1) < 0.02, "center absorb release should shrink the visual ghost before completion");
      assert(layer.previewNode.labelText.alpha < 0.001, "center absorb release should fade the label out before completion");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    motionRuntime.configureDebug({ enabled: true });
    const layer = new DragPreviewLayer();
    try {
      layer.update({
        folderPageSize: 9,
        height: 600,
        iconSize: 64,
        isTextlessMode: false,
        launchTargetStatusById: {},
        previewState: {
          cellSize: { height: 80, width: 80 },
          item: { id: "app-a", name: "App A", type: "app" },
          offset: { x: 32, y: 32 },
          pointer: { x: 180, y: 220 },
          size: { height: 64, width: 64 },
          source: { index: 0, pageIndex: 0, type: "page" },
        },
        showMissingLaunchTargetBadge: true,
        stageRect: { height: 600, left: 0, top: 0, width: 800 },
        width: 800,
      });

      const report = motionRuntime.debugReport({ includeTargets: true });
      assert(
        report.targets.some((entry) => entry.sourceLabel === "dragPreview.node" && entry.itemId === "app-a"),
        "drag preview should describe its animated preview node",
      );
      assert(
        report.targets.some((entry) => entry.sourceLabel === "dragPreview.scale" && entry.kind === "DragPreview"),
        "drag preview should describe its animated scale target",
      );
      assert(report.animations.every((animation) => animation.sourceLabel), "drag preview active animations should expose source labels");
      assert(report.warnings.length === 0, "described drag preview targets should not emit missing metadata warnings");

      layer.destroy({ children: true });
      const destroyedCount = motionRuntime.debugSnapshot().counters.canceledByReason.destroyed || 0;
      assert(destroyedCount >= 2, `destroying drag preview should mark active scale motion as destroyed, got ${destroyedCount}`);
    } finally {
      motionRuntime.reset();
      if (!layer.destroyed) layer.destroy({ children: true });
    }
  }

  {
    motionRuntime.reset();
    motionRuntime.configureDebug({ enabled: true });
    const layer = new DragPreviewLayer();
    const previewState = {
      cellSize: { height: 80, width: 80 },
      item: { id: "app-a", name: "App A", type: "app" },
      offset: { x: 32, y: 32 },
      pointer: { x: 180, y: 220 },
      size: { height: 64, width: 64 },
      source: { index: 0, pageIndex: 0, type: "page" },
    };
    const baseState = {
      folderPageSize: 9,
      height: 600,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      showMissingLaunchTargetBadge: true,
      stageRect: { height: 600, left: 0, top: 0, width: 800 },
      width: 800,
    };
    try {
      layer.update({ ...baseState, previewState });
      assert(layer.previewNode.state.compact === false, "drag preview should default to non-compact label layout");
      layer.update({ ...baseState, previewState: null });
      assert(
        (motionRuntime.debugSnapshot().counters.canceledByReason["drag-preview-clear"] || 0) >= 2,
        "clearing drag preview should use a specific cancel reason"
      );

      motionRuntime.reset();
      motionRuntime.configureDebug({ enabled: true });
      layer.update({ ...baseState, previewState });
      layer.update({
        ...baseState,
        releaseState: {
          ...previewState,
          key: "release-reason",
          targetRect: { height: 64, left: 240, top: 260, width: 64 },
          targetVersion: 1,
          velocity: { x: 0, y: 0 },
        },
      });
      assert(
        (motionRuntime.debugSnapshot().counters.canceledByReason["drag-release-start"] || 0) >= 1,
        "starting drag release should use a specific cancel reason for preview motion"
      );
    } finally {
      motionRuntime.reset();
      if (!layer.destroyed) layer.destroy({ children: true });
    }
  }

  {
    motionRuntime.reset();
    const layer = new DragPreviewLayer();
    try {
      layer.update({
        folderPageSize: 9,
        height: 600,
        iconSize: 64,
        isTextlessMode: false,
        launchTargetStatusById: {},
        previewState: {
          cellSize: { height: 80, width: 80 },
          compact: true,
          item: { id: "app-compact", name: "Compact App", type: "app" },
          offset: { x: 32, y: 32 },
          pointer: { x: 180, y: 220 },
          singleLineLabel: true,
          size: { height: 64, width: 64 },
          source: { index: 0, pageIndex: 0, type: "page" },
        },
        showMissingLaunchTargetBadge: true,
        stageRect: { height: 600, left: 0, top: 0, width: 800 },
        width: 800,
      });
      assert(layer.previewNode.state.compact === true, "drag preview layer should pass compact label layout to IconNode");
      assert(layer.previewNode.state.singleLineLabel === true, "drag preview layer should pass single-line label layout to IconNode");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }
}
