import { assertDesktopSceneFrame, makeDesktopSceneFrame } from "../../sceneFrame.js";
import { makeDesktopSceneRuntimeAdapter } from "../../sceneRuntime.js";
import {
  assertSceneEvent,
  makeAppLaunchCloseFrameCommittedEvent,
  makeControlledPointerInput,
  makeGroupReleaseCompleteEvent,
  makeIconPointerdownEvent,
} from "../../sceneEvents.js";

export function runSceneFrameTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi scene frame test failed] ${message}`);
  };

  const activePages = [[{ id: "app-1", metadata: { label: "App 1" } }]];
  const selectedAppIds = new Set(["app-1"]);
  const frame = makeDesktopSceneFrame({
    activePages,
    appLaunchCloseSessionId: 7,
    desktopVisualAlpha: 0.7,
    focusedIcon: { id: "app-1" },
    selectedAppIds,
  });
  const runtime = makeDesktopSceneRuntimeAdapter({
    domRefs: {},
    folderOverlayState: {},
    getDesktopPageRenderMode: () => "desktop",
    getIconTextureItems: () => [],
    getVisibleDesktopPage: (page) => page,
    iconBoundsRegistry: { name: "registry" },
    isFolderOpeningPreviewFrameGhosted: () => false,
    isIconOpening: () => false,
    setPageRef: () => {},
  });

  assert(frame.viewport.activePages !== activePages, "scene frame should snapshot mutable page collections");
  activePages.push([]);
  activePages[0][0].metadata.label = "Changed";
  selectedAppIds.add("app-2");
  assert(frame.viewport.activePages.length === 1, "later collection mutations should not alter a scene frame");
  assert(
    frame.viewport.activePages[0][0].metadata.label === "App 1",
    "scene frames should isolate nested records from later caller mutation"
  );
  assert(
    frame.interaction.selectedAppIds instanceof Set && !frame.interaction.selectedAppIds.has("app-2"),
    "scene frames should preserve Set read semantics while isolating the caller collection"
  );
  let setMutationThrew = false;
  try {
    frame.interaction.selectedAppIds.add("app-3");
  } catch (error) {
    setMutationThrew = error instanceof TypeError;
  }
  assert(setMutationThrew, "published scene-frame Sets should reject mutation");
  assert(Object.isFrozen(frame) && Object.isFrozen(frame.viewport), "scene frame containers should be immutable snapshots");
  assert(frame.visual.desktopVisualAlpha === 0.7, "scene frame should group visual state");
  assert(frame.visual.appLaunchCloseSessionId === 7, "scene frame should carry the active app-launch close session");
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

  let rejectedWrongInputType = false;
  try {
    makeDesktopSceneFrame({ activePageIndex: "0" });
  } catch (error) {
    rejectedWrongInputType = error instanceof TypeError;
  }
  assert(rejectedWrongInputType, "scene-frame construction should reject invalid field value types");

  const scrubFrame = makeDesktopSceneFrame({
    pageTrackScrub: {
      edge: false,
      fromIndex: 0,
      progress: 0.5,
      scope: "desktop",
      toIndex: 1,
    },
  });
  assert(
    scrubFrame.viewport.pageTrackScrub.edge === false,
    "scene-frame construction should accept the gesture engine's boolean edge marker"
  );

  let rejectedStringScrubEdge = false;
  try {
    makeDesktopSceneFrame({
      pageTrackScrub: {
        edge: "false",
        fromIndex: 0,
        progress: 0.5,
        scope: "desktop",
        toIndex: 1,
      },
    });
  } catch (error) {
    rejectedStringScrubEdge = error instanceof TypeError;
  }
  assert(rejectedStringScrubEdge, "scene-frame construction should reject non-boolean scrub edge markers");

  let rejectedMutableNestedFrame = false;
  try {
    assertDesktopSceneFrame(Object.freeze({
      ...frame,
      viewport: Object.freeze({
        ...frame.viewport,
        pageGridMeasureStyle: { height: "640px" },
      }),
    }));
  } catch (error) {
    rejectedMutableNestedFrame = error instanceof TypeError;
  }
  assert(rejectedMutableNestedFrame, "scene-frame validation should reject mutable nested contract values");

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

  const boundedEvent = makeIconPointerdownEvent(
    {
      currentTarget: {
        getBoundingClientRect: () => ({ height: 60, left: 30, top: 40, width: 50 }),
      },
      type: "pointerdown",
    },
    { id: "app-1" },
    { type: "desktop" }
  );
  const controlledInput = makeControlledPointerInput(boundedEvent.pointer, boundedEvent.control);
  const controlledRect = controlledInput.currentTarget.getBoundingClientRect();
  assert(
    controlledRect?.left === 30 &&
      controlledRect?.top === 40 &&
      controlledRect?.right === 80 &&
      controlledRect?.bottom === 100,
    "controlled pointer inputs should restore complete DOMRect edge semantics"
  );

  const releaseEvent = makeGroupReleaseCompleteEvent({
    actorKey: "item:app-1",
    entryId: "app-1",
    node: { fn: () => {} },
    outcome: "settled",
    planKey: "release-1",
    reason: null,
    runtimePlan: { internal: true },
  });
  assertSceneEvent(releaseEvent);
  assert(
    Object.keys(releaseEvent.payload).join(",") === "actorKey,entryId,outcome,planKey,reason" &&
      !Object.prototype.hasOwnProperty.call(releaseEvent.payload, "node") &&
      !Object.prototype.hasOwnProperty.call(releaseEvent.payload, "runtimePlan"),
    "group release events should expose only the semantic completion contract"
  );

  const appLaunchCommitEvent = makeAppLaunchCloseFrameCommittedEvent(7);
  assertSceneEvent(appLaunchCommitEvent);
  assert(
    appLaunchCommitEvent.type === "app-launch-close-frame-committed" && appLaunchCommitEvent.sessionId === 7,
    "scene events should publish the committed app-launch close session"
  );

  let rejectedUnknownEvent = false;
  try {
    assertSceneEvent({ type: "unknown-event" });
  } catch {
    rejectedUnknownEvent = true;
  }
  assert(rejectedUnknownEvent, "unknown scene events should fail explicitly");
}
