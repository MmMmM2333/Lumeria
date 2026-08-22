import { clearMotionPreferencesForTests, setReducedMotionForTests } from "../animation/motionPreferences.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { FolderClosingPreviewSwapController } from "./folderClosingPreviewSwapController.js";
import type {
  FolderClosingPreviewSwapContainer,
  FolderClosingPreviewSwapDisplayObject,
  FolderClosingPreviewSwapGraphics,
  FolderClosingPreviewSwapLayer,
  FolderClosingPreviewSwapPoint,
  FolderClosingPreviewSwapReporter,
  FolderClosingPreviewSwapStartOptions,
  FolderClosingPreviewSwapSprite,
  FolderClosingPreviewSwapState,
  FolderClosingPreviewSwapText,
} from "./folderClosingPreviewSwapController.js";
import type { ClosingPreviewSwapTarget } from "./folderOverlayTargets.js";
import type { FolderVisualReportStatus } from "./folderVisualSession.js";

type AssertTrue<Value extends true> = Value;
type PreviewSwapConstructorOptionsAreRequired = AssertTrue<
  undefined extends ConstructorParameters<typeof FolderClosingPreviewSwapController>[1] ? false : true
>;
type PreviewSwapStartOptionsAreRequired = AssertTrue<
  undefined extends Parameters<FolderClosingPreviewSwapController["start"]>[4] ? false : true
>;
type PreviewSwapReporterIsRequired = AssertTrue<
  undefined extends FolderClosingPreviewSwapStartOptions["reporter"] ? false : true
>;

function makePoint(): FolderClosingPreviewSwapPoint {
  return {
    x: 0,
    y: 0,
    set(x: number, y = x) {
      this.x = x;
      this.y = y;
    },
  };
}

function makeContainer(): FolderClosingPreviewSwapContainer {
  const children: FolderClosingPreviewSwapDisplayObject[] = [];
  const container: FolderClosingPreviewSwapContainer = {
    alpha: 1,
    children,
    destroyed: false,
    eventMode: "auto",
    parent: null,
    pivot: makePoint(),
    position: makePoint(),
    scale: makePoint(),
    x: 0,
    y: 0,
    addChild<T extends FolderClosingPreviewSwapDisplayObject>(child: T): T {
      child.parent?.removeChild?.(child);
      child.parent = container;
      children.push(child);
      return child;
    },
    removeChild<T extends FolderClosingPreviewSwapDisplayObject>(child: T): T {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      if (child.parent === container) child.parent = null;
      return child;
    },
    removeChildren(): FolderClosingPreviewSwapDisplayObject[] {
      const removed = children.splice(0);
      for (const child of removed) {
        if (child.parent === container) child.parent = null;
      }
      return removed;
    },
    removeFromParent() {
      container.parent?.removeChild(container);
    },
    destroy() {
      container.destroyed = true;
    },
  };
  return container;
}

type TestGraphics = FolderClosingPreviewSwapGraphics & {
  fillStyle: Readonly<{ alpha: number; color: number }> | null;
  rectArgs: Readonly<{ height: number; left: number; top: number; width: number }> | null;
};

function makeGraphics(): TestGraphics {
  const graphics: TestGraphics = {
    destroyed: false,
    fillStyle: null,
    parent: null,
    rectArgs: null,
    clear() {
      return graphics;
    },
    destroy() {
      graphics.destroyed = true;
    },
    fill(style: Readonly<{ alpha: number; color: number }>) {
      graphics.fillStyle = style;
      return graphics;
    },
    rect(left: number, top: number, width: number, height: number) {
      graphics.rectArgs = { height, left, top, width };
      return graphics;
    },
  };
  return graphics;
}

type TestLayer = FolderClosingPreviewSwapLayer & {
  closingPreviewSwapLayer: FolderClosingPreviewSwapContainer;
};

function makeLayer(): TestLayer {
  const layer: TestLayer = {
    closingPreviewSwapLayer: makeContainer(),
    ensureClosingPreviewSwapLayer(containerFactory: () => FolderClosingPreviewSwapContainer) {
      if (layer.closingPreviewSwapLayer.destroyed) {
        layer.closingPreviewSwapLayer = containerFactory();
      }
      return layer.closingPreviewSwapLayer;
    },
    removeClosingPreviewSwapChildren() {
      return layer.closingPreviewSwapLayer.removeChildren();
    },
  };
  return layer;
}

