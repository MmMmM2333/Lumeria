import { ref } from "vue";
import { useFolderViewportMetrics } from "./useFolderViewportMetrics.js";

function makeVirtualElement(height, folderId) {
  return {
    __launchpadVirtualElementMeta: { folderId },
    clientHeight: height,
    offsetHeight: height,
    getBoundingClientRect: () => ({ height }),
  };
}

export function runFolderViewportMetricsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder viewport metrics test failed] ${message}`);
  };

  const folderViewportRef = ref(makeVirtualElement(320, "folder-small"));
  const renderedFolder = ref({ id: "folder-small" });
  const metrics = useFolderViewportMetrics({
    folderViewportRef,
    renderedFolder,
  });

  metrics.updateFolderViewportHeight();
  assert(metrics.folderViewportHeight.value === 320, "matching virtual folder viewport should update height");

  renderedFolder.value = { id: "folder-large" };
  metrics.resetFolderViewportMetrics();
  metrics.updateFolderViewportHeight();
  assert(metrics.folderViewportHeight.value === 0, "stale virtual folder viewport should not repopulate height after folder switch");

  folderViewportRef.value = makeVirtualElement(680, "folder-large");
  metrics.updateFolderViewportHeight();
  assert(metrics.folderViewportHeight.value === 680, "current virtual folder viewport should update after Pixi publishes the new ref");
}
