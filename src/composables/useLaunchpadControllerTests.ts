import { createSSRApp, h, ref } from "vue";
import { renderToString } from "@vue/server-renderer";
import {
  isMultiSelectFixtureEnabled,
  shouldIgnoreFolderCloseRequest,
  shouldPlayFolderOpenIconGhosts,
  shouldWaitForFolderClosePresentation,
  useLaunchpadController,
  type LaunchpadController,
} from "./useLaunchpadController.js";
import { createLocalization } from "../i18n/localization.js";

export async function runLaunchpadControllerTests() {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[Launchpad controller test failed] ${message}`);
  }

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

  assert(shouldWaitForFolderClosePresentation("next-folder", {
    folderCloseIconGhostSession: ref({ folderId: "folder", requestId: 1, status: "staged" }),
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(true),
    isFolderZoomFadeClosing: ref(false),
    renderedFolder: ref({ id: "folder" }),
  }), "opening another folder before its close presentation should wait for Pixi consumption");
  assert(!shouldWaitForFolderClosePresentation("next-folder", {
    folderCloseIconGhostSession: ref({ folderId: "folder", requestId: 1, status: "presented" }),
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(true),
    isFolderZoomFadeClosing: ref(false),
    renderedFolder: ref({ id: "folder" }),
  }), "a cross-folder open should proceed immediately once the closing artwork was actually presented");
  assert(!shouldWaitForFolderClosePresentation("folder", {
    folderCloseIconGhostSession: ref({ folderId: "folder", requestId: 1, status: "staged" }),
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(true),
    isFolderZoomFadeClosing: ref(false),
    renderedFolder: ref({ id: "folder" }),
  }), "reopening the same closing folder should not wait for a detached close handoff");

  const controllerOwner: { value: LaunchpadController | null } = { value: null };
  const app = createSSRApp({
    setup() {
      const localization = createLocalization({
        preference: "zh-CN",
        resolvedLocale: "zh-CN",
        match: "explicit",
        issue: null,
      });
      controllerOwner.value = useLaunchpadController({
        activateLocale: localization.activate,
        appVersion: "controller-setup-test",
        localizationText: localization.text,
      });
      return () => h("div");
    },
  });
  await renderToString(app);
  const controller = controllerOwner.value;
  if (!controller) throw new Error("[Launchpad controller test failed] the controller should initialize during SSR setup");
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
