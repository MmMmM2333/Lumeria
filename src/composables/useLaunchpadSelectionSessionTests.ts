import { useLaunchpadSelectionSession } from "./useLaunchpadSelectionSession.js";

export function runLaunchpadSelectionSessionTests() {
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`[Launchpad selection session test failed] ${message}`);
  };

  const session = useLaunchpadSelectionSession();
  session.begin({ initialIds: ["app-a"], primaryId: "app-a" });
  assert(session.isActive.value, "begin should activate the session");
  assert(session.isSelected("app-a"), "begin should select its initial app");

  session.toggle("app-b", {
    scope: { key: "desktop:0", orderedIds: ["app-a", "app-b", "app-c"] },
  });
  session.toggle("app-c", {
    range: true,
    scope: { key: "desktop:0", orderedIds: ["app-a", "app-b", "app-c", "app-d"] },
  });
  assert(
    ["app-a", "app-b", "app-c"].every((id) => session.isSelected(id)),
    "shift range should add every app between the anchor and target"
  );

  session.selectScope({
    key: "folder:one:0",
    items: [
      { id: "folder-a", type: "folder", name: "Folder A", childPages: [[]] },
      { id: "app-d", type: "app", name: "App D" },
    ],
  });
  assert(session.isSelected("app-d"), "scope selection should include apps");
  assert(!session.isSelected("folder-a"), "scope selection should exclude folders");

  const frozenSnapshot = session.snapshot();
  session.freeze("drag");
  assert(!session.toggle("app-e"), "a frozen session should reject mutations");
  assert(
    session.snapshot().selectedIds.join(",") === frozenSnapshot.selectedIds.join(","),
    "a rejected frozen mutation should not change selection"
  );
  session.unfreeze("drag");

  session.reconcile([[{
    id: "folder-live",
    type: "folder",
    name: "Live Folder",
    childPages: [[{ id: "app-d", type: "app", name: "App D" }]],
  }]]);
  assert(
    session.selectedCount.value === 1 && session.isSelected("app-d"),
    "reconcile should retain only globally live app ids"
  );

  const commit = session.beginCommit();
  assert(commit?.selectedIds?.[0] === "app-d", "beginCommit should return an immutable operation snapshot");
  assert(!session.toggle("app-a"), "committing should freeze selection");
  session.reconcile([], { exitWhenEmpty: true });
  assert(!session.isActive.value, "reconcile may close an empty completed session");

  const activeEmptySession = useLaunchpadSelectionSession();
  activeEmptySession.begin({ initialIds: ["app-a", "app-b"], primaryId: "app-a" });
  assert(activeEmptySession.deselectAll(), "deselectAll should clear a mutable active selection");
  assert(
    activeEmptySession.isActive.value &&
      activeEmptySession.selectedCount.value === 0 &&
      activeEmptySession.primaryId.value === null,
    "deselectAll should preserve batch mode while removing every selected item"
  );
}
