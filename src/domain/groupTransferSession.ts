export const GROUP_TRANSFER_PHASE = Object.freeze({
  COMMITTING: "committing",
  DRAGGING: "dragging",
  GATHERING: "gathering",
  RELEASING: "releasing",
  RETURNING: "returning",
  SETTLED: "settled",
});

export const GROUP_TRANSFER_OUTCOME = Object.freeze({
  ACCEPTED: "accepted",
  CANCELLED: "cancelled",
  NOOP: "noop",
  REJECTED: "rejected",
  VISUAL_ABORTED: "visual-aborted",
});

export type GroupTransferPhase = typeof GROUP_TRANSFER_PHASE[keyof typeof GROUP_TRANSFER_PHASE];
export type GroupTransferOutcome = typeof GROUP_TRANSFER_OUTCOME[keyof typeof GROUP_TRANSFER_OUTCOME];

const INTERACTIVE_PHASES = new Set<GroupTransferPhase>([
  GROUP_TRANSFER_PHASE.GATHERING,
  GROUP_TRANSFER_PHASE.DRAGGING,
]);

const VISUAL_PHASES = new Set<GroupTransferPhase>([
  GROUP_TRANSFER_PHASE.COMMITTING,
  GROUP_TRANSFER_PHASE.RELEASING,
  GROUP_TRANSFER_PHASE.RETURNING,
]);

export function isInteractiveGroupTransferPhase(phase: unknown): phase is GroupTransferPhase {
  return typeof phase === "string" && INTERACTIVE_PHASES.has(phase as GroupTransferPhase);
}

export function isVisualGroupTransferPhase(phase: unknown): phase is GroupTransferPhase {
  return typeof phase === "string" && VISUAL_PHASES.has(phase as GroupTransferPhase);
}
