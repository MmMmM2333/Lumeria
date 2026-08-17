import {
  makeDesktopSceneFrame,
  makeSceneEvent,
  readDesktopSceneFrameValue,
} from "../../sceneFrame.js";

export function runSceneFrameTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi scene frame test failed] ${message}`);
  };

  const activePages = [[{ id: "app-1" }]];
  const frame = makeDesktopSceneFrame({
    activePages,
    desktopVisualAlpha: 0.7,
    focusedIcon: { id: "app-1" },
    iconBoundsRegistry: { name: "registry" },
  });

  assert(frame.viewport.activePages === activePages, "scene frame should preserve viewport references");
  assert(frame.visual.desktopVisualAlpha === 0.7, "scene frame should group visual state");
  assert(frame.interaction.focusedIcon.id === "app-1", "scene frame should group interaction state");
  assert(frame.runtime.iconBoundsRegistry.name === "registry", "scene frame should group runtime services");
  assert(readDesktopSceneFrameValue(frame, "desktopVisualAlpha") === 0.7, "frame value lookup should resolve grouped values");
  assert(readDesktopSceneFrameValue(frame, "missing") === undefined, "frame value lookup should not invent missing values");

  const event = makeSceneEvent("icon-pointerdown", { id: "app-1", button: 0 });
  assert(event.type === "icon-pointerdown" && event.id === "app-1" && event.button === 0, "scene events should carry semantic payloads");
}
