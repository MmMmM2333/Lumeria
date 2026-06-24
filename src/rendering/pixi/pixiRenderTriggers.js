export function makeIconActionRenderReason(action) {
  return `icon-${action || "action"}`;
}

export function makeFolderInternalActivityRenderReason(active) {
  return active ? "folder-internal-active" : "folder-internal-idle";
}
