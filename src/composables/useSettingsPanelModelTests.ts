import { computed, ref } from "vue";
import type { BackgroundLayoutContext } from "../api/launchpadApi.js";
import {
  normalizeAppearancePreference,
} from "../domain/appearancePreference.js";
import type { AppearancePreference } from "../domain/appearancePreference.js";
import { normalizeLaunchpadIconVariant } from "../domain/launchpadIconVariant.js";
import { normalizeMainWindowShortcut } from "../domain/mainWindowShortcut.js";
import { normalizeLocalePreference } from "../i18n/locale.js";
import { createLocalization } from "../i18n/localization.js";
import { useSettingsPanelModel } from "./useSettingsPanelModel.js";
import type { SettingsPanelCapabilities } from "./useSettingsPanelModel.js";

function createCapabilities() {
  const draftMainWindowShortcut = ref<string | null>("control+alt+KeyL");
  const draftLaunchpadIconVariant = ref<SettingsPanelCapabilities["draftLaunchpadIconVariant"]["value"]>("light");
  const draftLocalePreference = ref("system");
  const draftSettingsThemePreference = ref<SettingsPanelCapabilities["draftSettingsThemePreference"]["value"]>("system");
  const draftWindowEffectAppearance = ref<SettingsPanelCapabilities["draftWindowEffectAppearance"]["value"]>("dark");
  const draftWindowEffectMaterial = ref<SettingsPanelCapabilities["draftWindowEffectMaterial"]["value"]>("none");
  const localePreferenceError = ref("");
  const launchpadIconError = ref("");
  const mainWindowShortcutError = ref("");
  const capabilities = {
    appManagerSearchQuery: ref(""),
    applySettingsConfig: async () => ({ ok: true }),
    cancelScanAppExclusion: () => false,
    cancelScanAppExclusions: () => false,
    closeSettingsPanel: () => {},
    canCustomizeLaunchpadIcon: ref(true),
    canUseDraftBackgroundEffect: () => true,
    canUseLiveDesktopBackground: () => false,
    canUseLiveDesktopBackgroundEffect: () => false,
    canUseWindowEffectMaterial: () => true,
    draftBackgroundAcrylicAppearance: ref("system"),
    draftBackgroundAcrylicBlurStrength: ref(32),
    draftBackgroundAcrylicDarkParams: ref({
      brightness: 0.8,
      contrast: 0.85,
      noise: 0.005,
      saturation: 1.5,
      seed: 0,
      tintColor: [0.235, 0.235, 0.235] as [number, number, number],
      tintStrength: 0.2,
    }),
    draftBackgroundAcrylicLightParams: ref({
      brightness: 1,
      contrast: 0.85,
      noise: 0.005,
      saturation: 1.5,
      seed: 0,
      tintColor: [0.459, 0.459, 0.459] as [number, number, number],
      tintStrength: 0.2,
    }),
    draftBackgroundBlurStrength: ref(24),
    draftBackgroundDarkenStrength: ref(30),
    draftBackgroundEffect: ref("none"),
    draftBackgroundImageLayout: ref("fill"),
    draftBackgroundImageOpacity: ref(100),
    draftBackgroundImagePath: ref(""),
    draftBackgroundImageUrl: ref(""),
    draftBackgroundLiveDesktopOpacity: ref(100),
    draftBackgroundSource: ref("systemMaterial"),
    draftLocalePreference,
    draftLaunchpadIconVariant,
    draftMainWindowShortcut,
    draftSettingsThemePreference,
    draftWindowEffectAppearance,
    draftWindowEffectMaterial,
    dragMeta: ref(null),
    excludedScanApps: ref([
      { name: "Blocked Tool", catalogId: "catalog-blocked-tool", iconUrl: "http://asset.localhost/blocked.png" },
      { name: "Hidden Editor", catalogId: "catalog-hidden-editor" },
    ]),
    isApplyingSettingsConfig: ref(false),
    isSettingsPanelOpen: ref(true),
    localePreferenceError,
    launchpadIconError,
    mainWindowShortcutError,
    scanAppBlacklist: ref([
      { name: "Blocked Tool", catalogId: "catalog-blocked-tool" },
      { name: "Hidden Editor", catalogId: "catalog-hidden-editor" },
    ]),
    scanRoots: ref<SettingsPanelCapabilities["scanRoots"]["value"]>([]),
    resetDraftBackgroundAcrylicParams: () => {},
    setDraftBackgroundAcrylicAppearance: () => {},
    setDraftBackgroundAcrylicParam: () => {},
    setDraftLaunchAtLogin: () => {},
    setDraftMainWindowShortcut: (value: unknown) => {
      draftMainWindowShortcut.value = normalizeMainWindowShortcut(value);
      mainWindowShortcutError.value = "";
    },
    setDraftLocalePreference: (value: unknown) => {
      draftLocalePreference.value = normalizeLocalePreference(value);
      localePreferenceError.value = "";
    },
    setDraftLaunchpadIconVariant: (value: unknown) => {
      draftLaunchpadIconVariant.value = normalizeLaunchpadIconVariant(value);
      launchpadIconError.value = "";
    },
    setDraftSettingsThemePreference: (value: unknown) => {
      draftSettingsThemePreference.value = normalizeAppearancePreference(value);
    },
    setDraftWindowEffectAppearance: () => {},
    setDraftWindowEffectMaterial: () => {},
    setMainWindowShortcutError: (value: unknown) => {
      mainWindowShortcutError.value = String(value || "");
    },
    setMainWindowShortcutCaptureActive: () => {},
    settingsOverlayAnimate: computed(() => ({ opacity: 1 })),
    settingsPanelAnimate: computed(() => ({
      opacity: 1,
      scaleX: 1,
      scaleY: 1,
      x: 0,
      y: 0,
      borderRadius: "18px",
    })),
    settingsPanelCloseDurationSeconds: computed(() => 0.22),
    settingsPanelInitial: computed(() => ({
      opacity: 0,
      scaleX: 0.08,
      scaleY: 0.06,
      x: 0,
      y: 0,
      borderRadius: "18px",
    })),
    shouldRenderSettingsPanel: computed(() => true),
    windowEffectsSupport: ref({ supportsAcrylic: true, supportsMica: true, supportsMicaAlt: true }),
  } satisfies SettingsPanelCapabilities;
  return capabilities;
}