type TestReport = Readonly<{ key: string; phase: "complete" | "start"; status: FolderVisualReportStatus }>;
type TestReporter = FolderClosingPreviewSwapReporter & {
  readonly keys: Set<string>;
  readonly reports: TestReport[];
};

function makeReporter(options: Readonly<{ stale?: boolean }> = {}): TestReporter {
  const keys = new Set<string>();
  const reports: TestReport[] = [];
  return {
    keys,
    reports,
    previewComplete(key: string) {
      if (options.stale) return { status: "stale" };
      const status = keys.delete(key) ? "accepted" : "duplicate";
      reports.push({ key, phase: "complete", status });
      return { status };
    },
    previewStarted(key: string) {
      if (options.stale) return { status: "stale" };
      const status = keys.has(key) ? "duplicate" : "accepted";
      if (status === "accepted") keys.add(key);
      reports.push({ key, phase: "start", status });
      return { status };
    },
  };
}

function makeSprite(): FolderClosingPreviewSwapSprite {
  return {
    anchor: makePoint(),
    destroyed: false,
    destroy() {},
    height: 0,
    parent: null,
    texture: null,
    visible: true,
    width: 0,
  };
}

function makeText(size: number): FolderClosingPreviewSwapText {
  return {
    anchor: makePoint(),
    destroyed: false,
    destroy() {},
    parent: null,
    style: { fontSize: size, lineHeight: size },
    text: "",
    visible: true,
  };
}

function createController(layer: TestLayer = makeLayer()) {
  return {
    controller: new FolderClosingPreviewSwapController(layer, {
      containerFactory: makeContainer,
      getIconTexture: () => null,
      graphicsFactory: makeGraphics,
      spriteFactory: makeSprite,
      textFactory: makeText,
    }),
    layer,
  };
}

function makeState(): FolderClosingPreviewSwapState {
  return {
    folderPageIndex: 1,
    height: 600,
    renderedFolder: { id: "folder-1" },
    stageRect: { height: 600, left: 0, top: 0, width: 800 },
    width: 800,
  };
}

function makeTarget(left = 40, top = 50): ClosingPreviewSwapTarget {
  return {
    item: { id: "app-1", name: "App" },
    previewSlotIndex: 0,
    targetStageLayoutRect: { height: 24, left, top, width: 24 },
  };
}

function requireContainer(
  value: FolderClosingPreviewSwapDisplayObject | undefined,
  label: string,
): FolderClosingPreviewSwapContainer {
  if (!isContainer(value)) {
    throw new Error(`[Folder closing preview swap controller test fixture failed] Missing ${label}`);
  }
  return value;
}

function isContainer(
  value: FolderClosingPreviewSwapDisplayObject | undefined,
): value is FolderClosingPreviewSwapContainer {
  return value !== undefined && "position" in value && "addChild" in value;
}

export function runFolderClosingPreviewSwapControllerTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Folder closing preview swap controller test failed] ${message}`);
  };

  {
    let thrown: unknown = null;
    try {
      Reflect.construct(FolderClosingPreviewSwapController, [makeLayer()]);
    } catch (error) {
      thrown = error;
    }
    assert(/requires containerFactory\(\)/.test(String(thrown)), "preview swap controller should reject missing constructor capabilities explicitly");
  }

  {
    const { controller } = createController();
    let thrown: unknown = null;
    try {
      Reflect.apply(controller.start, controller, [
        makeState(),
        [makeTarget()],
        { iconDuration: 0.01, progress: 1 },
        () => {},
      ]);
    } catch (error) {
      thrown = error;
    }
    assert(/previewStarted/.test(String(thrown)), "preview swap should reject missing start options explicitly");
  }

  {
    const { controller } = createController();
    let thrown: unknown = null;
    try {
      Reflect.apply(controller.start, controller, [
        makeState(),
        [makeTarget()],
        { iconDuration: 0.01, progress: 1 },
        () => {},
        { reporter: { previewStarted: () => ({ status: "accepted" }) } },
      ]);
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

    const root = requireContainer(layer.closingPreviewSwapLayer.children[0], "preview root");
    controller.clear();
  assert((layer.closingPreviewSwapLayer.children.length as number) === 0, "clear should remove owned preview visuals");
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

    const root = requireContainer(layer.closingPreviewSwapLayer.children[0], "retarget preview root");
    const iconsWrap = requireContainer(root.children[1], "retarget icon wrapper");
    const ghost = requireContainer(iconsWrap.children[0], "retarget icon ghost");
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
