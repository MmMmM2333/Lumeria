import { useProvisionalFolderRollback } from "./useProvisionalFolderRollback.js";
import { createLaunchpadLayoutHelpers } from "../domain/launchpadLayout.js";
import type {
  LaunchpadApp,
  LaunchpadPages,
  ReadonlyLaunchpadItem,
} from "../domain/launchpadLayout.js";

function app(id: string): LaunchpadApp {
  return { id, name: id, type: "app" };
}

function readRefValue<T>(source: Readonly<{ value: T }>): T {
  return source.value;
}

const layoutHelpers = createLaunchpadLayoutHelpers({
  getFolderPageSize: () => 35,
  getPageSize: () => 35,
});

export function runProvisionalFolderRollbackTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Provisional folder rollback test failed] ${message}`);
  };
  const target = app("target-app");
  const projectedPages: LaunchpadPages = [[{
    childPages: [[target]],
    id: "folder-provisional",
    name: "New Folder",
    type: "folder",
  }]];
  const rollback = useProvisionalFolderRollback({
    cloneItem: (item: ReadonlyLaunchpadItem) => layoutHelpers.cloneItem(item),
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
    readRefValue(rollback.projectedPages) === projectedPages &&
      readRefValue(rollback.presentation)?.phase === "closing",
    "the transaction should retain the exact projected folder throughout formal closing"
  );
  assert(
    readRefValue(rollback.presentation)?.targetItem !== target &&
      readRefValue(rollback.presentation)?.targetItem?.id === target.id,
    "the presentation should own a stable target snapshot instead of the mutable layout item"
  );
  const staleDissolveResult = rollback.beginDissolve("different-folder");
  assert(
    staleDissolveResult === false &&
      readRefValue(rollback.projectedPages) === projectedPages,
    "a stale close completion must not release another folder transaction"
  );
  const dissolveResult = rollback.beginDissolve("folder-provisional", { handoffVelocity: 0.75 });
  assert(
    dissolveResult === true &&
      readRefValue(rollback.projectedPages) === null &&
      readRefValue(rollback.presentation)?.phase === "dissolving" &&
      readRefValue(rollback.presentation)?.handoffVelocity === 0.75,
    "the authoritative desktop should replace the projection only after the close handoff finishes"
  );
  const staleCompletionResult = rollback.complete(token + 1);
  assert(
    staleCompletionResult === false && readRefValue(rollback.presentation)?.phase === "dissolving",
    "a stale visual completion must not clear the current dissolve"
  );
  const completionResult = rollback.complete(token);
  assert(
    completionResult === true &&
      readRefValue(rollback.presentation) === null &&
      readRefValue(rollback.projectedPages) === null,
    "the transaction should retire only after the shell/app dissolve reports completion"
  );
}
