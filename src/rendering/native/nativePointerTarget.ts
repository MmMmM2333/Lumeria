import type { Container } from "pixi.js";

export type NativePointerTarget = Readonly<{ kind: "icon"; id: string }> | Readonly<{ kind: "control" | "surface" }>;

/** Pixi child nodes may be unlabelled; resolve ownership through their ancestors. */
export function resolveNativePointerTarget(target: Container | null): NativePointerTarget {
  for (let node = target; node; node = node.parent) {
    const label = node.label;
    if (typeof label !== "string") continue;
    if (label.startsWith("launchpad-item:")) return { kind: "icon", id: label.slice("launchpad-item:".length) };
    if (label === "native-search-bar" || label === "native-management" || label === "native-selection-toolbar"
      || label === "native-desktop-page-dots") return { kind: "control" };
  }
  return { kind: "surface" };
}
