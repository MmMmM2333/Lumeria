import { FolderClosingPreviewSwapController } from "./folderClosingPreviewSwapController.js";
import { clearMotionPreferencesForTests, setReducedMotionForTests } from "../animation/motionPreferences.js";

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
      children.push(child);
      return child;
    },
    removeChildren() {
      return children.splice(0);
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function makeGraphics() {
  return {
    destroyed: false,
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
    addChild(child) {
      children.push(child);
      return child;
    },
    addChildAt(child, index) {
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
    assert(layer.closingPreviewSwapKeys instanceof Set, "ensure should initialize preview swap keys");
  }

  {
    const { controller, layer } = createController();
    const ghost = makeContainer();
    layer.closingPreviewSwapLayer.addChild(ghost);
    layer.closingPreviewSwapKeys.add("swap");
    controller.clear();
    assert(layer.closingPreviewSwapKeys.size === 0, "clear should reset preview swap keys");
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

    assert(layer.closingPreviewSwapKeys.size === 1, "start should track an active preview swap");
    assert(layer.closingPreviewSwapLayer.children.length === 1, "start should add the swap root to the layer");
    controller.clear();
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
    assert(layer.closingPreviewSwapKeys.size === 0, "synchronous reduced-motion preview swap should clear its active key");
    assert(!layer.closingPreviewSwapMotionControls?.size, "synchronous reduced-motion preview swap should not register a stale motion control");
  }

  {
    const { controller, layer } = createController();
    const root = makeContainer();
    const iconsWrap = makeContainer();
    let finished = false;
    layer.closingPreviewSwapKeys.add("swap-key");

    controller.complete({}, "swap-key", root, iconsWrap, () => {
      finished = true;
    });

    assert(!layer.closingPreviewSwapKeys.has("swap-key"), "complete should remove the active key");
    assert(finished, "complete should notify the closing controller");
    assert(root.alpha === 1, "complete should restore root alpha");
  }
}
