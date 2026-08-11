import {
  GROUP_TRANSFER_OUTCOME,
  GROUP_TRANSFER_PHASE,
  isInteractiveGroupTransferPhase,
  isVisualGroupTransferPhase,
} from "./groupTransferSession.js";

export function runGroupTransferSessionTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Group transfer session test failed] ${message}`);
  };

  assert(isInteractiveGroupTransferPhase(GROUP_TRANSFER_PHASE.GATHERING), "gathering should accept pointer updates");
  assert(isInteractiveGroupTransferPhase(GROUP_TRANSFER_PHASE.DRAGGING), "dragging should accept pointer updates");
  assert(!isInteractiveGroupTransferPhase(GROUP_TRANSFER_PHASE.RETURNING), "returning should not accept pointer updates");
  assert(isVisualGroupTransferPhase(GROUP_TRANSFER_PHASE.COMMITTING), "committing should reserve visual ownership");
  assert(isVisualGroupTransferPhase(GROUP_TRANSFER_PHASE.RELEASING), "releasing should run actor handoff");
  assert(isVisualGroupTransferPhase(GROUP_TRANSFER_PHASE.RETURNING), "returning should run actor handoff");
  assert(!isVisualGroupTransferPhase(GROUP_TRANSFER_PHASE.SETTLED), "settled should own no transfer visuals");
  assert(
    new Set(Object.values(GROUP_TRANSFER_OUTCOME)).size === 5,
    "terminal outcomes should stay explicit and non-overlapping"
  );
}
