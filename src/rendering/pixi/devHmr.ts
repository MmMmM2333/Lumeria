let reloadScheduled = false;

export function requestPixiHotReload(): void {
  if (reloadScheduled || typeof window === "undefined") return;
  reloadScheduled = true;
  const reload = () => window.location.reload();
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(reload);
    return;
  }
  reload();
}

export function disposePixiForHotReload(
  destroyPixi: ((options: { deep: boolean }) => void) | null | undefined,
): void {
  requestPixiHotReload();
  try {
    destroyPixi?.({ deep: false });
  } catch (error) {
    console.warn("[pixi-hmr] skipped deep destroy before reload", error);
  }
}

export function reloadOnPixiHotUpdate(
  hot: Pick<NonNullable<ImportMeta["hot"]>, "accept"> | null | undefined,
): void {
  if (!hot) return;
  hot.accept(() => requestPixiHotReload());
}
