const VISUAL_PROGRESS_EPSILON = 0.0001;
const VISUAL_FIELDS = Object.freeze([
  "desktopAlpha",
  "desktopScale",
  "folderAlpha",
  "folderScale",
]);
const VISUAL_FIELDS_BY_SCOPE = Object.freeze({
  desktop: Object.freeze(["desktopAlpha", "desktopScale"]),
  folder: Object.freeze(["folderAlpha", "folderScale"]),
});

function requireSessionId(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function snapshotVisual(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const snapshot = {};
  for (const field of VISUAL_FIELDS) {
    const number = Number(value[field]);
    if (!Number.isFinite(number)) throw new TypeError(`${label}.${field} must be finite`);
    snapshot[field] = number;
  }
  return Object.freeze(snapshot);
}

function requireScope(value) {
  if (!Object.prototype.hasOwnProperty.call(VISUAL_FIELDS_BY_SCOPE, value)) {
    throw new TypeError('scope must be "desktop" or "folder"');
  }
  return value;
}

function distanceToTarget(snapshot, target, scope) {
  return VISUAL_FIELDS_BY_SCOPE[scope]
    .reduce((distance, field) => distance + Math.abs(snapshot[field] - target[field]), 0);
}

export function createAppLaunchVisualCommitTracker({
  cancelAnimationFrame = globalThis.cancelAnimationFrame,
  getCurrentSessionId,
  onCommit,
  requestAnimationFrame = globalThis.requestAnimationFrame,
} = {}) {
  if (typeof requestAnimationFrame !== "function") {
    throw new TypeError("createAppLaunchVisualCommitTracker requires requestAnimationFrame");
  }
  if (typeof getCurrentSessionId !== "function") {
    throw new TypeError("createAppLaunchVisualCommitTracker requires getCurrentSessionId");
  }
  if (typeof onCommit !== "function") {
    throw new TypeError("createAppLaunchVisualCommitTracker requires onCommit");
  }

  let destroyed = false;
  let session = null;

  function cancelPresentationFrame() {
    if (session?.presentationFrame == null) return;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(session.presentationFrame);
    session.presentationFrame = null;
  }

  function reset() {
    cancelPresentationFrame();
    session = null;
  }

  function beforeRender({ scope, sessionId, snapshot, target } = {}) {
    if (destroyed) return false;
    if (sessionId == null) {
      reset();
      return false;
    }
    const normalizedSessionId = requireSessionId(sessionId, "sessionId");
    if (session?.id === normalizedSessionId) return true;
    reset();
    session = {
      baseline: snapshotVisual(snapshot, "snapshot"),
      committed: false,
      id: normalizedSessionId,
      presentationFrame: null,
      scope: requireScope(scope),
      target: snapshotVisual(target, "target"),
    };
    return true;
  }

  function afterRender({ sessionId, snapshot } = {}) {
    if (destroyed || sessionId == null) return false;
    const normalizedSessionId = requireSessionId(sessionId, "sessionId");
    if (
      !session ||
      session.id !== normalizedSessionId ||
      session.committed ||
      session.presentationFrame != null
    ) {
      return false;
    }
    const current = snapshotVisual(snapshot, "snapshot");
    const baselineDistance = distanceToTarget(session.baseline, session.target, session.scope);
    const currentDistance = distanceToTarget(current, session.target, session.scope);
    if (baselineDistance - currentDistance <= VISUAL_PROGRESS_EPSILON) return false;

    const pendingSession = session;
    pendingSession.presentationFrame = requestAnimationFrame(() => {
      pendingSession.presentationFrame = null;
      if (
        destroyed ||
        session !== pendingSession ||
        getCurrentSessionId() !== pendingSession.id
      ) {
        if (session === pendingSession) session = null;
        return;
      }
      pendingSession.committed = true;
      onCommit(pendingSession.id);
    });
    return true;
  }

  function destroy() {
    destroyed = true;
    reset();
  }

  return Object.freeze({
    afterRender,
    beforeRender,
    destroy,
    reset,
  });
}
