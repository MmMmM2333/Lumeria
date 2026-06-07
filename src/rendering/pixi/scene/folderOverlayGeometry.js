export function getFolderPageMaskRect(geometry, localGridLeft, localGridTop) {
  return {
    left: localGridLeft,
    top: localGridTop,
    width: geometry.grid.width,
    height: Math.max(geometry.grid.height, geometry.panel.height - localGridTop - 20),
  };
}

export function resolveOpeningInterruptionFrame(frameRect, panelRect, contentFrameRect) {
  return frameRect || panelRect || contentFrameRect;
}
