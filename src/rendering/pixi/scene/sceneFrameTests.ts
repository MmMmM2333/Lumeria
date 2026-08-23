import {
  assertCompleteDesktopSceneFrame,
  assertDesktopSceneFrame,
  makeDesktopSceneFrame,
} from "../../sceneFrame.js";
import { makeDesktopSceneRuntimeAdapter } from "../../sceneRuntime.js";
import { createIconBoundsRegistry } from "../geometry/iconBoundsRegistry.js";
import {
  assertSceneEvent,
  makeAppLaunchCloseFrameCommittedEvent,
  makeControlledPointerInput,
  makeGroupReleaseCompleteEvent,
  makeIconPointerdownEvent,
} from "../../sceneEvents.js";

type MutableSceneFrameTestItem = {
  id: string;
  metadata: { label: string };
};

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(`[Pixi scene frame test setup failed] ${message}`);
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new Error(`[Pixi scene frame test setup failed] ${message}`);
  }
  return value;
}

export function runSceneFrameTests(): void {
  const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(`[Pixi scene frame test failed] ${message}`);
  };

  const activePages: MutableSceneFrameTestItem[][] = [[{ id: "app-1", metadata: { label: "App 1" } }]];
  const selectedAppIds = new Set(["app-1"]);
  const iconBoundsRegistry = createIconBoundsRegistry();
  const frame = makeDesktopSceneFrame({
    activePages,
    appLaunchCloseSessionId: 7,
    desktopVisualAlpha: 0.7,
    focusedIcon: { id: "app-1" },
    selectedAppIds,
  });
  const runtime = makeDesktopSceneRuntimeAdapter({
    completeProvisionalFolderRollback: () => true,
    domRefs: {},
    folderOverlayState: {
      renderedFolder: { value: null },
      renameFolder: () => {},
    },
    getDesktopPageRenderMode: () => "empty",
    getIconTextureItems: () => [],
    getVisibleDesktopPage: (page: unknown) => page,
    iconBoundsRegistry,
    isFolderOpeningPreviewFrameGhosted: () => false,
    isIconOpening: () => false,
    setPageRef: () => {},
  });

  const frameActivePages = requireValue(frame.viewport.activePages, "scene frame should expose active pages");
  const mutableFirstPage = requireValue(activePages[0], "mutable input should contain its first page");
  const mutableFirstItem = requireValue(mutableFirstPage[0], "mutable input should contain its first item");
  assert(frameActivePages !== activePages, "scene frame should snapshot mutable page collections");
  activePages.push([]);
  mutableFirstItem.metadata.label = "Changed";
  selectedAppIds.add("app-2");
  const snapshotFirstPage = requireValue(frameActivePages[0], "scene frame snapshot should contain its first page");
  const snapshotFirstItem = requireValue(snapshotFirstPage[0], "scene frame snapshot should contain its first item");
  const snapshotMetadata = requireRecord(snapshotFirstItem.metadata, "scene frame snapshot item should contain metadata");
  assert(frameActivePages.length === 1, "later collection mutations should not alter a scene frame");
  assert(
    snapshotMetadata.label === "App 1",
    "scene frames should isolate nested records from later caller mutation"
  );
  const frameSelectedAppIds = requireValue(frame.interaction.selectedAppIds, "scene frame should expose selected app ids");
  assert(
    frameSelectedAppIds instanceof Set && !frameSelectedAppIds.has("app-2"),
    "scene frames should preserve Set read semantics while isolating the caller collection"
  );
  let setMutationThrew = false;
  try {
    const add = Reflect.get(frameSelectedAppIds, "add");
    if (typeof add !== "function") throw new TypeError("published scene-frame Set should expose a rejecting add method");
    Reflect.apply(add, frameSelectedAppIds, ["app-3"]);
  } catch (error) {
    setMutationThrew = error instanceof TypeError;
  }
  assert(setMutationThrew, "published scene-frame Sets should reject mutation");
  assert(Object.isFrozen(frame) && Object.isFrozen(frame.viewport), "scene frame containers should be immutable snapshots");
  assert(frame.visual.desktopVisualAlpha === 0.7, "scene frame should group visual state");
  assert(frame.visual.appLaunchCloseSessionId === 7, "scene frame should carry the active app-launch close session");
  const focusedIcon = requireValue(frame.interaction.focusedIcon, "scene frame should expose the focused icon");
  assert(focusedIcon.id === "app-1", "scene frame should group interaction state");
  assert(runtime.iconBoundsRegistry === iconBoundsRegistry, "scene runtime should hold mutable services");
  assert(!Object.prototype.hasOwnProperty.call(frame, "runtime"), "scene frame should not carry imperative runtime services");
  assert(!Object.prototype.hasOwnProperty.call(frame.folder, "folderOverlayState"), "folder frame should not carry Vue overlay state");
  assertDesktopSceneFrame(frame);

  let rejectedIncompleteSurfaceFrame = false;
  try {
    assertCompleteDesktopSceneFrame(frame);
  } catch (error) {
    rejectedIncompleteSurfaceFrame = error instanceof TypeError;
  }
  assert(
    rejectedIncompleteSurfaceFrame,
    "the Pixi surface boundary should reject composition frames with unpublished fields",
  );

  const completeFrame = makeDesktopSceneFrame({
    activePageIndex: 0,
    activePages: [],
    appLaunchCloseSessionId: null,
    desktopGridDebugOptions: null,
    desktopProjectionEpoch: 0,
    desktopTrackMotionKey: "desktop-idle",
    desktopVisualAlpha: 1,
    desktopVisualTransform: { scale: 1, y: 0 },
    dragFolderHoverState: null,
    dragFolderTargetId: null,
    dragHitDebugOptions: null,
    dragHitDebugState: null,
    dragMeta: null,
    focusedIcon: null,
    folderClosingHandoffId: null,
    folderPageSize: 24,
    folderSourceGhostedId: null,
    folderSourceGhostedIds: new Set(),
    gridCols: 7,
    gridRows: 4,
    groupDragState: null,
    iconGesturePresentation: null,
    iconSize: 64,
    isBatchSelectionActive: false,
    isDesktopClosing: false,
    isEditMode: false,
    isHomeRevealSettling: false,
    isSearchMode: false,
    isTextlessMode: false,
    launchTargetStatusById: {},
    launchpadVisualAlpha: 1,
    launchpadVisualTransform: { scale: 1, y: 0 },
    pageGridMeasureStyle: {},
    pageTrackScrub: null,
    provisionalFolderRollback: null,
    selectedAppIds: new Set(),
    showMissingLaunchTargetBadge: false,
    singleStageDiagnosticsOptions: null,
  });
  assertCompleteDesktopSceneFrame(completeFrame);

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
    Reflect.apply(makeDesktopSceneFrame, undefined, [{ activePageIndex: "0" }]);
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
  const pageTrackScrub = requireValue(scrubFrame.viewport.pageTrackScrub, "scrub scene frame should expose pageTrackScrub");
  assert(
    pageTrackScrub.edge === false,
    "scene-frame construction should accept the gesture engine's boolean edge marker"
  );

  let rejectedStringScrubEdge = false;
  try {
    Reflect.apply(makeDesktopSceneFrame, undefined, [{
      pageTrackScrub: {
        edge: "false",
        fromIndex: 0,
        progress: 0.5,
        scope: "desktop",
        toIndex: 1,
      },
    }]);
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
  const eventSource = requireValue(event.source, "icon pointerdown event should expose its source");
  assert(
    event.type === "icon-pointerdown" && event.item.id === "app-1" && eventSource.type === "desktop",
    "scene events should carry semantic snapshots"
  );
  assert(Object.isFrozen(event) && Object.isFrozen(event.pointer), "scene events should be immutable");
  assert(!Object.prototype.hasOwnProperty.call(event, "event"), "scene events should not expose raw renderer events");

  let rejectedMissingIconSource = false;
  try {
    makeIconPointerdownEvent({ type: "pointerdown" }, { id: "app-1" }, null);
  } catch (error) {
    rejectedMissingIconSource = error instanceof TypeError;
  }
  assert(rejectedMissingIconSource, "interactive icon pointerdown events should require a launch source");

  let rejectedInvalidIconSource = false;
  try {
    assertSceneEvent({ ...event, source: null });
  } catch (error) {
    rejectedInvalidIconSource = error instanceof TypeError;
  }
  assert(rejectedInvalidIconSource, "scene-event validation should reject a null icon launch source");

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
