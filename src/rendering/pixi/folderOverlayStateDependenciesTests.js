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
          if (key === "folderPageTurnRequest") return { token: 7, targetIndex: 3 };
          if (key === "folderPageTrackScrub") return { progress: 0.5 };
          if (key === "folderOpenProgress") return 0.42;
          if (key === "folderOpenProgressTarget") return 1;
          if (key === "visualFolderPageIndex") return 3;
          return key;
        },
      }),
    });
  }
  for (const key of ["dragMeta", "dragReleaseState"]) {
    Object.defineProperty(state, key, {
      configurable: true,
      value: Object.defineProperty({}, "value", {
        get() {
          reads.push(key);
          return { item: { id: "app-a" } };
        },
      }),
    });
  }

  const dependencies = readFolderOverlayStateRenderDependencies(state);

  for (const key of FOLDER_OVERLAY_STATE_RENDER_REF_KEYS) {
    assert(reads.includes(key), `${key} should be read for Vue render scheduling`);
  }
  assert(dependencies.folderPageIndex === 2, "folder page index should resolve through refs");
  assert(dependencies.visualFolderPageIndex === 3, "visual folder page index should resolve through refs");
  assert(dependencies.folderOpenProgress === 0.42, "folder open progress should resolve through refs");
  assert(dependencies.folderOpenProgressTarget === 1, "folder open progress target should resolve through refs");
  assert(dependencies.folderPageTurnRequest.token === 7, "folder page turn request should resolve through refs");
  assert(dependencies.folderPageTrackScrub.progress === 0.5, "folder page scrub should resolve through refs");
  assert(!reads.includes("dragMeta"), "folder overlay scheduling should not read drag meta through a second reactive path");
  assert(!reads.includes("dragReleaseState"), "folder overlay scheduling should not read release state ahead of the frame-level drag snapshot");
}
