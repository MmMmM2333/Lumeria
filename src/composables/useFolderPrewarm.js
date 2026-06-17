export function getFirstFolderPageItems(folder) {
  if (Array.isArray(folder?.childPages)) return folder.childPages[0] || [];
  return Array.isArray(folder?.children) ? folder.children : [];
}

export function makeFolderPrewarmKey(folder, pageSize) {
  const firstPageItems = getFirstFolderPageItems(folder).slice(0, pageSize);
  return `${folder?.id || "folder"}:${firstPageItems.map((item) => item?.id || "").join(",")}`;
}

export function useFolderPrewarm(options) {
  const delayMs = options.delayMs ?? 80;
  const folderLimit = options.folderLimit ?? 4;
  const textureTimeoutMs = options.textureTimeoutMs ?? 80;
  const timerHost = options.timerHost || globalThis;
  const prewarmedFolderKeys = new Set();
  let folderPrewarmTimer = null;
  let folderPrewarmRequestId = 0;
  let folderPrewarmKey = null;

  function getFolderPageSize() {
    return Math.max(0, Number(options.getFolderPageSize?.()) || 0);
  }

  function canPrewarm() {
    return Boolean(options.canPrewarm?.()) && !options.shouldRunPixi?.();
  }

  function cancelFolderPrewarm() {
    folderPrewarmRequestId += 1;
    folderPrewarmKey = null;
    if (folderPrewarmTimer == null) return;
    timerHost.clearTimeout?.(folderPrewarmTimer);
    folderPrewarmTimer = null;
  }

  function clearPrewarmedFolderKeys() {
    prewarmedFolderKeys.clear();
  }

  function getPrewarmFolderCandidate() {
    const activePages = options.getActivePages?.();
    if (!canPrewarm() || !activePages || prewarmedFolderKeys.size >= folderLimit) return null;
    const page = activePages[options.getActivePageIndex?.() || 0] || [];
    const visibleItems = options.getVisibleDesktopPage?.(page) || [];
    return visibleItems.find((item) => {
      if (item?.type !== "folder") return false;
      const firstPageItems = getFirstFolderPageItems(item).slice(0, getFolderPageSize());
      const key = makeFolderPrewarmKey(item, getFolderPageSize());
      return firstPageItems.length && !prewarmedFolderKeys.has(key);
    }) || null;
  }

  function finishFolderPrewarmRequest(requestId) {
    if (requestId === folderPrewarmRequestId) folderPrewarmKey = null;
  }

  async function runFolderPrewarm(folder, requestId) {
    if (!folder || !canPrewarm()) {
      finishFolderPrewarmRequest(requestId);
      return false;
    }
    const firstPageItems = getFirstFolderPageItems(folder).slice(0, getFolderPageSize());
    await options.preloadIconTextures?.(firstPageItems, { timeoutMs: textureTimeoutMs });
    if (requestId !== folderPrewarmRequestId || !canPrewarm()) {
      finishFolderPrewarmRequest(requestId);
      return false;
    }
    const key = makeFolderPrewarmKey(folder, getFolderPageSize());
    const rendered = await options.renderPrewarm?.({ firstPageItems, folder, key });
    if (requestId !== folderPrewarmRequestId || !canPrewarm() || rendered === false) {
      finishFolderPrewarmRequest(requestId);
      return false;
    }
    prewarmedFolderKeys.add(key);
    finishFolderPrewarmRequest(requestId);
    scheduleFolderPrewarm();
    return true;
  }

  function scheduleFolderPrewarm(folderOverride = null, scheduleOptions = {}) {
    if (!canPrewarm()) return false;
    const folder = folderOverride || getPrewarmFolderCandidate();
    if (!folder) return false;
    const firstPageItems = getFirstFolderPageItems(folder).slice(0, getFolderPageSize());
    const nextKey = makeFolderPrewarmKey(folder, getFolderPageSize());
    if (!firstPageItems.length || prewarmedFolderKeys.has(nextKey) || folderPrewarmKey === nextKey) return false;
    cancelFolderPrewarm();
    folderPrewarmKey = nextKey;
    const requestId = folderPrewarmRequestId;
    folderPrewarmTimer = timerHost.setTimeout?.(() => {
      folderPrewarmTimer = null;
      void runFolderPrewarm(folder, requestId);
    }, scheduleOptions.delayMs ?? delayMs);
    return true;
  }

  return {
    cancelFolderPrewarm,
    clearPrewarmedFolderKeys,
    getPrewarmedFolderKeys: () => Array.from(prewarmedFolderKeys),
    scheduleFolderPrewarm,
  };
}
