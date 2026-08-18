import { Text } from "pixi.js";
import { getTextRenderResolution } from "./geometry/stageCoordinates.js";

export function createPixiText(options = {}) {
  return new Text({
    ...options,
    resolution: getTextRenderResolution(options.resolution),
  });
}

export function syncPixiTextResolution(root, resolution = getTextRenderResolution()) {
  if (!root) return 0;
  const targetResolution = getTextRenderResolution(resolution);
  const pending = [root];
  const visited = new Set();
  let updated = 0;

  while (pending.length > 0) {
    const node = pending.pop();
    if (!node || visited.has(node)) continue;
    visited.add(node);
    if (node instanceof Text && node.resolution !== targetResolution) {
      node.resolution = targetResolution;
      updated += 1;
    }
    for (const child of node.children || []) pending.push(child);
  }

  return updated;
}
