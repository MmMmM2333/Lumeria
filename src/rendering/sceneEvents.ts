/**
 * Closed renderer-to-application event union.
 *
 * Raw DOM/Pixi events never cross this boundary. Pointer and wheel values are
 * immutable snapshots; the small control object is the only capability that
 * may act on the originating event.
 */

const EVENT_FIELDS = Object.freeze({
  "app-launch-close-frame-committed": Object.freeze(["type", "sessionId"]),
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

type UnknownRecord = Record<string, unknown>;

export type SceneRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export interface SceneEventDataArray extends ReadonlyArray<SceneEventData> {}

export interface SceneEventDataObject {
  readonly [key: string]: SceneEventData;
}

export type SceneEventData =
  | null
  | undefined
  | string
  | number
  | boolean
  | SceneEventDataArray
  | SceneEventDataObject;

export type PointerSnapshot = Readonly<{
  type: string;
  timeStamp: number;
  pointerId: number | null;
  pointerType: string;
  button: number;
  buttons: number | null;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  iconBounds: SceneRect | null;
  dragVisualState: SceneEventData | null;
  folderOriginBounds: SceneEventData | null;
}>;

export type WheelSnapshot = Readonly<{
  timeStamp: number;
  ctrlKey: boolean;
  metaKey: boolean;
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  momentum: boolean | null;
}>;

export type SceneEventControl = Readonly<{
  preventDefault: () => void;
  stopPropagation: () => void;
  targetMatches: (selector: string) => boolean;
  addLostPointerCaptureListener: (listener: EventListenerOrEventListenerObject) => void;
  removeLostPointerCaptureListener: (listener: EventListenerOrEventListenerObject) => void;
  setPointerCapture: (pointerId: number) => void;
  hasPointerCapture: (pointerId: number) => boolean;
  releasePointerCapture: (pointerId: number) => void;
}>;

export type ChooseAppIconSceneEvent = Readonly<{ type: "choose-app-icon"; itemId: string }>;
export type AppLaunchCloseFrameCommittedSceneEvent = Readonly<{
  type: "app-launch-close-frame-committed";
  sessionId: number;
}>;
export type ContextMenuRequestSceneEvent = Readonly<{ type: "context-menu-request"; pointer: PointerSnapshot }>;
export type DesktopFocusSceneEvent = Readonly<{ type: "desktop-focus" }>;
export type GroupReleaseCompleteSceneEvent = Readonly<{
  type: "group-release-complete";
  payload: SceneEventData;
}>;
export type InternalActivitySceneEvent = Readonly<{
  type: "internal-activity";
  active: boolean;
  folderId: string | null;
}>;
export type IconPointerdownSceneEvent = Readonly<{
  type: "icon-pointerdown";
  pointer: PointerSnapshot;
  control: SceneEventControl;
  item: SceneEventDataObject;
  source: SceneEventDataObject | null;
}>;
export type RemoveAppSceneEvent = Readonly<{ type: "remove-app"; itemId: string }>;
export type ResetAppIconSceneEvent = Readonly<{ type: "reset-app-icon"; itemId: string }>;
export type SurfacePointerdownSceneEvent = Readonly<{
  type: "surface-pointerdown";
  pointer: PointerSnapshot;
  control: SceneEventControl;
}>;
export type WheelSceneEvent = Readonly<{
  type: "wheel";
  wheel: WheelSnapshot;
  control: SceneEventControl;
}>;

export type SceneEvent =
  | AppLaunchCloseFrameCommittedSceneEvent
  | ChooseAppIconSceneEvent
  | ContextMenuRequestSceneEvent
  | DesktopFocusSceneEvent
  | GroupReleaseCompleteSceneEvent
  | InternalActivitySceneEvent
  | IconPointerdownSceneEvent
  | RemoveAppSceneEvent
  | ResetAppIconSceneEvent
  | SurfacePointerdownSceneEvent
  | WheelSceneEvent;

type SceneEventType = SceneEvent["type"];
type SceneEventOf<Type extends SceneEventType> = Extract<SceneEvent, { type: Type }>;
type SceneEventFields<Type extends SceneEventType> = Omit<SceneEventOf<Type>, "type">;

type BoundsTarget = UnknownRecord & {
  getBoundingClientRect?: () => unknown;
};

type ControlTarget = UnknownRecord & {
  closest?: (selector: string) => unknown;
  addEventListener?: (name: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (name: string, listener: EventListenerOrEventListenerObject) => void;
  setPointerCapture?: (pointerId: number) => void;
  hasPointerCapture?: (pointerId: number) => boolean;
  releasePointerCapture?: (pointerId: number) => void;
};

type EventSource = UnknownRecord & {
  currentTarget?: BoundsTarget;
  target?: ControlTarget;
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

export type ControlledPointerInput = PointerSnapshot & Readonly<{
  currentTarget: Readonly<{ getBoundingClientRect: () => SceneRect | null }>;
  preventDefault: () => void;
  stopPropagation: () => void;
  target: Readonly<{
    closest: (selector: string) => true | null;
    addEventListener: (name: string, listener: EventListenerOrEventListenerObject) => void;
    removeEventListener: (name: string, listener: EventListenerOrEventListenerObject) => void;
    setPointerCapture: (pointerId: number) => void;
    hasPointerCapture: (pointerId: number) => boolean;
    releasePointerCapture: (pointerId: number) => void;
  }>;
}>;

export type ControlledWheelInput = WheelSnapshot & Readonly<{
  preventDefault: () => void;
  stopPropagation: () => void;
}>;

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireObject(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as UnknownRecord;
}

function assertExactFields(value: unknown, fields: readonly string[], label: string): UnknownRecord {
  const object = requireObject(value, label);
  const keys = Object.keys(object);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    throw new TypeError(`${label} contains unsupported fields`);
  }
  return object;
}

function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function snapshotRect(value: unknown): SceneRect | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rect = value as UnknownRecord;
  return Object.freeze({
    height: readNumber(rect.height),
    width: readNumber(rect.width),
    x: readNumber(rect.x ?? rect.left),
    y: readNumber(rect.y ?? rect.top),
  });
}

function snapshotData(value: unknown, seen = new WeakSet<object>()): SceneEventData {
  if (
    value === null
    || value === undefined
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError("SceneEvent data must contain only snapshot values");
  }
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
  const result: Record<string, SceneEventData> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "function") {
      throw new TypeError(`SceneEvent data.${key} must not contain functions`);
    }
    result[key] = snapshotData(entry, seen);
  }
  seen.delete(value);
  return Object.freeze(result);
}

