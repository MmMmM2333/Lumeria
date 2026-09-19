import type { ReadonlyLaunchpadItem,ReadonlyLaunchpadPages } from "../../domain/launchpadLayout.js";
import type { SceneItem } from "../../rendering/sceneFrame.js";

// Texture residency walks the presentation frame plus the layout it was built
// from. Layout ownership stays independent from decoding and GPU residency, so
// this helper deliberately reports ids, not textures.
export function collectTextureItems(
  frame: Readonly<{ viewport: Readonly<{ activePageIndex: number; activePages: readonly (readonly (SceneItem | null)[])[] }> }>,
  layoutPages: ReadonlyLaunchpadPages | typeof frame.viewport.activePages = frame.viewport.activePages,
): readonly (SceneItem | ReadonlyLaunchpadItem)[] {
  const result: (SceneItem | ReadonlyLaunchpadItem)[] = [];
  const seen = new Set<string>();
  const append = (item: SceneItem | ReadonlyLaunchpadItem | null | undefined): void => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    result.push(item);
    if (item.type !== "folder" || !Array.isArray(item.childPages)) return;
    for (const page of item.childPages) for (const child of page) append(child as SceneItem | null);
  };
  for(const page of layoutPages)for(const item of page)append(item);
  frame.viewport.activePages.forEach((page) => {
    // Layout ownership is independent from decoding and GPU residency.
    for (const item of page) append(item);
  });
  return result;
}
