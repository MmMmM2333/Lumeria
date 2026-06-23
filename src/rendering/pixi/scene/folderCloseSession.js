export class FolderCloseSession {
  constructor(layer) {
    this.layer = layer;
    this.initialize();
  }

  initialize() {
    const layer = this.layer;
    layer.closingGhostRevealTimer ??= null;
    layer.closingFrameComplete ??= false;
    layer.closingFrameVisualComplete ??= false;
    layer.closingHandoffVisualCleanupScheduled ??= false;
    layer.closingHandoffVisualReleased ??= false;
    layer.closingPreviewSwapKeys ||= new Set();
    layer.closingPreviewSwapMotionControls ??= null;
    layer.closingVisualGhostKeys ||= new Set();
    layer.closingGhostKeys ||= new Set();
    layer.closingGhostMotionControls ||= new Set();
    layer.closingGhostSessionToken ??= null;
    layer.completedClosingControllerGhostKeys ||= [];
    layer.pendingClosingControllerGhostKeys ||= new Set();
    layer.completedClosingPreviewGhosts ||= [];
    layer.closingFolderHandoffGhost ??= null;
    layer.closingFolderHandoffRect ??= null;
    layer.closingFolderHandoffTarget ??= null;
    layer.closingFrameDetachedTarget ??= null;
  }

  begin(folderId = null) {
    const layer = this.layer;
    layer.closingGhostFolderId = folderId || null;
    layer.closingGhostKeys = new Set();
    layer.closingGhostMotionControls = new Set();
    layer.closingFrameComplete = false;
    layer.closingFrameVisualComplete = false;
    layer.closingHandoffVisualCleanupScheduled = false;
    layer.closingHandoffVisualReleased = false;
    layer.closingVisualGhostKeys = new Set();
    layer.completedClosingControllerGhostKeys = [];
    layer.pendingClosingControllerGhostKeys = new Set();
    layer.completedClosingPreviewGhosts = [];
    layer.closingFolderHandoffRect = null;
    layer.closingFolderHandoffTarget = null;
    layer.closingFrameDetachedTarget = null;
    this.setHandoffActive(false);
  }

  clearAfterVisualReset() {
    const layer = this.layer;
    layer.closingGhostKeys?.clear();
    layer.closingVisualGhostKeys?.clear();
    layer.closingPreviewSwapKeys?.clear();
    layer.closingFrameComplete = false;
    layer.closingFrameVisualComplete = false;
    layer.closingHandoffVisualCleanupScheduled = false;
    layer.closingHandoffVisualReleased = false;
    layer.completedClosingControllerGhostKeys = [];
    layer.pendingClosingControllerGhostKeys = new Set();
    layer.completedClosingPreviewGhosts = [];
    layer.closingFolderHandoffRect = null;
    layer.closingFolderHandoffTarget = null;
    layer.closingFrameDetachedTarget = null;
    this.setHandoffActive(false);
  }

  setFolderId(folderId = null) {
    this.layer.closingGhostFolderId = folderId || null;
  }

  clearFolderId() {
    this.setFolderId(null);
  }

  setSessionToken(token = null) {
    this.layer.closingGhostSessionToken = token || null;
  }

  clearSessionToken() {
    this.layer.closingGhostSessionToken = null;
  }

  setRevealTimer(timer = null) {
    this.layer.closingGhostRevealTimer = timer || null;
  }

  clearRevealTimer(cancelTimer = null) {
    const timer = this.layer.closingGhostRevealTimer;
    if (!timer) return null;
    if (typeof cancelTimer === "function") cancelTimer(timer);
    this.layer.closingGhostRevealTimer = null;
    return timer;
  }

  clearRevealTimerRef() {
    this.layer.closingGhostRevealTimer = null;
  }

  setHandoffGeometry({ detachedTarget = null, rect = null, target = null } = {}) {
    const layer = this.layer;
    layer.closingFolderHandoffRect = rect;
    layer.closingFolderHandoffTarget = target;
    layer.closingFrameDetachedTarget = detachedTarget;
  }

  addGhostTarget(target, controllerGhostKey = null) {
    const itemId = target?.item?.id;
    if (itemId) {
      this.layer.closingGhostKeys.add(itemId);
      if (target.isThumbnailChild) this.layer.closingVisualGhostKeys.add(itemId);
    }
    if (controllerGhostKey) this.layer.pendingClosingControllerGhostKeys.add(controllerGhostKey);
  }

  hasGhost(itemId) {
    return this.layer.closingGhostKeys?.has(itemId) === true;
  }

  deleteGhost(itemId) {
    if (!itemId) return;
    this.layer.closingGhostKeys?.delete(itemId);
  }

  deleteVisualGhost(itemId) {
    if (!itemId) return;
    this.layer.closingVisualGhostKeys?.delete(itemId);
  }

  clearGhostKeys() {
    this.layer.closingGhostKeys?.clear();
    this.layer.closingVisualGhostKeys?.clear();
  }

  addMotionControl(control) {
    if (!control) return;
    this.layer.closingGhostMotionControls?.add(control);
  }

  deleteMotionControl(control) {
    this.layer.closingGhostMotionControls?.delete(control);
  }

  consumeMotionControls() {
    const controls = this.layer.closingGhostMotionControls;
    this.layer.closingGhostMotionControls = null;
    return controls;
  }

  addPreviewSwapKey(key) {
    if (!key) return;
    this.ensurePreviewSwapKeys();
    this.layer.closingPreviewSwapKeys.add(key);
  }

  deletePreviewSwapKey(key) {
    if (!key) return;
    this.layer.closingPreviewSwapKeys?.delete(key);
  }

  hasPreviewSwapKey(key) {
    return this.layer.closingPreviewSwapKeys?.has(key) === true;
  }

  clearPreviewSwapKeys() {
    this.layer.closingPreviewSwapKeys?.clear();
  }

  resetPreviewSwapMotionControls() {
    this.layer.closingPreviewSwapMotionControls = new Set();
    return this.layer.closingPreviewSwapMotionControls;
  }

  consumePreviewSwapMotionControls() {
    const controls = this.layer.closingPreviewSwapMotionControls;
    this.layer.closingPreviewSwapMotionControls = null;
    return controls;
  }

  addPreviewSwapMotionControl(control) {
    if (!control) return;
    if (!this.layer.closingPreviewSwapMotionControls) this.resetPreviewSwapMotionControls();
    this.layer.closingPreviewSwapMotionControls.add(control);
  }

  deletePreviewSwapMotionControl(control) {
    this.layer.closingPreviewSwapMotionControls?.delete(control);
  }

  ensurePreviewSwapKeys() {
    if (!this.layer.closingPreviewSwapKeys) this.layer.closingPreviewSwapKeys = new Set();
    return this.layer.closingPreviewSwapKeys;
  }

  markFrameVisualComplete() {
    if (this.layer.closingFrameVisualComplete) return false;
    this.layer.closingFrameVisualComplete = true;
    return true;
  }

  markFrameComplete() {
    this.layer.closingFrameComplete = true;
    this.layer.closingFrameVisualComplete = true;
  }

  markHandoffVisualReleased() {
    if (this.layer.closingHandoffVisualReleased) return false;
    this.layer.closingHandoffVisualReleased = true;
    return true;
  }

  clearHandoffVisualReleased() {
    this.layer.closingHandoffVisualReleased = false;
  }

  markHandoffVisualCleanupScheduled() {
    if (this.layer.closingHandoffVisualCleanupScheduled) return false;
    this.layer.closingHandoffVisualCleanupScheduled = true;
    return true;
  }

  markControllerGhostComplete(key) {
    if (!key) return;
    this.layer.completedClosingControllerGhostKeys.push(key);
  }

  consumeControllerGhostKeys() {
    const pendingKeys = Array.from(this.layer.pendingClosingControllerGhostKeys || []);
    const completedKeys = this.layer.completedClosingControllerGhostKeys || [];
    const keys = pendingKeys.length
      ? Array.from(new Set([...pendingKeys, ...completedKeys]))
      : completedKeys;
    this.layer.pendingClosingControllerGhostKeys = new Set();
    this.layer.completedClosingControllerGhostKeys = [];
    return keys;
  }

  takeFolderHandoffGhost() {
    const ghost = this.layer.closingFolderHandoffGhost;
    this.layer.closingFolderHandoffGhost = null;
    return ghost;
  }

  isHandoffActive() {
    return this.layer.closingHandoffActive === true;
  }

  setHandoffActive(active) {
    if (typeof this.layer.setClosingHandoffActive === "function") {
      this.layer.setClosingHandoffActive(active);
      return;
    }
    this.layer.closingHandoffActive = Boolean(active);
  }

  hasActiveVisuals() {
    return Boolean(this.layer.closingGhostKeys?.size || this.layer.closingPreviewSwapKeys?.size);
  }

  get folderId() {
    return this.layer.closingGhostFolderId || null;
  }

  get sessionToken() {
    return this.layer.closingGhostSessionToken || null;
  }
}

export function ensureFolderCloseSession(layer) {
  if (!layer.closeSession) layer.closeSession = new FolderCloseSession(layer);
  else layer.closeSession.initialize?.();
  return layer.closeSession;
}
