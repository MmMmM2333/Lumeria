import {
  buildMotionOverlayItems,
  mapMotionOverlayTargetRect,
  resolveMotionOverlayLocalRect,
} from "./motionDebugOverlay.js";

function makeMatrix(offsetX = 0, offsetY = 0) {
  return {
    apply(point) {
      return {
        x: point.x + offsetX,
        y: point.y + offsetY,
      };
    },
  };
}

function makeTarget(offsetX = 0, offsetY = 0, extra = {}) {
  return {
    getGlobalTransform: () => makeMatrix(offsetX, offsetY),
    ...extra,
  };
}

export async function runMotionDebugOverlayTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion debug overlay test failed] ${message}`);
  };

  let resolverCalls = 0;
  const disabledItems = buildMotionOverlayItems({
    animations: [{ prop: "x", targetId: 1 }],
    targets: [{ sourceLabel: "desktop.icon.node", targetId: 1 }],
  }, {
    enabled: false,
    resolveTarget: () => {
      resolverCalls += 1;
      return makeTarget();
    },
  });
  assert(disabledItems.length === 0, "disabled overlay should not build drawable items");
  assert(resolverCalls === 0, "disabled overlay should not resolve live targets");

  const targetOne = makeTarget(100, 200, { iconSize: 64 });
  const targetTwo = makeTarget(20, 40);
  const resolvedIds = [];
  const report = {
    animations: [{
      lane: "base",
      laneKey: "layout",
      prop: "x",
      sourceLabel: "desktop.icon.node",
      targetId: 1,
      to: 132,
      value: 100,
    }, {
      lane: "base",
      laneKey: "layout",
      prop: "y",
      sourceLabel: "desktop.icon.node",
      targetId: 1,
      to: 196,
      value: 200,
    }, {
      lane: "base",
      laneKey: "fade",
      prop: "alpha",
      sourceLabel: "folder.panel",
      targetId: 2,
      to: 1,
      value: 0.5,
    }],
    targets: [{
      kind: "Icon",
      sourceLabel: "desktop.icon.node",
      targetId: 1,
      targetPart: "node",
    }, {
      height: 120,
      kind: "FolderPanel",
      sourceLabel: "folder.panel",
      targetId: 2,
      width: 160,
    }, {
      kind: "Icon",
      sourceLabel: "inactive.icon.node",
      targetId: 3,
    }],
    warnings: [{
      lane: "base",
      laneKey: "fade",
      prop: "alpha",
      targetId: 2,
      type: "missing-target-metadata",
    }],
  };

  const items = buildMotionOverlayItems(report, {
    enabled: true,
    resolveTarget: (targetId) => {
      resolvedIds.push(targetId);
      return targetId === 1 ? targetOne : targetTwo;
    },
  });

  assert(items.length === 2, "overlay should build one item per active target");
  assert(resolvedIds.join(",") === "1,2", "overlay should resolve active targets once and ignore inactive targets");
  assert(items[0].rect.left === 68 && items[0].rect.top === 168, "icon overlay rect should use centered icon size and global transform");
  assert(items[0].propSummary === "x,y", "overlay item should summarize active props");
  assert(items[0].vector?.to.x > items[0].vector.from.x, "x/y animations should expose a target direction vector");
  assert(items[1].hasWarning === true, "overlay item should inherit warning state for active target");

  const local = resolveMotionOverlayLocalRect(targetOne, { kind: "Icon" });
  assert(local.left === -32 && local.width === 64, "local rect should prefer live icon size");
  const mapped = mapMotionOverlayTargetRect(targetOne, local);
  assert(mapped.left === 68 && mapped.top === 168, "target rect mapping should use global transform without getBounds");

  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node.js" },
    });
  }
  const { MotionDebugOverlayLayer } = await import("./motionDebugOverlayLayer.js");
  let snapshotCalls = 0;
  let reportCalls = 0;
  const layer = new MotionDebugOverlayLayer({ maxItems: 4 });
  let drawnItems = null;
  layer.draw = (nextItems) => {
    drawnItems = nextItems;
  };
  layer.update({
    enabled: true,
    runtime: {
      debugReport: () => {
        reportCalls += 1;
        throw new Error("overlay should not request a debug report");
      },
      debugSnapshot: (options = {}) => {
        snapshotCalls += 1;
        assert(options.includeTargets === true, "overlay snapshot should request targets");
        return report;
      },
      resolveDebugTarget: (targetId) => (targetId === 1 ? targetOne : targetTwo),
    },
  });
  assert(snapshotCalls === 1, "overlay layer should read runtime debugSnapshot once");
  assert(reportCalls === 0, "overlay layer should not call runtime debugReport");
  assert(drawnItems?.length === 2, "overlay layer should draw items from the snapshot data");

  const textLayer = new MotionDebugOverlayLayer({ maxItems: 2 });
  const makeCountingLabel = () => {
    let text = "";
    let setCount = 0;
    return {
      get setCount() {
        return setCount;
      },
      get text() {
        return text;
      },
      set text(value) {
        setCount += 1;
        text = value;
      },
      position: { set() {} },
      visible: false,
    };
  };
  const firstLabel = makeCountingLabel();
  textLayer.getLabel = () => firstLabel;
  textLayer.draw([items[0]], { stageWidth: 400 });
  assert(firstLabel.setCount === 1, "overlay label should set text on first draw");
  textLayer.draw([items[0]], { stageWidth: 400 });
  assert(firstLabel.setCount === 1, "overlay label should not reset unchanged text");
  textLayer.draw([{ ...items[0], propSummary: "alpha" }], { stageWidth: 400 });
  assert(firstLabel.setCount === 2, "overlay label should update when badge text changes");
}
