import { nextTick, ref } from "vue";
import { getElementFromRef } from "./usePageGridMetrics.js";

function roundPx(value) {
  return Math.round(value * 100) / 100;
}

export function useFolderViewportMetrics(options) {
  const folderViewportHeight = ref(0);
  let folderViewportResizeObserver = null;
  let observedFolderViewportElement = null;

  function updateFolderViewportHeight() {
    const element = getElementFromRef(options.folderViewportRef);
    // Ancestor panel animations use transforms; layout height avoids reading the scaled rect.
    const layoutHeight = element ? element.offsetHeight || element.clientHeight || element.getBoundingClientRect().height : 0;
    const nextHeight = roundPx(layoutHeight);
    if (Math.abs(folderViewportHeight.value - nextHeight) > 0.1) folderViewportHeight.value = nextHeight;
  }

  function scheduleFolderViewportMetrics() {
    nextTick(updateFolderViewportHeight);
  }

  function disconnectFolderViewportObserver() {
    if (folderViewportResizeObserver) folderViewportResizeObserver.disconnect();
    folderViewportResizeObserver = null;
    observedFolderViewportElement = null;
  }

  function observeFolderViewport() {
    const element = getElementFromRef(options.folderViewportRef);
    if (element === observedFolderViewportElement) {
      updateFolderViewportHeight();
      return;
    }

    disconnectFolderViewportObserver();
    observedFolderViewportElement = element;

    const canObserveElement = element && typeof ResizeObserver !== "undefined" &&
      (typeof Element === "undefined" || element instanceof Element);
    if (canObserveElement) {
      folderViewportResizeObserver = new ResizeObserver(updateFolderViewportHeight);
      folderViewportResizeObserver.observe(element);
    }

    updateFolderViewportHeight();
  }

  return {
    disconnectFolderViewportObserver,
    folderViewportHeight,
    observeFolderViewport,
    scheduleFolderViewportMetrics,
    updateFolderViewportHeight,
  };
}
