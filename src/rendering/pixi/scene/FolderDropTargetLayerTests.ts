import { motionRuntime } from "../animation/motionRuntime.js";
import { getFolderFrameRadius } from "../nodes/folderThumbDrawing.js";
import { getFolderThumbMetrics } from "../nodes/folderThumbMetrics.js";

function installPixiTextTestDom(): void {
  if (!("CanvasRenderingContext2D" in globalThis)) {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class CanvasRenderingContext2D {};
  }
  if ("document" in globalThis) return;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      baseURI: "http://localhost/",
      fonts: null,
      createElement() {
        const context = Object.create(globalThis.CanvasRenderingContext2D.prototype);
        const canvas = {
          getContext: () => context,
          height: 0,
          width: 0,
        };
        context.canvas = canvas;
        return canvas;
      },
    },
  });
}

export async function runFolderDropTargetLayerTests(): Promise<void> {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node.js" },
    });
  }
  installPixiTextTestDom();
  const { FolderDropTargetLayer } = await import("./FolderDropTargetLayer.js");
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[Folder drop target layer test failed] ${message}`);
  }
  function requireValue<T>(value: T | null | undefined, message: string): T {
    if (value === null || value === undefined) {
      throw new Error(`[Folder drop target layer test failed] ${message}`);
    }
    return value;
  }
  const readBooleanProperty = (target: object, key: string): boolean => Reflect.get(target, key) === true;
  const nearlyEqual = (actual: number, expected: number, epsilon = 0.001): boolean => Math.abs(actual - expected) <= epsilon;
  const stepMotion = (count = 6, delta = 0.05): void => {
    for (let index = 0; index < count; index += 1) motionRuntime.step(delta);
  };
  const stepFlashSegment = (): void => stepMotion(3, 0.045);

  {
    const layer = new FolderDropTargetLayer({ part: "fill" });
    try {
      layer.update(null, { stageRect: { height: 600, left: 0, top: 0, width: 800 } });
      assert(layer.visible === false, "empty drop target should hide the layer");
      assert(layer.lastDrawKey === null, "empty drop target should clear draw state");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    const layer = new FolderDropTargetLayer({ part: "stroke" });
    const firstTarget = {
      active: true,
      geometryVersion: "folder-a:100",
      hoverRect: { height: 64, left: 100, top: 80, width: 64 },
      padding: 8,
      phase: "hover",
      targetId: "folder-a",
    };
    const secondTarget = {
      ...firstTarget,
      geometryVersion: "folder-a:180",
      hoverRect: { height: 64, left: 180, top: 80, width: 64 },
    };
    try {
      layer.update(firstTarget, { stageRect: { height: 600, left: 10, top: 20, width: 800 } });
      assert(layer.visible === true, "active drop target should show the layer");
      const enterRect = requireValue(layer.lastDrawRect, "enter should produce a draw rect");
      const enterFrame = requireValue(layer.lastDrawFrame, "enter should produce a draw frame");
      assert(enterRect.left === 90 && enterRect.top === 60, "drop target should enter at the real folder thumb rect in stage visual space");
      assert(enterRect.width === 64 && enterRect.height === 64, "drop target should start from the unpadded folder thumb frame");
      assert(nearlyEqual(enterFrame.outerRect.width, 64), "drop target should draw the original folder thumb frame at progress zero");
      assert(nearlyEqual(enterFrame.innerRect.width, 64), "drop target should preserve the original folder thumb as the inner frame");
      assert(nearlyEqual(enterFrame.fillAlpha, 0.22), "normal folder drop fill should match the original folder thumb fill alpha");
      assert(nearlyEqual(enterFrame.strokeAlpha, 0.26), "normal folder drop stroke should match the original folder thumb stroke alpha");
      assert(layer.activeTargetId === "folder-a", "active folder drop fill should keep ownership of the folder thumb background");

      stepMotion();
      const expandedRect = requireValue(layer.lastDrawRect, "settled enter should retain a draw rect");
      const expandedFrame = requireValue(layer.lastDrawFrame, "settled enter should retain a draw frame");
      assert(expandedRect.left === 82 && expandedRect.top === 52, "drop target should expand symmetrically after the enter animation");
      assert(expandedRect.width === 80 && expandedRect.height === 80, "drop target should finish at the padded hover frame");
      assert(nearlyEqual(expandedFrame.outerRect.width, 80), "drop target should draw the expanded folder thumb frame at progress one");

      layer.update(secondTarget, { stageRect: { height: 600, left: 10, top: 20, width: 800 } });
      assert(requireValue(layer.lastDrawRect, "retarget should retain a draw rect").left === 162, "same targetId with a new geometry version should redraw at the new rect");
      assert(requireValue(layer.lastDrawKey, "retarget should retain a draw key").includes("folder-a:180"), "draw key should include geometryVersion, not just targetId");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    const layer = new FolderDropTargetLayer({ part: "fill" });
    const target = {
      active: true,
      geometryVersion: "folder-a:100",
      hoverRect: { height: 64, left: 100, top: 80, width: 64 },
      padding: 8,
      phase: "hover",
      targetId: "folder-a",
    };
    try {
      layer.update(target, { stageRect: { height: 600, left: 0, top: 0, width: 800 } });
      assert(layer.visible === true, "entering a target should show the layer immediately");
      const activeFrameState = requireValue(layer.frame, "active layer should expose frame state");
      const activeGraphics = requireValue(layer.graphics, "active layer should expose graphics");
      assert(nearlyEqual(activeFrameState.alpha, 1), "enter animation should keep the replacement thumb background opaque to avoid a blank takeover frame");
      assert(nearlyEqual(activeFrameState.progress, 0), "enter animation should start at the unpadded folder width");
      assert(nearlyEqual(activeGraphics.scale.x, 1), "graphics should not use transform scale for the folder drop frame shape");

      stepMotion();
      assert(nearlyEqual(activeFrameState.alpha, 1), "enter animation should settle to full alpha");
      assert(nearlyEqual(activeFrameState.progress, 1), "enter animation should settle to the full padded hover frame");
      assert(nearlyEqual(activeGraphics.scale.x, 1), "graphics scale should stay neutral at the final hover size");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    const layer = new FolderDropTargetLayer({ part: "stroke" });
    const iconSize = 64;
    const visualScale = 1.25;
    const padding = 8;
    const target = {
      active: true,
      geometryVersion: "folder-scaled:100",
      hoverRect: { height: iconSize * visualScale, left: 100, top: 80, width: iconSize * visualScale },
      iconSize,
      padding,
      phase: "hover",
      targetId: "folder-scaled",
    };
    try {
      layer.update(target, { stageRect: { height: 600, left: 0, top: 0, width: 800 } });
      stepMotion();
      const thumb = getFolderThumbMetrics(iconSize);
      const expectedRadius = getFolderFrameRadius(thumb, padding) * visualScale;
      const expectedBaseRadius = getFolderFrameRadius(thumb, 0) * visualScale;
      const scaledFrame = requireValue(layer.lastDrawFrame, "scaled target should produce a draw frame");
      const scaledRect = requireValue(layer.lastDrawRect, "scaled target should produce a draw rect");
      assert(nearlyEqual(scaledFrame.visualScale, visualScale), "drop target should derive visual scale from hover rect size over logical icon size");
      assert(nearlyEqual(scaledRect.width, 100), "drop target should scale hover padding with the measured folder thumb");
      assert(nearlyEqual(scaledFrame.radius, expectedRadius), "drop target radius should match the original folder thumb model after visual scaling");
      assert(nearlyEqual(scaledFrame.baseRadius, expectedBaseRadius), "drop target base radius should match the original unpadded folder thumb after visual scaling");
      assert(nearlyEqual(scaledFrame.strokeWidth, visualScale), "drop target stroke width should match the scaled original folder thumb stroke");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    const layer = new FolderDropTargetLayer({ part: "fill" });
    let nodeRect = { height: 64, left: 100, top: 80, width: 64 };
    const targetNode = {
      getFolderThumbBounds: () => nodeRect,
    };
    const target = {
      active: true,
      geometryVersion: "folder-moving:100",
      hoverRect: { height: 64, left: 20, top: 20, width: 64 },
      iconSize: 64,
      padding: 8,
      phase: "hover",
      targetId: "folder-moving",
    };
    try {
      layer.update(target, {
        stageRect: { height: 600, left: 10, top: 20, width: 800 },
        targetNode,
      });
      stepMotion();
      const firstNodeRect = requireValue(layer.lastDrawRect, "rendered target node should produce a draw rect");
      assert(firstNodeRect.left === 82 && firstNodeRect.top === 52, "drop target should prefer the rendered folder node bounds over stale hover rects");

      nodeRect = { height: 64, left: 132, top: 96, width: 64 };
      layer.syncRenderedFrames();
      const movedNodeRect = requireValue(layer.lastDrawRect, "moved target node should retain a draw rect");
      assert(movedNodeRect.left === 114 && movedNodeRect.top === 68, "drop target should follow the rendered folder node as it moves");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    const callbacks: string[] = [];
    const layer = new FolderDropTargetLayer({
      part: "stroke",
      onExitComplete: (folderId) => callbacks.push(`complete:${folderId}`),
      onExitStart: (folderId) => callbacks.push(`start:${folderId}`),
      onTargetActive: (folderId) => callbacks.push(`active:${folderId}`),
    });
    const target = {
      active: true,
      geometryVersion: "folder-a:100",
      hoverRect: { height: 64, left: 100, top: 80, width: 64 },
      padding: 8,
      phase: "hover",
      targetId: "folder-a",
    };
    try {
      layer.update(target, { stageRect: { height: 600, left: 0, top: 0, width: 800 } });
      assert(callbacks.includes("active:folder-a"), "active target should claim folder thumb background ownership");
      stepMotion();
      layer.update(null, { stageRect: { height: 600, left: 0, top: 0, width: 800 } });
      assert(layer.visible === true, "clearing an active target should keep the replacement thumb visible while shrinking");
      assert(callbacks.includes("start:folder-a"), "clear should keep folder thumb background ownership during the shrink-out animation");
      assert(!callbacks.includes("complete:folder-a"), "clear should not restore the IconNode thumb frame before shrink-out finishes");
      const frame = requireValue(layer.getFrame("folder-a"), "clearing should keep the exiting folder frame alive");
      assert(frame.clearing === true, "clearing should keep the exiting folder frame alive");
      assert(nearlyEqual(frame.frame.progress, 1), "shrink-out should start from the expanded folder thumb background");

      motionRuntime.step(0.05);
      assert(frame.frame.progress > 0 && frame.frame.progress < 1, "shrink-out should animate the full thumb background toward the original size");
      const shrinkingFrame = requireValue(frame.lastDrawFrame, "mid-shrink should retain a draw frame");
      assert(shrinkingFrame.radius > shrinkingFrame.baseRadius, "mid-shrink radius should still be larger than the original folder thumb radius");
      assert(nearlyEqual(frame.graphics.alpha, 1), "shrink-out should not fade the replacement thumb before IconNode restores its own frame");
      assert(!callbacks.includes("complete:folder-a"), "mid-shrink should still keep the original IconNode thumb frame suppressed");
      stepMotion();
      assert(layer.visible === true, "finished shrink-out should wait visibly at the original size until the next render restores IconNode's frame");
      assert(frame.restorePending === true, "finished shrink-out should mark the layer as waiting for frame handoff");
      assert(!readBooleanProperty(frame, "clearing"), "finished shrink-out should clear the clearing flag");
      const settledFrame = requireValue(frame.lastDrawFrame, "settled shrink should retain a draw frame");
      assert(nearlyEqual(settledFrame.radius, settledFrame.baseRadius), "finished shrink-out should match the real folder thumb corner radius before handoff");
      assert(nearlyEqual(requireValue(frame.lastDrawRect, "settled shrink should retain a draw rect").width, 64), "finished shrink-out should match the real folder thumb size before handoff");
      assert(callbacks.includes("complete:folder-a"), "finished shrink-out should request IconNode thumb frame ownership restore");

      layer.update(null, { stageRect: { height: 600, left: 0, top: 0, width: 800 } });
      assert(!readBooleanProperty(layer, "visible"), "after the restore render, the replacement layer should hide");
      assert(layer.getFrame("folder-a") === null, "after the restore render, the exiting frame should be removed");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    const callbacks: string[] = [];
    const layer = new FolderDropTargetLayer({
      part: "fill",
      onExitComplete: (folderId) => callbacks.push(`complete:${folderId}`),
      onExitStart: (folderId) => callbacks.push(`start:${folderId}`),
      onTargetActive: (folderId) => callbacks.push(`active:${folderId}`),
    });
    const target = {
      active: true,
      geometryVersion: "folder-opening:100",
      hoverRect: { height: 64, left: 100, top: 80, width: 64 },
      padding: 8,
      phase: "opening",
      targetId: "folder-opening",
    };
    try {
      layer.update(target, { stageRect: { height: 600, left: 0, top: 0, width: 800 } });
      stepMotion();
      layer.update(null, {
        exitTransition: { mode: "immediate", targetId: target.targetId },
        stageRect: { height: 600, left: 0, top: 0, width: 800 },
      });
      assert(layer.visible === false, "opening handoff should hide the desktop drop frame in the same update");
      assert(layer.getFrame(target.targetId) === null, "opening handoff should remove the drop frame without a shrink-out tail");
      assert(callbacks.includes(`complete:${target.targetId}`), "opening handoff should release folder thumb suppression immediately");
      stepMotion();
      assert(layer.visible === false, "an immediately retired opening frame should not reappear on later motion frames");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    const callbacks: string[] = [];
    const layer = new FolderDropTargetLayer({
      part: "fill",
      onExitComplete: (folderId) => callbacks.push(`complete:${folderId}`),
      onExitStart: (folderId) => callbacks.push(`start:${folderId}`),
      onTargetActive: (folderId) => callbacks.push(`active:${folderId}`),
    });
    const firstTarget = {
      active: true,
      geometryVersion: "folder-a:100",
      hoverRect: { height: 64, left: 100, top: 80, width: 64 },
      padding: 8,
      phase: "hover",
      targetId: "folder-a",
    };
    const secondTarget = {
      ...firstTarget,
      geometryVersion: "folder-b:100",
      hoverRect: { height: 64, left: 180, top: 80, width: 64 },
      targetId: "folder-b",
    };
    try {
      layer.update(firstTarget, { stageRect: { height: 600, left: 0, top: 0, width: 800 } });
      stepMotion();
      layer.update(null, { stageRect: { height: 600, left: 0, top: 0, width: 800 } });
      motionRuntime.step(0.03);
      layer.update(secondTarget, { stageRect: { height: 600, left: 0, top: 0, width: 800 } });
      assert(!callbacks.includes("complete:folder-a"), "retargeting during shrink-out should not release the previous folder before its own exit animation finishes");
      assert(layer.getFrame("folder-a")?.clearing === true, "retargeting should keep the previous folder shrink-out frame alive");
      assert(layer.getFrame("folder-b")?.visible === true, "retargeting should create an independent frame for the new folder");
      assert(callbacks.includes("active:folder-b"), "retargeting during shrink-out should claim the new folder thumb frame suppression");
      assert(layer.activeTargetId === "folder-b", "retargeting during shrink-out should make the new folder active");
      stepMotion();
      assert(callbacks.includes("complete:folder-a"), "previous folder should release suppression only after its shrink-out finishes");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }

  {
    const layer = new FolderDropTargetLayer({ part: "fill" });
    const target = {
      active: true,
      geometryVersion: "folder-a:100",
      hoverRect: { height: 64, left: 100, top: 80, width: 64 },
      padding: 8,
      phase: "hover",
      targetId: "folder-a",
    };
    try {
      layer.update(target, { stageRect: { height: 600, left: 0, top: 0, width: 800 } });
      stepMotion();
      layer.update({ ...target, phase: "flash" }, { stageRect: { height: 600, left: 0, top: 0, width: 800 } });
      const flashFrame = requireValue(layer.frame, "active flash target should expose frame state");
      assert(nearlyEqual(flashFrame.flash, 0), "flash phase should begin from the normal hover frame like the original overlay");
      stepFlashSegment();
      assert(flashFrame.flash > 0.99, "flash phase should reach the original first pulse peak after 135ms");
      stepFlashSegment();
      assert(flashFrame.flash < 0.01, "flash phase should dip after the original first pulse");
      stepFlashSegment();
      assert(flashFrame.flash > 0.84 && flashFrame.flash < 0.88, "flash phase should play the original softer second pulse");
      stepFlashSegment();
      assert(flashFrame.flash < 0.01, "flash pulse should settle back to the normal hover frame after the original four-step sequence");
      assert(layer.visible === true, "flash pulse should not hide the active hover layer");
    } finally {
      layer.destroy({ children: true });
      motionRuntime.reset();
    }
  }
}
