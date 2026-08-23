export type IconInteractionPhase = "armed" | "pressing";

type IconInteractionOptions = Readonly<{
  interactive?: boolean;
  itemId?: string | null;
  scope?: string | null;
}>;

const ICON_INTERACTION_PHASES = new Set<IconInteractionPhase>(["pressing", "armed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function resolveIconInteractionPhase(
  presentation: unknown,
  options: IconInteractionOptions = {},
): IconInteractionPhase | null {
  if (options.interactive === false || !options.itemId) return null;
  if (!isRecord(presentation) || presentation.scope !== options.scope) return null;
  const target = presentation.target;
  if (!isRecord(target) || target.kind !== "icon" || target.id !== options.itemId) return null;
  const phase = presentation.phase;
  return typeof phase === "string" && ICON_INTERACTION_PHASES.has(phase as IconInteractionPhase)
    ? phase as IconInteractionPhase
    : null;
}