export async function runSettingsPanelModelTests() {
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`[Settings panel model test failed] ${message}`);
  };
  const capabilities = createCapabilities();
  const localization = createLocalization({
    issue: null,
    match: "exact",
    preference: "en-US",
    resolvedLocale: "en-US",
  });
  let developerConsoleOpenCount = 0;
  const systemAppearance = ref<AppearancePreference>("light");
  const model = useSettingsPanelModel({
    appVersion: "0.1.0-test",
    backgroundLayoutContext: ref<BackgroundLayoutContext | null>(null),
    capabilities,
    developerTools: {
      isAvailable: () => true,
      openConsole: async () => {
        developerConsoleOpenCount += 1;
        return true;
      },
    },
    nativeEvents: { listen: async () => () => {} },
    localizationText: localization.text,
    systemAppearance,
  });

  assert(model.shell.activeTab.value === "general", "settings should start on the general page");
  assert(model.shell.tabs.value[0]!.label === "General", "settings navigation should use the active locale");
  localization.activate({ issue: null, match: "exact", preference: "zh-CN", resolvedLocale: "zh-CN" });
  assert(model.shell.tabs.value[0]!.label === "通用", "settings navigation should react to locale changes");
  model.pages.general.actions.setLocalePreference("en-US");
  assert(capabilities.draftLocalePreference.value === "en-US", "General should update the locale draft through the owner command");
  model.pages.general.actions.setLaunchpadIconVariant("pastelDark");
  assert(capabilities.draftLaunchpadIconVariant.value === "pastelDark", "General should update the launchpad icon draft through the owner command");
  assert(model.pages.general.launchpadIconOptions.value.length === 4, "General should expose all four launchpad icon choices");
  model.shell.actions.selectTab("apps");
  model.pages.apps.actions.openAppManager();
  assert(model.shell.activeRoute.value.subPageId === "apps.appManager", "Apps should own navigation to its manager subpage");
  model.pages.apps.actions.openKeywordFilters();
  assert(model.shell.activeRoute.value.key === "apps/index", "keyword settings navigation should return to the Apps root");
  assert(model.pages.apps.isKeywordBlacklistExpanded.value, "keyword settings navigation should expand the keyword editor");
  assert(model.shell.activePageModel.value === model.pages.apps, "the shell should expose only the selected page model");
  const firstExcludedApp = model.pages.apps.filteredExcludedApps.value[0]?.app;
  assert(
    firstExcludedApp
      && "iconUrl" in firstExcludedApp
      && firstExcludedApp.iconUrl === "http://asset.localhost/blocked.png",
    "Apps should preserve runtime icon presentation for excluded rows"
  );
  model.shell.actions.closeSubPage();
  assert(model.shell.activeRoute.value.depth === 0, "closing a subpage should return to the Apps root");

  model.pages.apps.actions.setExcludedAppsSearchQuery("editor");
  assert(model.pages.apps.filteredExcludedApps.value.length === 1, "Apps should own excluded-app filtering");
  const excluded = model.pages.apps.filteredExcludedApps.value[0];
  model.pages.apps.actions.toggleExcludedAppSelection(excluded!.key, true);
  assert(model.pages.apps.selectedExcludedAppCount.value === 1, "Apps should own excluded-app selection");

  model.pages.general.actions.clearShortcut();
  assert(capabilities.draftMainWindowShortcut.value === null, "General should update shortcut drafts through an owner command");
  assert(model.pages.general.canResetMainWindowShortcut.value, "a disabled shortcut should be resettable");
  model.pages.general.actions.resetShortcut();
  assert(capabilities.draftMainWindowShortcut.value === "alt+Space", "reset should restore the documented default shortcut");
  assert(!model.pages.general.canResetMainWindowShortcut.value, "the default shortcut should not offer a no-op reset");
  assert(model.pages.general.canOpenDeveloperConsole.value, "General should expose developer console availability");
  assert(await model.pages.general.actions.openDeveloperConsole(), "General should report a successful developer console open");
  assert(developerConsoleOpenCount === 1, "General should open the developer console through its injected port");
  assert(!("scanRoots" in model.pages.general), "General should not expose Apps page state");
  assert(!("draftBackgroundSource" in model.pages.apps), "Apps should not expose Interface page drafts");
  assert(model.pages.about.appVersion === "0.1.0-test", "About should receive the app version explicitly");
  assert(model.pages.about.draftLaunchpadIconVariant === capabilities.draftLaunchpadIconVariant, "About should reuse the launchpad icon draft owner");
  assert(model.pages.interface.systemAppearance === model.systemAppearance, "Interface should reuse the shared system appearance owner");
  assert(model.shell.resolvedSettingsTheme.value === "light", "the system settings theme should resolve through the shared appearance owner");
  capabilities.setDraftSettingsThemePreference("dark");
  assert(model.shell.resolvedSettingsTheme.value === "dark", "an explicit settings theme should override the system appearance");
  assert(model.pages.interface.windowEffectSummary.value === "无材质", "no material summaries should omit the inactive appearance");
  capabilities.draftWindowEffectMaterial.value = "acrylic";
  assert(model.pages.interface.windowEffectSummary.value === "Acrylic · 深色", "active materials should retain their appearance summary");
  capabilities.draftWindowEffectAppearance.value = "system";
  assert(model.pages.interface.windowEffectSummary.value === "Acrylic · 跟随系统", "window material summaries should expose the system preference");
  assert(model.pages.interface.windowEffectPreviewItems.value[1]!.appearance === "system", "window previews should preserve the selected preference");
  assert(model.pages.interface.windowEffectPreviewItems.value[1]!.resolvedAppearance === "light", "window previews should resolve system appearance for presentation");
  systemAppearance.value = "dark";
  assert(model.pages.interface.windowEffectPreviewItems.value[1]!.resolvedAppearance === "dark", "window previews should react to system appearance changes");
  model.dispose();
}
