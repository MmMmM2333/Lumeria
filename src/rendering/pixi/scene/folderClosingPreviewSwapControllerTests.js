import { clearMotionPreferencesForTests, setReducedMotionForTests } from "../animation/motionPreferences.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { FolderClosingPreviewSwapController } from "./folderClosingPreviewSwapController.js";

function makePoint() {
  return {
    x: 0,
    y: 0,
    set(x, y = x) {
      this.x = x;
      this.y = y;
    },
  };
}

function makeContainer() {
  const children = [];
  return {
    alpha: 1,
    children,
    destroyed: false,
    pivot: makePoint(),
    position: makePoint(),
    scale: makePoint(),
    x: 0,
    y: 0,
    addChild(child) {
      child.parent?.removeChild?.(child);
      child.parent = this;
      children.push(child);
      return child;
    },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      if (child.parent === this) child.parent = null;
      return child;
    },
    removeChildren() {
      const removed = children.splice(0);
      for (const child of removed) {
        if (child.parent === this) child.parent = null;
      }
      return removed;
    },
    removeFromParent() {
      this.parent?.removeChild?.(this);
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function makeGraphics() {
  return {
    clear() {
      return this;
    },
    destroy() {
      this.destroyed = true;
    },
    fill(style) {
      this.fillStyle = style;
      return this;
    },
    rect(left, top, width, height) {
      this.rectArgs = { height, left, top, width };
      return this;
    },
  };
}

function makeLayer() {
  return {
    closingPreviewSwapLayer: makeContainer(),
    ensureClosingPreviewSwapLayer(containerFactory) {
      if (!this.closingPreviewSwapLayer || this.closingPreviewSwapLayer.destroyed) {
        this.closingPreviewSwapLayer = containerFactory();
      }
      return this.closingPreviewSwapLayer;
    },
    removeClosingPreviewSwapChildren() {
      return this.closingPreviewSwapLayer?.removeChildren?.() || [];
    },
  };
}

function makeReporter(options = {}) {
  const keys = new Set();
  const reports = [];
  return {
    keys,
    reports,
    previewComplete(key) {
      if (options.stale) return { status: "stale" };
      const status = keys.delete(key) ? "accepted" : "duplicate";
      reports.push({ key, phase: "complete", status });
      return { status };
    },
    previewStarted(key) {
      if (options.stale) return { status: "stale" };
      const status = keys.has(key) ? "duplicate" : "accepted";
      if (status === "accepted") keys.add(key);
      reports.push({ key, phase: "start", status });
      return { status };
    },
  };
}

function createController(layer = makeLayer()) {
  return {
    controller: new FolderClosingPreviewSwapController(layer, {
      containerFactory: makeContainer,
      getIconTexture: () => null,
      graphicsFactory: makeGraphics,
      spriteFactory: () => ({ anchor: makePoint(), visible: true }),
      textFactory: (size) => ({
        anchor: makePoint(),
        style: { fontSize: size, lineHeight: size },
        text: "",
        visible: true,
      }),
    }),
    layer,
  };
}

function makeState() {
  return {
    folderPageIndex: 1,
    height: 600,
    renderedFolder: { id: "folder-1" },
    stageRect: { left: 0, top: 0 },
    width: 800,
  };
}

function makeTarget(left = 40, top = 50) {
  return {
    item: { id: "app-1", name: "App" },
    previewSlotIndex: 0,
    targetStageLayoutRect: { height: 24, left, top, width: 24 },
  };
}

export function runFolderClosingPreviewSwapControllerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder closing preview swap controller test failed] ${message}`);
  };

  {
    const { controller } = createController();
    let thrown = null;
    try {
      controller.start(makeState(), [makeTarget()], { iconDuration: 0.01, progress: 1 }, () => {}, {
        reporter: { previewStarted: () => ({ status: "accepted" }) },
      });
    } catch (error) {
      thrown = error;
    }
    assert(/previewComplete/.test(String(thrown)), "preview adapter setup should reject reporters missing completion capability");
  }

  {
    const { controller, layer } = createController();
    assert(controller.ensureLayer() === layer.closingPreviewSwapLayer, "ensure should reuse the owned preview-swap layer");
    assert(controller.snapshot().activeKey === null, "an idle adapter snapshot should not expose coordinator state");
  }

  {
    const { controller, layer } = createController();
    const reporter = makeReporter();
    controller.start(makeState(), [makeTarget()], { iconDuration: 0.01, progress: 1 }, () => {}, { reporter });

    assert(reporter.keys.size === 1, "start should register preview participation through the closing reporter");
    assert(layer.closingPreviewSwapLayer.children.length === 1, "start should install one preview root");
    assert(controller.snapshot().activeKey?.startsWith("closing-preview-swap:folder-1"), "the adapter snapshot should expose its active presentation key");

    const root = layer.closingPreviewSwapLayer.children[0];
    controller.clear();
    assert(layer.closingPreviewSwapLayer.children.length === 0, "clear should remove owned preview visuals");
    assert(root.destroyed, "clear should destroy the removed preview tree");
    assert(reporter.keys.size === 1, "visual cleanup alone must not forge settlement reports");
  }

  {
    motionRuntime.reset();
    const { controller, layer } = createController();
    const reporter = makeReporter();
    let finished = 0;
    controller.start(makeState(), [makeTarget()], { iconDuration: 0.01, progress: 1 }, () => {
      finished += 1;
    }, { reporter });

    const root = layer.closingPreviewSwapLayer.children[0];
    const iconsWrap = root.children[1];
    const ghost = iconsWrap.children[0];
    const retargeted = controller.retarget(makeState(), [makeTarget(80, 90)]);

    assert(retargeted, "retarget should accept a changed active target");
    assert(layer.closingPreviewSwapLayer.children[0] === root, "retarget should reuse the active preview root");
    assert(iconsWrap.children[0] === ghost, "retarget should reuse the icon ghost for the same slot identity");
    assert(controller.snapshot().motionControlCount === 1, "retarget should replace the tracked aggregate motion owner");
    for (let remaining = 3; remaining > 0; remaining -= 0.05) motionRuntime.step(Math.min(0.05, remaining));
    assert(Math.abs(ghost.x - 92) < 0.5 && Math.abs(ghost.y - 102) < 0.5, "retarget should settle at the new target center");
    assert(finished === 1 && reporter.keys.size === 0, "completion should notify the caller and close reporter exactly once");
    assert(controller.snapshot().motionControlCount === 0, "completion should release aggregate motion ownership");
    controller.clear();
    motionRuntime.reset();
  }

  {
    const { controller, layer } = createController();
    const reporter = makeReporter({ stale: true });
    controller.start(makeState(), [makeTarget()], { iconDuration: 0.01, progress: 1 }, () => {}, { reporter });
    assert(layer.closingPreviewSwapLayer.children.length === 0, "a stale phase reporter should prevent installation of orphan preview visuals");
    assert(controller.snapshot().activeKey === null, "a stale phase reporter should leave the adapter idle");
  }

  {
    const { controller } = createController();
    const reporter = makeReporter();
    let finished = 0;
    setReducedMotionForTests(true);
    try {
      controller.start(makeState(), [makeTarget()], { iconDuration: 0.01, progress: 1 }, () => {
        finished += 1;
      }, { reporter });
    } finally {
      clearMotionPreferencesForTests();
    }

    assert(finished === 1, "synchronous reduced-motion preview should complete once");
    assert(reporter.keys.size === 0, "synchronous completion should settle its registered preview key");
    assert(controller.snapshot().motionControlCount === 0, "synchronous completion must not retain a stale motion owner");
    motionRuntime.reset();
  }
}
