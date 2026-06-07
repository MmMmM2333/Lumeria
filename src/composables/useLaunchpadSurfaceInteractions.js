const DESKTOP_SURFACE_IGNORED_SELECTOR = [
  ".page-dot",
  ".search-pill",
  ".settings-overlay",
  ".scan-result-overlay",
  ".app-edit-overlay",
  ".icon-chooser-overlay",
  ".warning-dialog-overlay",
  ".icon-context-menu-layer",
  "button",
  "input",
  "textarea",
  "select",
].join(", ");

export function useLaunchpadSurfaceInteractions(options) {
  function setPageRef(node, targetPageIndex) {
    if (!node) return;
    options.pageRefs[targetPageIndex] = node.$el || node;
  }

  function setFolderPageRef(node, targetPageIndex) {
    if (!node) return;
    options.folderPageRefs[targetPageIndex] = node.$el || node;
  }

  function handleDesktopSurfacePointerDown(event) {
    if (event?.button !== 0) return;
    if (!options.isDesktopOpen.value || options.isDragActive() || options.isAppLaunching.value) return;
    if (options.isFolderClosing?.value || options.isFolderAppLaunchClosing?.value) return;

    if (event.target?.closest?.(DESKTOP_SURFACE_IGNORED_SELECTOR)) return;

    options.closeDesktop({ clearSearch: true });
    options.hideNativeWindowAfterCloseAnimation();
  }

  function handleFolderOverlayPointerDown() {
    if (!options.isDragActive()) options.commitOpenFolder(null);
  }

  return {
    handleDesktopSurfacePointerDown,
    handleFolderOverlayPointerDown,
    setFolderPageRef,
    setPageRef,
  };
}
