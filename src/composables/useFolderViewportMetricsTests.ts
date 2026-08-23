import { ref } from "vue";
import {
  useFolderViewportMetrics,
  type FolderViewportElement,
} from "./useFolderViewportMetrics.js";

function makeVirtualElement(height: number, folderId: string): FolderViewportElement {
  return {
    __launchpadVirtualElementMeta: { folderId },
    clientHeight: height,
    offsetHeight: height,
    getBoundingClientRect: () => ({ height }),
  };
}

function readRefValue<T>(source: Readonly<{ value: T }>): T {
  return source.value;
}

export function runFolderViewportMetricsTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Folder viewport metrics test failed] ${message}`);
  };

  const folderViewportRef = ref(makeVirtualElement(320, "folder-small"));
  const renderedFolder = ref({ id: "folder-small" });
  const metrics = useFolderViewportMetrics({
    folderViewportRef,
    renderedFolder,
  });

  metrics.updateFolderViewportHeight();
  assert(readRefValue(metrics.folderViewportHeight) === 320, "matching virtual folder viewport should update height");

  renderedFolder.value = { id: "folder-large" };
  metrics.resetFolderViewportMetrics();
  metrics.updateFolderViewportHeight();
  assert(readRefValue(metrics.folderViewportHeight) === 0, "stale virtual folder viewport should not repopulate height after folder switch");

  folderViewportRef.value = makeVirtualElement(680, "folder-large");
  metrics.updateFolderViewportHeight();
  assert(readRefValue(metrics.folderViewportHeight) === 680, "current virtual folder viewport should update after Pixi publishes the new ref");
}
