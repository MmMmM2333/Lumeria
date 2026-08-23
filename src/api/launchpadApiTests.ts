import { readFileSync } from "node:fs";
import {
  applyAppLocalePreference,
  beginMainWindowClose,
  checkLaunchTargets,
  completeRendererStartup,
  getAutostartStatus,
  getAppLocaleState,
  getLaunchContext,
  getLiveDesktopBackgroundSupport,
  getLiveDesktopRuntimeStatus,
  hideMainWindow,
  loadLayout,
  normalizeScanAppsResult,
  openDeveloperConsole,
  pickLaunchFile,
  revealMainWindow,
  saveLayout,
  setAutostartEnabled,
  setLaunchpadApiBridgeForTests,
  setMainWindowMode,
} from "./launchpadApi.js";

export async function runLaunchpadApiTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad API test failed] ${message}`);
  };
  type Invocation = Readonly<{
    command: string;
    args?: Readonly<Record<string, unknown>>;
  }>;
  const invocations: Invocation[] = [];
  const invocationAt = (index: number): Invocation => {
    const invocation = invocations[index];
    if (!invocation) throw new Error(`[Launchpad API test failed] missing invocation ${index}`);
    return invocation;
  };
  const nativeLocaleState = {
    preference: "system",
    resolvedLocale: "en-US",
    match: "language",
    issue: null,
  };
  let malformedStatsError: unknown = null;
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
  const validCatalogApp = {
    id: "catalog-app",
    type: "app",
    name: "Catalog App",
    emoji: "C",
    launchTarget: { kind: "executable", path: "C:/Apps/catalog.exe" },
    launchArgs: "--catalog",
    trackingKey: "path:c:/apps/catalog.exe",
    identityStatus: "exact",
    sources: [{
      key: "custom:catalog.exe",
      type: "customDirectory",
      state: "primary",
      rootId: "root-custom",
      rootLabel: "Custom",
      relativePath: "catalog.exe",
      absolutePath: "C:/Apps/catalog.exe",
    }],
  };
  const { keywordExcludedApps: _keywordExcludedApps, ...statsWithoutKeywordExclusions } = validStats;
  let missingKeywordExclusionsError: unknown = null;
  try {
    normalizeScanAppsResult({ apps: [], excludedApps: [], keywordExcludedApps: [], warnings: [], stats: statsWithoutKeywordExclusions });
  } catch (error) {
    missingKeywordExclusionsError = error;
  }
  assert(
    missingKeywordExclusionsError instanceof TypeError,
    "scan results should require keyword exclusion counts"
  );
  let missingKeywordExcludedAppsError: unknown = null;
  try {
    normalizeScanAppsResult({ apps: [], excludedApps: [], warnings: [], stats: validStats });
  } catch (error) {
    missingKeywordExcludedAppsError = error;
  }
  assert(
    missingKeywordExcludedAppsError instanceof TypeError,
    "scan results should require complete keyword-excluded apps"
  );
  let missingExcludedAppsError: unknown = null;
  try {
    normalizeScanAppsResult({ apps: [], keywordExcludedApps: [], warnings: [], stats: validStats });
  } catch (error) {
    missingExcludedAppsError = error;
  }
  assert(missingExcludedAppsError instanceof TypeError, "scan results should require runtime excluded-app presentation data");
  const excludedApps = [{ ...validCatalogApp, id: "catalog-blocked", name: "Blocked" }];
  const normalizedResult = normalizeScanAppsResult({
    apps: [],
    excludedApps,
    keywordExcludedApps: [{
      app: {
        ...validCatalogApp,
        id: "catalog-uninstall",
        name: "Uninstall Example",
        iconPath: "C:/Icons/uninstall.png",
        launchTarget: { kind: "shortcut", path: "C:/Users/Example/Uninstall Example.lnk" },
      },
      matchedKeyword: "uninstall",
      rootId: "root-system",
      rootLabel: "System Start Menu",
    }],
    warnings: [{ rootId: "root-custom", rootLabel: "Custom", kind: "readFailed", message: "denied" }],
    stats: validStats,
  });
  assert(
    normalizedResult.excludedApps === excludedApps,
    "complete scan results should preserve runtime excluded-app presentation data"
  );
  assert(
    JSON.stringify(normalizedResult.keywordExcludedApps) === JSON.stringify([{
      app: {
        ...validCatalogApp,
        id: "catalog-uninstall",
        name: "Uninstall Example",
        iconPath: "C:/Icons/uninstall.png",
        launchTarget: { kind: "shortcut", path: "C:/Users/Example/Uninstall Example.lnk" },
      },
      matchedKeyword: "uninstall",
    }]),
    "scan results should preserve complete keyword-excluded apps and their matched keyword"
  );
  assert(normalizedResult.stats === validStats, "complete scan stats should pass through unchanged");

  let malformedMatchedKeywordError: unknown = null;
  try {
    normalizeScanAppsResult({
      apps: [],
      excludedApps: [],
      keywordExcludedApps: [{ app: validCatalogApp, matchedKeyword: 42 }],
      warnings: [],
      stats: validStats,
    });
  } catch (error) {
    malformedMatchedKeywordError = error;
  }
  assert(
    malformedMatchedKeywordError instanceof TypeError,
    "scan results should reject non-string matched keywords instead of coercing bridge payloads",
  );

  for (const [label, payload] of [
    ["launch target", { ...validCatalogApp, launchTarget: { kind: "executable" } }],
    ["source", { ...validCatalogApp, sources: [{ ...validCatalogApp.sources[0], type: "registry" }] }],
  ] as const) {
    let malformedCatalogError: unknown = null;
    try {
      normalizeScanAppsResult({
        apps: [payload],
        excludedApps: [],
        keywordExcludedApps: [],
        warnings: [],
        stats: validStats,
      });
    } catch (error) {
      malformedCatalogError = error;
    }
    assert(malformedCatalogError instanceof TypeError, `scan results should reject malformed catalog ${label} fields`);
  }
  let malformedWarningError: unknown = null;
  try {
    normalizeScanAppsResult({
      apps: [],
      excludedApps: [],
      keywordExcludedApps: [],
      warnings: [{ rootId: "root", rootLabel: "Root", kind: "readFailed" }],
      stats: validStats,
    });
  } catch (error) {
    malformedWarningError = error;
  }
  assert(malformedWarningError instanceof TypeError, "scan results should reject incomplete warning payloads");

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
      invocations.push(args ? { args, command } : { command });
      if (command === "load_layout") return loadedLayout;
      if (command === "save_layout") return null;
      if (command === "get_app_locale_state") return nativeLocaleState;
      if (command === "apply_app_locale_preference") {
        const preference = args?.preference;
        if (preference !== "zh-CN" && preference !== "en-US") throw new Error("invalid test locale preference");
        return { ...nativeLocaleState, preference, resolvedLocale: preference };
      }
      if (command === "get_launch_context") return { origin: "loginStartup" };
      if (command === "complete_renderer_startup") return null;
      if (command === "pick_launch_file") {
        return {
          name: "Catalog App",
          path: "C:/Apps/catalog.exe",
          launchTarget: { kind: "executable", path: "C:/Apps/catalog.exe" },
          launchArgs: "--catalog",
          iconPath: null,
          iconDataUrl: null,
        };
      }
      if (command === "begin_main_window_close") {
        const openSequence = args?.openSequence;
        if (typeof openSequence !== "number") throw new Error("missing test open sequence");
        return { accepted: true, generation: openSequence + 1 };
      }
      if (command === "hide_main_window") return args?.generation === 18;
      if (command === "reveal_main_window") return args?.openSequence === 17;
      if (command === "set_main_window_mode") return args?.mode;
      if (command === "get_autostart_status") return autostartStatus;
      if (command === "set_autostart_enabled") {
        autostartStatus = Boolean(args?.enabled);
        return autostartStatus;
      }
    },
  });

  try {
    assert(await openDeveloperConsole(), "the native bridge should report a successful console open");
    assert(invocations.length === 1, "opening the developer console should issue one native command");
    assert(invocationAt(0).command === "open_developer_console", "the developer console should use the dedicated open command");
    assert(await getAppLocaleState() === nativeLocaleState, "locale bootstrap should preserve the native locale state payload");
    const appliedLocale = await applyAppLocalePreference("zh-CN");
    assert(appliedLocale !== null && appliedLocale.resolvedLocale === "zh-CN", "locale apply should return the native applied state");
    assert(invocationAt(1).command === "get_app_locale_state", "locale bootstrap should use the dedicated native command");
    assert(
      invocationAt(2).command === "apply_app_locale_preference" && invocationAt(2).args?.preference === "zh-CN",
      "locale apply should pass the preference through the dedicated native command"
    );
    assert(await loadLayout() === validLayout, "layout load should return the validated canonical document");
    await saveLayout(validLayout);
    assert(invocationAt(3).command === "load_layout", "layout load should use the native layout command");
    assert(invocationAt(4).command === "save_layout", "layout save should use the native layout command");

    loadedLayout = structuredClone(validLayout);
    loadedLayout.pages[0][0].children = [];
    let invalidLoadError: unknown = null;
    try {
      await loadLayout();
    } catch (error) {
      invalidLoadError = error;
    }
    assert(invalidLoadError instanceof TypeError, "layout load should reject legacy persisted fields");

    let invalidSaveError: unknown = null;
    try {
      await saveLayout(loadedLayout);
    } catch (error) {
      invalidSaveError = error;
    }
    assert(invalidSaveError instanceof TypeError, "layout save should reject legacy persisted fields before IPC");
    assert((await getLaunchContext()).origin === "loginStartup", "launch context should cross the native bridge");
    await completeRendererStartup();
    assert(invocations.some(({ command }) => command === "complete_renderer_startup"), "renderer startup completion should cross the native bridge");
    const pickedLaunchFile = await pickLaunchFile();
    assert(pickedLaunchFile?.launchTarget.kind === "executable", "picked launch files should expose a validated launch target");
    const close = await beginMainWindowClose(17);
    assert(close !== null && close.accepted && close.generation === 18, "begin-close should return the native transition generation");
    assert(await hideMainWindow(close.generation), "hide should return the native generation check result");
    assert(await revealMainWindow(17), "reveal should return whether the native generation was committed");
    assert(await setMainWindowMode("windowed", { fullscreenOverscanEnabled: false }) === "windowed", "window mode should return the applied native mode");
    assert(
      invocations.some(({ command, args }) => command === "hide_main_window" && args?.generation === 18),
      "hide should carry the accepted close generation across the bridge"
    );
    assert(!(await getAutostartStatus()), "autostart status should start disabled");
    assert(await setAutostartEnabled(true), "autostart enable should report the applied status");
    assert(await getAutostartStatus(), "autostart status should reflect the enabled state");
    assert(!(await setAutostartEnabled(false)), "autostart disable should report the applied status");

    setLaunchpadApiBridgeForTests({
      invoke: async (command) => command === "get_launch_context"
        ? { origin: "unexpected" }
        : null,
    });
    let invalidLaunchContextError: unknown = null;
    try {
      await getLaunchContext();
    } catch (error) {
      invalidLaunchContextError = error;
    }
    assert(
      invalidLaunchContextError instanceof TypeError,
      "launch context should reject unknown native origins at the IPC boundary",
    );

    setLaunchpadApiBridgeForTests({
      invoke: async (command) => command === "get_app_locale_state"
        ? { preference: "system", resolvedLocale: "fr-FR", match: "exact", issue: null }
        : null,
    });
    let invalidLocaleStateError: unknown = null;
    try {
      await getAppLocaleState();
    } catch (error) {
      invalidLocaleStateError = error;
    }
    assert(
      invalidLocaleStateError instanceof TypeError,
      "locale state should reject unbundled native locales at the IPC boundary",
    );

    for (const code of ["preferenceLoadFailed", "systemLocaleUnavailable"] as const) {
      setLaunchpadApiBridgeForTests({
        invoke: async (command) => command === "get_app_locale_state"
          ? { ...nativeLocaleState, issue: { code, value: code === "preferenceLoadFailed" ? "layout" : "windows" } }
          : null,
      });
      const degradedLocale = await getAppLocaleState();
      assert(degradedLocale?.issue?.code === code, `locale API should preserve the native ${code} degraded state`);
    }

    setLaunchpadApiBridgeForTests({
      invoke: async (command) => command === "pick_launch_file"
        ? {
            name: "Broken",
            path: "C:/Apps/broken.exe",
            launchTarget: { kind: "executable" },
            launchArgs: "",
            iconPath: null,
            iconDataUrl: null,
          }
        : null,
    });
    let invalidPickedTargetError: unknown = null;
    try {
      await pickLaunchFile();
    } catch (error) {
      invalidPickedTargetError = error;
    }
    assert(invalidPickedTargetError instanceof TypeError, "picked launch files should reject malformed launch targets");

    setLaunchpadApiBridgeForTests({
      invoke: async (command) => command === "check_launch_targets"
        ? [{ id: "broken", status: "gone" }]
        : null,
    });
    let invalidLaunchTargetStatusError: unknown = null;
    try {
      await checkLaunchTargets([]);
    } catch (error) {
      invalidLaunchTargetStatusError = error;
    }
    assert(invalidLaunchTargetStatusError instanceof TypeError, "launch target checks should reject unknown native status values");

    setLaunchpadApiBridgeForTests({
      invoke: async (command) => command === "get_live_desktop_background_support"
        ? { platform: "windows", supportsLiveDesktopBackground: true, reason: "available" }
        : null,
    });
    let invalidLiveDesktopSupportError: unknown = null;
    try {
      await getLiveDesktopBackgroundSupport();
    } catch (error) {
      invalidLiveDesktopSupportError = error;
    }
    assert(
      invalidLiveDesktopSupportError instanceof TypeError,
      "live desktop support should require both native capability flags",
    );

    setLaunchpadApiBridgeForTests({
      invoke: async (command) => command === "get_live_desktop_background_support"
        ? {
            platform: "windows",
            supportsLiveDesktopBackground: true,
            supportsLiveDesktopBackgroundEffects: true,
            reason: "available",
            detail: "ready",
            prerequisiteProbe: {},
            rendererProbe: {},
          }
        : null,
    });
    let invalidLiveDesktopProbeError: unknown = null;
    try {
      await getLiveDesktopBackgroundSupport();
    } catch (error) {
      invalidLiveDesktopProbeError = error;
    }
    assert(invalidLiveDesktopProbeError instanceof TypeError, "live desktop support should deeply validate native probes");

    setLaunchpadApiBridgeForTests({
      invoke: async (command) => command === "get_live_desktop_runtime_status"
        ? { phase: "running", active: true, generation: 1, reason: "running", detail: "ready" }
        : null,
    });
    let invalidLiveDesktopDiagnosticsError: unknown = null;
    try {
      await getLiveDesktopRuntimeStatus();
    } catch (error) {
      invalidLiveDesktopDiagnosticsError = error;
    }
    assert(invalidLiveDesktopDiagnosticsError instanceof TypeError, "live desktop status should require native diagnostics payloads");
  } finally {
    setLaunchpadApiBridgeForTests(null);
  }
}
