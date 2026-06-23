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
    handoffRect: null,
    handoffTarget: null,
    handoffVisualCleanupScheduled: false,
    handoffVisualReleased: false,
    motionControls: new Set(),
    pendingControllerGhostKeys: new Set(),
    phase: "idle",
    previewSwapKeys: new Set(),
    previewSwapMotionControls: null,
    revealTimer: null,
    token: null,
    visualGhostKeys: new Set(),
  };
}

function cloneRect(rect) {
  return rect ? { ...rect } : null;
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
    if (wasHandoffActive) this.layer?.onInternalActivityChange?.(false, null);
  }

  clearAfterVisualReset() {
    const state = this.state;
    state.completedControllerGhostKeys = [];
    state.completedPreviewGhosts = [];
    state.detachedFrameTarget = null;
    state.frameComplete = false;
    state.frameVisualComplete = false;
    state.ghostKeys.clear();
    state.handoffRect = null;
    state.handoffTarget = null;
    state.handoffVisualCleanupScheduled = false;
    state.handoffVisualReleased = false;
    state.motionControls = new Set();
    state.pendingControllerGhostKeys = new Set();
    state.phase = state.folderId ? "closing" : "idle";
    state.previewSwapKeys.clear();
    state.previewSwapMotionControls = null;
    state.visualGhostKeys.clear();
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
      handoffRect: cloneRect(state.handoffRect),
      handoffTarget: state.handoffTarget,
      handoffVisualCleanupScheduled: state.handoffVisualCleanupScheduled,
      handoffVisualReleased: state.handoffVisualReleased,
      motionControlCount: state.motionControls?.size || 0,
      pendingControllerGhostKeys: new Set(state.pendingControllerGhostKeys),
      phase: state.phase,
      previewSwapKeys: new Set(state.previewSwapKeys),
      previewSwapMotionControlCount: state.previewSwapMotionControls?.size || 0,
      revealTimerActive: Boolean(state.revealTimer),
      token: state.token,
      visualGhostKeys: new Set(state.visualGhostKeys),
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
    this.state.token = token || null;
  }

  clearSessionToken() {
    this.state.token = null;
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
      if (target.isThumbnailChild) this.state.visualGhostKeys.add(itemId);
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
  }

  deletePreviewSwapKey(key) {
    if (!key) return;
    this.state.previewSwapKeys.delete(key);
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

  markFrameVisualComplete() {
    if (this.state.frameVisualComplete) return false;
    this.state.frameVisualComplete = true;
    return true;
  }

  markFrameComplete() {
    this.state.frameComplete = true;
    this.state.frameVisualComplete = true;
  }

  isFrameVisualComplete() {
    return this.state.frameVisualComplete || this.state.frameComplete;
  }

  isFrameComplete() {
    return this.state.frameComplete;
  }

  markHandoffVisualReleased() {
    if (this.state.handoffVisualReleased) return false;
    this.state.handoffVisualReleased = true;
    return true;
  }

  clearHandoffVisualReleased() {
    this.state.handoffVisualReleased = false;
  }

  markHandoffVisualCleanupScheduled() {
    if (this.state.handoffVisualCleanupScheduled) return false;
    this.state.handoffVisualCleanupScheduled = true;
    return true;
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

  isHandoffVisuallyReady(openingGhostKeys = null) {
    return !(
      openingGhostKeys?.size ||
      this.state.visualGhostKeys.size ||
      this.state.previewSwapKeys.size ||
      !this.isFrameVisualComplete()
    );
  }

  isOverlaySettled(openingGhostKeys = null) {
    return !(
      openingGhostKeys?.size ||
      this.state.ghostKeys.size ||
      this.state.previewSwapKeys.size ||
      !this.state.frameComplete
    );
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
