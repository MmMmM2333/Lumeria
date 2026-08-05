const ICON_INTERACTION_PHASES = new Set(["pressing", "armed"]);

export function resolveIconInteractionPhase(presentation, options = {}) {
  if (options.interactive === false || !options.itemId) return null;
  if (presentation?.scope !== options.scope) return null;
  if (presentation?.target?.kind !== "icon" || presentation.target.id !== options.itemId) return null;
  return ICON_INTERACTION_PHASES.has(presentation.phase) ? presentation.phase : null;
}
