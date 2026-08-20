import {
  getIconVisualStateFields,
  makeIconVisualState,
} from "./iconVisualState.js";

function makeState(overrides = {}) {
  return {
    area: null,
    batchSelected: false,
    cellHeight: 80,
    cellWidth: 96,
    compact: false,
    dragging: false,
    draggable: true,
    dropTarget: false,
    editing: false,
    focused: false,
    folderHoverState: null,
    folderPreviewPageSize: 9,
    folderPreviewRelease: false,
    ghosted: false,
    hasCustomIcon: false,
    iconSize: 64,
    interactionPhase: null,
    interactive: true,
    item: { id: "app-a", type: "app" },
    jiggleSeed: 0,
    launchTargetStatus: null,
    opening: false,
    preserveNodeScale: false,
    removable: true,
    revealLabelAfterVisualHandoff: false,
    selectedChildCount: 0,
    singleLineLabel: false,
    source: { type: "page", pageIndex: 0, index: 0 },
    stageHeight: 720,
    stageWidth: 1280,
    suppressFolderThumbFrame: false,
    suppressedFolderPreviewChildIds: [],
    suppressLabelRevealAfterGhost: false,
    textless: false,
    visualSpecTransition: null,
    ...overrides,
  };
}

export function runIconVisualStateTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Icon visual state test failed] ${message}`);
  };

  const state = makeIconVisualState(makeState());
  assert(Object.isFrozen(state), "constructed states should be immutable");
  assert(
    Object.keys(state).length === getIconVisualStateFields().length,
    "the public field list should match the exact runtime contract",
  );

  for (const invalid of [
    (() => {
      const value = makeState();
      delete value.iconSize;
      return value;
    })(),
    makeState({ legacyFlag: true }),
  ]) {
    let rejected = false;
    try {
      makeIconVisualState(invalid);
    } catch (error) {
      rejected = error instanceof TypeError;
    }
    assert(rejected, "missing and legacy extra fields should fail explicitly");
  }
}
