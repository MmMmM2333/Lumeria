import { makeDesktopSourceVisualKey } from "./folderVisualOwnershipRegistry.js";

function cloneFramePresentation(frame) {
  if (!frame) return null;
  return {
    fillAlpha: frame.fillAlpha,
    fillColor: frame.fillColor,
    height: frame.height,
    left: frame.left,
    progress: frame.progress,
    radius: frame.radius,
    strokeAlpha: frame.strokeAlpha,
    strokeColor: frame.strokeColor,
    strokeWidth: frame.strokeWidth,
    top: frame.top,
    width: frame.width,
  };
}

function getClosingMirrorOffsetX(layer) {
  const offsetX = Number(layer?.closingDesktopPageTrackMirrorX);
  return Number.isFinite(offsetX) ? offsetX : 0;
}

function cloneMirroredFramePresentation(layer) {
  const frame = cloneFramePresentation(layer?.frameGhostState);
  const offsetX = getClosingMirrorOffsetX(layer);
  if (frame && offsetX !== 0) frame.left += offsetX;
  return frame;
}

export function createLayerTransitionPort(layer) {
  return {
    acquireDesktopSourceOwnership(owner) {
      const key = makeDesktopSourceVisualKey(owner?.folderId);
      if (!key || typeof layer.acquireVisualOwnership !== "function") return false;
      return layer.acquireVisualOwnership(key, owner);
    },
    addClosingGhost(ghost) {
      return layer.closingGhostLayer?.addChild?.(ghost);
    },
    addOpeningGhost(ghost) {
      return layer.openingGhostLayer?.addChild?.(ghost);
    },
    clearCurrentFolder() {
      layer.currentFolderId = null;
    },
    clearFrameGhost(options = {}) {
      return layer.clearFrameGhost?.(options);
    },
    clearOpeningGhostBounds() {
      return layer.openingGhostBoundsRefreshers?.clear?.();
    },
    clearOpeningGhosts(options = {}) {
      return layer.openingGhosts?.clear?.(options);
    },
    createClosingGhostToken(folderId = null) {
      return layer.createClosingGhostToken?.(folderId);
    },
    deleteOpeningGhostBounds(itemId) {
      return layer.openingGhostBoundsRefreshers?.delete?.(itemId);
    },
    enableClosingFrameMask() {
      return layer.enableClosingFrameMask?.();
    },
    ensureClosingPreviewSwapLayer(containerFactory) {
      if (layer.closingPreviewSwapLayer && !layer.closingPreviewSwapLayer.destroyed) {
        return layer.closingPreviewSwapLayer;
      }
      layer.closingPreviewSwapLayer = containerFactory();
      const closingIndex = layer.children?.indexOf?.(layer.closingGhostLayer);
      if (closingIndex >= 0) layer.addChildAt(layer.closingPreviewSwapLayer, closingIndex + 1);
      else layer.addChild(layer.closingPreviewSwapLayer);
      return layer.closingPreviewSwapLayer;
    },
    getClosingFrameStartRect(panelRect, folderId) {
      if (layer.frameGhostFolderId !== folderId) return panelRect;
      return cloneFramePresentation(layer.frameGhostState) || panelRect;
    },
    getClosingGhostCount() {
      return layer.closingGhostLayer?.children?.length ?? null;
    },
    getCurrentFolderId() {
      return layer.currentFolderId || null;
    },
    getClosingPresentationFrameRect() {
      return cloneMirroredFramePresentation(layer);
    },
    getDebugSnapshot() {
      return {
        closingGhostCount: layer.closingGhostLayer?.children?.length ?? null,
        framePresentation: cloneMirroredFramePresentation(layer),
        panelVisible: layer.panel?.visible ?? null,
        pageTrackVisible: layer.pageTrack?.visible ?? null,
      };
    },
    getOpeningGhostChildren() {
      return layer.openingGhostLayer?.children || [];
    },
    hideIconNodesForTransition(itemId, owner) {
      return layer.hideIconNodesForTransition?.(itemId, owner);
    },
    hidePageTrackForTransition(owner) {
      return layer.hidePageTrackForTransition?.(owner);
    },
    notifyClosingHandoffPrepare(folderId) {
      return layer.onClosingHandoffPrepare?.(folderId);
    },
    notifyClosingHandoffVisualRelease(folderId) {
      return layer.onClosingHandoffVisualRelease?.(folderId);
    },
    releaseTransitionOwnership(token, options = {}) {
      return layer.releaseTransitionOwnership?.(token, options);
    },
    releaseIconNodesForTransition(itemId, token, options = {}) {
      return layer.releaseIconNodesForTransition?.(itemId, token, options);
    },
    refreshRegisteredIconBounds() {
      return layer.refreshRegisteredIconBounds?.();
    },
    registerOpeningGhostBounds(state, target, ghost) {
      return layer.registerOpeningGhostBounds?.(state, target, ghost);
    },
    releaseOpeningGhost(itemId) {
      return layer.openingGhosts?.releaseGhost?.(itemId) || null;
    },
    rebuildPageTrackMask() {
      return layer.rebuildPageTrackMask?.();
    },
    removeClosingGhosts() {
      return layer.closingGhostLayer?.removeChildren?.() || [];
    },
    removeClosingPreviewSwapChildren() {
      const swapLayer = layer.closingPreviewSwapLayer;
      if (!swapLayer || swapLayer.destroyed) return [];
      return swapLayer.removeChildren?.() || [];
    },
    removeOpeningGhost(ghost) {
      const children = layer.openingGhostLayer?.children;
      if (Array.isArray(children)) {
        const index = children.indexOf(ghost);
        if (index >= 0) children.splice(index, 1);
        return ghost;
      }
      return layer.openingGhostLayer?.removeChild?.(ghost);
    },
    removeOpeningGhosts() {
      return layer.openingGhostLayer?.removeChildren?.() || [];
    },
    setHitArea(hitArea) {
      layer.hitArea = hitArea;
      return hitArea;
    },
    setFrameGhostVisible(visible, alpha = null) {
      if (!layer.frameGhost) return;
      layer.frameGhost.visible = Boolean(visible);
      if (alpha != null) layer.frameGhost.alpha = Number(alpha) || 0;
    },
    setLayerVisible(visible) {
      layer.visible = Boolean(visible);
    },
    setOpeningGhostBoundsRefresher(itemId, refreshBounds) {
      if (!itemId || typeof refreshBounds !== "function") return;
      layer.openingGhostBoundsRefreshers?.set?.(itemId, refreshBounds);
    },
    setPageTrackVisible(visible) {
      if (layer.pageTrack) layer.pageTrack.visible = Boolean(visible);
    },
    setPanelMaterialVisible(visible, alpha = null) {
      if (!layer.panelMaterial) return;
      layer.panelMaterial.visible = Boolean(visible);
      if (alpha != null) layer.panelMaterial.alpha = Number(alpha) || 0;
    },
    setPanelVisible(visible) {
      if (layer.panel) layer.panel.visible = Boolean(visible);
    },
    startFrameGhost(fromRect, toRect, options = {}) {
      if (typeof layer.startFrameGhost !== "function") return false;
      layer.startFrameGhost(fromRect, toRect, options);
      return true;
    },
  };
}

export function ensureLayerTransitionPort(layer) {
  if (!layer) return createLayerTransitionPort({});
  if (!layer.transitionPort) layer.transitionPort = createLayerTransitionPort(layer);
  return layer.transitionPort;
}
