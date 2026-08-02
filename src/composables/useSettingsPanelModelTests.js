import { ref } from "vue";
import { useSettingsPanelModel } from "./useSettingsPanelModel.js";

function createCapabilities() {
  const draftMainWindowShortcut = ref("control+alt+KeyL");
  const mainWindowShortcutError = ref("");
  return {
    activeSettingsState: ref(true),
    appManagerSearchQuery: ref(""),
    applySettingsConfig: async () => ({ ok: true }),
    cancelScanAppExclusion: () => {},
    cancelScanAppExclusions: () => {},
    closeSettingsPanel: () => {},
    draftBackgroundAcrylicAppearance: ref("system"),
    draftBackgroundSource: ref("systemMaterial"),
    draftMainWindowShortcut,
    dragMeta: ref(null),
    isApplyingSettingsConfig: ref(false),
    isSettingsPanelOpen: ref(true),
    mainWindowShortcutError,
    scanAppBlacklist: ref([
      { name: "Blocked Tool", path: "C:/Tools/Blocked.exe", sourceKey: "blocked-tool" },
      { name: "Hidden Editor", path: "C:/Apps/Editor.exe", sourceKey: "hidden-editor" },
    ]),
    setDraftMainWindowShortcut: (value) => {
      draftMainWindowShortcut.value = value;
      mainWindowShortcutError.value = "";
    },
    setMainWindowShortcutError: (value) => {
      mainWindowShortcutError.value = String(value || "");
    },
    setMainWindowShortcutCaptureActive: () => {},
    settingsOverlayAnimate: ref({ opacity: 1 }),
    settingsPanelAnimate: ref({ opacity: 1 }),
    settingsPanelCloseDurationSeconds: ref(0.22),
    settingsPanelInitial: ref({ opacity: 0 }),
    shouldRenderSettingsPanel: ref(true),
  };
}

export function runSettingsPanelModelTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Settings panel model test failed] ${message}`);
  };
  const capabilities = createCapabilities();
  const model = useSettingsPanelModel({
    appVersion: "0.1.0-test",
    backgroundLayoutContext: ref({ viewportWidth: 1920 }),
    capabilities,
    nativeEvents: { listen: async () => () => {} },
    systemAppearance: ref("light"),
  });

  assert(model.shell.activeTab.value === "general", "settings should start on the general page");
  model.shell.actions.selectTab("apps");
  model.pages.apps.actions.openAppManager();
  assert(model.shell.activeRoute.value.subPageId === "apps.appManager", "Apps should own navigation to its manager subpage");
  assert(model.shell.activePageModel.value === model.pages.apps, "the shell should expose only the selected page model");
  model.shell.actions.closeSubPage();
  assert(model.shell.activeRoute.value.depth === 0, "closing a subpage should return to the Apps root");

  model.pages.apps.actions.setExcludedAppsSearchQuery("editor");
  assert(model.pages.apps.filteredExcludedApps.value.length === 1, "Apps should own excluded-app filtering");
  const excluded = model.pages.apps.filteredExcludedApps.value[0];
  model.pages.apps.actions.toggleExcludedAppSelection(excluded.key, true);
  assert(model.pages.apps.selectedExcludedAppCount.value === 1, "Apps should own excluded-app selection");

  model.pages.general.actions.clearShortcut();
  assert(capabilities.draftMainWindowShortcut.value === null, "General should update shortcut drafts through an owner command");
  assert(!("scanRoots" in model.pages.general), "General should not expose Apps page state");
  assert(!("draftBackgroundSource" in model.pages.apps), "Apps should not expose Interface page drafts");
  assert(model.pages.about.appVersion === "0.1.0-test", "About should receive the app version explicitly");
  assert(model.pages.interface.systemAppearance === model.systemAppearance, "Interface should reuse the shared system appearance owner");
  model.dispose();
}
