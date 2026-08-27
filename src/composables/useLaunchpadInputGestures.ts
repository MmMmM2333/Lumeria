import { shallowRef, type Ref } from "vue";
import type {
  ReadonlyLaunchpadApp,
  ReadonlyLaunchpadFolder,
  ReadonlyLaunchpadItem,
  Rect,
} from "../domain/launchpadLayout.js";
import { createLaunchpadGestureEngine } from "../domain/input/launchpadGestureEngine.js";
import type {
  LaunchpadGestureCommand,
  LaunchpadGestureDeadline,
  LaunchpadGestureInput,
  LaunchpadGestureOutput,
  LaunchpadGestureTarget,
  LaunchpadPagePresentation,
  LaunchpadTargetPresentation,
} from "../domain/input/launchpadGestureEngine.js";
import type { LaunchpadGesturePolicy } from "../domain/input/launchpadGesturePolicy.js";
import { makeLaunchSourceFromBounds } from "../domain/input/launchpadPointerTarget.js";
import type { LaunchSource } from "../domain/input/launchpadPointerTarget.js";
import type { CapturedFolderOriginBounds } from "../rendering/desktopScenePort.js";
import type { FolderFlowCommitOptions } from "./useLaunchpadFolderFlow.js";
import type {
  LaunchpadDragBatchPayload,
  LaunchpadDragControls,
  LaunchpadDragPointerEvent,
} from "./useLaunchpadDrag.js";

export type { LaunchpadDragPointerEvent } from "./useLaunchpadDrag.js";

const SURFACE_IGNORED_SELECTOR = [
  ".page-dot",
  ".search-pill",
  ".settings-overlay",
  ".scan-result-overlay",
  ".app-edit-overlay",
  ".icon-chooser-overlay",
  ".warning-dialog-overlay",
  ".icon-context-menu-layer",
  "button",
  "input",
  "textarea",
  "select",
].join(", ");

export type LaunchpadBatchDragPayload = LaunchpadDragBatchPayload;

export type LaunchpadGesturePointerTarget = Readonly<{
  addEventListener?: (type: string, listener: LaunchpadGestureEventListener) => void;
  closest?: (selector: string) => unknown | null;
  hasPointerCapture?: (pointerId: number) => boolean;
  releasePointerCapture?: (pointerId: number) => void;
  removeEventListener?: (type: string, listener: LaunchpadGestureEventListener) => void;
  setPointerCapture?: (pointerId: number) => void;
}>;

export type LaunchpadGesturePointerEvent = LaunchpadDragPointerEvent & Readonly<{
  clientX?: number | undefined;
  clientY?: number | undefined;
  ctrlKey?: boolean | undefined;
  deltaMode?: number | undefined;
  deltaX?: number | undefined;
  deltaY?: number | undefined;
  folderOriginBounds?: CapturedFolderOriginBounds | null | undefined;
  metaKey?: boolean | undefined;
  momentum?: boolean | null | undefined;
  target?: LaunchpadGesturePointerTarget | null | undefined;
}>;

export type LaunchpadGestureEventListener = (event: LaunchpadGesturePointerEvent) => void;

export type LaunchpadGestureEventTarget = Readonly<{
  addEventListener?: (
    type: string,
    listener: LaunchpadGestureEventListener,
    options?: AddEventListenerOptions | boolean,
  ) => void;
  clearTimeout?: (timer: number) => void;
  removeEventListener?: (type: string, listener: LaunchpadGestureEventListener) => void;
  setTimeout?: (callback: () => void, delay?: number) => number;
}>;

type PageRefElement = Readonly<{
  getBoundingClientRect: () => Readonly<Rect>;
}>;

type PageRefNode =
  | PageRefElement
  | Readonly<{ $el: PageRefElement | null | undefined }>;

function getPageRefElement(node: PageRefNode): PageRefElement | null | undefined {
  return "$el" in node ? node.$el : node;
}

