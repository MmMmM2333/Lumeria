import { useFolderOpenIconGhosts } from "./useFolderOpenIconGhosts.js";

const folder = { id: "folder-1", type: "folder", name: "Folder" };
const appA = { id: "app-a", type: "app", name: "App A" };
const appB = { id: "app-b", type: "app", name: "App B" };
const appC = { id: "app-c", type: "app", name: "App C" };

function createGhosts() {
  return useFolderOpenIconGhosts({
    cloneItem: (item) => ({ ...item }),
    folderPreviewSlots: () => [appA, appB, null, null, null, null, null, null, null],
  });
}

export function runFolderOpenIconGhostsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder open icon ghost test failed] ${message}`);
  };

  const ghosts = createGhosts();
  const capturedOpen = ghosts.captureFolderPreviewIconGhosts(folder, [appA, appB, appC]);
  assert(capturedOpen.length === 3, "open capture should publish visible folder children");
  assert(capturedOpen[0].item !== appA, "open capture should clone items");
  assert(capturedOpen[0].previewSlotIndex === 0, "open capture should preserve preview slot metadata");
  assert(capturedOpen[2].synthetic, "open capture should mark non-preview children as synthetic");

  ghosts.playFolderOpenIconGhosts(folder.id, capturedOpen);
  assert(ghosts.folderOpenIconGhosts.value.length === 3, "open play should publish controller ghosts");
  const openRequestId = ghosts.folderOpenIconGhosts.value[0].requestId;
  assert(ghosts.folderOpenIconGhostSession.value?.status === "staged", "open play should stage a visual session before Pixi accepts it");
  assert(ghosts.isFolderOpenIconAnimationActive.value, "open play should mark the animation active");
  assert(ghosts.isFolderOpenFrameGhostPending.value, "open play should keep page dots blocked until the frame ghost arrives");
  assert(ghosts.isFolderOpeningIconGhosted(folder.id, appC.id), "open play should ghost folder targets");
  assert(!ghosts.isFolderOpeningPreviewFrameGhosted(folder.id), "staged open should not hide the source folder thumbnail before Pixi accepts the visual session");
  assert(ghosts.acceptFolderOpenIconGhostSession(folder.id, openRequestId, "open-token-1"), "Pixi should be able to accept the staged open visual session");
  assert(ghosts.folderOpenIconGhostSession.value?.status === "accepted", "accepted open should expose the visual session status");
  assert(ghosts.folderOpenIconGhostSession.value?.token === "open-token-1", "accepted open should keep the Pixi session token");
  assert(ghosts.isFolderOpeningPreviewFrameGhosted(folder.id), "accepted open should hide the source folder thumbnail frame");
  assert(!ghosts.acceptFolderOpenIconGhostSession(folder.id, openRequestId - 1, "stale-token"), "stale open session acceptance should be rejected");

  ghosts.completeFolderOpenIconGhost("stale-key");
  assert(ghosts.folderOpenIconGhosts.value.length === 3, "stale open completion should not clear current ghosts");
  ghosts.folderOpenIconGhosts.value.forEach((ghost) => ghosts.completeFolderOpenIconGhost(ghost.key));
  assert(ghosts.folderOpenIconGhosts.value.length === 0, "open ghosts should clear after all completions");
  assert(!ghosts.isFolderOpenIconAnimationActive.value, "open completion should clear animation state");
  assert(ghosts.isFolderOpenFrameGhostPending.value, "open icon completion should not unblock page dots before frame arrive");
  assert(ghosts.isFolderOpeningPreviewFrameGhosted(folder.id), "open icon completion should keep the source folder thumbnail hidden before frame arrive");
  assert(!ghosts.completeFolderOpenFrameGhost(folder.id, openRequestId - 1), "stale frame completion should not unblock page dots");
  assert(ghosts.completeFolderOpenFrameGhost(folder.id, openRequestId), "current frame completion should unblock page dots");
  assert(!ghosts.isFolderOpenFrameGhostPending.value, "frame completion should unblock page dots");
  assert(!ghosts.isFolderOpeningPreviewFrameGhosted(folder.id), "frame completion should reveal the source folder thumbnail frame");

  const capturedClose = ghosts.captureFolderCloseIconGhosts(folder, [appA, appB]);
  ghosts.playFolderCloseIconGhosts(folder.id, capturedClose);
  assert(ghosts.folderCloseIconGhosts.value.length === 2, "close play should publish controller ghosts");
  assert(ghosts.isFolderCloseIconAnimationActive.value, "close play should mark the animation active");
  assert(ghosts.isFolderClosingIconGhosted(folder.id, appB.id), "close play should ghost closing folder children");
  assert(!ghosts.completeFolderCloseIconGhost("stale-key"), "stale close completion should not finish the close");
  const closeGhostKeys = ghosts.folderCloseIconGhosts.value.map((ghost) => ghost.key);
  assert(!ghosts.completeFolderCloseIconGhost(closeGhostKeys[0]), "partial close completion should stay active");
  assert(ghosts.completeFolderCloseIconGhost(closeGhostKeys[1]), "final close completion should finish the close");
  assert(ghosts.folderCloseIconGhosts.value.length === 0, "close ghosts should clear after all completions");

  ghosts.playFolderOpenIconGhosts(folder.id, capturedOpen);
  ghosts.clearFolderOpenIconGhosts();
  assert(ghosts.folderOpenIconGhosts.value.length === 0, "manual open clear should reset open ghosts");
  assert(ghosts.folderOpenIconGhostSession.value === null, "manual open clear should reset the visual session");
  ghosts.playFolderCloseIconGhosts(folder.id, capturedClose);
  ghosts.clearFolderCloseIconGhosts();
  assert(ghosts.folderCloseIconGhosts.value.length === 0, "manual close clear should reset close ghosts");
}
