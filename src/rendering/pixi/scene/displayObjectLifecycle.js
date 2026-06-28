const pendingDeferredDestroys = new WeakSet();

export function detachDisplayObject(displayObject, parent = null) {
  if (!displayObject || displayObject.destroyed) return false;
  if (typeof displayObject.removeFromParent === "function" && displayObject.parent) {
    displayObject.removeFromParent();
    return true;
  }
  const owner = displayObject.parent || parent;
  if (typeof owner?.removeChild === "function") {
    owner.removeChild(displayObject);
    return true;
  }
  return false;
}

export function disableDisplayObjectForDestroy(displayObject) {
  if (!displayObject || displayObject.destroyed) return;
  displayObject.visible = false;
  displayObject.renderable = false;
  if ("eventMode" in displayObject) displayObject.eventMode = "none";
  if ("interactiveChildren" in displayObject) displayObject.interactiveChildren = false;
}

export function destroyDisplayObjectAfterFrame(displayObject, options = {}, scheduler = globalThis) {
  if (!displayObject || displayObject.destroyed || pendingDeferredDestroys.has(displayObject)) return false;
  pendingDeferredDestroys.add(displayObject);
  disableDisplayObjectForDestroy(displayObject);
  detachDisplayObject(displayObject);

  const destroy = () => {
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