export type LaunchpadInputBoundsTarget = Readonly<{
  folderOriginBounds?: CapturedFolderOriginBounds | null;
  id: string;
  meta?: Readonly<{
    area?: string | null;
    folderId?: string | null;
    id?: string | null;
    index?: number | null;
    item?: ReadonlyLaunchpadItem;
    pageIndex?: number | null;
  }>;
  rect?: Readonly<Rect>;
}>;

export type LaunchpadInputTargetOptions = Readonly<{
  area?: "desktop" | "folder" | "search";
  folderId?: string | null;
}>;

export type OpenIconContextMenuCallback = (
  event: LaunchpadDragPointerEvent,
  item: ReadonlyLaunchpadItem,
  source: LaunchSource,
) => unknown;

export type LaunchpadInputDragControls = Pick<
  LaunchpadDragControls,
  "cancelDrag" | "finishDrag" | "isDragActive" | "startDrag" | "updateDragPointer"
>;

export type LaunchpadInputGesturesOptions = Readonly<{
  activePageIndex?: Readonly<Ref<number>>;
  activePages?: Readonly<Ref<readonly (readonly unknown[])[]>>;
  cancelFolderOpening?: () => boolean;
  commitActivePageIndex?: (pageIndex: number) => unknown;
  commitFolderPageIndex?: (pageIndex: number) => unknown;
  commitOpenFolder?: (
    folderId: string | null,
    options?: FolderFlowCommitOptions,
  ) => unknown;
  dragControls?: LaunchpadInputDragControls;
  eventTarget?: LaunchpadGestureEventTarget;
  folderPageIndex?: Readonly<Ref<number>>;
  folderPageRefs: Array<PageRefElement | null | undefined>;
  folderPages?: Readonly<Ref<readonly (readonly unknown[])[]>>;
  folderPanelRef?: Readonly<Ref<PageRefElement | null>>;
  folderViewportRef?: Readonly<Ref<PageRefElement | null>>;
  gesturePolicy?: Partial<LaunchpadGesturePolicy>;
  getBatchDragPayload?: (item: ReadonlyLaunchpadApp) => LaunchpadBatchDragPayload | null;
  getDesktopTargetAtPoint?: (
    x: number,
    y: number,
    options?: LaunchpadInputTargetOptions,
  ) => LaunchpadInputBoundsTarget | null;
  handleSurfaceTap?: (target: Extract<LaunchpadGestureTarget, { kind: "surface" }>) => unknown;
  isBatchSelectionActive?: () => boolean;
  isFolderAppLaunchClosing?: Readonly<Ref<boolean>>;
  isFolderClosing?: Readonly<Ref<boolean>>;
  isInteractionBlocked?: () => boolean;
  isSearchMode?: Readonly<Ref<boolean>>;
  openApp?: (item: ReadonlyLaunchpadApp, source: LaunchSource) => unknown;
  openFolder?: (
    folder: ReadonlyLaunchpadFolder,
    event: LaunchpadGesturePointerEvent,
    originBounds?: CapturedFolderOriginBounds | null,
  ) => unknown;
  openFolderId?: Readonly<Ref<string | null>>;
  openIconContextMenu?: OpenIconContextMenuCallback;
  pageRefs: Array<PageRefElement | null | undefined>;
  prepareFolderOpen?: (
    folder: ReadonlyLaunchpadFolder,
    originBounds?: CapturedFolderOriginBounds | null,
  ) => unknown;
  renderedFolder?: Readonly<Ref<ReadonlyLaunchpadFolder | null>>;
  rootRef?: Readonly<Ref<PageRefElement | null>>;
  toggleBatchSelection?: (
    item: ReadonlyLaunchpadApp,
    event: LaunchpadGesturePointerEvent,
    source: LaunchSource,
  ) => unknown;
}>;

export type LaunchpadPageTrackScrub = Readonly<{
  edge: boolean;
  fromIndex: number;
  progress: number;
  scope: string;
  settle?: true;
  settleToken?: string;
  targetProgress?: 0 | 1;
  toIndex: number;
  velocity?: number;
}>;

