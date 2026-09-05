import { useLaunchpadLayout } from "./useLaunchpadLayout.js";
import { useLaunchpadSettings as createVueSettings, type LaunchpadSettingsOptions } from "./useLaunchpadSettings.js";
import { createLaunchpadSettings } from "../application/launchpadSettings.js";
import { createNativeStateHost } from "../application/stateHost.js";
import { backgroundAssetPort, autostartPort as defaultAutostart, launchpadIconPort, localeRuntimePort } from "../platform/launchpadPorts.js";
import type { LaunchpadSettingsMainWindow } from "./useLaunchpadSettings.js";
import type { AutostartPort, LaunchpadIconPort } from "../platform/launchpadPorts.js";
import type { LaunchpadIconVariant } from "../domain/launchpadIconVariant.js";
import type { LocaleState } from "../i18n/locale.js";
import { createLocalization } from "../i18n/localization.js";
import {
  BACKGROUND_EFFECT_BLUR,
  BACKGROUND_SOURCE_CUSTOM_IMAGE,
  WINDOW_EFFECT_APPEARANCE_SYSTEM,
  WINDOW_MODE_WINDOWED,
} from "./useLaunchpadSettingsConfig.js";
import {
  APPEARANCE_DARK as SETTINGS_THEME_DARK,
  APPEARANCE_LIGHT as SETTINGS_THEME_LIGHT,
  APPEARANCE_SYSTEM as SETTINGS_THEME_SYSTEM,
} from "../domain/appearancePreference.js";
import {
  LAUNCHPAD_ICON_DARK,
  LAUNCHPAD_ICON_LIGHT,
  LAUNCHPAD_ICON_PASTEL_DARK,
  LAUNCHPAD_ICON_PASTEL_LIGHT,
} from "../domain/launchpadIconVariant.js";

const localizationText = createLocalization({ issue: null, match: "exact", preference: "zh-CN", resolvedLocale: "zh-CN" }).text;

type MainWindowRuntimeFixture = LaunchpadSettingsMainWindow & {
  calls: Array<readonly [string, unknown]>;
};

function makeMainWindowRuntime(
  options: Readonly<{ shortcutError?: unknown }> = {},
): MainWindowRuntimeFixture {
  const calls: Array<readonly [string, unknown]> = [];
  return {
    calls,
    registerShortcut: async (shortcut: string | null) => {
      calls.push(["shortcut", shortcut]);
      if (options.shortcutError) return { ok: false as const, error: options.shortcutError };
      return { ok: true as const, shortcut };
    },
    setEffectsEnabled: async (request: Parameters<LaunchpadSettingsMainWindow["setEffectsEnabled"]>[0]) => {
      calls.push(["effects", request]);
      return { ok: true };
    },
    setMode: async (request: Parameters<LaunchpadSettingsMainWindow["setMode"]>[0]) => {
      calls.push(["mode", request]);
      return { ok: true };
    },
    support: {
      value: {
        platform: "windows",
        supportsAcrylic: true,
        supportsMica: true,
        supportsMicaAlt: true,
      },
    },
  };
}

function makeLaunchpadIconPort(
  options: Readonly<{ available?: boolean; error?: Error }> = {},
): LaunchpadIconPort & { calls: LaunchpadIconVariant[] } {
  const calls: LaunchpadIconVariant[] = [];
  return {
    calls,
    isAvailable: () => options.available !== false,
    applyVariant: async (variant: LaunchpadIconVariant) => {
      calls.push(variant);
      if (options.error) throw options.error;
      return variant;
    },
  };
}

function makeLocaleState(preference: string): LocaleState {
  return {
    preference,
    resolvedLocale: preference === "en-US" ? "en-US" : "zh-CN",
    match: preference === "system" ? "default" : "explicit",
    issue: null,
  };
}

export async function runLaunchpadSettingsTests() {
  for(const native of [false,true])await runSettingsForHost(native);
}

