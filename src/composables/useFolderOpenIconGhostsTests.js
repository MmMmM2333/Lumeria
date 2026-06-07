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
  assert(ghosts.isFolderOpenIconAnimationActive.value, "open play should mark the animation active");
  assert(ghosts.isFolderOpenFrameGhostPending.value, "open play should keep page dots blocked while ghosts are active");
  assert(ghosts.isFolderOpeningIconGhosted(folder.id, appC.id), "open play should ghost folder targets");
  assert(ghosts.isFolderOpeningPreviewFrameGhosted(folder.id), "open play should hide the source folder thumbnail frame");

  ghosts.completeFolderOpenIconGhost("stale-key");
  assert(ghosts.folderOpenIconGhosts.value.length === 3, "stale open completion should not clear current ghosts");
  ghosts.folderOpenIconGhosts.value.forEach((ghost) => ghosts.completeFolderOpenIconGhost(ghost.key));
  assert(ghosts.folderOpenIconGhosts.value.length === 0, "open ghosts should clear after all completions");
  assert(!ghosts.isFolderOpenIconAnimationActive.value, "open completion should clear animation state");
  assert(!ghosts.isFolderOpenFrameGhostPending.value, "open completion should unblock page dots");
  assert(!ghosts.isFolderOpeningPreviewFrameGhosted(folder.id), "open completion should reveal the source folder thumbnail frame");

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
  ghosts.playFolderCloseIconGhosts(folder.id, capturedClose);
  ghosts.clearFolderCloseIconGhosts();
  assert(ghosts.folderCloseIconGhosts.value.length === 0, "manual close clear should reset close ghosts");
}
