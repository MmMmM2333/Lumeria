import { assertDesktopSceneFrame, makeDesktopSceneFrame } from "../../sceneFrame.js";
import {
  assertSceneEvent,
  makeIconPointerdownEvent,
} from "../../sceneEvents.js";

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
  assertDesktopSceneFrame(frame);

  const event = makeIconPointerdownEvent(
    { type: "pointerdown" },
    { id: "app-1" },
    "desktop"
  );
  assertSceneEvent(event);
  assert(event.type === "icon-pointerdown" && event.item.id === "app-1" && event.source === "desktop", "scene events should carry semantic payloads");

  let rejectedUnknownEvent = false;
  try {
    assertSceneEvent({ type: "unknown-event" });
  } catch {
    rejectedUnknownEvent = true;
  }
  assert(rejectedUnknownEvent, "unknown scene events should fail explicitly");
}
