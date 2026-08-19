import { assertDesktopSceneFrame, makeDesktopSceneFrame } from "../../sceneFrame.js";
import { makeDesktopSceneRuntimeAdapter } from "../../sceneRuntime.js";
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
  });
  const runtime = makeDesktopSceneRuntimeAdapter({
    domRefs: {},
    folderOverlayState: {},
    getDesktopPageRenderMode: () => "desktop",
    getVisibleDesktopPage: (page) => page,
    iconBoundsRegistry: { name: "registry" },
    isFolderOpeningPreviewFrameGhosted: () => false,
    isIconOpening: () => false,
    setPageRef: () => {},
  });

  assert(frame.viewport.activePages !== activePages, "scene frame should snapshot mutable page collections");
  activePages.push([]);
  assert(frame.viewport.activePages.length === 1, "later collection mutations should not alter a scene frame");
  assert(Object.isFrozen(frame) && Object.isFrozen(frame.viewport), "scene frame containers should be immutable snapshots");
  assert(frame.visual.desktopVisualAlpha === 0.7, "scene frame should group visual state");
  assert(frame.interaction.focusedIcon.id === "app-1", "scene frame should group interaction state");
  assert(runtime.iconBoundsRegistry.name === "registry", "scene runtime should hold mutable services");
  assert(!Object.prototype.hasOwnProperty.call(frame, "runtime"), "scene frame should not carry imperative runtime services");
  assert(!Object.prototype.hasOwnProperty.call(frame.folder, "folderOverlayState"), "folder frame should not carry Vue overlay state");
  assertDesktopSceneFrame(frame);

  let rejectedUnknownFrameField = false;
  try {
    assertDesktopSceneFrame(Object.freeze({
      ...frame,
      viewport: Object.freeze({ ...frame.viewport, unexpected: true }),
    }));
  } catch {
    rejectedUnknownFrameField = true;
  }
  assert(rejectedUnknownFrameField, "unknown scene-frame fields should fail explicitly");

  const event = makeIconPointerdownEvent(
    { type: "pointerdown" },
    { id: "app-1" },
    { type: "desktop" }
  );
  assertSceneEvent(event);
  assert(
    event.type === "icon-pointerdown" && event.item.id === "app-1" && event.source.type === "desktop",
    "scene events should carry semantic snapshots"
  );
  assert(Object.isFrozen(event) && Object.isFrozen(event.pointer), "scene events should be immutable");
  assert(!Object.prototype.hasOwnProperty.call(event, "event"), "scene events should not expose raw renderer events");

  let rejectedUnknownEvent = false;
  try {
    assertSceneEvent({ type: "unknown-event" });
  } catch {
    rejectedUnknownEvent = true;
  }
  assert(rejectedUnknownEvent, "unknown scene events should fail explicitly");
}
