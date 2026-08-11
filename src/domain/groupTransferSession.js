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

const INTERACTIVE_PHASES = new Set([
  GROUP_TRANSFER_PHASE.GATHERING,
  GROUP_TRANSFER_PHASE.DRAGGING,
]);

const VISUAL_PHASES = new Set([
  GROUP_TRANSFER_PHASE.COMMITTING,
  GROUP_TRANSFER_PHASE.RELEASING,
  GROUP_TRANSFER_PHASE.RETURNING,
]);

export function isInteractiveGroupTransferPhase(phase) {
  return INTERACTIVE_PHASES.has(phase);
}

export function isVisualGroupTransferPhase(phase) {
  return VISUAL_PHASES.has(phase);
}
