export interface DisplayObjectLifecycleTarget {
  destroyed?: boolean;
  destroy?(options?: unknown): unknown;
  eventMode?: unknown;
  interactiveChildren?: boolean;
  parent?: unknown;
  removeFromParent?(): unknown;
  renderable?: boolean;
  visible?: boolean;
}

export interface DisplayObjectDestroyScheduler {
  requestAnimationFrame?(callback: FrameRequestCallback): number;
}

interface DisplayObjectRemovalOwner {
  removeChild(child: DisplayObjectLifecycleTarget): unknown;
}

const pendingDeferredDestroys = new WeakSet<object>();

export function detachDisplayObject(
  displayObject: DisplayObjectLifecycleTarget | null | undefined,
  parent: unknown = null,
): boolean {
  if (!displayObject || displayObject.destroyed) return false;
  if (typeof displayObject.removeFromParent === "function" && displayObject.parent) {
    displayObject.removeFromParent();
    return true;
  }
  const owner = displayObject.parent || parent;
  if (typeof (owner as DisplayObjectRemovalOwner | null | undefined)?.removeChild === "function") {
    (owner as DisplayObjectRemovalOwner).removeChild(displayObject);
    return true;
  }
  return false;
}

export function disableDisplayObjectForDestroy(
  displayObject: DisplayObjectLifecycleTarget | null | undefined,
): void {
  if (!displayObject || displayObject.destroyed) return;
  displayObject.visible = false;
  displayObject.renderable = false;
  if ("eventMode" in displayObject) displayObject.eventMode = "none";
  if ("interactiveChildren" in displayObject) displayObject.interactiveChildren = false;
}

export function destroyDisplayObjectAfterFrame(
  displayObject: DisplayObjectLifecycleTarget | null | undefined,
  options: unknown = {},
  scheduler: DisplayObjectDestroyScheduler | null | undefined = globalThis,
): boolean {
  if (!displayObject || displayObject.destroyed || pendingDeferredDestroys.has(displayObject)) return false;
  pendingDeferredDestroys.add(displayObject);
  disableDisplayObjectForDestroy(displayObject);
  detachDisplayObject(displayObject);

  const destroy = (): void => {
    pendingDeferredDestroys.delete(displayObject);
    if (!displayObject.destroyed) displayObject.destroy?.(options);
  };

  if (typeof scheduler?.requestAnimationFrame === "function") {
    scheduler.requestAnimationFrame(destroy);
  } else {
    destroy();
  }
  return true;
}
