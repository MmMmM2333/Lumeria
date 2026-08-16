import { shallowRef } from "vue";
import { createLaunchpadGestureEngine } from "../domain/input/launchpadGestureEngine.js";
import { makeLaunchSourceFromBounds } from "../domain/input/launchpadPointerTarget.js";

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

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readEventTime(event) {
  const time = Number(event?.timeStamp);
  if (Number.isFinite(time) && time >= 0) return time;
  return globalThis.performance?.now?.() || Date.now();
}

function isSamePointer(pointerId, event) {
  return pointerId == null || event?.pointerId == null || pointerId === event.pointerId;
}

export function useLaunchpadInputGestures(options) {
  const pageTrackScrub = shallowRef(null);
  const folderPageTrackScrub = shallowRef(null);
  const iconGesturePresentation = shallowRef(null);
  const engine = createLaunchpadGestureEngine(options.gesturePolicy);
  const deadlineTimers = new Map();
  let ownedPointerId = null;
  let pointerDetails = null;
  let lastDispatchTime = 0;
  let lastPresentationScope = null;
  let pointerListenersAttached = false;
  let pointerCaptureTarget = null;

  function getEventTarget() {
    return options.eventTarget || globalThis.window;
  }

  function setPageRef(node, pageIndex) {
    if (node) options.pageRefs[pageIndex] = node.$el || node;
  }

  function setFolderPageRef(node, pageIndex) {
    if (node) options.folderPageRefs[pageIndex] = node.$el || node;
  }

  function getPageWidth(scope, pageIndex) {
    const isFolder = scope.startsWith("folder:");
    const pageRef = isFolder ? options.folderPageRefs?.[pageIndex] : options.pageRefs?.[pageIndex];
    const fallback = isFolder
      ? options.folderViewportRef?.value || options.folderPanelRef?.value
      : options.rootRef?.value;
    return Math.max(1, readNumber(pageRef?.getBoundingClientRect?.().width, readNumber(fallback?.getBoundingClientRect?.().width, globalThis.innerWidth || 1)));
  }

  function getViewport(scope) {
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

  function getFolderScope() {
    const folderId = options.renderedFolder?.value?.id || options.openFolderId?.value || "active";
    return `folder:${folderId}`;
  }

  function normalizePointerInput(type, event, target, scope) {
    return {
      type,
      time: readEventTime(event),
      pointerId: event?.pointerId,
      pointerType: event?.pointerType || "mouse",
      button: event?.button ?? 0,
      buttons: event?.buttons,
      isPrimary: event?.isPrimary,
      x: readNumber(event?.clientX),
      y: readNumber(event?.clientY),
      target,
      viewport: getViewport(scope),
    };
  }

  function clearDeadline(kind) {
    const timer = deadlineTimers.get(kind);
    if (timer) getEventTarget()?.clearTimeout?.(timer);
    deadlineTimers.delete(kind);
  }

  function clearInteractionDeadlines() {
    clearDeadline("hold");
    clearDeadline("wheelEnd");
  }

  function clearPresentation(scope = lastPresentationScope) {
    if (scope?.startsWith("folder:")) folderPageTrackScrub.value = null;
    else pageTrackScrub.value = null;
    if (scope === lastPresentationScope) lastPresentationScope = null;
  }

  function scheduleDeadline(deadline) {
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

  function applyPresentation(presentation) {
    if (!presentation || presentation.fromIndex == null || presentation.toIndex == null) return;
    lastPresentationScope = presentation.scope;
    clearDeadline("clearPresentation");
    const scrub = {
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

  function makeDragEvent(pointer, type, extras = {}) {
    const original = pointerDetails?.event || {};
    return {
      ...original,
      button: pointer?.button ?? original.button ?? 0,
      buttons: pointer?.buttons,
      clientX: pointer?.x ?? original.clientX ?? 0,
      clientY: pointer?.y ?? original.clientY ?? 0,
      isPrimary: pointer?.isPrimary,
      pointerId: pointer?.pointerId ?? original.pointerId,
      pointerType: pointer?.pointerType ?? original.pointerType,
      timeStamp: pointer?.time,
      type,
      ...extras,
    };
  }

  function activatePointerTarget() {
    const item = pointerDetails?.item;
    const source = pointerDetails?.source;
    if (!item) return;
    if (item.type === "folder") {
      if (options.openFolder) options.openFolder(item, pointerDetails?.event);
      else options.commitOpenFolder?.(item.id, { originBounds: pointerDetails?.event?.folderOriginBounds });
      return;
    }
    if (options.isBatchSelectionActive?.()) {
      options.toggleBatchSelection?.(item, pointerDetails?.event, source);
      return;
    }
    options.openApp?.(item, source);
  }

  function executeCommand(command, context = {}) {
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
      options.handleSurfaceTap?.(command.target);
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
        const batchPayload = options.getBatchDragPayload?.(pointerDetails.item) || null;
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

  function applyOutput(output, event, input, commandContext = {}) {
    lastDispatchTime = readNumber(input?.time, lastDispatchTime);
    applyPresentation(output?.presentation);
    if (Object.prototype.hasOwnProperty.call(output || {}, "targetPresentation")) {
      iconGesturePresentation.value = output.targetPresentation;
    }
    for (const command of output?.commands || []) executeCommand(command, commandContext);
    if (Object.prototype.hasOwnProperty.call(output || {}, "deadline")) scheduleDeadline(output.deadline);
    if (output?.handled) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
    }
    return output;
  }

  function dispatchPointerDown(event, target, scope, details = null) {
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
    ownedPointerId = event?.pointerId;
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

  function handleOwnedPointerEvent(type, event) {
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

  function handlePointerMove(event) {
    handleOwnedPointerEvent("pointerMove", event);
  }

  function handlePointerUp(event) {
    handleOwnedPointerEvent("pointerUp", event);
  }

  function handlePointerCancel(event) {
    handleOwnedPointerEvent("pointerCancel", event);
  }

  function handleLostPointerCapture(event) {
    if (ownedPointerId == null || !isSamePointer(ownedPointerId, event)) return;
    cancelOwnedInteraction(event);
  }

  function handleWindowBlur(event) {
    if (ownedPointerId == null) return;
    cancelOwnedInteraction(event);
  }

  function attachPointerListeners() {
    if (pointerListenersAttached) return;
    pointerListenersAttached = true;
    const eventTarget = getEventTarget();
    eventTarget?.addEventListener?.("pointermove", handlePointerMove, { passive: false });
    eventTarget?.addEventListener?.("pointerup", handlePointerUp);
    eventTarget?.addEventListener?.("pointercancel", handlePointerCancel);
    eventTarget?.addEventListener?.("blur", handleWindowBlur);
  }

  function detachPointerListeners() {
    if (!pointerListenersAttached) return;
    pointerListenersAttached = false;
    const eventTarget = getEventTarget();
    eventTarget?.removeEventListener?.("pointermove", handlePointerMove);
    eventTarget?.removeEventListener?.("pointerup", handlePointerUp);
    eventTarget?.removeEventListener?.("pointercancel", handlePointerCancel);
    eventTarget?.removeEventListener?.("blur", handleWindowBlur);
  }

  function releasePointerCapture() {
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

  function finishPointerOwnership() {
    detachPointerListeners();
    releasePointerCapture();
    ownedPointerId = null;
    pointerDetails = null;
  }

  function cancelOwnedInteraction(event, optionsArg = {}) {
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

  function getIconTarget(event, targetOptions) {
    return options.getDesktopTargetAtPoint?.(event.clientX, event.clientY, targetOptions) || null;
  }

  function makeIconDetails(event, item, source, scope) {
    return {
      event,
      item,
      scope,
      source,
      target: { id: item?.id || null, itemType: item?.type || null, kind: "icon" },
    };
  }

  function handleIconPointerDown(event, item, source) {
    if (options.isInteractionBlocked?.() || event?.button !== 0 || event?.isPrimary === false) return;
    const scope = source?.type === "folder" ? getFolderScope() : "desktop";
    if (item?.type === "folder" && source?.type !== "folder") {
      options.prepareFolderOpen?.(item, event?.folderOriginBounds);
    }
    const details = makeIconDetails(event, item, source, scope);
    if (dispatchPointerDown(event, details.target, scope, details)) {
      event.preventDefault?.();
      event.stopPropagation?.();
    }
  }

  function handleDesktopSurfacePointerDown(event) {
    if (event?.button !== 0 || event?.isPrimary === false || options.isInteractionBlocked?.()) return;
    if (options.isFolderAppLaunchClosing?.value) return;
    if (event.target?.closest?.(SURFACE_IGNORED_SELECTOR)) return;
    const iconTarget = getIconTarget(event);

    if (options.isFolderClosing?.value) {
      if (iconTarget?.meta?.area === "desktop" && iconTarget?.meta?.item?.type === "folder") {
        event.preventDefault?.();
        event.stopPropagation?.();
        options.commitOpenFolder?.(iconTarget.id);
      }
      return;
    }

    if (options.openFolderId?.value || options.renderedFolder?.value) {
      if (iconTarget?.meta?.area === "folder") return;
      const details = {
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
      const details = makeIconDetails(event, item, source, "desktop");
      dispatchPointerDown(event, details.target, details.scope, details);
      return;
    }

    const details = {
      event,
      scope: "desktop",
      target: { action: "closeDesktop", kind: "surface" },
    };
    dispatchPointerDown(event, details.target, details.scope, details);
  }

  function handleFolderPanelPointerDown(event) {
    if (event?.button !== 0 || event?.isPrimary === false || options.isInteractionBlocked?.()) return;
    if (options.isFolderClosing?.value || options.isFolderAppLaunchClosing?.value) return;
    if (!options.renderedFolder?.value && !options.openFolderId?.value) return;
    if (event.target?.closest?.(SURFACE_IGNORED_SELECTOR)) return;
    const folderId = options.renderedFolder?.value?.id || options.openFolderId?.value || null;
    if (getIconTarget(event, { area: "folder", folderId })?.meta?.area === "folder") return;
    const scope = getFolderScope();
    const details = { event, scope, target: { kind: "surface" } };
    dispatchPointerDown(event, details.target, scope, details);
  }

  function handleFolderOverlayPointerDown() {
    cancelInputGesture({ cancelSource: "folder-overlay" });
    if (!options.dragControls?.isDragActive?.()) options.commitOpenFolder?.(null);
  }

  function handleLaunchpadWheel(event) {
    if (options.isInteractionBlocked?.()) return;
    const scope = options.renderedFolder?.value && options.openFolderId?.value ? getFolderScope() : "desktop";
    const input = {
      type: "wheel",
      time: readEventTime(event),
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      momentum: typeof event?.momentum === "boolean" ? event.momentum : null,
      viewport: getViewport(scope),
    };
    applyOutput(engine.dispatch(input), event, input);
  }

  function cancelInputGesture(optionsArg = {}) {
    return cancelOwnedInteraction(null, optionsArg);
  }

  function disposeInputGestures() {
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
