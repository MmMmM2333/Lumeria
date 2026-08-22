import { createSSRApp, h, ref } from "vue";
import { renderToString } from "@vue/server-renderer";
import {
  isMultiSelectFixtureEnabled,
  shouldDeferFolderOpenForClosingGhostHandoff,
  shouldIgnoreFolderCloseRequest,
  shouldPlayFolderOpenIconGhosts,
  useLaunchpadController,
} from "./useLaunchpadController.js";
import { createLocalization } from "../i18n/localization.js";

export async function runLaunchpadControllerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad controller test failed] ${message}`);
  };

  assert(
    isMultiSelectFixtureEnabled("?fixture=multi-select", true),
    "the isolated multi-select fixture should only activate for its exact development query"
  );
  assert(
    !isMultiSelectFixtureEnabled("?fixture=multi-select", false) &&
      !isMultiSelectFixtureEnabled("?fixture=other", true),
    "the fixture gate must stay disabled in production and for unrelated queries"
  );

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

  let controller;
  const app = createSSRApp({
    setup() {
      const localization = createLocalization({
        preference: "zh-CN",
        resolvedLocale: "zh-CN",
        match: "explicit",
        issue: null,
      });
      controller = useLaunchpadController({
        activateLocale: localization.activate,
        appVersion: "controller-setup-test",
        localizationText: localization.text,
      });
      return () => h("div");
    },
  });
  await renderToString(app);
  assert(
    Array.isArray(controller.settingsPanelModel.pages.apps.excludedScanApps.value),
    "the Apps settings model should expose runtime excluded-app presentation data"
  );
  assert(
    controller.dialogs.resolvedSettingsTheme === controller.settingsPanelModel.shell.resolvedSettingsTheme,
    "standalone dialogs should share the settings panel's resolved theme source"
  );
  assert(
    controller.dialogs.resolvedSettingsTheme.value === "dark",
    "standalone dialogs should preserve the existing dark default"
  );
  assert(
    controller.overlays.resolvedSettingsTheme === controller.settingsPanelModel.shell.resolvedSettingsTheme,
    "launchpad overlays should share the settings panel's resolved theme source"
  );
  assert(
    controller.overlays.resolvedSettingsTheme.value === "dark",
    "launchpad overlays should preserve the existing dark default"
  );
  assert(
    typeof controller.chrome.closeNativeWindow === "function",
    "window chrome should expose the generation-owned native close action"
  );
}
