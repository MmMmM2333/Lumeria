import { motionRuntime } from "../animation/motionRuntime.js";

const FRAME_VISUAL_PENDING_KEY = "frame:visual";
const FRAME_COMPLETE_PENDING_KEY = "frame:complete";

function roundGeometryValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

export function makeFolderPanelTargetKey(folderId, targetX, targetY, panelRect) {
  return [
    folderId || "",
    roundGeometryValue(targetX),
    roundGeometryValue(targetY),
    roundGeometryValue(panelRect?.width),
    roundGeometryValue(panelRect?.height),
  ].join(":");
}

function makeGhostVisualPendingKey(itemId) {
  return itemId ? `ghost:visual:${itemId}` : null;
}

function makeGhostCompletePendingKey(itemId) {
  return itemId ? `ghost:complete:${itemId}` : null;
}

function makePreviewSwapPendingKey(key) {
  return key ? `preview:${key}` : null;
}

function makeInitialState() {
  return {
    completedControllerGhostKeys: [],
    completedPreviewGhosts: [],
    detachedFrameTarget: null,
    detachedGhostMotion: new WeakMap(),
    folderHandoffGhost: null,
    folderId: null,
    frameComplete: false,
    frameVisualComplete: false,
    ghostKeys: new Set(),
    handoffActive: false,
    handoffCleanupFrame: null,
    handoffCleanupToken: 0,
    handoffReadySettled: false,
    handoffRect: null,
    handoffTarget: null,
    handoffVisualReleased: false,
    motionControls: new Set(),
    overlayPendingKeys: new Set(),
    overlaySettled: false,
    pendingControllerGhostKeys: new Set(),
    phase: "idle",
    previewSwapKeys: new Set(),
    previewSwapMotionControls: null,
    revealTimer: null,
    settlementStarted: false,
    token: null,
    visualGhostKeys: new Set(),
    visualPendingKeys: new Set(),
  };
}

function makeOpeningVisualState() {
  return {
    controllerKeys: new Map(),
    ghostKeys: new Set(),
    motionControls: new Set(),
    motionControlsByItemId: new Map(),
    revealTimer: null,
    sessionToken: null,
    state: null,
  };
}

function cloneRect(rect) {
  return rect ? { ...rect } : null;
}

function normalizeToken(token) {
  return token == null ? null : token;
}

