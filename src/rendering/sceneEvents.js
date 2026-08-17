/**
 * Renderer-to-application semantic events. The renderer never emits DOM
 * events directly across the application boundary; it emits one of these
 * explicit event shapes instead.
 */

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

/** @param {string} itemId */
export function makeChooseAppIconEvent(itemId) {
  return { type: "choose-app-icon", itemId: requireNonEmptyString(itemId, "itemId") };
}

/** @param {unknown} event */
export function makeContextMenuRequestEvent(event) {
  return { type: "context-menu-request", event: requireObject(event, "event") };
}

export function makeDesktopFocusEvent() {
  return { type: "desktop-focus" };
}

/** @param {unknown} payload */
export function makeGroupReleaseCompleteEvent(payload) {
  return { type: "group-release-complete", payload };
}

/** @param {boolean} active @param {string | null | undefined} folderId */
export function makeInternalActivityEvent(active, folderId = null) {
  if (typeof active !== "boolean") {
    throw new TypeError("active must be a boolean");
  }
  if (folderId !== null && folderId !== undefined) {
    requireNonEmptyString(folderId, "folderId");
  }
  return { type: "internal-activity", active, folderId: folderId || null };
}

/** @param {unknown} event @param {unknown} item @param {unknown} source */
export function makeIconPointerdownEvent(event, item, source) {
  return {
    type: "icon-pointerdown",
    event: requireObject(event, "event"),
    item: requireObject(item, "item"),
    source: source ?? null,
  };
}

/** @param {string} itemId */
export function makeRemoveAppEvent(itemId) {
  return { type: "remove-app", itemId: requireNonEmptyString(itemId, "itemId") };
}

/** @param {string} itemId */
export function makeResetAppIconEvent(itemId) {
  return { type: "reset-app-icon", itemId: requireNonEmptyString(itemId, "itemId") };
}

/** @param {unknown} event */
export function makeSurfacePointerdownEvent(event) {
  return { type: "surface-pointerdown", event: requireObject(event, "event") };
}

/** @param {unknown} event */
export function makeWheelEvent(event) {
  return { type: "wheel", event: requireObject(event, "event") };
}

/**
 * @param {unknown} event
 * @returns {object}
 */
export function assertSceneEvent(event) {
  requireObject(event, "SceneEvent");
  switch (event.type) {
    case "choose-app-icon":
    case "remove-app":
    case "reset-app-icon":
      requireNonEmptyString(event.itemId, `${event.type}.itemId`);
      break;
    case "context-menu-request":
    case "surface-pointerdown":
    case "wheel":
      requireObject(event.event, `${event.type}.event`);
      break;
    case "desktop-focus":
      break;
    case "group-release-complete":
      if (!Object.prototype.hasOwnProperty.call(event, "payload")) {
        throw new TypeError("group-release-complete.payload is required");
      }
      break;
    case "internal-activity":
      makeInternalActivityEvent(event.active, event.folderId);
      break;
    case "icon-pointerdown":
      makeIconPointerdownEvent(event.event, event.item, event.source);
      break;
    default:
      throw new TypeError(`Unknown SceneEvent type: ${String(event.type)}`);
  }
  return event;
}
