import { Container, Graphics } from "pixi.js";

/** Release renderer references before recursive UI destruction.
 * Graphics.destroy({children:true}) does not unload its context in Pixi 8.20.
 * Unload, rather than destroy, also preserves externally shared context data.
 */
export function releaseNativeGraphics(node: Container): void {
  if (node.destroyed) return;
  if (node instanceof Graphics && !node.context.destroyed) node.context.unload();
  for (const child of node.children) releaseNativeGraphics(child);
}

export function destroyNativeSubtree(node: Container): void {
  releaseNativeGraphics(node);
  node.destroy({ children: true });
}
