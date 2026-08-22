const VISUAL_PROGRESS_EPSILON = 0.0001;
const VISUAL_FIELDS = Object.freeze([
  "desktopAlpha",
  "desktopScale",
  "folderAlpha",
  "folderScale",
] as const);
export type AppLaunchVisualField = typeof VISUAL_FIELDS[number];
export type AppLaunchVisualScope = "desktop" | "folder";
export type AppLaunchVisualSnapshot = Readonly<Record<AppLaunchVisualField, number>>;

const VISUAL_FIELDS_BY_SCOPE = Object.freeze({
  desktop: Object.freeze(["desktopAlpha", "desktopScale"]),
  folder: Object.freeze(["folderAlpha", "folderScale"]),
} satisfies Record<AppLaunchVisualScope, readonly AppLaunchVisualField[]>);

export interface AppLaunchVisualCommitTrackerOptions {
  cancelAnimationFrame?: ((handle: number) => void) | undefined;
  getCurrentSessionId: () => number | null | undefined;
  onCommit: (sessionId: number) => void;
  requestAnimationFrame?: ((callback: FrameRequestCallback) => number) | undefined;
}

export interface AppLaunchVisualBeforeRenderOptions {
  scope?: AppLaunchVisualScope | undefined;
  sessionId?: number | null | undefined;
  snapshot?: AppLaunchVisualSnapshot | undefined;
  target?: AppLaunchVisualSnapshot | undefined;
}

export interface AppLaunchVisualAfterRenderOptions {
  sessionId?: number | null | undefined;
  snapshot?: AppLaunchVisualSnapshot | undefined;
}

export interface AppLaunchVisualCommitTracker {
  afterRender(options?: AppLaunchVisualAfterRenderOptions): boolean;
  beforeRender(options?: AppLaunchVisualBeforeRenderOptions): boolean;
  destroy(): void;
  reset(): void;
}

interface AppLaunchVisualSession {
  baseline: AppLaunchVisualSnapshot;
  committed: boolean;
  id: number;
  presentationFrame: number | null;
  scope: AppLaunchVisualScope;
  target: AppLaunchVisualSnapshot;
}

function requireSessionId(value: unknown, label: string): number {
  if (!Number.isInteger(value as number) || (value as number) <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value as number;
}

function snapshotVisual(value: unknown, label: string): AppLaunchVisualSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const snapshot = {} as Record<AppLaunchVisualField, number>;
  for (const field of VISUAL_FIELDS) {
    const number = Number((value as Readonly<Record<string, unknown>>)[field]);
    if (!Number.isFinite(number)) throw new TypeError(`${label}.${field} must be finite`);
    snapshot[field] = number;
  }
  return Object.freeze(snapshot);
}

function requireScope(value: unknown): AppLaunchVisualScope {
  if (!Object.prototype.hasOwnProperty.call(VISUAL_FIELDS_BY_SCOPE, value as PropertyKey)) {
    throw new TypeError('scope must be "desktop" or "folder"');
  }
  return value as AppLaunchVisualScope;
}

function distanceToTarget(
  snapshot: AppLaunchVisualSnapshot,
  target: AppLaunchVisualSnapshot,
  scope: AppLaunchVisualScope,
): number {
  return VISUAL_FIELDS_BY_SCOPE[scope]
    .reduce((distance, field) => distance + Math.abs(snapshot[field] - target[field]), 0);
}

export function createAppLaunchVisualCommitTracker(
  options: AppLaunchVisualCommitTrackerOptions,
): Readonly<AppLaunchVisualCommitTracker> {
  if (!options) {
    throw new TypeError("createAppLaunchVisualCommitTracker requires getCurrentSessionId");
  }
  const {
    cancelAnimationFrame = globalThis.cancelAnimationFrame,
    getCurrentSessionId,
    onCommit,
    requestAnimationFrame = globalThis.requestAnimationFrame,
  } = options;
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
  let session: AppLaunchVisualSession | null = null;

  function cancelPresentationFrame(): void {
    if (session?.presentationFrame == null) return;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(session.presentationFrame);
    session.presentationFrame = null;
  }

  function reset(): void {
    cancelPresentationFrame();
    session = null;
  }

  function beforeRender({
    scope,
    sessionId,
    snapshot,
    target
  }: AppLaunchVisualBeforeRenderOptions = {}): boolean {
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

  function afterRender({ sessionId, snapshot }: AppLaunchVisualAfterRenderOptions = {}): boolean {
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

  function destroy(): void {
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
