import { motionRuntime } from "../animation/motionRuntime.js";

function runUntil(condition, maxSteps = 600) {
  for (let index = 0; index < maxSteps; index += 1) {
    motionRuntime.step(1 / 60);
    if (condition()) return true;
  }
  return false;
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
      targetRect: { height: 16, left: 240, top: 260, width: 16 },
      targetVersion: 1,
      velocity: { x: 0, y: 0 },
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

      motionRuntime.step(1 / 60);
      const scaleAfterFirstStep = layer.previewNode.scale.x;
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
      motionRuntime.step(1 / 60);
      assert(layer.previewNode.scale.x < scaleAfterFirstStep, "re-rendering a release should not cancel the scale animation");
      assert(runUntil(() => calls.length === 1), "center absorb release completion should wait for the full release animation group");
      assert(layer.previewNode.alpha < 0.001, "center absorb release should fade the ghost out before completion");
      assert(Math.abs(layer.previewNode.scale.x - 0.1) < 0.02, "center absorb release should shrink the ghost before completion");
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