async function runSettingsForHost(native:boolean) {
  const useLaunchpadSettings = (options:LaunchpadSettingsOptions) => native
    ? createLaunchpadSettings({...options,
      backgroundAssetPort:options.backgroundAssetPort??backgroundAssetPort,
      autostartPort:options.autostartPort??defaultAutostart,
      launchpadIconPort:options.launchpadIconPort??launchpadIconPort,
      localeRuntime:options.localeRuntime??localeRuntimePort,
    },createNativeStateHost(()=>{}))
    : createVueSettings(options);
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`[Launchpad settings owner test failed] ${message}`);
  };

  const layout = useLaunchpadLayout({
    getNewFolderName: () => localizationText.t("launchpad.newFolder"),
    seedEnabled: false,
  });
  const mainWindow = makeMainWindowRuntime();
  const launchpadIcons = makeLaunchpadIconPort();
  let liveDesktopSyncs = 0;
  const settings = useLaunchpadSettings({
    layout,
    localizationText,
    liveDesktopSupport: {
      value: {
        platform: "windows",
        supportsLiveDesktopBackground: true,
        supportsLiveDesktopBackgroundEffects: true,
      },
    },
    launchpadIconPort: launchpadIcons,
    mainWindow,
  });
  const initialLayout = layout.captureConfiguration();
  const initialWindowMode = settings.presentation.windowMode.value;
  assert(settings.presentation.settingsThemePreference.value === SETTINGS_THEME_DARK, "new and legacy settings should default to the existing dark theme");
  assert(settings.presentation.launchpadIconVariant.value === LAUNCHPAD_ICON_LIGHT, "new and legacy settings should use the classic light icon");

  settings.beginEdit();
  settings.draft.rows.value = 2;
  settings.draft.cols.value = 3;
  settings.actions.setDraftWindowMode(WINDOW_MODE_WINDOWED);
  settings.actions.setDraftBackgroundSource(BACKGROUND_SOURCE_CUSTOM_IMAGE);
  settings.draft.backgroundImagePath.value = "C:/Images/test.png";
  settings.draft.backgroundImageUrl.value = "asset://test";
  settings.actions.setDraftBackgroundEffect(BACKGROUND_EFFECT_BLUR);
  settings.actions.setDraftSettingsThemePreference(SETTINGS_THEME_LIGHT);
  settings.actions.setDraftLaunchpadIconVariant(LAUNCHPAD_ICON_DARK);
  settings.cancelEdit();
  assert(
    settings.draft.rows.value === initialLayout.rows
      && settings.draft.cols.value === initialLayout.cols
      && settings.draft.windowMode.value === initialWindowMode
      && settings.draft.settingsThemePreference.value === SETTINGS_THEME_DARK
      && settings.draft.launchpadIconVariant.value === LAUNCHPAD_ICON_LIGHT
      && settings.presentation.windowMode.value === initialWindowMode,
    "cancel should discard the entire edit draft"
  );

  const shortcutError = { message: "occupied" };
  const failedLayout = useLaunchpadLayout({
    getNewFolderName: () => localizationText.t("launchpad.newFolder"),
    seedEnabled: false,
  });
  const failed = useLaunchpadSettings({
    layout: failedLayout,
    localizationText,
    liveDesktopSupport: { value: { supportsLiveDesktopBackground: false } },
    mainWindow: makeMainWindowRuntime({ shortcutError }),
  });
  const failedInitialLayout = failedLayout.captureConfiguration();
  const failedInitialWindowMode = failed.presentation.windowMode.value;
  failed.beginEdit();
  failed.draft.rows.value = 2;
  failed.draft.cols.value = 3;
  failed.actions.setDraftWindowMode(WINDOW_MODE_WINDOWED);
  failed.actions.setDraftMainWindowShortcut("control+alt+KeyL");
  const failedOutcome = await failed.applyEdit();
  assert(
    !failedOutcome.ok && "error" in failedOutcome && failedOutcome.error === shortcutError,
    "shortcut failures should remain explicit",
  );
  assert(
    failedLayout.presentation.gridRows.value === failedInitialLayout.rows
      && failedLayout.presentation.gridCols.value === failedInitialLayout.cols
      && failed.presentation.windowMode.value === failedInitialWindowMode,
    "shortcut failures should commit no domain"
  );
  assert(
    failed.presentation.mainWindowShortcutError.value === "occupied",
    "structured shortcut failures should retain their platform message",
  );

  settings.beginEdit();
  settings.draft.rows.value = 2;
  settings.draft.cols.value = 3;
  settings.actions.setDraftWindowMode(WINDOW_MODE_WINDOWED);
  settings.actions.setDraftMainWindowShortcut("control+alt+KeyL");
  settings.actions.setDraftSettingsThemePreference(SETTINGS_THEME_SYSTEM);
  settings.actions.setDraftLaunchpadIconVariant(LAUNCHPAD_ICON_PASTEL_DARK);
  settings.actions.setDraftWindowEffectAppearance(WINDOW_EFFECT_APPEARANCE_SYSTEM);
  const outcome = await settings.applyEdit({
    reclampPageIndices: () => {},
    schedulePageGridMetrics: () => {},
    syncLiveDesktop: () => { liveDesktopSyncs += 1; },
  });
  assert(outcome.ok, "valid settings should commit successfully");
  assert(layout.presentation.gridRows.value === 2 && layout.presentation.gridCols.value === 3, "successful apply should commit layout configuration once");
  assert(settings.presentation.windowMode.value === WINDOW_MODE_WINDOWED, "successful apply should commit settings values");
  assert(settings.presentation.settingsThemePreference.value === SETTINGS_THEME_SYSTEM, "successful apply should commit the settings theme preference");
  assert(settings.presentation.launchpadIconVariant.value === LAUNCHPAD_ICON_PASTEL_DARK, "successful apply should commit the launchpad icon variant");
  assert(launchpadIcons.calls.join(",") === LAUNCHPAD_ICON_PASTEL_DARK, "icon changes should cross the native icon seam exactly once");
  assert(settings.presentation.windowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_SYSTEM, "successful apply should preserve the system window appearance preference");
  assert(mainWindow.calls.map(([name]) => name).join(",") === "shortcut,mode,effects", "successful apply should register shortcuts before platform presentation");
  const effectsCall = mainWindow.calls[2];
  assert(
    effectsCall?.[0] === "effects"
      && typeof effectsCall[1] === "object"
      && effectsCall[1] !== null
      && "appearance" in effectsCall[1]
      && effectsCall[1].appearance === WINDOW_EFFECT_APPEARANCE_SYSTEM,
    "settings should pass the unresolved window appearance preference to the runtime owner",
  );
  assert(liveDesktopSyncs === 1, "successful apply should request one live desktop synchronization");

  settings.persistence.restore({
    textless: true,
    backgroundSource: BACKGROUND_SOURCE_CUSTOM_IMAGE,
    backgroundEffect: BACKGROUND_EFFECT_BLUR,
    backgroundImagePath: "C:/Images/restored.png",
    windowMode: WINDOW_MODE_WINDOWED,
    windowEffectAppearance: WINDOW_EFFECT_APPEARANCE_SYSTEM,
    settingsThemePreference: SETTINGS_THEME_LIGHT,
    launchpadIconVariant: LAUNCHPAD_ICON_PASTEL_LIGHT,
  });
  const captured = settings.persistence.capture();
  assert(captured.textless && captured.backgroundImagePath === "C:/Images/restored.png", "settings persistence should round-trip committed values");
  assert(captured.settingsThemePreference === SETTINGS_THEME_LIGHT, "settings persistence should round-trip the settings theme preference");
  assert(captured.launchpadIconVariant === LAUNCHPAD_ICON_PASTEL_LIGHT, "settings persistence should round-trip the launchpad icon variant");
  assert(captured.windowEffectAppearance === WINDOW_EFFECT_APPEARANCE_SYSTEM, "settings persistence should round-trip the system window appearance preference");

  settings.persistence.restore({ settingsThemePreference: "unexpected" });
  assert(settings.presentation.settingsThemePreference.value === SETTINGS_THEME_DARK, "invalid and legacy theme values should restore as dark");
  assert(settings.presentation.launchpadIconVariant.value === LAUNCHPAD_ICON_LIGHT, "invalid and legacy icon values should restore as classic light");

  const localeCalls: string[] = [];
  const activatedLocales: LocaleState["resolvedLocale"][] = [];
  const localizedSettings = useLaunchpadSettings({
    localizationText,
    activateLocale: (state) => activatedLocales.push(state.resolvedLocale),
    layout: useLaunchpadLayout({
      getNewFolderName: () => localizationText.t("launchpad.newFolder"),
      seedEnabled: false,
    }),
    liveDesktopSupport: { value: { supportsLiveDesktopBackground: false } },
    localeRuntime: {
      applyPreference: async (preference) => {
        localeCalls.push(preference);
        return { ok: true, state: makeLocaleState(preference) };
      },
    },
    mainWindow: makeMainWindowRuntime(),
  });
  assert(localizedSettings.presentation.localePreference.value === "system", "new settings should follow the system language");
  localizedSettings.beginEdit();
  localizedSettings.actions.setDraftLocalePreference("en-US");
  localizedSettings.cancelEdit();
  assert(localizedSettings.draft.localePreference.value === "system", "cancel should discard the draft language");

  localizedSettings.beginEdit();
  localizedSettings.actions.setDraftLocalePreference("en-US");
  const localeOutcome = await localizedSettings.applyEdit();
  assert(localeOutcome.ok, "a supported language should apply successfully");
  assert(localizedSettings.presentation.localePreference.value === "en-US", "successful apply should commit the language preference");
  assert(localeCalls.join(",") === "en-US", "language changes should cross the locale runtime seam once");
  assert(activatedLocales.join(",") === "en-US", "the WebView locale should activate only after the settings transaction commits");
  assert(localizedSettings.persistence.capture().localePreference === "en-US", "the committed language should be persisted with settings");

  localizedSettings.persistence.restore({});
  assert(localizedSettings.presentation.localePreference.value === "system", "legacy settings without a locale should restore as system");

  const localeError = new Error("locale unavailable");
  const localeFailureSettings = useLaunchpadSettings({
    localizationText,
    layout: useLaunchpadLayout({
      getNewFolderName: () => localizationText.t("launchpad.newFolder"),
      seedEnabled: false,
    }),
    liveDesktopSupport: { value: { supportsLiveDesktopBackground: false } },
    localeRuntime: { applyPreference: async () => ({ ok: false, error: localeError }) },
    mainWindow: makeMainWindowRuntime(),
  });
  localeFailureSettings.beginEdit();
  localeFailureSettings.actions.setDraftLocalePreference("en-US");
  const localeFailureOutcome = await localeFailureSettings.applyEdit();
  assert(
    !localeFailureOutcome.ok && "error" in localeFailureOutcome && localeFailureOutcome.error === localeError,
    "native language failures should remain explicit",
  );
  assert(localeFailureSettings.presentation.localePreference.value === "system", "language failures should commit no settings state");
  assert(localeFailureSettings.presentation.localePreferenceError.value === localeError.message, "language failures should remain visible in the edit session");

  const rollbackLocaleCalls: string[] = [];
  const rollbackActivations: LocaleState["resolvedLocale"][] = [];
  const shortcutFailureSettings = useLaunchpadSettings({
    localizationText,
    activateLocale: (state) => rollbackActivations.push(state.resolvedLocale),
    layout: useLaunchpadLayout({
      getNewFolderName: () => localizationText.t("launchpad.newFolder"),
      seedEnabled: false,
    }),
    liveDesktopSupport: { value: { supportsLiveDesktopBackground: false } },
    localeRuntime: {
      applyPreference: async (preference) => {
        rollbackLocaleCalls.push(preference);
        return { ok: true, state: makeLocaleState(preference) };
      },
    },
    mainWindow: makeMainWindowRuntime({ shortcutError }),
  });
  shortcutFailureSettings.beginEdit();
  shortcutFailureSettings.actions.setDraftLocalePreference("en-US");
  shortcutFailureSettings.actions.setDraftMainWindowShortcut("control+alt+KeyL");
  const shortcutFailureOutcome = await shortcutFailureSettings.applyEdit();
  assert(
    !shortcutFailureOutcome.ok
      && "error" in shortcutFailureOutcome
      && shortcutFailureOutcome.error === shortcutError,
    "shortcut failure should remain the transaction error",
  );
  assert(rollbackLocaleCalls.join(",") === "en-US,system", "shortcut failure should restore the previous native language");
  assert(shortcutFailureSettings.presentation.localePreference.value === "system", "compensated transactions should keep the committed language");
  assert(rollbackActivations.length === 0, "the WebView language should not activate before the full transaction succeeds");

  const iconError = new Error("icon unavailable");
  const iconFailureLocaleCalls: string[] = [];
  const iconFailureMainWindow = makeMainWindowRuntime();
  const iconFailureSettings = useLaunchpadSettings({
    localizationText,
    layout: useLaunchpadLayout({
      getNewFolderName: () => localizationText.t("launchpad.newFolder"),
      seedEnabled: false,
    }),
    launchpadIconPort: makeLaunchpadIconPort({ error: iconError }),
    liveDesktopSupport: { value: { supportsLiveDesktopBackground: false } },
    localeRuntime: {
      applyPreference: async (preference) => {
        iconFailureLocaleCalls.push(preference);
        return { ok: true, state: makeLocaleState(preference) };
      },
    },
    mainWindow: iconFailureMainWindow,
  });
  iconFailureSettings.beginEdit();
  iconFailureSettings.actions.setDraftLocalePreference("en-US");
  iconFailureSettings.actions.setDraftMainWindowShortcut("control+alt+KeyL");
  iconFailureSettings.actions.setDraftLaunchpadIconVariant(LAUNCHPAD_ICON_DARK);
  const iconFailureOutcome = await iconFailureSettings.applyEdit();
  assert(
    !iconFailureOutcome.ok && "error" in iconFailureOutcome && iconFailureOutcome.error === iconError,
    "icon failures should remain explicit",
  );
  assert(iconFailureLocaleCalls.join(",") === "en-US,system", "icon failure should restore the previous native language");
  assert(
    iconFailureMainWindow.calls.filter(([name]) => name === "shortcut").length === 2,
    "icon failure should restore the previous shortcut"
  );
  assert(iconFailureSettings.presentation.launchpadIconVariant.value === LAUNCHPAD_ICON_LIGHT, "icon failures should commit no icon state");
  assert(iconFailureSettings.presentation.localePreference.value === "system", "icon failures should commit no language state");
  assert(iconFailureSettings.presentation.launchpadIconError.value === iconError.message, "icon failures should stay visible in the edit session");

  let startupStatus = false;
  const startupCalls: boolean[] = [];
  const autostartPort: AutostartPort = {
    isAvailable: () => true,
    getStatus: async () => startupStatus,
    setEnabled: async (enabled: boolean) => {
      startupCalls.push(Boolean(enabled));
      startupStatus = Boolean(enabled);
      return startupStatus;
    },
  };
  const startupSettings = useLaunchpadSettings({
    localizationText,
    layout: useLaunchpadLayout({
      getNewFolderName: () => localizationText.t("launchpad.newFolder"),
      seedEnabled: false,
    }),
    liveDesktopSupport: { value: { supportsLiveDesktopBackground: false } },
    mainWindow: makeMainWindowRuntime(),
    autostartPort,
  });
  startupSettings.beginEdit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(startupSettings.presentation.canConfigureLaunchAtLogin.value, "desktop startup should expose the sign-in startup capability");
  startupSettings.actions.setDraftLaunchAtLogin(true);
  const startupOutcome = await startupSettings.applyEdit();
  assert(startupOutcome.ok, "sign-in startup should apply through the startup port");
  assert(startupCalls.join(",") === "true", "sign-in startup should cross the native seam once");
  assert(startupSettings.presentation.launchAtLogin.value, "successful sign-in startup should update committed state");
  assert(!Object.prototype.hasOwnProperty.call(startupSettings.persistence.capture(), "launchAtLogin"), "sign-in startup must stay outside layout persistence");

  const startupFailureCalls: boolean[] = [];
  const startupFailureSettings = useLaunchpadSettings({
    activateLocale: () => {},
    layout: useLaunchpadLayout({
      getNewFolderName: () => localizationText.t("launchpad.newFolder"),
      seedEnabled: false,
    }),
    localizationText,
    launchpadIconPort: makeLaunchpadIconPort(),
    liveDesktopSupport: { value: { supportsLiveDesktopBackground: false } },
    localeRuntime: {
      applyPreference: async (preference) => ({ ok: true, state: makeLocaleState(preference) }),
    },
    mainWindow: makeMainWindowRuntime(),
    autostartPort: {
      isAvailable: () => true,
      getStatus: async () => false,
      setEnabled: async (enabled: boolean) => {
        startupFailureCalls.push(Boolean(enabled));
        if (enabled) throw new Error("startup denied");
        return false;
      },
    },
  });
  startupFailureSettings.beginEdit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  startupFailureSettings.actions.setDraftLocalePreference("en-US");
  startupFailureSettings.actions.setDraftMainWindowShortcut("control+alt+KeyL");
  startupFailureSettings.actions.setDraftLaunchpadIconVariant(LAUNCHPAD_ICON_DARK);
  startupFailureSettings.actions.setDraftLaunchAtLogin(true);
  const startupFailureOutcome = await startupFailureSettings.applyEdit();
  assert(!startupFailureOutcome.ok, "sign-in startup failures should remain explicit");
  assert(startupFailureCalls.join(",") === "true,false", "sign-in startup failure should attempt a native rollback");
  assert(!startupFailureSettings.presentation.launchAtLogin.value, "sign-in startup failure should commit no startup state");
  assert(startupFailureSettings.presentation.launchAtLoginError.value.includes("startup denied"), "sign-in startup failures should remain visible");
}
