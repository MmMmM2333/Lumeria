const FRAME_VISUAL_PENDING_KEY = "frame:visual";
const FRAME_COMPLETE_PENDING_KEY = "frame:complete";

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

function cloneRect(rect) {
  return rect ? { ...rect } : null;
}

function normalizeToken(token) {
  return token == null ? null : token;
}

export class FolderCloseSession {
  constructor(layer) {
    this.layer = layer;
    this.initialize();
  }

  initialize() {
    if (!this.state) this.state = makeInitialState();
  }

  begin(folderId = null) {
    const wasHandoffActive = this.state.handoffActive;
    const previousCleanupFrame = this.state.handoffCleanupFrame;
    const previousCleanupToken = this.state.handoffCleanupToken;
    this.state = {
      ...makeInitialState(),
      folderId: folderId || null,
      handoffCleanupFrame: previousCleanupFrame,
      handoffCleanupToken: previousCleanupToken,
      phase: "closing",
    };
    this.registerFramePending();
    if (wasHandoffActive) this.layer?.onInternalActivityChange?.(false, null);
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

  clearAfterVisualReset() {
    const state = this.state;
    state.completedControllerGhostKeys = [];
    state.completedPreviewGhosts = [];
    state.detachedFrameTarget = null;
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
    this.setHandoffActive(false);
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

  setFolderId(folderId = null) {
    this.state.folderId = folderId || null;
    if (this.state.folderId && this.state.phase === "idle") this.state.phase = "closing";
  }

  clearFolderId() {
    this.setFolderId(null);
    if (!this.hasActiveVisuals() && !this.state.handoffActive) this.state.phase = "idle";
  }

  setSessionToken(token = null) {
    this.state.token = normalizeToken(token);
  }

  clearSessionToken() {
    this.state.token = null;
  }

  isCurrentToken(token = null) {
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
      events.push({ folderId: state.folderId || null, token: state.token, type: "handoffReady" });
    }
    if (!state.overlaySettled && state.overlayPendingKeys.size === 0) {
      state.overlaySettled = true;
      state.phase = state.folderId ? "settled" : "idle";
      events.push({ folderId: state.folderId || null, token: state.token, type: "overlaySettled" });
    }
    return events;
  }

  releasePending(token, keys) {
    if (!this.isCurrentToken(token)) return [];
    const pendingKeys = Array.isArray(keys) ? keys : [keys];
    for (const key of pendingKeys) {
      if (!key) continue;
      this.state.visualPendingKeys.delete(key);
      this.state.overlayPendingKeys.delete(key);
    }
    return this.collectSettlementEvents();
  }

  releaseFrameVisual(token = this.state.token) {
    if (!this.isCurrentToken(token)) return [];
    this.state.frameVisualComplete = true;
    return this.releasePending(token, FRAME_VISUAL_PENDING_KEY);
  }

  releaseFrameComplete(token = this.state.token) {
    if (!this.isCurrentToken(token)) return [];
    this.state.frameComplete = true;
    this.state.frameVisualComplete = true;
    return this.releasePending(token, [
      FRAME_VISUAL_PENDING_KEY,
      FRAME_COMPLETE_PENDING_KEY,
    ]);
  }

  releaseGhostVisual(token = this.state.token, itemId = null) {
    if (!this.isCurrentToken(token)) return [];
    const key = makeGhostVisualPendingKey(itemId);
    if (itemId) this.state.visualGhostKeys.delete(itemId);
    return this.releasePending(token, key);
  }

  releaseGhostComplete(token = this.state.token, itemId = null) {
    if (!this.isCurrentToken(token)) return [];
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

  releasePreviewSwap(token = this.state.token, key = null) {
    if (!this.isCurrentToken(token)) return [];
    if (key) this.state.previewSwapKeys.delete(key);
    return this.releasePending(token, makePreviewSwapPendingKey(key));
  }

  releaseAllOverlayPending(token = this.state.token) {
    if (!this.isCurrentToken(token)) return [];
    this.state.frameComplete = true;
    this.state.frameVisualComplete = true;
    this.state.ghostKeys.clear();
    this.state.previewSwapKeys.clear();
    this.state.visualGhostKeys.clear();
    this.state.visualPendingKeys.clear();
    this.state.overlayPendingKeys.clear();
    return this.collectSettlementEvents();
  }

  releaseHandoffVisual(token = this.state.token) {
    if (!this.isCurrentToken(token)) return false;
    if (this.state.handoffVisualReleased) return false;
    this.state.handoffVisualReleased = true;
    return true;
  }

  resetHandoffVisualRelease() {
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

  setHandoffGeometry({ detachedTarget = null, rect = null, target = null } = {}) {
    this.state.detachedFrameTarget = detachedTarget;
    this.state.handoffRect = rect;
    this.state.handoffTarget = target;
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

  addGhostTarget(target, controllerGhostKey = null) {
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

  hasGhost(itemId) {
    return this.state.ghostKeys.has(itemId) === true;
  }

  deleteGhost(itemId) {
    if (!itemId) return;
    this.state.ghostKeys.delete(itemId);
  }

  deleteVisualGhost(itemId) {
    if (!itemId) return;
    this.state.visualGhostKeys.delete(itemId);
  }

  clearGhostKeys() {
    this.state.ghostKeys.clear();
    this.state.visualGhostKeys.clear();
  }

  getGhostKeys() {
    return this.state.ghostKeys;
  }

  getVisualGhostKeys() {
    return this.state.visualGhostKeys;
  }

  addMotionControl(control) {
    if (!control) return;
    if (!this.state.motionControls) this.state.motionControls = new Set();
    this.state.motionControls.add(control);
  }

  deleteMotionControl(control) {
    this.state.motionControls?.delete(control);
  }

  consumeMotionControls() {
    const controls = this.state.motionControls;
    this.state.motionControls = null;
    return controls;
  }

  addPreviewSwapKey(key) {
    if (!key) return;
    this.state.previewSwapKeys.add(key);
    const pendingKey = makePreviewSwapPendingKey(key);
    this.registerVisualPending(pendingKey);
    this.registerOverlayPending(pendingKey);
  }

  hasPreviewSwapKey(key) {
    return this.state.previewSwapKeys.has(key) === true;
  }

  clearPreviewSwapKeys() {
    this.state.previewSwapKeys.clear();
  }

  getPreviewSwapKeys() {
    return this.state.previewSwapKeys;
  }

  resetPreviewSwapMotionControls() {
    this.state.previewSwapMotionControls = new Set();
    return this.state.previewSwapMotionControls;
  }

  consumePreviewSwapMotionControls() {
    const controls = this.state.previewSwapMotionControls;
    this.state.previewSwapMotionControls = null;
    return controls;
  }

  addPreviewSwapMotionControl(control) {
    if (!control) return;
    if (!this.state.previewSwapMotionControls) this.resetPreviewSwapMotionControls();
    this.state.previewSwapMotionControls.add(control);
  }

  deletePreviewSwapMotionControl(control) {
    this.state.previewSwapMotionControls?.delete(control);
  }

  ensurePreviewSwapKeys() {
    return this.state.previewSwapKeys;
  }

  isFrameVisualComplete() {
    return this.state.frameVisualComplete || this.state.frameComplete;
  }

  isFrameComplete() {
    return this.state.frameComplete;
  }

  markControllerGhostComplete(key) {
    if (!key) return;
    this.state.completedControllerGhostKeys.push(key);
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

  isHandoffActive() {
    return this.state.handoffActive === true;
  }

  setHandoffActive(active) {
    const next = Boolean(active);
    if (this.state.handoffActive === next) return;
    this.state.handoffActive = next;
    const folderId = next ? this.state.folderId || this.layer?.currentFolderId || null : null;
    if (next) this.layer?.onClosingHandoffReady?.(folderId);
    this.layer?.onInternalActivityChange?.(next, folderId);
  }

  hasActiveVisuals() {
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

  get sessionToken() {
    return this.state.token || null;
  }
}

export function ensureFolderCloseSession(layer) {
  if (!layer.closeSession) layer.closeSession = new FolderCloseSession(layer);
  else layer.closeSession.initialize?.();
  return layer.closeSession;
}
