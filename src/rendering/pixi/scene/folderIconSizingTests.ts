import { resolveFolderIconRenderSize } from "./folderIconSizing.js";

export function runFolderIconSizingTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder icon sizing test failed] ${message}`);
  };

  assert(resolveFolderIconRenderSize({ requestedSize: 88, cellWidth: 120, cellHeight: 140 }) === 88, "folder icon sizing should allow sizes above the old 56px cap");
  assert(resolveFolderIconRenderSize({ requestedSize: 128, cellWidth: 90, cellHeight: 160 }) === 66, "folder icon sizing should reserve horizontal interaction padding in narrow cells");
  assert(resolveFolderIconRenderSize({ requestedSize: 128, cellWidth: 160, cellHeight: 72 }) === 72, "folder icon sizing should clamp to short cell height");
  assert(resolveFolderIconRenderSize({ fallbackSize: 72 }) === 72, "folder icon sizing should fall back to a positive fallback size");
}
