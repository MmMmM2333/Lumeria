import type { Container } from "pixi.js";
import { CLOSING_FOLDER_TARGET_LABEL_PREFIX } from "../../domain/input/launchpadPointerTarget.js";

export type NativePointerTarget =
  | Readonly<{ id: string; kind: "icon" }>
  // A detached closing residual still carries the identity of the folder that
  // is closing. It is not an ordinary desktop icon yet: the input router routes
  // it through the gesture engine so a hold or drag is never stolen by reopen.
  | Readonly<{ id: string; kind: "closingFolder" }>
  | Readonly<{ kind: "control" | "surface" }>;

/** Pixi child nodes may be unlabelled; resolve ownership through their ancestors. */
export function resolveNativePointerTarget(target: Container | null): NativePointerTarget {
  for (let node = target; node; node = node.parent) {
    const label = node.label;
    if (typeof label !== "string") continue;
    if (label.startsWith("launchpad-item:")) return { kind: "icon", id: label.slice("launchpad-item:".length) };
    if (label.startsWith(CLOSING_FOLDER_TARGET_LABEL_PREFIX)) {
      const id = label.slice(CLOSING_FOLDER_TARGET_LABEL_PREFIX.length);
      if (id) return { kind: "closingFolder", id };
      continue;
    }
    if (label === "native-touchpad-capture" || label === "native-folder-name" || label === "native-search-bar" || label === "native-management" || label === "native-notice" || label === "native-selection-toolbar"
      || label === "native-desktop-page-dots" || label === "native-settings" || label === "native-settings-button" || label === "native-new-apps" || label === "native-window-chrome") return { kind: "control" };
  }
  return { kind: "surface" };
}

export type NativePointerGestureTarget =
  | Readonly<{ id: string; kind: "icon" }>
  | Readonly<{ kind: "surface" }>;

export type NativePointerDownRoute =
  | Readonly<{ kind: "defer" }>
  | Readonly<{ kind: "gesture"; target: NativePointerGestureTarget }>;

/**
 * Primary-button pointer-down routing for the native input router.
 *
 * "defer" means the router leaves the event alone so the host keeps ownership
 * (Pixi controls, folder-scope surfaces, modals, and the shared closing
 * interruption path). A "closingFolder" hit becomes a normal desktop icon
 * gesture so the hold/move/drag path wins and only a short tap reopens.
 */
export function routeNativePointerDown(options: Readonly<{
  target: NativePointerTarget;
  hasModal: boolean;
  hasSettingsShell: boolean;
  isActiveDesktopItem: (id: string) => boolean;
  isClosing: boolean;
  scopeArea: string;
}>): NativePointerDownRoute {
  const { target } = options;
  if (target.kind === "control" || options.hasModal || options.hasSettingsShell) return { kind: "defer" };
  if (target.kind === "closingFolder") {
    return options.isActiveDesktopItem(target.id)?{ kind: "gesture", target: { id: target.id, kind: "icon" } }:{kind:"defer"};
  }
  const itemId = target.kind === "icon" ? target.id : undefined;
  if (options.isClosing && (!itemId || !options.isActiveDesktopItem(itemId))) return { kind: "defer" };
  if (!itemId && options.scopeArea === "folder") return { kind: "defer" };
  return { kind: "gesture", target: itemId ? { id: itemId, kind: "icon" } : { kind: "surface" } };
}
