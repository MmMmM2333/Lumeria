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
    clearFrameGhost(options = {}) {
      return layer.clearFrameGhost?.(options);
    },
    createClosingGhostToken(folderId = null) {
      return layer.createClosingGhostToken?.(folderId);
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
    getClosingPresentationFrameRect() {
      return cloneFramePresentation(layer.frameGhostState);
    },
    getDebugSnapshot() {
      return {
        closingGhostCount: layer.closingGhostLayer?.children?.length ?? null,
        framePresentation: cloneFramePresentation(layer.frameGhostState),
        panelVisible: layer.panel?.visible ?? null,
        pageTrackVisible: layer.pageTrack?.visible ?? null,
      };
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
    removeClosingGhosts() {
      return layer.closingGhostLayer?.removeChildren?.() || [];
    },
    removeClosingPreviewSwapChildren() {
      const swapLayer = layer.closingPreviewSwapLayer;
      if (!swapLayer || swapLayer.destroyed) return [];
      return swapLayer.removeChildren?.() || [];
    },
    setHitArea(hitArea) {
      layer.hitArea = hitArea;
      return hitArea;
    },
    setPageTrackVisible(visible) {
      if (layer.pageTrack) layer.pageTrack.visible = Boolean(visible);
    },
    setPanelVisible(visible) {
      if (layer.panel) layer.panel.visible = Boolean(visible);
    },
    startFrameGhost(fromRect, toRect, options = {}) {
      return layer.startFrameGhost?.(fromRect, toRect, options);
    },
  };
}

export function ensureLayerTransitionPort(layer) {
  if (!layer) return createLayerTransitionPort({});
  if (!layer.transitionPort) layer.transitionPort = createLayerTransitionPort(layer);
  return layer.transitionPort;
}