function makePointerSnapshot(event: unknown): PointerSnapshot {
  const source = requireObject(event, "event") as EventSource;
  const globalPoint = source.global && typeof source.global === "object"
    ? source.global as UnknownRecord
    : null;
  const currentTarget = source.currentTarget && typeof source.currentTarget === "object"
    ? source.currentTarget
    : null;
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
    iconBounds: snapshotRect(currentTarget?.getBoundingClientRect?.() || source.iconBounds),
    dragVisualState: source.dragVisualState == null ? null : snapshotData(source.dragVisualState),
    folderOriginBounds: source.folderOriginBounds == null ? null : snapshotData(source.folderOriginBounds),
  });
}

function makeWheelSnapshot(event: unknown): WheelSnapshot {
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

function makeEventControl(event: unknown): SceneEventControl {
  const source = requireObject(event, "event") as EventSource;
  const target = source.target && typeof source.target === "object" ? source.target : null;
  return Object.freeze({
    preventDefault: () => { source.preventDefault?.(); },
    stopPropagation: () => { source.stopPropagation?.(); },
    targetMatches: (selector) => Boolean(target?.closest?.(selector)),
    addLostPointerCaptureListener: (listener: EventListenerOrEventListenerObject) => {
      target?.addEventListener?.("lostpointercapture", listener);
    },
    removeLostPointerCaptureListener: (listener: EventListenerOrEventListenerObject) => {
      target?.removeEventListener?.("lostpointercapture", listener);
    },
    setPointerCapture: (pointerId: number) => { target?.setPointerCapture?.(pointerId); },
    hasPointerCapture: (pointerId) => target?.hasPointerCapture?.(pointerId) ?? false,
    releasePointerCapture: (pointerId: number) => { target?.releasePointerCapture?.(pointerId); },
  });
}

function makeEvent<Type extends SceneEventType>(
  type: Type,
  fields: SceneEventFields<Type>,
): SceneEventOf<Type> {
  return assertSceneEvent(Object.freeze({ type, ...fields })) as SceneEventOf<Type>;
}

/** Convert a semantic snapshot/capability pair to the renderer-neutral input adapter used by gestures. */
export function makeControlledPointerInput(
  pointer: PointerSnapshot,
  control: SceneEventControl,
): ControlledPointerInput {
  assertPointerSnapshot(pointer, "pointer");
  assertEventControl(control, "control");
  const target = Object.freeze({
    closest: (selector: string) => (control.targetMatches(selector) ? true : null),
    addEventListener: (name: string, listener: EventListenerOrEventListenerObject) => {
      if (name === "lostpointercapture") control.addLostPointerCaptureListener(listener);
    },
    removeEventListener: (name: string, listener: EventListenerOrEventListenerObject) => {
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

export function makeControlledWheelInput(
  wheel: WheelSnapshot,
  control: SceneEventControl,
): ControlledWheelInput {
  assertWheelSnapshot(wheel, "wheel");
  assertEventControl(control, "control");
  return Object.freeze({
    ...wheel,
    preventDefault: control.preventDefault,
    stopPropagation: control.stopPropagation,
  });
}

export function makeChooseAppIconEvent(itemId: string): ChooseAppIconSceneEvent {
  return makeEvent("choose-app-icon", { itemId: requireNonEmptyString(itemId, "itemId") });
}

export function makeAppLaunchCloseFrameCommittedEvent(
  sessionId: number,
): AppLaunchCloseFrameCommittedSceneEvent {
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new TypeError("sessionId must be a positive integer");
  }
  return makeEvent("app-launch-close-frame-committed", { sessionId });
}

/** Context menu requests are controlled in the renderer before publication. */
export function makeContextMenuRequestEvent(event: unknown): ContextMenuRequestSceneEvent {
  return makeEvent("context-menu-request", { pointer: makePointerSnapshot(event) });
}

export function makeDesktopFocusEvent(): DesktopFocusSceneEvent {
  return makeEvent("desktop-focus", {});
}

export function makeGroupReleaseCompleteEvent(payload: unknown): GroupReleaseCompleteSceneEvent {
  return makeEvent("group-release-complete", { payload: snapshotData(payload) });
}

export function makeInternalActivityEvent(
  active: boolean,
  folderId: string | null = null,
): InternalActivitySceneEvent {
  if (typeof active !== "boolean") throw new TypeError("active must be a boolean");
  if (folderId !== null && folderId !== undefined) requireNonEmptyString(folderId, "folderId");
  return makeEvent("internal-activity", { active, folderId: folderId || null });
}

function snapshotObjectData(value: unknown, label: string): SceneEventDataObject {
  const snapshot = snapshotData(requireObject(value, label));
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError(`${label} must produce an object snapshot`);
  }
  return snapshot as SceneEventDataObject;
}

export function makeIconPointerdownEvent(
  event: unknown,
  item: unknown,
  source: unknown,
): IconPointerdownSceneEvent {
  return makeEvent("icon-pointerdown", {
    pointer: makePointerSnapshot(event),
    control: makeEventControl(event),
    item: snapshotObjectData(item, "item"),
    source: source == null ? null : snapshotObjectData(source, "source"),
  });
}

export function makeRemoveAppEvent(itemId: string): RemoveAppSceneEvent {
  return makeEvent("remove-app", { itemId: requireNonEmptyString(itemId, "itemId") });
}

export function makeResetAppIconEvent(itemId: string): ResetAppIconSceneEvent {
  return makeEvent("reset-app-icon", { itemId: requireNonEmptyString(itemId, "itemId") });
}

export function makeSurfacePointerdownEvent(event: unknown): SurfacePointerdownSceneEvent {
  return makeEvent("surface-pointerdown", {
    pointer: makePointerSnapshot(event),
    control: makeEventControl(event),
  });
}

export function makeWheelEvent(event: unknown): WheelSceneEvent {
  return makeEvent("wheel", {
    wheel: makeWheelSnapshot(event),
    control: makeEventControl(event),
  });
}

function assertPointerSnapshot(pointer: unknown, label: string): asserts pointer is PointerSnapshot {
  const snapshot = assertExactFields(pointer, POINTER_FIELDS, label);
  if (!Object.isFrozen(pointer)) throw new TypeError(`${label} must be immutable`);
  for (const key of ["timeStamp", "button", "clientX", "clientY"]) {
    if (!Number.isFinite(snapshot[key])) throw new TypeError(`${label}.${key} must be finite`);
  }
}

function assertWheelSnapshot(wheel: unknown, label: string): asserts wheel is WheelSnapshot {
  const snapshot = assertExactFields(wheel, WHEEL_FIELDS, label);
  if (!Object.isFrozen(wheel)) throw new TypeError(`${label} must be immutable`);
  for (const key of ["timeStamp", "deltaMode", "deltaX", "deltaY"]) {
    if (!Number.isFinite(snapshot[key])) throw new TypeError(`${label}.${key} must be finite`);
  }
}

function assertEventControl(control: unknown, label: string): asserts control is SceneEventControl {
  const capability = assertExactFields(control, CONTROL_FIELDS, label);
  if (!Object.isFrozen(control)) throw new TypeError(`${label} must be immutable`);
  for (const key of CONTROL_FIELDS) {
    if (typeof capability[key] !== "function") throw new TypeError(`${label}.${key} must be a function`);
  }
}

export function assertSceneEvent(event: unknown): SceneEvent {
  const sceneEvent = requireObject(event, "SceneEvent");
  const type = sceneEvent.type;
  if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(EVENT_FIELDS, type)) {
    throw new TypeError(`Unknown SceneEvent type: ${String(type)}`);
  }
  const eventType = type as SceneEventType;
  const fields = EVENT_FIELDS[eventType] as readonly string[];
  assertExactFields(sceneEvent, fields, `SceneEvent.${eventType}`);
  if (!Object.isFrozen(event)) throw new TypeError("SceneEvent must be immutable");
  switch (eventType) {
    case "app-launch-close-frame-committed":
      if (!Number.isInteger(sceneEvent.sessionId) || Number(sceneEvent.sessionId) <= 0) {
        throw new TypeError("app-launch-close-frame-committed.sessionId must be a positive integer");
      }
      break;
    case "choose-app-icon":
    case "remove-app":
    case "reset-app-icon":
      requireNonEmptyString(sceneEvent.itemId, `${eventType}.itemId`);
      break;
    case "context-menu-request":
      assertPointerSnapshot(sceneEvent.pointer, `${eventType}.pointer`);
      break;
    case "desktop-focus":
      break;
    case "group-release-complete":
      if (!Object.prototype.hasOwnProperty.call(sceneEvent, "payload")) {
        throw new TypeError("group-release-complete.payload is required");
      }
      break;
    case "internal-activity":
      if (typeof sceneEvent.active !== "boolean") throw new TypeError("internal-activity.active must be a boolean");
      if (sceneEvent.folderId !== null) requireNonEmptyString(sceneEvent.folderId, "internal-activity.folderId");
      break;
    case "icon-pointerdown":
      assertPointerSnapshot(sceneEvent.pointer, "icon-pointerdown.pointer");
      assertEventControl(sceneEvent.control, "icon-pointerdown.control");
      requireObject(sceneEvent.item, "icon-pointerdown.item");
      if (sceneEvent.source !== null) requireObject(sceneEvent.source, "icon-pointerdown.source");
      break;
    case "surface-pointerdown":
      assertPointerSnapshot(sceneEvent.pointer, "surface-pointerdown.pointer");
      assertEventControl(sceneEvent.control, "surface-pointerdown.control");
      break;
    case "wheel":
      assertWheelSnapshot(sceneEvent.wheel, "wheel.wheel");
      assertEventControl(sceneEvent.control, "wheel.control");
      break;
    default:
      throw new TypeError(`Unhandled SceneEvent type: ${String(eventType)}`);
  }
  return sceneEvent as SceneEvent;
}
