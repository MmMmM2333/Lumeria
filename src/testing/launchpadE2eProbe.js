export const LAUNCHPAD_E2E_PROBE_NAME = "__LUMERIA_E2E__";

function requireFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function`);
  return value;
}

function cloneBounds(bounds, id) {
  if (!bounds) throw new Error(`Rendered icon bounds are unavailable for ${id}`);
  const left = Number(bounds.left);
  const top = Number(bounds.top);
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error(`Rendered icon bounds are invalid for ${id}`);
  }
  return Object.freeze({
    bottom: Number.isFinite(Number(bounds.bottom)) ? Number(bounds.bottom) : top + height,
    height,
    left,
    right: Number.isFinite(Number(bounds.right)) ? Number(bounds.right) : left + width,
    top,
    width,
  });
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function cloneVisualSnapshot(visual) {
  if (visual == null) return null;
  try {
    return deepFreeze(structuredClone(visual));
  } catch (error) {
    throw new Error("Launchpad E2E visual snapshot must be structured-cloneable", { cause: error });
  }
}

function makeLayoutSnapshot(pages) {
  return Object.freeze((pages || []).map((page) => Object.freeze((page || []).map((item) => {
    const snapshot = {
      id: item?.id || null,
      type: item?.type || null,
    };
    if (item?.type === "folder") {
      snapshot.childPages = Object.freeze((item.childPages || []).map((childPage) => (
        Object.freeze((childPage || []).map((child) => Object.freeze({
          id: child?.id || null,
          type: child?.type || null,
        })))
      )));
    }
    return Object.freeze(snapshot);
  }))));
}

function makeSnapshot(state) {
  if (!state || typeof state !== "object") {
    throw new TypeError("Launchpad E2E snapshot state must be an object");
  }
  const drag = state.drag;
  const folder = state.folder || {};
  const hover = state.hover;
  const rollback = state.rollback;
  return Object.freeze({
    drag: drag ? Object.freeze({
      folderTransitFolderId: drag.folderTransit?.folderId || null,
      outcome: drag.outcome || null,
      phase: drag.phase || null,
    }) : null,
    folder: Object.freeze({
      closing: folder.closing === true,
      layerActive: folder.layerActive === true,
      openFolderId: folder.openFolderId || null,
      renderedFolderId: folder.renderedFolderId || null,
    }),
    hover: hover ? Object.freeze({
      phase: hover.phase || null,
      targetId: hover.targetId || null,
      targetType: hover.targetType || null,
    }) : null,
    layout: makeLayoutSnapshot(state.authoritativePages),
    renderedLayout: makeLayoutSnapshot(state.renderedPages),
    rollback: rollback ? Object.freeze({
      folderId: rollback.folderId || null,
      handoffVelocity: Number(rollback.handoffVelocity) || 0,
      phase: rollback.phase || null,
      targetAppId: rollback.targetAppId || null,
      token: rollback.token ?? null,
    }) : null,
    visual: cloneVisualSnapshot(state.visual),
  });
}

export function installLaunchpadE2eProbe(options = {}) {
  if (typeof window === "undefined") {
    throw new Error("Launchpad E2E probe requires a browser window");
  }
  const getIconBounds = requireFunction(options.getIconBounds, "Launchpad E2E getIconBounds");
  const getSnapshotState = requireFunction(
    options.getSnapshotState,
    "Launchpad E2E getSnapshotState"
  );
  if (window[LAUNCHPAD_E2E_PROBE_NAME]) {
    throw new Error("Launchpad E2E probe is already installed");
  }
  const probe = Object.freeze({
    getIconBounds(id) {
      const iconId = String(id || "").trim();
      if (!iconId) throw new TypeError("Launchpad E2E icon id must be non-empty");
      return cloneBounds(getIconBounds(iconId), iconId);
    },
    snapshot() {
      return makeSnapshot(getSnapshotState());
    },
    version: 1,
  });
  Object.defineProperty(window, LAUNCHPAD_E2E_PROBE_NAME, {
    configurable: true,
    enumerable: false,
    value: probe,
    writable: false,
  });
  return () => {
    if (window[LAUNCHPAD_E2E_PROBE_NAME] === probe) {
      delete window[LAUNCHPAD_E2E_PROBE_NAME];
    }
  };
}
