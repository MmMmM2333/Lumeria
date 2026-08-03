import {
  applyAppLocalePreference,
  getAppLocaleState,
  normalizeScanAppsResult,
  openDeveloperConsole,
  setLaunchpadApiBridgeForTests,
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
    normalizeScanAppsResult({ apps: [], excludedApps: [], warnings: [], stats: {} });
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
    excludedApps: 0,
    appsFound: 0,
    limitReached: false,
  };
  let missingExcludedAppsError = null;
  try {
    normalizeScanAppsResult({ apps: [], warnings: [], stats: validStats });
  } catch (error) {
    missingExcludedAppsError = error;
  }
  assert(missingExcludedAppsError instanceof TypeError, "scan results should require runtime excluded-app presentation data");
  const excludedApps = [{ id: "catalog-blocked", name: "Blocked" }];
  const normalizedResult = normalizeScanAppsResult({ apps: [], excludedApps, warnings: [], stats: validStats });
  assert(
    normalizedResult.excludedApps === excludedApps,
    "complete scan results should preserve runtime excluded-app presentation data"
  );
  assert(normalizedResult.stats === validStats, "complete scan stats should pass through unchanged");

  setLaunchpadApiBridgeForTests({
    invoke: async (command, args) => {
      invocations.push({ args, command });
      if (command === "get_app_locale_state") return nativeLocaleState;
      if (command === "apply_app_locale_preference") {
        return { ...nativeLocaleState, preference: args.preference, resolvedLocale: args.preference };
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
  } finally {
    setLaunchpadApiBridgeForTests(null);
  }
}