type IconPointerDetails = Readonly<{
  event: LaunchpadGesturePointerEvent;
  folderOriginBounds?: CapturedFolderOriginBounds | null | undefined;
  item: ReadonlyLaunchpadItem;
  scope: string;
  source: LaunchSource;
  target: Extract<LaunchpadGestureTarget, { kind: "icon" }>;
}>;

type SurfacePointerDetails = Readonly<{
  event: LaunchpadGesturePointerEvent;
  folderOriginBounds?: undefined;
  item?: undefined;
  scope: string;
  source?: undefined;
  target: Extract<LaunchpadGestureTarget, { kind: "surface" }>;
}>;

type PointerDetails = IconPointerDetails | SurfacePointerDetails;

type MutableGestureInput = {
  button?: unknown;
  buttons?: number;
  dragOnHold?: boolean;
  isPrimary?: boolean;
  pointerId?: number | null | undefined;
  pointerType?: string;
  target?: LaunchpadGestureTarget;
  time?: unknown;
  type?: string;
  viewport?: Readonly<{
    pageCount: number;
    pageIndex: number;
    pageWidth: number;
    scope: string;
  }>;
  x?: unknown;
  y?: unknown;
};

type CancelInteractionOptions = Readonly<{
  cancelSource?: string | null;
  userInitiatedCancel?: boolean;
}>;

function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readEventTime(event: Pick<LaunchpadGesturePointerEvent, "timeStamp"> | null): number {
  const time = Number(event?.timeStamp);
  if (Number.isFinite(time) && time >= 0) return time;
  return globalThis.performance?.now?.() || Date.now();
}

function isSamePointer(
  pointerId: number | null,
  event: Pick<LaunchpadGesturePointerEvent, "pointerId"> | null,
): boolean {
  return pointerId == null || event?.pointerId == null || pointerId === event.pointerId;
}

