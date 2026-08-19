/**
 * Closed renderer-to-application event union.
 *
 * Raw DOM/Pixi events never cross this boundary. Pointer and wheel values are
 * immutable snapshots; the small control object is the only capability that
 * may act on the originating event.
 */

const EVENT_FIELDS = Object.freeze({
  "choose-app-icon": Object.freeze(["type", "itemId"]),
  "context-menu-request": Object.freeze(["type", "pointer"]),
  "desktop-focus": Object.freeze(["type"]),
  "group-release-complete": Object.freeze(["type", "payload"]),
  "internal-activity": Object.freeze(["type", "active", "folderId"]),
  "icon-pointerdown": Object.freeze(["type", "pointer", "control", "item", "source"]),
  "remove-app": Object.freeze(["type", "itemId"]),
  "reset-app-icon": Object.freeze(["type", "itemId"]),
  "surface-pointerdown": Object.freeze(["type", "pointer", "control"]),
  wheel: Object.freeze(["type", "wheel", "control"]),
});

const POINTER_FIELDS = Object.freeze([
  "type",
  "timeStamp",
  "pointerId",
  "pointerType",
  "button",
  "buttons",
  "isPrimary",
  "clientX",
  "clientY",
  "ctrlKey",
  "metaKey",
  "iconBounds",
  "dragVisualState",
  "folderOriginBounds",
]);

const WHEEL_FIELDS = Object.freeze([
  "timeStamp",
  "ctrlKey",
  "metaKey",
  "deltaMode",
  "deltaX",
  "deltaY",
  "momentum",
]);

const CONTROL_FIELDS = Object.freeze([
  "preventDefault",
  "stopPropagation",
  "targetMatches",
  "addLostPointerCaptureListener",
  "removeLostPointerCaptureListener",
  "setPointerCapture",
  "hasPointerCapture",
  "releasePointerCapture",
]);

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function assertExactFields(value, fields, label) {
  const keys = Object.keys(requireObject(value, label));
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    throw new TypeError(`${label} contains unsupported fields`);
  }
}

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function snapshotRect(value) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze({
    height: readNumber(value.height),
    width: readNumber(value.width),
    x: readNumber(value.x ?? value.left),
    y: readNumber(value.y ?? value.top),
  });
}

function snapshotData(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) throw new TypeError("SceneEvent data must not contain cycles");
  seen.add(value);
  if (Array.isArray(value)) {
    const result = Object.freeze(value.map((entry) => snapshotData(entry, seen)));
    seen.delete(value);
    return result;
  }
  if (value instanceof Set) {
    const result = Object.freeze([...value].map((entry) => snapshotData(entry, seen)));
    seen.delete(value);
    return result;
  }
  if (value instanceof Map) {
    const result = Object.freeze([...value].map(([key, entry]) => Object.freeze([
      snapshotData(key, seen),
      snapshotData(entry, seen),
    ])));
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "function") {
      throw new TypeError(`SceneEvent data.${key} must not contain functions`);
    }
    result[key] = snapshotData(entry, seen);
  }
  seen.delete(value);
  return Object.freeze(result);
}

function makePointerSnapshot(event) {
  const source = requireObject(event, "event");
  const globalPoint = source.global && typeof source.global === "object" ? source.global : null;
  return Object.freeze({
    type: typeof source.type === "string" ? source.type : "pointerdown",
    timeStamp: readNumber(source.timeStamp, globalThis.performance?.now?.() || Date.now()),
    pointerId: Number.isFinite(Number(source.pointerId)) ? Number(source.pointerId) : null,
    pointerType: typeof source.pointerType === "string" ? source.pointerType : "mouse",
    button: readNumber(source.button),
    buttons: Number.isFinite(Number(source.buttons)) ? Number(source.buttons) : null,
    isPrimary: source.isPrimary !== false,
    clientX: readNumber(source.clientX, readNumber(globalPoint?.x)),
    clientY: readNumber(source.clientY, readNumber(globalPoint?.y)),
    ctrlKey: source.ctrlKey === true,
    metaKey: source.metaKey === true,
    iconBounds: snapshotRect(source.currentTarget?.getBoundingClientRect?.() || source.iconBounds),
    dragVisualState: source.dragVisualState == null ? null : snapshotData(source.dragVisualState),
    folderOriginBounds: source.folderOriginBounds == null ? null : snapshotData(source.folderOriginBounds),
  });
}

