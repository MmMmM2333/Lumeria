import { createDragRenderSnapshot } from "./dragRenderSnapshot.js";
import { isReleaseGhostLaunchItem } from "./scene/dragVisibility.js";

export function runDragRenderSnapshotTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi drag render snapshot test failed] ${message}`);
  };

  const item = { id: "app-a", type: "app" };
  const releaseState = { item, key: "release-a" };
  let releaseReads = 0;
  const source = {
    dragMeta: null,
    dragPreviewState: null,
    get dragReleaseState() {
      releaseReads += 1;
      return releaseReads === 1 ? releaseState : null;
    },
  };

  const releasing = createDragRenderSnapshot(source);
  assert(Object.isFrozen(releasing), "frame drag state should not be rewritten by individual scene layers");
  assert(releaseReads === 1, "release state should be read exactly once while composing a frame");
  assert(releasing.dragReleaseState === releaseState, "the preview layer should receive the captured release state");
  assert(releasing.dragReleaseGhostId === item.id, "real icon ghosting should derive from the same captured release state");

  const releaseRealVisible = !isReleaseGhostLaunchItem(item, releasing);
  const releasePreviewVisible = Boolean(releasing.dragReleaseState?.item);
  assert(releaseRealVisible !== releasePreviewVisible, "release frames should show exactly one owner of the dragged visual");

  const settled = createDragRenderSnapshot({});
  const settledRealVisible = !isReleaseGhostLaunchItem(item, settled);
  const settledPreviewVisible = Boolean(settled.dragReleaseState?.item);
  assert(settledRealVisible !== settledPreviewVisible, "settled frames should hand visibility back to the real icon without overlap");
}
