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

export function reloadOnPixiHotUpdate(hot) {
  if (!hot) return;
  hot.accept(() => requestPixiHotReload());
}
