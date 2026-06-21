import { ref, shallowRef } from "vue";
import {
  createDeferredHandlers,
  shouldDeferFolderOpenForClosingGhostHandoff,
  shouldIgnoreFolderCloseRequest,
  shouldPlayFolderOpenIconGhosts,
} from "./useLaunchpadController.js";
import { useLaunchpadControllerHelpers } from "./useLaunchpadControllerHelpers.js";

export function runLaunchpadControllerHelpersTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad controller helpers test failed] ${message}`);
  };

  const pages = shallowRef([]);
  const helpers = useLaunchpadControllerHelpers({
    folderPageSize: ref(2),
    pageSize: ref(2),
    pages,
    seeds: [
      { name: "Alpha", emoji: "A" },
      { name: "Beta", emoji: "B" },
      { name: "Gamma", emoji: "G" },
    ],
  });

  assert(pages.value.length === 2, "seed apps should be chunked into default pages");
  assert(pages.value[0].length === 2 && pages.value[1].length === 1, "seed pages should follow the current page size");
  assert(pages.value[0][0].type === "app", "seed items should be normalized into app records");
  assert(pages.value[0][0].name === "Alpha", "seed app names should be preserved");
  assert(typeof helpers.chunkIntoPages === "function", "page chunking helper should be returned");
  assert(typeof helpers.cloneItem === "function", "layout helpers should be returned");
  assert(typeof helpers.withFolderPages === "function", "folder page helper should be returned");
  assert(typeof helpers.createLayoutSnapshot === "function", "data helpers should be returned");

  const nativePages = shallowRef([]);
  useLaunchpadControllerHelpers({
    folderPageSize: ref(2),
    pageSize: ref(2),
    pages: nativePages,
    seedEnabled: false,
    seeds: [
      { name: "Hidden Seed", emoji: "H" },
    ],
  });
  assert(nativePages.value.length === 1 && nativePages.value[0].length === 0, "disabled seeds should initialize an empty page");

  const folder = {
    id: "folder",
    type: "folder",
    name: "Folder",
    childPages: [[pages.value[0][0]]],
  };
  const snapshot = helpers.createLayoutSnapshot({
    pages: [[folder]],
    textless: true,
  });
  assert(snapshot.pages[0][0].children.length === 1, "data helpers should use the shared folder child helpers");

  const deferredHandlers = createDeferredHandlers({
    value: () => "fallback",
  });
  assert(deferredHandlers.call("value") === "fallback", "deferred handlers should use defaults before binding");
  deferredHandlers.set("value", (next) => `bound:${next}`);
  assert(deferredHandlers.call("value", "ready") === "bound:ready", "deferred handlers should call bound functions");
  assert(deferredHandlers.call("missing") === undefined, "missing deferred handlers should be no-ops");

  assert(!shouldPlayFolderOpenIconGhosts(null), "empty folder open requests should not play folder-open icon ghosts");
  assert(shouldPlayFolderOpenIconGhosts("folder", {
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(false),
    openFolderId: ref(null),
    renderedFolder: ref(null),
  }), "opening a closed folder should play folder-open icon ghosts");
  assert(!shouldPlayFolderOpenIconGhosts("folder", {
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(false),
    openFolderId: ref("folder"),
    renderedFolder: ref({ id: "folder" }),
  }), "refreshing the already-open folder should not replay folder-open icon ghosts");
  assert(shouldPlayFolderOpenIconGhosts("folder", {
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(false),
    openFolderId: ref("other-folder"),
    renderedFolder: ref({ id: "other-folder" }),
  }), "switching to another folder should play folder-open icon ghosts");
  assert(shouldPlayFolderOpenIconGhosts("folder", {
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(true),
    openFolderId: ref("folder"),
    renderedFolder: ref({ id: "folder" }),
  }), "reopening a closing folder should play folder-open icon ghosts");

  assert(shouldIgnoreFolderCloseRequest({
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(true),
    isFolderZoomFadeClosing: ref(false),
    openFolderId: ref(null),
    renderedFolder: ref({ id: "folder" }),
  }), "closing an already-closing folder should be ignored");
  assert(shouldIgnoreFolderCloseRequest({
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(false),
    isFolderZoomFadeClosing: ref(false),
    openFolderId: ref(null),
    renderedFolder: ref(null),
  }), "closing with no active folder should be ignored");
  assert(!shouldIgnoreFolderCloseRequest({
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(false),
    isFolderZoomFadeClosing: ref(false),
    openFolderId: ref("folder"),
    renderedFolder: ref({ id: "folder" }),
  }), "closing an open folder should be accepted");

  assert(shouldDeferFolderOpenForClosingGhostHandoff("next-folder", {
    folderCloseIconGhosts: ref([{ key: "close-ghost" }]),
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(true),
    isFolderZoomFadeClosing: ref(false),
    renderedFolder: ref({ id: "folder" }),
  }), "opening another folder during a pending close ghost handoff should wait for Pixi to consume the close");
  assert(!shouldDeferFolderOpenForClosingGhostHandoff("folder", {
    folderCloseIconGhosts: ref([{ key: "close-ghost" }]),
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(true),
    isFolderZoomFadeClosing: ref(false),
    renderedFolder: ref({ id: "folder" }),
  }), "reopening the same closing folder should not wait for a detached close handoff");
  assert(!shouldDeferFolderOpenForClosingGhostHandoff("next-folder", {
    folderCloseIconGhosts: ref([]),
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(true),
    isFolderZoomFadeClosing: ref(false),
    renderedFolder: ref({ id: "folder" }),
  }), "opening another folder without close ghosts should not be delayed");
}