// Open and close intentionally keep independent state/token lines. Open tokens
// live on activeOpenSession and guard reveal; close tokens live on state.token
// and guard closing handoff/settlement.
export class FolderHandoffCoordinator {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.eventSink = options.eventSink || motionRuntime;
    this.activeOpenSession = null;
    this.nextOpenToken = 1;
    this.initialize();
  }

  initialize() {
    if (!this.state) this.state = makeInitialState();
    if (!this.opening) this.opening = makeOpeningVisualState();
  }

  recordCoordinationEvent(action, details = {}) {
    this.eventSink?.recordCoordinationEvent?.({
      action,
      domain: "folderHandoff",
      folderId: details.folderId ?? this.state?.folderId ?? this.activeOpenSession?.folderId ?? null,
      phase: details.phase ?? this.state?.phase ?? "idle",
      token: details.token ?? this.state?.token ?? this.activeOpenSession?.token ?? null,
      ...details,
    });
  }

  beginOpeningVisuals({ sessionToken = null, state = null } = {}) {
    this.opening = {
      ...makeOpeningVisualState(),
      sessionToken: sessionToken || null,
      state: state || null,
    };
    return this.opening;
  }

  clearOpeningVisuals(options = {}) {
    const previous = this.opening || makeOpeningVisualState();
    this.opening = makeOpeningVisualState();
    if (options.keepSessionToken) this.opening.sessionToken = previous.sessionToken || null;
    return previous;
  }

  getOpeningSessionToken() {
    return this.opening?.sessionToken || null;
  }

  setOpeningSessionToken(sessionToken = null) {
    this.opening.sessionToken = sessionToken || null;
    return this.opening.sessionToken;
  }

  isCurrentOpeningVisualSession(sessionToken = null) {
    const activeToken = this.getOpeningSessionToken();
    return Boolean(sessionToken && activeToken === sessionToken);
  }

  getOpeningGhostKeys() {
    return this.opening?.ghostKeys || null;
  }

  hasOpeningGhost(itemId = null) {
    const keys = this.getOpeningGhostKeys();
    if (!keys?.size) return false;
    return itemId == null ? true : keys.has(itemId);
  }

  registerOpeningGhost(itemId, controllerGhostKey = null) {
    if (!itemId) return false;
    this.opening.ghostKeys.add(itemId);
    if (controllerGhostKey) this.opening.controllerKeys.set(itemId, controllerGhostKey);
    return true;
  }

  completeOpeningGhost(itemId, controllerGhostKey = null, sessionToken = null) {
    if (sessionToken && !this.isCurrentOpeningVisualSession(sessionToken)) return false;
    if (!itemId || !this.opening.ghostKeys.has(itemId)) return false;
    this.opening.ghostKeys.delete(itemId);
    this.opening.controllerKeys.delete(itemId);
    if (controllerGhostKey) this.opening.state?.completeFolderOpenIconGhost?.(controllerGhostKey);
    return true;
  }

  releaseOpeningGhost(itemId, sessionToken = null) {
    if (sessionToken && !this.isCurrentOpeningVisualSession(sessionToken)) return false;
    if (!itemId || !this.opening.ghostKeys.has(itemId)) return false;
    this.opening.ghostKeys.delete(itemId);
    this.opening.controllerKeys.delete(itemId);
    this.opening.motionControlsByItemId.delete(itemId);
    return true;
  }

  getOpeningControllerGhostKeys() {
    return this.opening?.controllerKeys || null;
  }

  completeOpeningControllerGhostKeys() {
    const keys = Array.from(this.opening?.controllerKeys?.values?.() || []);
    for (const key of keys) {
      if (key) this.opening.state?.completeFolderOpenIconGhost?.(key);
    }
    this.opening.controllerKeys.clear();
    return keys;
  }

  setOpeningRevealTimer(timer = null) {
    this.opening.revealTimer = timer || null;
    return this.opening.revealTimer;
  }

  clearOpeningRevealTimer(cancelTimer = null) {
    const timer = this.opening?.revealTimer || null;
    if (!timer) return null;
    if (typeof cancelTimer === "function") cancelTimer(timer);
    this.opening.revealTimer = null;
    return timer;
  }

  clearOpeningRevealTimerRef() {
    this.opening.revealTimer = null;
  }

  getOpeningRevealTimer() {
    return this.opening?.revealTimer || null;
  }

  addOpeningMotionControl(itemId, control) {
    if (!itemId || !control) return false;
    this.opening.motionControls.add(control);
    this.opening.motionControlsByItemId.set(itemId, control);
    return true;
  }

  deleteOpeningMotionControl(itemId, control = null) {
    const activeControl = control || this.opening.motionControlsByItemId.get(itemId);
    if (activeControl) this.opening.motionControls.delete(activeControl);
    if (itemId) this.opening.motionControlsByItemId.delete(itemId);
  }

  getOpeningMotionControl(itemId) {
    return itemId ? this.opening.motionControlsByItemId.get(itemId) || null : null;
  }

  consumeOpeningMotionControls() {
    const controls = this.opening.motionControls;
    this.opening.motionControls = new Set();
    this.opening.motionControlsByItemId = new Map();
    return controls;
  }

  hasActiveOpeningVisuals() {
    return Boolean(this.opening?.ghostKeys?.size);
  }

  beginOpen(folderId, targetKey, options = {}) {
    const current = this.activeOpenSession;
    const nextFolderId = folderId || null;
    const nextTargetKey = targetKey || "";
    const shouldReuse = !options.forceNew &&
      current &&
      current.folderId === nextFolderId;

    if (shouldReuse) {
      if (current.targetKey !== nextTargetKey) {
        current.targetKey = nextTargetKey;
        current.geometrySnapshot = null;
        current.geometryLayoutKey = null;
        if (!current.revealed) current.panelReady = false;
        this.recordCoordinationEvent("phase", {
          event: "open-retarget",
          folderId: nextFolderId,
          phase: "opening",
          targetKey: nextTargetKey,
          token: current.token,
        });
      }
      return { session: current, started: false };
    }

    const session = {
      folderId: nextFolderId,
      ghostsReady: false,
      panelReady: false,
      revealed: false,
      geometryLayoutKey: null,
      geometrySnapshot: null,
      targetKey: nextTargetKey,
      token: this.nextOpenToken,
    };
    this.nextOpenToken += 1;
    this.activeOpenSession = session;
    this.recordCoordinationEvent("phase", {
      event: "open-begin",
      folderId: nextFolderId,
      phase: "opening",
      targetKey: nextTargetKey,
      token: session.token,
    });
    return { session, started: true };
  }

  get activeOpenToken() {
    return this.activeOpenSession?.token || null;
  }

  isCurrentOpen(token) {
    return Boolean(token && this.activeOpenSession?.token === token);
  }

  markPanelPending(token, targetKey = null) {
    if (!this.isCurrentOpen(token)) return false;
    if (targetKey != null && this.activeOpenSession.targetKey !== targetKey) {
      this.activeOpenSession.targetKey = targetKey;
      this.activeOpenSession.geometrySnapshot = null;
      this.activeOpenSession.geometryLayoutKey = null;
    }
    if (!this.activeOpenSession.revealed) this.activeOpenSession.panelReady = false;
    return true;
  }

  setOpenGeometrySnapshot(token, snapshot) {
    if (!this.isCurrentOpen(token) || !snapshot) return false;
    const session = this.activeOpenSession;
    const nextLayoutKey = snapshot.layoutKey || null;
    if (session.geometryLayoutKey === nextLayoutKey && session.geometrySnapshot === snapshot) return false;
    if (session.geometryLayoutKey && session.geometryLayoutKey !== nextLayoutKey && !session.revealed) {
      session.panelReady = false;
    }
    session.geometryLayoutKey = nextLayoutKey;
    session.geometrySnapshot = snapshot;
    return true;
  }

  getOpenGeometrySnapshot(token = null) {
    const session = this.activeOpenSession;
    if (!session) return null;
    if (token != null && session.token !== token) return null;
    return session.geometrySnapshot || null;
  }

  markPanelReady(token) {
    if (!this.isCurrentOpen(token)) return false;
    if (this.activeOpenSession.panelReady) return false;
    this.activeOpenSession.panelReady = true;
    this.recordCoordinationEvent("visibility", {
      event: "open-panel-ready",
      folderId: this.activeOpenSession.folderId || null,
      phase: "opening",
      token,
    });
    return true;
  }

  markGhostsReady(token) {
    if (!this.isCurrentOpen(token)) return false;
    if (this.activeOpenSession.ghostsReady) return false;
    this.activeOpenSession.ghostsReady = true;
    this.recordCoordinationEvent("visibility", {
      event: "open-ghosts-ready",
      folderId: this.activeOpenSession.folderId || null,
      phase: "opening",
      token,
    });
    return true;
  }

  canReveal(token) {
    const session = this.activeOpenSession;
    return Boolean(
      token &&
      session?.token === token &&
      session.panelReady &&
      session.ghostsReady &&
      !session.revealed
    );
  }

  finishReveal(token) {
    if (!this.canReveal(token)) return false;
    this.activeOpenSession.revealed = true;
    this.recordCoordinationEvent("visibility", {
      event: "open-reveal",
      folderId: this.activeOpenSession.folderId || null,
      phase: "opening",
      token,
    });
    return true;
  }

  isRevealPending() {
    const session = this.activeOpenSession;
    return Boolean(session && !session.revealed);
  }

  cancelOpen(token = null) {
    if (token && !this.isCurrentOpen(token)) return false;
    if (!this.activeOpenSession) return false;
    const session = this.activeOpenSession;
    this.activeOpenSession = null;
    this.recordCoordinationEvent("phase", {
      event: "open-cancel",
      folderId: session.folderId || null,
      phase: "idle",
      token: session.token,
    });
    return true;
  }

  beginCloseTransition(folderId = null, options = {}) {
    const { closeToken = null, handoffGeometry = null } = options;
    const wasHandoffActive = this.state.handoffActive;
    const previousCleanupFrame = this.state.handoffCleanupFrame;
    const previousCleanupToken = this.state.handoffCleanupToken;
    this.state = {
      ...makeInitialState(),
      folderId: folderId || null,
      handoffCleanupFrame: previousCleanupFrame,
      handoffCleanupToken: previousCleanupToken,
      phase: "closing",
      token: normalizeToken(closeToken),
    };
    this.registerFramePending();
    if (handoffGeometry) this.setCloseHandoffGeometry(handoffGeometry);
    if (wasHandoffActive) this.layer?.onInternalActivityChange?.(false, null);
    this.recordCoordinationEvent("phase", {
      event: "close-begin",
      folderId: this.state.folderId || null,
      phase: "closing",
      token: this.state.token,
    });
    return this.closeToken;
  }

  resetSettlement() {
    const state = this.state;
    state.frameComplete = false;
    state.frameVisualComplete = false;
    state.handoffReadySettled = false;
    state.overlayPendingKeys = new Set();
    state.overlaySettled = false;
    state.settlementStarted = false;
    state.visualPendingKeys = new Set();
  }

  clearCloseVisualState() {
    const state = this.state;
    state.completedControllerGhostKeys = [];
    state.completedPreviewGhosts = [];
    state.detachedFrameTarget = null;
    state.detachedGhostMotion = new WeakMap();
    state.ghostKeys.clear();
    state.handoffRect = null;
    state.handoffTarget = null;
    state.handoffVisualReleased = false;
    state.motionControls = new Set();
    state.pendingControllerGhostKeys = new Set();
    state.phase = state.folderId ? "closing" : "idle";
    state.previewSwapKeys.clear();
    state.previewSwapMotionControls = null;
    state.visualGhostKeys.clear();
    this.resetSettlement();
    this.setCloseHandoffActive(false);
  }

  snapshot() {
    const state = this.state;
    return {
      completedControllerGhostKeys: [...state.completedControllerGhostKeys],
      completedPreviewGhostCount: state.completedPreviewGhosts.length,
      detachedFrameTarget: cloneRect(state.detachedFrameTarget),
      folderId: state.folderId,
      frameComplete: state.frameComplete,
      frameVisualComplete: state.frameVisualComplete,
      ghostKeys: new Set(state.ghostKeys),
      handoffActive: state.handoffActive,
      handoffCleanupFrame: state.handoffCleanupFrame,
      handoffCleanupToken: state.handoffCleanupToken,
      handoffReadySettled: state.handoffReadySettled,
      handoffRect: cloneRect(state.handoffRect),
      handoffTarget: state.handoffTarget,
      handoffVisualReleased: state.handoffVisualReleased,
      motionControlCount: state.motionControls?.size || 0,
      overlayPendingKeys: new Set(state.overlayPendingKeys),
      overlaySettled: state.overlaySettled,
      opening: {
        controllerKeys: new Map(this.opening?.controllerKeys || []),
        ghostKeys: new Set(this.opening?.ghostKeys || []),
        motionControlCount: this.opening?.motionControls?.size || 0,
        revealTimerActive: Boolean(this.opening?.revealTimer),
        sessionToken: this.opening?.sessionToken || null,
      },
      pendingControllerGhostKeys: new Set(state.pendingControllerGhostKeys),
      phase: state.phase,
      previewSwapKeys: new Set(state.previewSwapKeys),
      previewSwapMotionControlCount: state.previewSwapMotionControls?.size || 0,
      revealTimerActive: Boolean(state.revealTimer),
      token: state.token,
      visualGhostKeys: new Set(state.visualGhostKeys),
      visualPendingKeys: new Set(state.visualPendingKeys),
    };
  }

  setCloseFolderId(folderId = null) {
    this.state.folderId = folderId || null;
    if (this.state.folderId && this.state.phase === "idle") this.state.phase = "closing";
  }

  clearCloseFolderId() {
    this.setCloseFolderId(null);
    if (!this.hasActiveCloseVisuals() && !this.state.handoffActive) this.state.phase = "idle";
  }

  clearCloseToken() {
    this.state.token = null;
  }

  takeCloseToken() {
    const token = this.closeToken;
    this.clearCloseToken();
    return token;
  }

  isCurrentCloseToken(token = null) {
    return this.state.token === normalizeToken(token);
  }

  registerFramePending() {
    const state = this.state;
    state.settlementStarted = true;
    state.visualPendingKeys.add(FRAME_VISUAL_PENDING_KEY);
    state.overlayPendingKeys.add(FRAME_COMPLETE_PENDING_KEY);
  }

  registerVisualPending(key) {
    if (!key) return;
    this.state.settlementStarted = true;
    this.state.visualPendingKeys.add(key);
  }

  registerOverlayPending(key) {
    if (!key) return;
    this.state.settlementStarted = true;
    this.state.overlayPendingKeys.add(key);
  }

  collectSettlementEvents() {
    const state = this.state;
    if (!state.settlementStarted) return [];
    const events = [];
    if (!state.handoffReadySettled && state.visualPendingKeys.size === 0) {
      state.handoffReadySettled = true;
      const event = { folderId: state.folderId || null, token: state.token, type: "handoffReady" };
      events.push(event);
      this.recordCoordinationEvent("settlement", {
        event: "handoff-ready",
        folderId: event.folderId,
        pendingOverlayCount: state.overlayPendingKeys.size,
        pendingVisualCount: state.visualPendingKeys.size,
        phase: state.phase,
        token: event.token,
      });
    }
    if (!state.overlaySettled && state.overlayPendingKeys.size === 0) {
      state.overlaySettled = true;
      state.phase = state.folderId ? "settled" : "idle";
      const event = { folderId: state.folderId || null, token: state.token, type: "overlaySettled" };
      events.push(event);
      this.recordCoordinationEvent("settlement", {
        event: "overlay-settled",
        folderId: event.folderId,
        pendingOverlayCount: state.overlayPendingKeys.size,
        pendingVisualCount: state.visualPendingKeys.size,
        phase: state.phase,
        token: event.token,
      });
    }
    return events;
  }

  releasePending(token, keys) {
    if (!this.isCurrentCloseToken(token)) return [];
    const pendingKeys = Array.isArray(keys) ? keys : [keys];
    for (const key of pendingKeys) {
      if (!key) continue;
      this.state.visualPendingKeys.delete(key);
      this.state.overlayPendingKeys.delete(key);
    }
    return this.collectSettlementEvents();
  }

  completeCloseFrameVisual(token = this.state.token) {
    if (!this.isCurrentCloseToken(token)) return [];
    this.state.frameVisualComplete = true;
    return this.releasePending(token, FRAME_VISUAL_PENDING_KEY);
  }

  completeCloseFrame(token = this.state.token) {
    if (!this.isCurrentCloseToken(token)) return [];
    this.state.frameComplete = true;
    this.state.frameVisualComplete = true;
    return this.releasePending(token, [
      FRAME_VISUAL_PENDING_KEY,
      FRAME_COMPLETE_PENDING_KEY,
    ]);
  }

  completeCloseGhostVisual(token = this.state.token, itemId = null) {
    if (!this.isCurrentCloseToken(token)) return null;
    const key = makeGhostVisualPendingKey(itemId);
    if (itemId) this.state.visualGhostKeys.delete(itemId);
    return this.releasePending(token, key);
  }

  completeCloseGhost(token = this.state.token, itemId = null, controllerGhostKey = null) {
    if (!this.isCurrentCloseToken(token)) return null;
    if (controllerGhostKey) this.state.completedControllerGhostKeys.push(controllerGhostKey);
    const keys = [makeGhostCompletePendingKey(itemId)];
    if (itemId) {
      this.state.ghostKeys.delete(itemId);
      if (this.state.visualGhostKeys.has(itemId)) {
        this.state.visualGhostKeys.delete(itemId);
        keys.push(makeGhostVisualPendingKey(itemId));
      }
    }
    return this.releasePending(token, keys);
  }

  completeClosePreviewSwap(token = this.state.token, key = null) {
    if (!this.isCurrentCloseToken(token)) return null;
    if (key && !this.state.previewSwapKeys.has(key)) return null;
    if (key) this.state.previewSwapKeys.delete(key);
    return this.releasePending(token, makePreviewSwapPendingKey(key));
  }

  releaseCloseOverlayVisuals(token = this.state.token) {
    if (!this.isCurrentCloseToken(token)) return null;
    if (this.state.handoffVisualReleased) return null;
    this.state.handoffVisualReleased = true;
    this.state.frameComplete = true;
    this.state.frameVisualComplete = true;
    this.state.ghostKeys.clear();
    this.state.previewSwapKeys.clear();
    this.state.visualGhostKeys.clear();
    this.state.visualPendingKeys.clear();
    this.state.overlayPendingKeys.clear();
    this.recordCoordinationEvent("ownership", {
      event: "overlay-visual-release",
      folderId: this.state.folderId || null,
      phase: this.state.phase,
      token,
    });
    return this.collectSettlementEvents();
  }

  resetCloseHandoffVisualRelease() {
    this.state.handoffVisualReleased = false;
  }

  setRevealTimer(timer = null) {
    this.state.revealTimer = timer || null;
  }

  clearRevealTimer(cancelTimer = null) {
    const timer = this.state.revealTimer;
    if (!timer) return null;
    if (typeof cancelTimer === "function") cancelTimer(timer);
    this.state.revealTimer = null;
    return timer;
  }

  clearRevealTimerRef() {
    this.state.revealTimer = null;
  }

  setCloseHandoffGeometry({ detachedTarget = null, rect = null, target = null } = {}) {
    this.state.detachedFrameTarget = detachedTarget;
    this.state.handoffRect = rect;
    this.state.handoffTarget = target;
    this.recordCoordinationEvent("ownership", {
      event: "close-geometry",
      folderId: this.state.folderId || target?.folderId || null,
      hasDetachedTarget: Boolean(detachedTarget),
      hasHandoffRect: Boolean(rect),
      hasHandoffTarget: Boolean(target),
      phase: this.state.phase,
      token: this.state.token,
    });
  }

  getHandoffRect() {
    return this.state.handoffRect;
  }

  getHandoffTarget() {
    return this.state.handoffTarget;
  }

  getDetachedFrameTarget() {
    return this.state.detachedFrameTarget;
  }

  setDetachedClosingGhostMotion(ghost, motion = null) {
    if (!ghost || !motion) return false;
    this.state.detachedGhostMotion.set(ghost, { ...motion });
    return true;
  }

  getDetachedClosingGhostMotion(ghost) {
    if (!ghost) return null;
    const motion = this.state.detachedGhostMotion.get(ghost);
    return motion ? { ...motion } : null;
  }

  deleteDetachedClosingGhostMotion(ghost) {
    if (!ghost) return false;
    return this.state.detachedGhostMotion.delete(ghost);
  }

  trackCloseGhost(target, controllerGhostKey = null) {
    const itemId = target?.item?.id;
    if (itemId) {
      this.state.ghostKeys.add(itemId);
      this.registerOverlayPending(makeGhostCompletePendingKey(itemId));
      if (target.isThumbnailChild) {
        this.state.visualGhostKeys.add(itemId);
        this.registerVisualPending(makeGhostVisualPendingKey(itemId));
      }
    }
    if (controllerGhostKey) this.state.pendingControllerGhostKeys.add(controllerGhostKey);
  }

  trackCloseGhosts(targets, getControllerGhostKey = null) {
    for (const target of targets || []) {
      const controllerGhostKey = typeof getControllerGhostKey === "function"
        ? getControllerGhostKey(target)
        : target?.controllerGhostKey || null;
      this.trackCloseGhost(target, controllerGhostKey);
    }
  }

  hasCloseGhost(itemId) {
    return this.state.ghostKeys.has(itemId) === true;
  }

  deleteCloseGhost(itemId) {
    if (!itemId) return;
    this.state.ghostKeys.delete(itemId);
  }

  deleteCloseVisualGhost(itemId) {
    if (!itemId) return;
    this.state.visualGhostKeys.delete(itemId);
  }

  clearCloseGhostKeys() {
    this.state.ghostKeys.clear();
    this.state.visualGhostKeys.clear();
  }

  getGhostKeys() {
    return this.state.ghostKeys;
  }

  getVisualGhostKeys() {
    return this.state.visualGhostKeys;
  }

  addCloseMotionControl(control) {
    if (!control) return;
    if (!this.state.motionControls) this.state.motionControls = new Set();
    this.state.motionControls.add(control);
  }

  deleteCloseMotionControl(control) {
    this.state.motionControls?.delete(control);
  }

  consumeCloseMotionControls() {
    const controls = this.state.motionControls;
    this.state.motionControls = null;
    return controls;
  }

  trackClosePreviewSwap(key) {
    if (!key) return;
    this.state.previewSwapKeys.add(key);
    const pendingKey = makePreviewSwapPendingKey(key);
    this.registerVisualPending(pendingKey);
    this.registerOverlayPending(pendingKey);
  }

  hasClosePreviewSwap(key) {
    return this.state.previewSwapKeys.has(key) === true;
  }

  clearClosePreviewSwaps() {
    this.state.previewSwapKeys.clear();
  }

  getPreviewSwapKeys() {
    return this.state.previewSwapKeys;
  }

  resetClosePreviewSwapMotionControls() {
    this.state.previewSwapMotionControls = new Set();
    return this.state.previewSwapMotionControls;
  }

  consumeClosePreviewSwapMotionControls() {
    const controls = this.state.previewSwapMotionControls;
    this.state.previewSwapMotionControls = null;
    return controls;
  }

  addClosePreviewSwapMotionControl(control) {
    if (!control) return;
    if (!this.state.previewSwapMotionControls) this.resetClosePreviewSwapMotionControls();
    this.state.previewSwapMotionControls.add(control);
  }

  deleteClosePreviewSwapMotionControl(control) {
    this.state.previewSwapMotionControls?.delete(control);
  }

  ensureClosePreviewSwaps() {
    return this.state.previewSwapKeys;
  }

  isFrameVisualComplete() {
    return this.state.frameVisualComplete || this.state.frameComplete;
  }

  isFrameComplete() {
    return this.state.frameComplete;
  }

  consumeControllerGhostKeys() {
    const pendingKeys = Array.from(this.state.pendingControllerGhostKeys);
    const completedKeys = this.state.completedControllerGhostKeys;
    const keys = pendingKeys.length
      ? Array.from(new Set([...pendingKeys, ...completedKeys]))
      : completedKeys;
    this.state.pendingControllerGhostKeys = new Set();
    this.state.completedControllerGhostKeys = [];
    return keys;
  }

  addCompletedPreviewGhost(ghost) {
    if (ghost) this.state.completedPreviewGhosts.push(ghost);
  }

  consumeCompletedPreviewGhosts() {
    const ghosts = this.state.completedPreviewGhosts;
    this.state.completedPreviewGhosts = [];
    return ghosts;
  }

  getCompletedPreviewGhosts() {
    return this.state.completedPreviewGhosts;
  }

  setFolderHandoffGhost(ghost = null) {
    this.state.folderHandoffGhost = ghost || null;
  }

  getFolderHandoffGhost() {
    return this.state.folderHandoffGhost;
  }

  takeFolderHandoffGhost() {
    const ghost = this.state.folderHandoffGhost;
    this.state.folderHandoffGhost = null;
    return ghost;
  }

  isCloseHandoffActive() {
    return this.state.handoffActive === true;
  }

  setCloseHandoffActive(active) {
    const next = Boolean(active);
    if (this.state.handoffActive === next) return;
    this.state.handoffActive = next;
    const folderId = next ? this.state.folderId || this.layer?.currentFolderId || null : null;
    this.recordCoordinationEvent("visibility", {
      active: next,
      event: "close-handoff-active",
      folderId,
      phase: this.state.phase,
      token: this.state.token,
    });
    if (next) this.layer?.onClosingHandoffReady?.(folderId);
    this.layer?.onInternalActivityChange?.(next, folderId);
  }

  startCloseHandoff() {
    if (this.isCloseHandoffActive()) return false;
    this.setCloseHandoffActive(true);
    return true;
  }

  finishCloseHandoffCleanup() {
    const folderId = this.state.folderId || null;
    const token = this.state.token;
    this.clearCloseFolderId();
    this.resetCloseHandoffVisualRelease();
    this.setCloseHandoffActive(false);
    this.recordCoordinationEvent("phase", {
      event: "close-cleanup-finish",
      folderId,
      phase: "idle",
      token,
    });
  }

  hasActiveCloseVisuals() {
    return Boolean(this.state.ghostKeys.size || this.state.previewSwapKeys.size);
  }

  cancelHandoffCleanup(cancelAnimationFrame = globalThis.cancelAnimationFrame) {
    this.state.handoffCleanupToken = (Number(this.state.handoffCleanupToken) || 0) + 1;
    if (this.state.handoffCleanupFrame == null) return;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.state.handoffCleanupFrame);
    this.state.handoffCleanupFrame = null;
  }

  scheduleHandoffCleanup(cleanup, scheduler = globalThis) {
    this.cancelHandoffCleanup(scheduler.cancelAnimationFrame);
    const token = (Number(this.state.handoffCleanupToken) || 0) + 1;
    this.state.handoffCleanupToken = token;

    const runCleanup = () => {
      if (token !== this.state.handoffCleanupToken) return;
      this.state.handoffCleanupFrame = null;
      cleanup();
    };

    if (typeof scheduler.requestAnimationFrame === "function") {
      this.state.handoffCleanupFrame = scheduler.requestAnimationFrame(runCleanup);
      return;
    }
    runCleanup();
  }

  get folderId() {
    return this.state.folderId || null;
  }

  get closeToken() {
    return this.state.token || null;
  }
}

export function ensureFolderHandoffCoordinator(layer) {
  if (!layer.folderHandoff) layer.folderHandoff = new FolderHandoffCoordinator(layer);
  else {
    layer.folderHandoff.layer = layer;
    if (!layer.folderHandoff.eventSink) layer.folderHandoff.eventSink = motionRuntime;
    layer.folderHandoff.initialize?.();
  }
  return layer.folderHandoff;
}
