let reloadScheduled = false;

export function requestPixiHotReload() {
  if (reloadScheduled || typeof window === "undefined") return;
  reloadScheduled = true;
  const reload = () => window.location.reload();
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(reload);
    return;
  }
  reload();
}

export function disposePixiForHotReload(destroyPixi) {
  requestPixiHotReload();
  try {
    destroyPixi?.({ deep: false });
  } catch (error) {
    console.warn("[pixi-hmr] skipped deep destroy before reload", error);
  }
}

export function reloadOnPixiHotUpdate(hot) {
  if (!hot) return;
  hot.accept(() => requestPixiHotReload());
}