export function useLaunchpadInputGestures(options: LaunchpadInputGesturesOptions) {
  const pageTrackScrub = shallowRef<LaunchpadPageTrackScrub | null>(null);
  const folderPageTrackScrub = shallowRef<LaunchpadPageTrackScrub | null>(null);
  const iconGesturePresentation = shallowRef<LaunchpadTargetPresentation | null>(null);
  const engine = createLaunchpadGestureEngine(options.gesturePolicy);
  const deadlineTimers = new Map<LaunchpadGestureDeadline["kind"], number>();
  let ownedPointerId: number | null = null;
  let pointerDetails: PointerDetails | null = null;
  let lastDispatchTime = 0;
  let lastPresentationScope: string | null = null;
  let pointerListenersAttached = false;
  let pointerCaptureTarget: LaunchpadGesturePointerTarget | null = null;

  function getEventTarget(): LaunchpadGestureEventTarget | undefined {
    return options.eventTarget || globalThis.window;
  }

  function setPageRef(node: PageRefNode | null, pageIndex: number): void {
    if (node) options.pageRefs[pageIndex] = getPageRefElement(node);
  }

  function setFolderPageRef(node: PageRefNode | null, pageIndex: number): void {
    if (node) options.folderPageRefs[pageIndex] = getPageRefElement(node);
  }

  function getPageWidth(scope: string, pageIndex: number): number {
    const isFolder = scope.startsWith("folder:");
    const pageRef = isFolder ? options.folderPageRefs?.[pageIndex] : options.pageRefs?.[pageIndex];
    const fallback = isFolder
      ? options.folderViewportRef?.value || options.folderPanelRef?.value
      : options.rootRef?.value;
    return Math.max(1, readNumber(pageRef?.getBoundingClientRect?.().width, readNumber(fallback?.getBoundingClientRect?.().width, globalThis.innerWidth || 1)));
  }

  function getViewport(scope: string) {
    if (scope.startsWith("folder:")) {
      const pageIndex = Math.max(0, readNumber(options.folderPageIndex?.value, 0));
      return {
        scope,
        pageIndex,
        pageCount: Math.max(0, (options.folderPages?.value || []).length),
        pageWidth: getPageWidth(scope, pageIndex),
      };
    }
    const pageIndex = Math.max(0, readNumber(options.activePageIndex?.value, 0));
    return {
      scope: options.isSearchMode?.value ? "search" : "desktop",
      pageIndex,
      pageCount: Math.max(0, (options.activePages?.value || []).length),
      pageWidth: getPageWidth(scope, pageIndex),
    };
  }

  function getFolderScope(): string {
    const folderId = options.renderedFolder?.value?.id || options.openFolderId?.value || "active";
    return `folder:${folderId}`;
  }

  function normalizePointerInput(
    type: string,
    event: LaunchpadGesturePointerEvent,
    target: LaunchpadGestureTarget,
    scope: string,
  ): MutableGestureInput {
    const input: MutableGestureInput = {
      type,
      time: readEventTime(event),
      pointerType: event?.pointerType || "mouse",
      button: event?.button ?? 0,
      x: readNumber(event?.clientX),
      y: readNumber(event?.clientY),
      target,
      viewport: getViewport(scope),
    };
    if (event.pointerId !== undefined) input.pointerId = event.pointerId;
    if (event.buttons != null) input.buttons = event.buttons;
    if (event.isPrimary !== undefined) input.isPrimary = event.isPrimary;
    return input;
  }

  function clearDeadline(kind: LaunchpadGestureDeadline["kind"]): void {
    const timer = deadlineTimers.get(kind);
    if (timer) getEventTarget()?.clearTimeout?.(timer);
    deadlineTimers.delete(kind);
  }

  function clearInteractionDeadlines(): void {
    clearDeadline("hold");
    clearDeadline("wheelEnd");
  }

  function clearPresentation(scope: string | null = lastPresentationScope): void {
    if (scope?.startsWith("folder:")) folderPageTrackScrub.value = null;
    else pageTrackScrub.value = null;
    if (scope === lastPresentationScope) lastPresentationScope = null;
  }

  function scheduleDeadline(deadline: LaunchpadGestureDeadline | null | undefined): void {
    if (!deadline) {
      clearInteractionDeadlines();
      return;
    }
    clearDeadline(deadline.kind);
    const delay = Math.max(0, readNumber(deadline.at) - lastDispatchTime);
    const timer = getEventTarget()?.setTimeout?.(() => {
      deadlineTimers.delete(deadline.kind);
      if (deadline.kind === "clearPresentation") {
        clearPresentation();
        return;
      }
      const output = engine.dispatch({ type: "deadline", kind: deadline.kind, time: deadline.at });
      applyOutput(output, null, { time: deadline.at });
    }, delay);
    if (timer) deadlineTimers.set(deadline.kind, timer);
  }

  function applyPresentation(presentation: LaunchpadPagePresentation | null | undefined): void {
    if (!presentation || presentation.fromIndex == null || presentation.toIndex == null) return;
    lastPresentationScope = presentation.scope;
    clearDeadline("clearPresentation");
    const scrub: LaunchpadPageTrackScrub = {
      edge: presentation.edge,
      fromIndex: presentation.fromIndex,
      progress: presentation.progress,
      scope: presentation.scope,
      toIndex: presentation.toIndex,
    };
    if (presentation.phase === "settle") {
      Object.assign(scrub, {
        settle: true,
        settleToken: presentation.settleToken,
        targetProgress: presentation.targetProgress,
        velocity: presentation.velocity,
      });
    }
    if (presentation.scope?.startsWith("folder:")) folderPageTrackScrub.value = scrub;
    else pageTrackScrub.value = scrub;
  }

  function makeDragEvent(
    pointer: Extract<LaunchpadGestureCommand, { type: "startDrag" }>["pointer"],
    type: string,
    extras: Partial<Pick<LaunchpadDragPointerEvent,
      "cancelSource" | "dragAnchor" | "dragStartedFromThreshold" | "userInitiatedCancel"
    >> = {},
  ): LaunchpadDragPointerEvent {
    const original = pointerDetails?.event || {};
    return {
      ...original,
      button: readNumber(pointer?.button, original.button ?? 0),
      buttons: pointer?.buttons,
      clientX: readNumber(pointer?.x, original.clientX ?? 0),
      clientY: readNumber(pointer?.y, original.clientY ?? 0),
      isPrimary: pointer?.isPrimary,
      pointerId: pointer?.pointerId ?? original.pointerId,
      pointerType: pointer?.pointerType ?? original.pointerType,
      timeStamp: readNumber(pointer?.time, original.timeStamp ?? 0),
      type,
      ...extras,
    };
  }

  function activatePointerTarget(): void {
    const details = pointerDetails;
    if (!details?.item) return;
    const { item, source } = details;
    if (item.type === "folder") {
      if (options.openFolder) {
        options.openFolder(item, details.event, details.folderOriginBounds);
      }
      else {
        const originBounds = details.folderOriginBounds;
        options.commitOpenFolder?.(
          item.id,
          originBounds === undefined ? undefined : { originBounds },
        );
      }
      return;
    }
    if (options.isBatchSelectionActive?.()) {
      options.toggleBatchSelection?.(item, details.event, source);
      return;
    }
    options.openApp?.(item, source);
  }

  function executeCommand(
    command: LaunchpadGestureCommand,
    context: CancelInteractionOptions = {},
  ): void {
    if (command.type === "commitPage") {
      if (command.scope?.startsWith("folder:")) options.commitFolderPageIndex?.(command.pageIndex);
      else options.commitActivePageIndex?.(command.pageIndex);
      return;
    }
    if (command.type === "activateTarget") {
      activatePointerTarget();
      return;
    }
    if (command.type === "surfaceTap") {
      if (options.isBatchSelectionActive?.()) return;
      if (command.target.kind === "surface") options.handleSurfaceTap?.(command.target);
      return;
    }
    if (command.type === "openContextMenu") {
      if (options.isBatchSelectionActive?.()) return;
      if (pointerDetails?.item) {
        options.openIconContextMenu?.(
          makeDragEvent(command.pointer, "contextmenu"),
          pointerDetails.item,
          pointerDetails.source
        );
      }
      return;
    }
    if (command.type === "startDrag") {
      if (pointerDetails?.item) {
        const batchPayload = pointerDetails.item.type === "app"
          ? options.getBatchDragPayload?.(pointerDetails.item) || null
          : null;
        options.dragControls?.startDrag?.(
          makeDragEvent(command.pointer, "pointermove", {
            dragAnchor: command.dragAnchor,
            dragStartedFromThreshold: command.dragStartedFromThreshold === true,
          }),
          pointerDetails.item,
          pointerDetails.source,
          batchPayload
        );
      }
      return;
    }
    if (command.type === "updateDrag") {
      options.dragControls?.updateDragPointer?.(makeDragEvent(command.pointer, "pointermove"));
      return;
    }
    if (command.type === "finishDrag") {
      options.dragControls?.finishDrag?.(makeDragEvent(command.pointer, "pointerup"));
      return;
    }
    if (command.type === "cancelDrag") {
      options.dragControls?.cancelDrag?.(makeDragEvent(command.pointer, "pointercancel", {
        cancelSource: context.cancelSource || null,
        userInitiatedCancel: context.userInitiatedCancel === true,
      }));
    }
  }

  function applyOutput(
    output: LaunchpadGestureOutput,
    event: LaunchpadGesturePointerEvent | null,
    input: Pick<LaunchpadGestureInput, "time">,
    commandContext: CancelInteractionOptions = {},
  ): LaunchpadGestureOutput {
    lastDispatchTime = readNumber(input?.time, lastDispatchTime);
    applyPresentation(output?.presentation);
    if (Object.prototype.hasOwnProperty.call(output || {}, "targetPresentation")) {
      iconGesturePresentation.value = output.targetPresentation ?? null;
    }
    for (const command of output?.commands || []) executeCommand(command, commandContext);
    if (Object.prototype.hasOwnProperty.call(output || {}, "deadline")) scheduleDeadline(output.deadline);
    if (output?.handled) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
    }
    return output;
  }

  function dispatchPointerDown(
    event: LaunchpadGesturePointerEvent,
    target: LaunchpadGestureTarget,
    scope: string,
    details: PointerDetails | null = null,
  ): boolean {
    const input = normalizePointerInput("pointerDown", event, target, scope);
    input.dragOnHold = Boolean(
      options.isBatchSelectionActive?.() &&
      details?.item?.type === "app"
    );
    const output = applyOutput(engine.dispatch(input), event, input);
    if (details && (ownedPointerId == null || isSamePointer(ownedPointerId, event))) pointerDetails = details;
    if (!output.ownsPointer) return false;
    clearDeadline("wheelEnd");
    clearPresentation();
    ownedPointerId = event.pointerId ?? null;
    if (details) pointerDetails = details;
    attachPointerListeners();
    const captureTarget = event?.target;
    if (captureTarget?.setPointerCapture && event?.pointerId != null) {
      pointerCaptureTarget = captureTarget;
      captureTarget.addEventListener?.("lostpointercapture", handleLostPointerCapture);
      try {
        captureTarget.setPointerCapture(event.pointerId);
      } catch (error) {
        captureTarget.removeEventListener?.("lostpointercapture", handleLostPointerCapture);
        pointerCaptureTarget = null;
        console.warn("Unable to capture Launchpad pointer", error);
      }
    }
    return true;
  }

  function handleOwnedPointerEvent(type: string, event: LaunchpadGesturePointerEvent) {
    if (!isSamePointer(ownedPointerId, event)) return;
    const scope = pointerDetails?.scope || (options.renderedFolder?.value ? getFolderScope() : "desktop");
    const target = pointerDetails?.target || { kind: "surface" };
    const input = normalizePointerInput(type, event, target, scope);
    const output = applyOutput(engine.dispatch(input), event, input);
    if (output?.releasesPointer) {
      finishPointerOwnership();
    }
    return output;
  }

  function handlePointerMove(event: LaunchpadGesturePointerEvent): void {
    handleOwnedPointerEvent("pointerMove", event);
  }

  function handlePointerUp(event: LaunchpadGesturePointerEvent): void {
    handleOwnedPointerEvent("pointerUp", event);
  }

  function handlePointerCancel(event: LaunchpadGesturePointerEvent): void {
    handleOwnedPointerEvent("pointerCancel", event);
  }

  function handleLostPointerCapture(event: LaunchpadGesturePointerEvent): void {
    if (ownedPointerId == null || !isSamePointer(ownedPointerId, event)) return;
    cancelOwnedInteraction(event);
  }

  function handleWindowBlur(event: LaunchpadGesturePointerEvent): void {
    if (ownedPointerId == null) return;
    cancelOwnedInteraction(event);
  }

  function attachPointerListeners(): void {
    if (pointerListenersAttached) return;
    pointerListenersAttached = true;
    const eventTarget = getEventTarget();
    eventTarget?.addEventListener?.("pointermove", handlePointerMove, { passive: false });
    eventTarget?.addEventListener?.("pointerup", handlePointerUp);
    eventTarget?.addEventListener?.("pointercancel", handlePointerCancel);
    eventTarget?.addEventListener?.("blur", handleWindowBlur);
  }

  function detachPointerListeners(): void {
    if (!pointerListenersAttached) return;
    pointerListenersAttached = false;
    const eventTarget = getEventTarget();
    eventTarget?.removeEventListener?.("pointermove", handlePointerMove);
    eventTarget?.removeEventListener?.("pointerup", handlePointerUp);
    eventTarget?.removeEventListener?.("pointercancel", handlePointerCancel);
    eventTarget?.removeEventListener?.("blur", handleWindowBlur);
  }

  function releasePointerCapture(): void {
    const captureTarget = pointerCaptureTarget;
    const pointerId = ownedPointerId;
    pointerCaptureTarget = null;
    captureTarget?.removeEventListener?.("lostpointercapture", handleLostPointerCapture);
    if (!captureTarget?.releasePointerCapture || pointerId == null) return;
    try {
      if (!captureTarget.hasPointerCapture || captureTarget.hasPointerCapture(pointerId)) {
        captureTarget.releasePointerCapture(pointerId);
      }
    } catch (error) {
      console.warn("Unable to release Launchpad pointer capture", error);
    }
  }

  function finishPointerOwnership(): void {
    detachPointerListeners();
    releasePointerCapture();
    ownedPointerId = null;
    pointerDetails = null;
  }

  function cancelOwnedInteraction(
    event: LaunchpadGesturePointerEvent | null,
    optionsArg: CancelInteractionOptions = {},
  ): LaunchpadGestureOutput {
    const time = readEventTime(event);
    const output = engine.dispatch({ type: "cancel", time });
    applyOutput(output, null, { time }, {
      cancelSource: optionsArg.cancelSource || null,
      userInitiatedCancel: optionsArg.userInitiatedCancel === true,
    });
    finishPointerOwnership();
    clearInteractionDeadlines();
    return output;
  }

  function getIconTarget(
    event: LaunchpadGesturePointerEvent,
    targetOptions?: LaunchpadInputTargetOptions,
  ): LaunchpadInputBoundsTarget | null {
    return options.getDesktopTargetAtPoint?.(
      readNumber(event.clientX),
      readNumber(event.clientY),
      targetOptions,
    ) || null;
  }

  function makeIconDetails(
    event: LaunchpadGesturePointerEvent,
    item: ReadonlyLaunchpadItem,
    source: LaunchSource,
    scope: string,
    folderOriginBounds = event.folderOriginBounds,
  ): IconPointerDetails {
    return {
      event,
      folderOriginBounds,
      item,
      scope,
      source,
      target: { id: item.id, itemType: item.type, kind: "icon" },
    };
  }

  function dispatchIconPointerDown(
    event: LaunchpadGesturePointerEvent,
    item: ReadonlyLaunchpadItem,
    source: LaunchSource,
    scope: string,
    folderOriginBounds = event.folderOriginBounds,
  ): boolean {
    const details = makeIconDetails(event, item, source, scope, folderOriginBounds);
    if (pointerListenersAttached && pointerDetails && isSamePointer(ownedPointerId, event)) {
      const activeItem = pointerDetails.item;
      const nextOriginBounds = details.folderOriginBounds;
      if (
        activeItem?.id === item.id &&
        item.type === "folder" &&
        source.type !== "folder" &&
        nextOriginBounds != null &&
        pointerDetails.folderOriginBounds == null
      ) {
        // The native canvas event and Pixi's federated icon event can arrive
        // in either order. Keep one gesture owner, but let the richer Pixi
        // event add the precise folder origin before pointerup activates it.
        pointerDetails = details;
        options.prepareFolderOpen?.(item, nextOriginBounds);
      }
      event.preventDefault?.();
      event.stopPropagation?.();
      return false;
    }
    if (!dispatchPointerDown(event, details.target, scope, details)) return false;
    if (item.type === "folder" && source.type !== "folder") {
      options.prepareFolderOpen?.(item, details.folderOriginBounds);
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }

  function handleIconPointerDown(
    event: LaunchpadGesturePointerEvent,
    item: ReadonlyLaunchpadItem,
    source: LaunchSource,
  ): void {
    if (options.isInteractionBlocked?.() || event?.button !== 0 || event?.isPrimary === false) return;
    const scope = source?.type === "folder" ? getFolderScope() : "desktop";
    let folderOriginBounds = event.folderOriginBounds;
    if (
      scope === "desktop" &&
      item.type === "folder" &&
      options.isFolderClosing?.value
    ) {
      const target = getIconTarget(event, { area: "desktop" });
      if (target?.id === item.id) {
        folderOriginBounds = target.folderOriginBounds ?? folderOriginBounds;
      }
    }
    dispatchIconPointerDown(event, item, source, scope, folderOriginBounds);
  }

  function handleDesktopSurfacePointerDown(event: LaunchpadGesturePointerEvent): void {
    if (event?.button !== 0 || event?.isPrimary === false || options.isInteractionBlocked?.()) return;
    if (options.isFolderAppLaunchClosing?.value) return;
    if (event.target?.closest?.(SURFACE_IGNORED_SELECTOR)) return;
    const iconTarget = getIconTarget(event);

    if (options.isFolderClosing?.value) {
      if (iconTarget?.meta?.area === "desktop" && iconTarget?.meta?.item?.type === "folder") {
        const item = iconTarget.meta.item;
        const source = makeLaunchSourceFromBounds(iconTarget, options.isSearchMode?.value);
        dispatchIconPointerDown(
          event,
          item,
          source,
          "desktop",
          iconTarget.folderOriginBounds,
        );
      }
      return;
    }

    if (options.openFolderId?.value || options.renderedFolder?.value) {
      if (iconTarget?.meta?.area === "folder") return;
      const details: SurfacePointerDetails = {
        event,
        scope: getFolderScope(),
        target: { action: "closeFolder", kind: "surface" },
      };
      dispatchPointerDown(event, details.target, details.scope, details);
      return;
    }

    if (iconTarget?.meta?.item) {
      const item = iconTarget.meta.item;
      const source = makeLaunchSourceFromBounds(iconTarget, options.isSearchMode?.value);
      dispatchIconPointerDown(
        event,
        item,
        source,
        "desktop",
        iconTarget.folderOriginBounds,
      );
      return;
    }

    const details: SurfacePointerDetails = {
      event,
      scope: "desktop",
      target: { action: "closeDesktop", kind: "surface" },
    };
    dispatchPointerDown(event, details.target, details.scope, details);
  }

  function handleFolderPanelPointerDown(event: LaunchpadGesturePointerEvent): void {
    if (event?.button !== 0 || event?.isPrimary === false || options.isInteractionBlocked?.()) return;
    if (options.isFolderClosing?.value || options.isFolderAppLaunchClosing?.value) return;
    if (!options.renderedFolder?.value && !options.openFolderId?.value) return;
    if (event.target?.closest?.(SURFACE_IGNORED_SELECTOR)) return;
    const folderId = options.renderedFolder?.value?.id || options.openFolderId?.value || null;
    if (getIconTarget(event, { area: "folder", folderId })?.meta?.area === "folder") return;
    const scope = getFolderScope();
    const details: SurfacePointerDetails = { event, scope, target: { kind: "surface" } };
    dispatchPointerDown(event, details.target, scope, details);
  }

  function handleFolderOverlayPointerDown(): void {
    cancelInputGesture({ cancelSource: "folder-overlay" });
    if (options.dragControls?.isDragActive?.()) return;
    if (!options.cancelFolderOpening?.()) options.commitOpenFolder?.(null);
  }

  function handleLaunchpadWheel(event: LaunchpadGesturePointerEvent): void {
    if (options.isInteractionBlocked?.()) return;
    const scope = options.renderedFolder?.value && options.openFolderId?.value ? getFolderScope() : "desktop";
    const input = {
      type: "wheel",
      time: readEventTime(event),
      ctrlKey: event.ctrlKey === true,
      metaKey: event.metaKey === true,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      momentum: typeof event?.momentum === "boolean" ? event.momentum : null,
      viewport: getViewport(scope),
    };
    applyOutput(engine.dispatch(input), event, input);
  }

  function cancelInputGesture(optionsArg: CancelInteractionOptions = {}): LaunchpadGestureOutput {
    return cancelOwnedInteraction(null, optionsArg);
  }

  function disposeInputGestures(): void {
    cancelInputGesture();
    for (const kind of [...deadlineTimers.keys()]) clearDeadline(kind);
    clearPresentation();
  }

  return {
    cancelInputGesture,
    disposeInputGestures,
    folderPageTrackScrub,
    handleDesktopSurfacePointerDown,
    handleFolderOverlayPointerDown,
    handleFolderPanelPointerDown,
    handleIconPointerDown,
    handleLaunchpadWheel,
    iconGesturePresentation,
    pageTrackScrub,
    setFolderPageRef,
    setPageRef,
  };
}
