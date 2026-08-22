import { nextTick, ref, type Ref } from "vue";
import {
  getElementFromRef,
  type DomRefSource,
  type MeasurableElement,
} from "./usePageGridMetrics.js";

export type FolderViewportElement = MeasurableElement & {
  readonly __launchpadVirtualElementMeta?: Readonly<{ folderId: string | null }>;
};

export type FolderViewportMetricsOptions = Readonly<{
  folderViewportRef: DomRefSource<FolderViewportElement>;
  getRenderedFolder?: () => Readonly<{ id: string }> | null | undefined;
  renderedFolder?: Readonly<Ref<Readonly<{ id: string }> | null>>;
}>;

function roundPx(value: number): number {
  return Math.round(value * 100) / 100;
}

function getExpectedFolderId(options: FolderViewportMetricsOptions): string | null {
  const folder = options.getRenderedFolder?.() || options.renderedFolder?.value;
  return folder?.id || null;
}

function getVirtualElementFolderId(element: FolderViewportElement): string | null {
  return element?.__launchpadVirtualElementMeta?.folderId || null;
}

function isStaleFolderViewportElement(
  element: FolderViewportElement | null,
  options: FolderViewportMetricsOptions,
): boolean {
  if (!element || !("__launchpadVirtualElementMeta" in element)) return false;
  return getVirtualElementFolderId(element) !== getExpectedFolderId(options);
}

export function useFolderViewportMetrics(options: FolderViewportMetricsOptions) {
  const folderViewportHeight = ref(0);
  let folderViewportResizeObserver: ResizeObserver | null = null;
  let observedFolderViewportElement: FolderViewportElement | null = null;

  function updateFolderViewportHeight() {
    const element = getElementFromRef(options.folderViewportRef);
    if (isStaleFolderViewportElement(element, options)) return;
    // Ancestor panel animations use transforms; layout height avoids reading the scaled rect.
    const layoutHeight = element ? element.offsetHeight || element.clientHeight || element.getBoundingClientRect().height : 0;
    const nextHeight = roundPx(layoutHeight);
    if (Math.abs(folderViewportHeight.value - nextHeight) > 0.1) folderViewportHeight.value = nextHeight;
  }

  function scheduleFolderViewportMetrics() {
    nextTick(updateFolderViewportHeight);
  }

  function resetFolderViewportMetrics() {
    if (folderViewportHeight.value !== 0) folderViewportHeight.value = 0;
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

    if (
      element &&
      typeof ResizeObserver !== "undefined" &&
      typeof Element !== "undefined" &&
      element instanceof Element
    ) {
      folderViewportResizeObserver = new ResizeObserver(updateFolderViewportHeight);
      folderViewportResizeObserver.observe(element);
    }

    updateFolderViewportHeight();
  }

  return {
    disconnectFolderViewportObserver,
    folderViewportHeight,
    observeFolderViewport,
    resetFolderViewportMetrics,
    scheduleFolderViewportMetrics,
    updateFolderViewportHeight,
  };
}
