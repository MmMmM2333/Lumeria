import {
  FOLDER_OVERLAY_STATE_RENDER_REF_KEYS,
  readFolderOverlayStateRenderDependencies,
} from "./folderOverlayStateDependencies.js";

export function runFolderOverlayStateDependenciesTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder overlay state dependencies test failed] ${message}`);
  };

  assert(Object.keys(readFolderOverlayStateRenderDependencies(null)).length === 0, "missing state should not expose dependencies");

  const reads = [];
  const state = {};
  for (const key of FOLDER_OVERLAY_STATE_RENDER_REF_KEYS) {
    Object.defineProperty(state, key, {
      configurable: true,
      value: Object.defineProperty({}, "value", {
        get() {
          reads.push(key);
          if (key === "folderPageIndex") return 2;
          if (key === "folderPageTrackScrub") return { progress: 0.5 };
          return key;
        },
      }),
    });
  }

  const dependencies = readFolderOverlayStateRenderDependencies(state);

  for (const key of FOLDER_OVERLAY_STATE_RENDER_REF_KEYS) {
    assert(reads.includes(key), `${key} should be read for Vue render scheduling`);
  }
  assert(dependencies.folderPageIndex === 2, "folder page index should resolve through refs");
  assert(dependencies.folderPageTrackScrub.progress === 0.5, "folder page scrub should resolve through refs");
}
