import { FolderClosingPreviewSwapController } from "./folderClosingPreviewSwapController.js";
import { clearMotionPreferencesForTests, setReducedMotionForTests } from "../animation/motionPreferences.js";
import { motionRuntime } from "../animation/motionRuntime.js";

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
    destroyed: false,
    clear() {
      return this;
    },
    rect(left, top, width, height) {
      this.rectArgs = { height, left, top, width };
      return this;
    },
    fill(style) {
      this.fillStyle = style;
      return this;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function makeSprite() {
  return {
    anchor: makePoint(),
    visible: true,
  };
}

function makeText(size) {
  return {
    anchor: makePoint(),
    style: { fontSize: size, lineHeight: size },
    text: "",
    visible: true,
  };
}

function makeLayer() {
  const children = [];
  return {
    children,
    closingGhostLayer: makeContainer(),
    closingPreviewSwapLayer: makeContainer(),
    ensureClosingPreviewSwapLayer(containerFactory) {
      if (this.closingPreviewSwapLayer && !this.closingPreviewSwapLayer.destroyed) return this.closingPreviewSwapLayer;
      this.closingPreviewSwapLayer = containerFactory();
      return this.closingPreviewSwapLayer;
    },
    removeClosingPreviewSwapChildren() {
      if (!this.closingPreviewSwapLayer || this.closingPreviewSwapLayer.destroyed) return [];
      return this.closingPreviewSwapLayer.removeChildren();
    },
    addChild(child) {
      child.parent?.removeChild?.(child);
      child.parent = this;
      children.push(child);
      return child;
    },
    addChildAt(child, index) {
      child.parent?.removeChild?.(child);
      child.parent = this;
      children.splice(index, 0, child);
      return child;
    },
  };
}

function createController(layer = makeLayer()) {
  const controller = new FolderClosingPreviewSwapController(layer, {
    containerFactory: makeContainer,
    getIconTexture: () => null,
    graphicsFactory: makeGraphics,
    spriteFactory: makeSprite,
    textFactory: makeText,
  });
  return { controller, layer };
}

export function runFolderClosingPreviewSwapControllerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder closing preview swap controller test failed] ${message}`);
  };

  {
    const { controller, layer } = createController();
    const swapLayer = controller.ensureLayer();
    assert(swapLayer === layer.closingPreviewSwapLayer, "ensure should reuse the existing swap layer");
    assert(controller.handoffCoordinator.getPreviewSwapKeys() instanceof Set, "ensure should initialize preview swap keys");
  }

  {
    const { controller, layer } = createController();
    const ghost = makeContainer();
    layer.closingPreviewSwapLayer.addChild(ghost);
    controller.handoffCoordinator.trackClosePreviewSwap("swap");
    controller.clear();
    assert(controller.handoffCoordinator.getPreviewSwapKeys().size === 0, "clear should reset preview swap keys");
    assert(layer.closingPreviewSwapLayer.children.length === 0, "clear should remove swap visuals");
    assert(ghost.destroyed, "clear should destroy swap children");
  }

  {
    const { controller, layer } = createController();
    const state = {
      folderPageIndex: 1,
      renderedFolder: { id: "folder-1" },
      stageRect: { left: 0, top: 0 },
    };
    controller.start(state, [{
      item: { id: "app-1", name: "App" },
      previewSlotIndex: 0,
      targetStageLayoutRect: { height: 24, left: 40, top: 50, width: 24 },
    }], { iconDuration: 0.01, progress: 1, swapDuration: 0.01 }, () => {});

    assert(controller.handoffCoordinator.getPreviewSwapKeys().size === 1, "start should track an active preview swap");
    assert(layer.closingPreviewSwapLayer.children.length === 1, "start should add the swap root to the layer");
    controller.clear();
  }

  {
    motionRuntime.reset();
    const { controller, layer } = createController();
    const state = {
      folderPageIndex: 1,
      height: 600,
      renderedFolder: { id: "folder-1" },
      stageRect: { left: 0, top: 0 },
      width: 800,
    };
    let finished = 0;
    controller.start(state, [{
      item: { id: "app-1", name: "App" },
      previewSlotIndex: 0,
      targetStageLayoutRect: { height: 24, left: 40, top: 50, width: 24 },
    }], { iconDuration: 0.01, progress: 1, swapDuration: 0.01 }, () => {
      finished += 1;
    });

    const root = layer.closingPreviewSwapLayer.children[0];
    const iconsWrap = root.children[1];
    const ghost = iconsWrap.children[0];
    const retargeted = controller.retarget(state, [{
      item: { id: "app-1", name: "App" },
      previewSlotIndex: 0,
      targetStageLayoutRect: { height: 24, left: 80, top: 90, width: 24 },
    }]);

    assert(retargeted === true, "retarget should accept updated active preview swap targets");
    assert(layer.closingPreviewSwapLayer.children[0] === root, "retarget should reuse the active preview swap root");
    assert(iconsWrap.children[0] === ghost, "retarget should reuse existing preview icon ghosts");
    assert(controller.handoffCoordinator.snapshot().previewSwapMotionControlCount === 1, "retarget should replace the tracked preview swap motion control");
    for (let remaining = 3; remaining > 0; remaining -= 0.05) motionRuntime.step(Math.min(0.05, remaining));
    assert(Math.abs(ghost.x - 92) < 0.5 && Math.abs(ghost.y - 102) < 0.5, "retarget should settle the preview icon at the new target center");
    assert(finished === 1, "retargeted preview swap should complete once");
    controller.clear();
    motionRuntime.reset();
  }

  {
    const { controller, layer } = createController();
    const state = {
      folderPageIndex: 1,
      height: 600,
      renderedFolder: { id: "folder-1" },
      stageRect: { left: 0, top: 0 },
      width: 800,
    };
    let finished = 0;

    setReducedMotionForTests(true);
    try {
      controller.start(state, [{
        item: { id: "app-1", name: "App" },
        previewSlotIndex: 0,
        targetStageLayoutRect: { height: 24, left: 40, top: 50, width: 24 },
      }], { iconDuration: 0.01, progress: 1, swapDuration: 0.01 }, () => {
        finished += 1;
      });
    } finally {
      clearMotionPreferencesForTests();
    }

    assert(finished === 1, "synchronous reduced-motion preview swap should finish once");
    assert(controller.handoffCoordinator.getPreviewSwapKeys().size === 0, "synchronous reduced-motion preview swap should clear its active key");
    assert(controller.handoffCoordinator.snapshot().previewSwapMotionControlCount === 0, "synchronous reduced-motion preview swap should not register a stale motion control");
  }

  {
    const { controller, layer } = createController();
    const root = makeContainer();
    const iconsWrap = makeContainer();
    let finished = false;
    controller.handoffCoordinator.trackClosePreviewSwap("swap-key");

    controller.complete({}, "swap-key", root, iconsWrap, () => {
      finished = true;
    });

    assert(!controller.handoffCoordinator.hasClosePreviewSwap("swap-key"), "complete should remove the active key");
    assert(finished, "complete should notify the closing controller");
    assert(root.alpha === 1, "complete should restore root alpha");
  }
}
