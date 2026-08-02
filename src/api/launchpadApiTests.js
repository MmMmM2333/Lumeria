import {
  normalizeScanAppsResult,
  openDeveloperConsole,
  setLaunchpadApiBridgeForTests,
} from "./launchpadApi.js";

export async function runLaunchpadApiTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad API test failed] ${message}`);
  };
  const invocations = [];
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
    },
  });

  try {
    assert(await openDeveloperConsole(), "the native bridge should report a successful console open");
    assert(invocations.length === 1, "opening the developer console should issue one native command");
    assert(invocations[0].command === "open_developer_console", "the developer console should use the dedicated open command");
  } finally {
    setLaunchpadApiBridgeForTests(null);
  }
}
