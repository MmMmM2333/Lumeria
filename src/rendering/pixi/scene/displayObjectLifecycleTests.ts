import {
  detachDisplayObject,
  destroyDisplayObjectAfterFrame,
} from "./displayObjectLifecycle.js";

interface TestDisplayObject {
  destroyed: boolean;
  destroy(options?: { children?: boolean }): void;
  destroyOptions: { children?: boolean } | null | undefined;
  eventMode: string;
  interactiveChildren: boolean;
  parent: TestDisplayObjectParent | null;
  removeFromParent(): void;
  renderable: boolean;
  visible: boolean;
}

interface TestDisplayObjectParent {
  children: TestDisplayObject[];
  removeChild(child: TestDisplayObject): TestDisplayObject;
}

function makeFrameScheduler() {
  const frames: FrameRequestCallback[] = [];
  return {
    requestAnimationFrame(callback: FrameRequestCallback) {
      frames.push(callback);
      return frames.length;
    },
    runFrame() {
      const callback = frames.shift();
      (callback as (() => void) | undefined)?.();
    },
    get frameCount() {
      return frames.length;
    },
  };
}

function makeParent(): TestDisplayObjectParent {
  return {
    children: [],
    removeChild(child: TestDisplayObject) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      if (child.parent === this) child.parent = null;
      return child;
    },
  };
}

function makeDisplayObject(): TestDisplayObject {
  return {
    destroyed: false,
    eventMode: "static",
    interactiveChildren: true,
    parent: null,
    renderable: true,
    visible: true,
    destroyOptions: null,
    removeFromParent() {
      this.parent?.removeChild?.(this);
    },
    destroy(options?: { children?: boolean }) {
      this.destroyOptions = options;
      this.destroyed = true;
    },
  };
}

export function runDisplayObjectLifecycleTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Display object lifecycle test failed] ${message}`);
  };

  {
    const parent = makeParent();
    const child = makeDisplayObject();
    child.parent = parent;
    parent.children.push(child);

    assert(detachDisplayObject(child) === true, "detach should use the object's parent relationship");
    assert(parent.children.length === 0, "detach should remove the object from its parent children");
    assert(child.parent === null, "detach should clear the parent relationship");
  }

  {
    const scheduler = makeFrameScheduler();
    const parent = makeParent();
    const child = makeDisplayObject();
    child.parent = parent;
    parent.children.push(child);

    assert(destroyDisplayObjectAfterFrame(child, { children: true }, scheduler) === true, "destroy should be scheduled");
    assert(parent.children.length === 0 && child.parent === null, "destroy should detach synchronously");
    assert(child.visible === false && child.renderable === false, "destroy should hide synchronously");
    assert(child.eventMode === "none" && child.interactiveChildren === false, "destroy should disable input synchronously");
    assert(child.destroyed === false, "destroy should wait for the next animation frame");
    assert(scheduler.frameCount === 1, "destroy should request one animation frame");
    assert(destroyDisplayObjectAfterFrame(child, { children: true }, scheduler) === false, "destroy should not schedule twice");

    scheduler.runFrame();
    assert((child.destroyed as boolean) === true, "destroy should run on the scheduled frame");
    assert(child.destroyOptions?.children === true, "destroy should pass through options");
  }
}