function makeWheelSnapshot(event) {
  const source = requireObject(event, "event");
  return Object.freeze({
    timeStamp: readNumber(source.timeStamp, globalThis.performance?.now?.() || Date.now()),
    ctrlKey: source.ctrlKey === true,
    metaKey: source.metaKey === true,
    deltaMode: readNumber(source.deltaMode),
    deltaX: readNumber(source.deltaX),
    deltaY: readNumber(source.deltaY),
    momentum: typeof source.momentum === "boolean" ? source.momentum : null,
  });
}

function makeEventControl(event) {
  const source = requireObject(event, "event");
  const target = source.target && typeof source.target === "object" ? source.target : null;
  return Object.freeze({
    preventDefault: () => source.preventDefault?.(),
    stopPropagation: () => source.stopPropagation?.(),
    targetMatches: (selector) => Boolean(target?.closest?.(selector)),
    addLostPointerCaptureListener: (listener) => target?.addEventListener?.("lostpointercapture", listener),
    removeLostPointerCaptureListener: (listener) => target?.removeEventListener?.("lostpointercapture", listener),
    setPointerCapture: (pointerId) => target?.setPointerCapture?.(pointerId),
    hasPointerCapture: (pointerId) => target?.hasPointerCapture?.(pointerId) ?? false,
    releasePointerCapture: (pointerId) => target?.releasePointerCapture?.(pointerId),
  });
}

function makeEvent(type, fields = {}) {
  const event = Object.freeze({ type, ...fields });
  assertSceneEvent(event);
  return event;
}

/** Convert a semantic snapshot/capability pair to the renderer-neutral input adapter used by gestures. */
export function makeControlledPointerInput(pointer, control) {
  assertPointerSnapshot(pointer, "pointer");
  assertEventControl(control, "control");
  const target = Object.freeze({
    closest: (selector) => (control.targetMatches(selector) ? true : null),
    addEventListener: (name, listener) => {
      if (name === "lostpointercapture") control.addLostPointerCaptureListener(listener);
    },
    removeEventListener: (name, listener) => {
      if (name === "lostpointercapture") control.removeLostPointerCaptureListener(listener);
    },
    setPointerCapture: control.setPointerCapture,
    hasPointerCapture: control.hasPointerCapture,
    releasePointerCapture: control.releasePointerCapture,
  });
  return Object.freeze({
    ...pointer,
    currentTarget: Object.freeze({
      getBoundingClientRect: () => pointer.iconBounds,
    }),
    preventDefault: control.preventDefault,
    stopPropagation: control.stopPropagation,
    target,
  });
}

export function makeControlledWheelInput(wheel, control) {
  assertWheelSnapshot(wheel, "wheel");
  assertEventControl(control, "control");
  return Object.freeze({
    ...wheel,
    preventDefault: control.preventDefault,
    stopPropagation: control.stopPropagation,
  });
}

/** @param {string} itemId */
export function makeChooseAppIconEvent(itemId) {
  return makeEvent("choose-app-icon", { itemId: requireNonEmptyString(itemId, "itemId") });
}

/** Context menu requests are controlled in the renderer before publication. */
export function makeContextMenuRequestEvent(event) {
  return makeEvent("context-menu-request", { pointer: makePointerSnapshot(event) });
}

export function makeDesktopFocusEvent() {
  return makeEvent("desktop-focus");
}

export function makeGroupReleaseCompleteEvent(payload) {
  return makeEvent("group-release-complete", { payload: snapshotData(payload) });
}

export function makeInternalActivityEvent(active, folderId = null) {
  if (typeof active !== "boolean") throw new TypeError("active must be a boolean");
  if (folderId !== null && folderId !== undefined) requireNonEmptyString(folderId, "folderId");
  return makeEvent("internal-activity", { active, folderId: folderId || null });
}

