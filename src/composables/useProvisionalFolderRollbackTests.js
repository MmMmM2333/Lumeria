import { useProvisionalFolderRollback } from "./useProvisionalFolderRollback.js";

function app(id) {
  return { id, name: id, type: "app" };
}

export function runProvisionalFolderRollbackTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Provisional folder rollback test failed] ${message}`);
  };
  const target = app("target-app");
  const projectedPages = [[{
    childPages: [[target]],
    id: "folder-provisional",
    name: "New Folder",
    type: "folder",
  }]];
  const rollback = useProvisionalFolderRollback({
    cloneItem: (item) => structuredClone(item),
  });

  const token = rollback.begin({
    folderId: "folder-provisional",
    previewSlotIndex: 0,
    projectedPages,
    targetIndex: 1,
    targetItem: target,
    targetPageIndex: 0,
    targetRect: { height: 64, left: 200, top: 150, width: 64 },
  });
  assert(token > 0, "begin should issue a transaction token");
  assert(
    rollback.projectedPages.value === projectedPages &&
      rollback.presentation.value?.phase === "closing",
    "the transaction should retain the exact projected folder throughout formal closing"
  );
  assert(
    rollback.presentation.value?.targetItem !== target &&
      rollback.presentation.value?.targetItem?.id === target.id,
    "the presentation should own a stable target snapshot instead of the mutable layout item"
  );
  assert(
    rollback.beginDissolve("different-folder") === false &&
      rollback.projectedPages.value === projectedPages,
    "a stale close completion must not release another folder transaction"
  );
  assert(
    rollback.beginDissolve("folder-provisional", { handoffVelocity: 0.75 }) === true &&
      rollback.projectedPages.value === null &&
      rollback.presentation.value?.phase === "dissolving" &&
      rollback.presentation.value?.handoffVelocity === 0.75,
    "the authoritative desktop should replace the projection only after the close handoff finishes"
  );
  assert(
    rollback.complete(token + 1) === false && rollback.presentation.value?.phase === "dissolving",
    "a stale visual completion must not clear the current dissolve"
  );
  assert(
    rollback.complete(token) === true &&
      rollback.presentation.value === null &&
      rollback.projectedPages.value === null,
    "the transaction should retire only after the shell/app dissolve reports completion"
  );
}
