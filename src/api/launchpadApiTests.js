import { readFileSync } from "node:fs";
import {
  applyAppLocalePreference,
  beginMainWindowClose,
  completeRendererStartup,
  getAutostartStatus,
  getAppLocaleState,
  getLaunchContext,
  hideMainWindow,
  loadLayout,
  normalizeScanAppsResult,
  openDeveloperConsole,
  revealMainWindow,
  saveLayout,
  setAutostartEnabled,
  setLaunchpadApiBridgeForTests,
  setMainWindowMode,
} from "./launchpadApi.js";

export async function runLaunchpadApiTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad API test failed] ${message}`);
  };
  const invocations = [];
  const nativeLocaleState = {
    preference: "system",
    resolvedLocale: "en-US",
    match: "language",
    issue: null,
  };
  let malformedStatsError = null;
  try {
    normalizeScanAppsResult({ apps: [], excludedApps: [], keywordExcludedApps: [], warnings: [], stats: {} });
  } catch (error) {
    malformedStatsError = error;
  }
  assert(malformedStatsError instanceof TypeError, "scan results should reject incomplete stats instead of assuming the scan was complete");
  const validStats = {
    dirsVisited: 0,
    entriesSeen: 0,
    physicalAppsFound: 0,
    startMenuOverlays: 0,
    equivalentAppsMerged: 0,
    unresolvedApps: 0,
    keywordExcludedApps: 0,
    excludedApps: 0,
    appsFound: 0,
    limitReached: false,
  };
  const statsWithoutKeywordExclusions = { ...validStats };
  delete statsWithoutKeywordExclusions.keywordExcludedApps;
  let missingKeywordExclusionsError = null;
  try {
    normalizeScanAppsResult({ apps: [], excludedApps: [], keywordExcludedApps: [], warnings: [], stats: statsWithoutKeywordExclusions });
  } catch (error) {
    missingKeywordExclusionsError = error;
  }
  assert(
    missingKeywordExclusionsError instanceof TypeError,
    "scan results should require keyword exclusion counts"
  );
  let missingKeywordExcludedAppsError = null;
  try {
    normalizeScanAppsResult({ apps: [], excludedApps: [], warnings: [], stats: validStats });
  } catch (error) {
    missingKeywordExcludedAppsError = error;
  }
  assert(
    missingKeywordExcludedAppsError instanceof TypeError,
    "scan results should require complete keyword-excluded apps"
  );
  let missingExcludedAppsError = null;
  try {
    normalizeScanAppsResult({ apps: [], keywordExcludedApps: [], warnings: [], stats: validStats });
  } catch (error) {
    missingExcludedAppsError = error;
  }
  assert(missingExcludedAppsError instanceof TypeError, "scan results should require runtime excluded-app presentation data");
  const excludedApps = [{ id: "catalog-blocked", name: "Blocked" }];
  const normalizedResult = normalizeScanAppsResult({
    apps: [],
    excludedApps,
    keywordExcludedApps: [{
      app: {
        id: "catalog-uninstall",
        type: "app",
        name: "Uninstall Example",
        iconPath: "C:/Icons/uninstall.png",
        launchTarget: { kind: "shortcut", path: "C:/Users/Example/Uninstall Example.lnk" },
      },
      matchedKeyword: "uninstall",
      rootId: "root-system",
      rootLabel: "System Start Menu",
    }],
    warnings: [],
    stats: validStats,
  });
  assert(
    normalizedResult.excludedApps === excludedApps,
    "complete scan results should preserve runtime excluded-app presentation data"
  );
  assert(
    JSON.stringify(normalizedResult.keywordExcludedApps) === JSON.stringify([{
      app: {
        id: "catalog-uninstall",
        type: "app",
        name: "Uninstall Example",
        iconPath: "C:/Icons/uninstall.png",
        launchTarget: { kind: "shortcut", path: "C:/Users/Example/Uninstall Example.lnk" },
      },
      matchedKeyword: "uninstall",
    }]),
    "scan results should preserve complete keyword-excluded apps and their matched keyword"
  );
  assert(normalizedResult.stats === validStats, "complete scan stats should pass through unchanged");

  const validLayout = JSON.parse(
    readFileSync(new URL("../domain/fixtures/layout-v2-roundtrip.json", import.meta.url), "utf8")
  );
  validLayout.pages = [[{
      id: "api-manual",
      type: "manualApp",
      name: "API Manual",
      launchTarget: { kind: "shortcut", path: "C:/Apps/API Manual.lnk" },
    }]];
  let loadedLayout = validLayout;
  let autostartStatus = false;

  setLaunchpadApiBridgeForTests({
    invoke: async (command, args) => {
      invocations.push({ args, command });
      if (command === "load_layout") return loadedLayout;
      if (command === "save_layout") return null;
      if (command === "get_app_locale_state") return nativeLocaleState;
      if (command === "apply_app_locale_preference") {
        return { ...nativeLocaleState, preference: args.preference, resolvedLocale: args.preference };
      }
      if (command === "get_launch_context") return { origin: "loginStartup" };
      if (command === "complete_renderer_startup") return null;
      if (command === "begin_main_window_close") {
        return { accepted: true, generation: args.openSequence + 1 };
      }
      if (command === "hide_main_window") return args.generation === 18;
      if (command === "reveal_main_window") return args.openSequence === 17;
      if (command === "set_main_window_mode") return args.mode;
      if (command === "get_autostart_status") return autostartStatus;
      if (command === "set_autostart_enabled") {
        autostartStatus = Boolean(args.enabled);
        return autostartStatus;
      }
    },
  });

  try {
    assert(await openDeveloperConsole(), "the native bridge should report a successful console open");
    assert(invocations.length === 1, "opening the developer console should issue one native command");
    assert(invocations[0].command === "open_developer_console", "the developer console should use the dedicated open command");
    assert(await getAppLocaleState() === nativeLocaleState, "locale bootstrap should preserve the native locale state payload");
    const appliedLocale = await applyAppLocalePreference("zh-CN");
    assert(appliedLocale.resolvedLocale === "zh-CN", "locale apply should return the native applied state");
    assert(invocations[1].command === "get_app_locale_state", "locale bootstrap should use the dedicated native command");
    assert(
      invocations[2].command === "apply_app_locale_preference" && invocations[2].args.preference === "zh-CN",
      "locale apply should pass the preference through the dedicated native command"
    );
    assert(await loadLayout() === validLayout, "layout load should return the validated canonical document");
    await saveLayout(validLayout);
    assert(invocations[3].command === "load_layout", "layout load should use the native layout command");
    assert(invocations[4].command === "save_layout", "layout save should use the native layout command");

    loadedLayout = structuredClone(validLayout);
    loadedLayout.pages[0][0].children = [];
    let invalidLoadError = null;
    try {
      await loadLayout();
    } catch (error) {
      invalidLoadError = error;
    }
    assert(invalidLoadError instanceof TypeError, "layout load should reject legacy persisted fields");

    let invalidSaveError = null;
    try {
      await saveLayout(loadedLayout);
    } catch (error) {
      invalidSaveError = error;
    }
    assert(invalidSaveError instanceof TypeError, "layout save should reject legacy persisted fields before IPC");
    assert((await getLaunchContext()).origin === "loginStartup", "launch context should cross the native bridge");
    await completeRendererStartup();
    assert(invocations.some(({ command }) => command === "complete_renderer_startup"), "renderer startup completion should cross the native bridge");
    const close = await beginMainWindowClose(17);
    assert(close.accepted && close.generation === 18, "begin-close should return the native transition generation");
    assert(await hideMainWindow(close.generation), "hide should return the native generation check result");
    assert(await revealMainWindow(17), "reveal should return whether the native generation was committed");
    assert(await setMainWindowMode("windowed", { fullscreenOverscanEnabled: false }) === "windowed", "window mode should return the applied native mode");
    assert(
      invocations.some(({ command, args }) => command === "hide_main_window" && args.generation === 18),
      "hide should carry the accepted close generation across the bridge"
    );
    assert(!(await getAutostartStatus()), "autostart status should start disabled");
    assert(await setAutostartEnabled(true), "autostart enable should report the applied status");
    assert(await getAutostartStatus(), "autostart status should reflect the enabled state");
    assert(!(await setAutostartEnabled(false)), "autostart disable should report the applied status");
  } finally {
    setLaunchpadApiBridgeForTests(null);
  }
}