export function makeIconPointerdownEvent(event, item, source) {
  return makeEvent("icon-pointerdown", {
    pointer: makePointerSnapshot(event),
    control: makeEventControl(event),
    item: snapshotData(requireObject(item, "item")),
    source: source == null ? null : snapshotData(requireObject(source, "source")),
  });
}

export function makeRemoveAppEvent(itemId) {
  return makeEvent("remove-app", { itemId: requireNonEmptyString(itemId, "itemId") });
}

export function makeResetAppIconEvent(itemId) {
  return makeEvent("reset-app-icon", { itemId: requireNonEmptyString(itemId, "itemId") });
}

export function makeSurfacePointerdownEvent(event) {
  return makeEvent("surface-pointerdown", {
    pointer: makePointerSnapshot(event),
    control: makeEventControl(event),
  });
}

export function makeWheelEvent(event) {
  return makeEvent("wheel", {
    wheel: makeWheelSnapshot(event),
    control: makeEventControl(event),
  });
}

function assertPointerSnapshot(pointer, label) {
  assertExactFields(pointer, POINTER_FIELDS, label);
  if (!Object.isFrozen(pointer)) throw new TypeError(`${label} must be immutable`);
  for (const key of ["timeStamp", "button", "clientX", "clientY"]) {
    if (!Number.isFinite(pointer[key])) throw new TypeError(`${label}.${key} must be finite`);
  }
}

function assertWheelSnapshot(wheel, label) {
  assertExactFields(wheel, WHEEL_FIELDS, label);
  if (!Object.isFrozen(wheel)) throw new TypeError(`${label} must be immutable`);
  for (const key of ["timeStamp", "deltaMode", "deltaX", "deltaY"]) {
    if (!Number.isFinite(wheel[key])) throw new TypeError(`${label}.${key} must be finite`);
  }
}

function assertEventControl(control, label) {
  assertExactFields(control, CONTROL_FIELDS, label);
  if (!Object.isFrozen(control)) throw new TypeError(`${label} must be immutable`);
  for (const key of CONTROL_FIELDS) {
    if (typeof control[key] !== "function") throw new TypeError(`${label}.${key} must be a function`);
  }
}

export function assertSceneEvent(event) {
  requireObject(event, "SceneEvent");
  const fields = EVENT_FIELDS[event.type];
  if (!fields) throw new TypeError(`Unknown SceneEvent type: ${String(event.type)}`);
  assertExactFields(event, fields, `SceneEvent.${event.type}`);
  if (!Object.isFrozen(event)) throw new TypeError("SceneEvent must be immutable");
  switch (event.type) {
    case "choose-app-icon":
    case "remove-app":
    case "reset-app-icon":
      requireNonEmptyString(event.itemId, `${event.type}.itemId`);
      break;
    case "context-menu-request":
      assertPointerSnapshot(event.pointer, `${event.type}.pointer`);
      break;
    case "desktop-focus":
      break;
    case "group-release-complete":
      if (!Object.prototype.hasOwnProperty.call(event, "payload")) {
        throw new TypeError("group-release-complete.payload is required");
      }
      break;
    case "internal-activity":
      if (typeof event.active !== "boolean") throw new TypeError("internal-activity.active must be a boolean");
      if (event.folderId !== null) requireNonEmptyString(event.folderId, "internal-activity.folderId");
      break;
    case "icon-pointerdown":
      assertPointerSnapshot(event.pointer, "icon-pointerdown.pointer");
      assertEventControl(event.control, "icon-pointerdown.control");
      requireObject(event.item, "icon-pointerdown.item");
      if (event.source !== null) requireObject(event.source, "icon-pointerdown.source");
      break;
    case "surface-pointerdown":
      assertPointerSnapshot(event.pointer, "surface-pointerdown.pointer");
      assertEventControl(event.control, "surface-pointerdown.control");
      break;
    case "wheel":
      assertWheelSnapshot(event.wheel, "wheel.wheel");
      assertEventControl(event.control, "wheel.control");
      break;
    default:
      throw new TypeError(`Unhandled SceneEvent type: ${String(event.type)}`);
  }
  return event;
}
