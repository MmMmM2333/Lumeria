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
