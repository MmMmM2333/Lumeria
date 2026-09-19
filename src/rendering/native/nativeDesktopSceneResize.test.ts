import assert from "node:assert/strict";
import { Container } from "pixi.js";
import { NativeDesktopScene } from "./NativeDesktopScene.js";
import { motionRuntime } from "../pixi/animation/motionRuntime.js";
import { ICON_BOUNDS_KIND, ICON_BOUNDS_VARIANT } from "../pixi/geometry/iconBoundsRegistry.js";
import type { IconNode } from "../pixi/nodes/IconNode.js";
import type { CompleteDesktopSceneFrame } from "../sceneFrame.js";
import { snapshotContractValue } from "../contractSnapshot.js";

export function runNativeDesktopResizeTests(baseFrame: CompleteDesktopSceneFrame): void {
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0;
  motionRuntime.reset();
  motionRuntime.suspendAutoTicker();
  const root = new Container();
  const subject = new NativeDesktopScene(root);
  const items = Array.from({ length: 48 }, (_, index) => ({
    id: `resize-regression-${index}`, name: `应用 ${index}`, emoji: "L", type: "app" as const,
  }));
  const snapshot = snapshotContractValue({ ...baseFrame,
    viewport: { ...baseFrame.viewport, activePages: [items], gridCols: 8, gridRows: 6 },
  }) as CompleteDesktopSceneFrame;
  let viewport = { width: 900, height: 600, resolution: 1 };
  const resize = (width: number, height: number) => {
    viewport = { width, height, resolution: 1 };
    subject.commit(snapshot, viewport, { snapDesktopLayout: true });
  };
  try {
    resize(900, 600);
    for (let frame = 0; frame < 180; frame++) motionRuntime.step(1 / 60);
    const measure = () => items.map(item => {
      const node = root.getChildByLabel(`launchpad-item:${item.id}`, true) as IconNode;
      assert.ok(node);
      const key = { area: "desktop", pageIndex: 0, id: item.id };
      const actual = node.getIconBounds({ left: 0, top: 0, width: viewport.width, height: viewport.height });
      const registered = subject.iconBoundsRegistry.getBounds(ICON_BOUNDS_KIND.LAUNCH, ICON_BOUNDS_VARIANT.RENDERED, key);
      assert.ok(actual && registered, "resized icons must retain registered launch bounds");
      assert.ok(Math.abs(actual.left - registered.left) < 0.01 && Math.abs(actual.top - registered.top) < 0.01,
        "registered hit/launch geometry must follow the rendered icon after resize");
      return { x: node.x, y: node.y, left: actual.left, top: actual.top };
    });
    resize(1200, 800);
    assert.equal(motionRuntime.hasActiveWork(), false,
      "synchronous resize bounds refresh must not leave a redundant animation-host frame");
    const direct = measure();
    resize(900, 600);
    for (let width = 904; width <= 1200; width += 4) resize(width, 600 + (width - 900) * 2 / 3);
    assert.deepEqual(measure(), direct, "small diagonal resize steps must match one direct resize for all 48 icons");
    for (let frame = 0; frame < 10; frame++) motionRuntime.step(1 / 60);
    assert.deepEqual(measure(), direct, "a later animation tick must not restore stale layout coordinates");
    resize(900, 600);
    resize(1200, 600);
    const horizontal = measure();
    resize(900, 600);
    for (let width = 901; width <= 1200; width++) resize(width, 600);
    assert.deepEqual(measure(), horizontal, "small horizontal resize steps must reach the same final node and bounds positions");
  } finally {
    subject.destroy(); root.destroy(); motionRuntime.reset(); motionRuntime.resumeAutoTicker();
    if (previousRaf) globalThis.requestAnimationFrame = previousRaf;
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
  }
}
