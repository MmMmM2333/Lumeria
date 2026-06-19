import { resolveDesktopBoundsTargets, resolveFolderPreviewChildBoundsTargets } from "./desktopBoundsTargets.js";

function makeMatrix(transform) {
  return {
    apply(point) {
      return transform(point);
    },
  };
}

function makeRegistration() {
  return {
    deviceResolution: 2,
    height: 100,
    stageRect: { height: 100, left: 0, top: 0, width: 100 },
    width: 100,
  };
}

function makeNode() {
  return {
    getFolderThumbBounds: () => ({ height: 10, left: 10.26, top: 20.74, width: 10 }),
    getIconBounds: () => ({ height: 10, left: 5.26, top: 7.74, width: 10 }),
  };
}

export function runDesktopBoundsTargetsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Desktop bounds targets test failed] ${message}`);
  };
  const nearlyEqual = (a, b) => Math.abs(a - b) < 0.0001;

  {
    const targets = resolveDesktopBoundsTargets({
      item: { id: "app-1", type: "app" },
      node: makeNode(),
      registration: makeRegistration(),
      sizing: { iconSize: 10 },
      targetX: 0,
      visualOffsetY: 0,
      visualRoot: {
        getGlobalTransform: () => makeMatrix(({ x, y }) => ({ x: x + 0.26, y: y + 0.74 })),
      },
      x: 20,
      y: 30,
    });

    assert(targets.renderedClientThumbBounds === null, "app targets should not include folder thumb bounds");
    assert(targets.coordinateSpace === "client-visual", "desktop bounds targets should identify client visual coordinates");
    assert(targets.liveClientTargetBounds.left === 15.26, "app live target should preserve unsnapped container bounds");
    assert(targets.stableProjectedClientTargetBounds.left === 15, "app stable target should preserve unsnapped projected stage bounds");
    assert(targets.stableStageLayoutTargetBounds.left === 15, "app stable target should expose the stage layout rect");
    assert(targets.renderedClientIconBounds.left === 5.26, "app icon bounds should not be snapped");
    assert(targets.syncHandoffLayoutTarget === null, "app targets should not request handoff sync");
  }

  {
    const targets = resolveDesktopBoundsTargets({
      item: { id: "folder-1", type: "folder" },
      node: makeNode(),
      registration: makeRegistration(),
      sizing: { iconSize: 10 },
      targetX: 0,
      visualOffsetY: 0,
      visualRoot: {
        getGlobalTransform: () => makeMatrix(({ x, y }) => ({ x: x + 0.26, y: y + 0.74 })),
      },
      x: 20,
      y: 30,
    });

    assert(targets.liveClientTargetBounds.left === 15.5, "folder live target should snap to the device grid");
    assert(targets.liveClientTargetBounds.top === 25.5, "folder live target y should snap to the device grid");
    assert(targets.stableProjectedClientTargetBounds.left === 15, "folder stable target should stay aligned to the projected stable grid");
    assert(targets.stableStageLayoutTargetBounds.left === 15, "folder stable target should expose the stage layout rect");
    assert(targets.renderedClientThumbBounds.left === 10.5, "folder thumb bounds should snap to the device grid");
    assert(targets.renderedClientIconBounds.left === 5.5, "folder icon bounds should snap to the device grid");
  }

  {
    const handoffLayoutTarget = { scaleX: 1.2, scaleY: 1.1, x: 44, y: 55 };
    const targets = resolveDesktopBoundsTargets({
      handoffLayoutTarget,
      isFolderClosingHandoff: true,
      item: { id: "folder-1", type: "folder" },
      node: makeNode(),
      registration: makeRegistration(),
      sizing: { iconSize: 10 },
      targetX: 0,
      visualOffsetY: 0,
      visualRoot: {
        getGlobalTransform: () => makeMatrix(({ x, y }) => ({ x: x + 0.26, y: y + 0.74 })),
      },
      x: 20,
      y: 30,
    });

    assert(targets.liveClientTargetBounds.left === targets.stableProjectedClientTargetBounds.left, "handoff folder should use projected stable bounds as live target");
    assert(targets.liveClientTargetBounds.top === targets.stableProjectedClientTargetBounds.top, "handoff folder should pin live y to projected stable target");
    assert(targets.syncHandoffLayoutTarget === handoffLayoutTarget, "handoff folder should request node sync to the handoff layout target");
  }

  {
    const targets = resolveDesktopBoundsTargets({
      isFolderClosingHandoff: true,
      item: { id: "folder-1", type: "folder" },
      node: makeNode(),
      registration: makeRegistration(),
      sizing: { iconSize: 10 },
      targetX: 0,
      visualOffsetY: 0,
      visualRoot: {},
      x: 20,
      y: 30,
    });

    assert(targets.syncHandoffLayoutTarget.x === 20 && targets.syncHandoffLayoutTarget.y === 30, "handoff sync should fall back to the stable layout target");
  }

  {
    const targets = resolveFolderPreviewChildBoundsTargets({
      node: {
        getFolderPreviewChildBounds: (stageRect, slotIndex) => (
          stageRect.left === 10 && slotIndex === 4
            ? { height: 8, left: 30, top: 40, width: 8 }
            : null
        ),
      },
      slotIndex: 4,
      stageRect: { height: 100, left: 10, top: 20, width: 100 },
      target: {
        liveThumbRect: { height: 72, left: 14, top: 24, width: 72 },
        stableStageLayoutThumbRect: { height: 90, left: 10, top: 20, width: 90 },
      },
    });

    assert(targets.renderedClientBounds.left === 30, "folder preview child bounds should use the rendered node rect");
    assert(targets.coordinateSpace === "client-visual", "folder preview targets should identify client visual coordinates");
    assert(nearlyEqual(targets.liveClientTargetBounds.left, 41), "folder preview live target should be projected from the live thumb rect");
    assert(nearlyEqual(targets.stableStageLayoutTargetBounds.left, 43.75), "folder preview stable target should expose the stage layout projection");
    assert(!("stableClientTargetBounds" in targets), "folder preview stable client target should not be exposed");
  }

  {
    const targets = resolveFolderPreviewChildBoundsTargets({
      node: {},
      slotIndex: 0,
      stageRect: { height: 100, left: 0, top: 0, width: 100 },
    });

    assert(targets.renderedClientBounds === null, "missing node bounds should stay nullable");
    assert(targets.liveClientTargetBounds === null, "missing live thumb target should stay nullable");
    assert(!("stableClientTargetBounds" in targets), "missing stable thumb target should not expose a client fallback");
  }
}
