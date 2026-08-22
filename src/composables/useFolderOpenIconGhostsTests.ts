import { useFolderOpenIconGhosts } from "./useFolderOpenIconGhosts.js";
import { createLaunchpadLayoutHelpers } from "../domain/launchpadLayout.js";
import type { LaunchpadApp, LaunchpadFolder } from "../domain/launchpadLayout.js";

const folder: LaunchpadFolder = { childPages: [[]], id: "folder-1", type: "folder", name: "Folder" };
const appA: LaunchpadApp = { id: "app-a", type: "app", name: "App A" };
const appB: LaunchpadApp = { id: "app-b", type: "app", name: "App B" };
const appC: LaunchpadApp = { id: "app-c", type: "app", name: "App C" };
const layoutHelpers = createLaunchpadLayoutHelpers({
  getFolderPageSize: () => 35,
  getPageSize: () => 35,
});

function createGhosts() {
  return useFolderOpenIconGhosts({
    cloneItem: layoutHelpers.cloneItem,
    folderPreviewSlots: () => [appA, appB, null, null, null, null, null, null, null],
  });
}

function readRefValue<T>(source: Readonly<{ value: T }>): T {
  return source.value;
}

function requireItemAt<T>(items: readonly T[], index: number, message: string): T {
  const item = items[index];
  if (item === undefined) throw new Error(message);
  return item;
}

export function runFolderOpenIconGhostsTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Folder open icon ghost test failed] ${message}`);
  };

  const ghosts = createGhosts();
  const capturedOpen = ghosts.captureFolderPreviewIconGhosts(folder, [appA, appB, appC]);
  assert(capturedOpen.length === 3, "open capture should publish visible folder children");
  const firstCapturedOpen = requireItemAt(capturedOpen, 0, "first captured open ghost should exist");
  const thirdCapturedOpen = requireItemAt(capturedOpen, 2, "third captured open ghost should exist");
  assert(firstCapturedOpen.item !== appA, "open capture should clone items");
  assert(firstCapturedOpen.previewSlotIndex === 0, "open capture should preserve preview slot metadata");
  assert(thirdCapturedOpen.synthetic, "open capture should mark non-preview children as synthetic");

  ghosts.playFolderOpenIconGhosts(folder.id, capturedOpen);
  assert(readRefValue(ghosts.folderOpenIconGhosts).length === 3, "open play should publish controller ghosts");
  const openRequestId = requireItemAt(
    readRefValue(ghosts.folderOpenIconGhosts),
    0,
    "published open ghost should exist",
  ).requestId;
  assert(readRefValue(ghosts.folderOpenIconGhostSession)?.status === "staged", "open play should stage a visual session before Pixi accepts it");
  assert(readRefValue(ghosts.isFolderOpenIconAnimationActive), "open play should mark the animation active");
  assert(readRefValue(ghosts.isFolderOpenFrameGhostPending), "open play should keep page dots blocked until the frame ghost arrives");
  assert(ghosts.isFolderOpeningIconGhosted(folder.id, appC.id), "open play should ghost folder targets");
  assert(!ghosts.isFolderOpeningPreviewFrameGhosted(folder.id), "staged open should not hide the source folder thumbnail before Pixi accepts the visual session");
  assert(ghosts.acceptFolderOpenIconGhostSession(folder.id, openRequestId), "Pixi should be able to accept the staged open visual session");
  const acceptedSession = readRefValue(ghosts.folderOpenIconGhostSession);
  assert(acceptedSession?.status === "accepted", "accepted open should expose the visual session status");
  assert(acceptedSession !== null && !("token" in acceptedSession), "the controller-facing open session should not expose Pixi ownership identity");
  assert(ghosts.isFolderOpeningPreviewFrameGhosted(folder.id), "accepted open should hide the source folder thumbnail frame");
  assert(!ghosts.acceptFolderOpenIconGhostSession(folder.id, openRequestId - 1), "stale open session acceptance should be rejected");

  ghosts.completeFolderOpenIconGhost("stale-key");
  assert(readRefValue(ghosts.folderOpenIconGhosts).length === 3, "stale open completion should not clear current ghosts");
  [...readRefValue(ghosts.folderOpenIconGhosts)].forEach((ghost) => ghosts.completeFolderOpenIconGhost(ghost.key));
  assert(readRefValue(ghosts.folderOpenIconGhosts).length === 0, "open ghosts should clear after all completions");
  assert(!readRefValue(ghosts.isFolderOpenIconAnimationActive), "open completion should clear animation state");
  assert(readRefValue(ghosts.isFolderOpenFrameGhostPending), "open icon completion should not unblock page dots before frame arrive");
  assert(ghosts.isFolderOpeningPreviewFrameGhosted(folder.id), "open icon completion should keep the source folder thumbnail hidden before frame arrive");
  assert(!ghosts.completeFolderOpenFrameGhost(folder.id, openRequestId - 1), "stale frame completion should not unblock page dots");
  assert(ghosts.completeFolderOpenFrameGhost(folder.id, openRequestId), "current frame completion should unblock page dots");
  assert(!readRefValue(ghosts.isFolderOpenFrameGhostPending), "frame completion should unblock page dots");
  assert(!ghosts.isFolderOpeningPreviewFrameGhosted(folder.id), "frame completion should reveal the source folder thumbnail frame");

  const capturedClose = ghosts.captureFolderCloseIconGhosts(folder, [appA, appB]);
  ghosts.playFolderCloseIconGhosts(folder.id, capturedClose);
  assert(readRefValue(ghosts.folderCloseIconGhosts).length === 2, "close play should publish controller ghosts");
  assert(readRefValue(ghosts.isFolderCloseIconAnimationActive), "close play should mark the animation active");
  assert(ghosts.isFolderClosingIconGhosted(folder.id, appB.id), "close play should ghost closing folder children");
  assert(!ghosts.completeFolderCloseIconGhost("stale-key"), "stale close completion should not finish the close");
  const closeGhostKeys = readRefValue(ghosts.folderCloseIconGhosts).map((ghost) => ghost.key);
  const firstCloseGhostKey = requireItemAt(closeGhostKeys, 0, "first close ghost key should exist");
  const secondCloseGhostKey = requireItemAt(closeGhostKeys, 1, "second close ghost key should exist");
  assert(!ghosts.completeFolderCloseIconGhost(firstCloseGhostKey), "partial close completion should stay active");
  assert(ghosts.completeFolderCloseIconGhost(secondCloseGhostKey), "final close completion should finish the close");
  assert(readRefValue(ghosts.folderCloseIconGhosts).length === 0, "close ghosts should clear after all completions");

  ghosts.playFolderOpenIconGhosts(folder.id, capturedOpen);
  ghosts.clearFolderOpenIconGhosts();
  assert(readRefValue(ghosts.folderOpenIconGhosts).length === 0, "manual open clear should reset open ghosts");
  assert(readRefValue(ghosts.folderOpenIconGhostSession) === null, "manual open clear should reset the visual session");
  ghosts.playFolderCloseIconGhosts(folder.id, capturedClose);
  ghosts.clearFolderCloseIconGhosts();
  assert(readRefValue(ghosts.folderCloseIconGhosts).length === 0, "manual close clear should reset close ghosts");
}
