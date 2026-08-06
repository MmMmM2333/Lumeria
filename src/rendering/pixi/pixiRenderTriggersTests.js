import {
  makeFolderInternalActivityRenderReason,
  makeIconActionRenderReason,
} from "./pixiRenderTriggers.js";

export function runPixiRenderTriggersTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi render triggers test failed] ${message}`);
  };

  assert(makeIconActionRenderReason("pointerdown") === "icon-pointerdown", "pointer press should map to an icon render reason");
  assert(makeIconActionRenderReason("remove") === "icon-remove", "icon actions should map to stable render reasons");
  assert(makeIconActionRenderReason("") === "icon-action", "unknown icon action should keep a stable render reason");
  assert(makeFolderInternalActivityRenderReason(true) === "folder-internal-active", "active folder lifecycle should map to an active render reason");
  assert(makeFolderInternalActivityRenderReason(false) === "folder-internal-idle", "idle folder lifecycle should map to an idle render reason");
}
