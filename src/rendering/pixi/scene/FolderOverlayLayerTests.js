import { getFolderPageMaskRect } from "./folderOverlayGeometry.js";

export function runFolderOverlayLayerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder overlay layer test failed] ${message}`);
  };

  const geometry = {
    grid: { height: 420, width: 884 },
    panel: { height: 560, width: 1000 },
  };
  const mask = getFolderPageMaskRect(geometry, 58, 64);

  assert(mask.left === 58, "folder page mask should start at the grid left edge");
  assert(mask.width === 884, "folder page mask should match the grid width, not the full panel width");
  assert(mask.top === 64, "folder page mask should preserve the grid top edge");
  assert(mask.height === 476, "folder page mask should keep the existing vertical panel coverage");
}
