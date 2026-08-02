import { createSSRApp, h, ref } from "vue";
import { renderToString } from "@vue/server-renderer";
import {
  shouldDeferFolderOpenForClosingGhostHandoff,
  shouldIgnoreFolderCloseRequest,
  shouldPlayFolderOpenIconGhosts,
  useLaunchpadController,
} from "./useLaunchpadController.js";

export async function runLaunchpadControllerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad controller test failed] ${message}`);
  };

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
  }), "opening another folder during a close ghost handoff should wait for Pixi consumption");
  assert(!shouldDeferFolderOpenForClosingGhostHandoff("folder", {
    folderCloseIconGhosts: ref([{ key: "close-ghost" }]),
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(true),
    isFolderZoomFadeClosing: ref(false),
    renderedFolder: ref({ id: "folder" }),
  }), "reopening the same closing folder should not wait for a detached close handoff");

  const app = createSSRApp({
    setup() {
      useLaunchpadController({ appVersion: "controller-setup-test" });
      return () => h("div");
    },
  });
  await renderToString(app);
}
