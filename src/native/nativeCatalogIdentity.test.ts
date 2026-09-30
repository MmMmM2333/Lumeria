import assert from "node:assert/strict";
import { nativeCatalogContentKey, nativeCatalogEnumerationKey, relabelNativeCatalog } from "./nativeCatalogIdentity.js";
import type { ScanAppsResult } from "../platform/launchpadContracts.js";
const result: ScanAppsResult = { apps: [{ id: "app", type: "app", name: "Application", launchTarget: { kind: "shortcut", path: "C:/Root/app.lnk" },
  iconPath: "C:/cache/icon-content-one.png", identityStatus: "exact", trackingKey: "launch:app", sources: [{ key: "source", type: "customDirectory", state: "primary",
    rootId: "root", rootLabel: "Old", relativePath: "app.lnk", absolutePath: "C:/Root/app.lnk" }] }],
  excludedApps: [], keywordExcludedApps: [], warnings: [],
  stats: { dirsVisited: 1, entriesSeen: 1, physicalAppsFound: 1, startMenuOverlays: 0, equivalentAppsMerged: 0, unresolvedApps: 0,
    keywordExcludedApps: 0, excludedApps: 0, appsFound: 1, limitReached: false, metadataCacheHits: 0, metadataReads: 1 },
};
assert.equal(nativeCatalogContentKey(result), nativeCatalogContentKey({ ...result, stats: { ...result.stats, metadataCacheHits: 5, metadataReads: 0 } }), "warm-scan statistics do not require layout reconciliation");
assert.notEqual(nativeCatalogContentKey(result), nativeCatalogContentKey({ ...result, apps: [{ ...result.apps[0]!, iconPath: "C:/cache/icon-content-two.png" }] }), "updated icon identity is a real catalog change");
assert.notEqual(nativeCatalogContentKey(result), nativeCatalogContentKey({ ...result, apps: [{ ...result.apps[0]!, launchArgs: "--new" }] }));
const request = { roots: [{ id: "root", type: "customDirectory" as const, label: "Old", path: "C:/Root", enabled: true }], filters: {} };
const renamed = { ...request, roots: [{ ...request.roots[0]!, label: "New" }] };
assert.equal(nativeCatalogEnumerationKey(request), nativeCatalogEnumerationKey(renamed));
assert.notEqual(nativeCatalogEnumerationKey(request), nativeCatalogEnumerationKey({ ...request, filters: { keywordBlacklist: ["uninstall"] } }));
const relabeled = relabelNativeCatalog(result, renamed);
assert.equal(relabeled.apps[0]?.sources[0]?.rootLabel, "New"); assert.equal(result.apps[0]?.sources[0]?.rootLabel, "Old");
assert.notEqual(nativeCatalogContentKey(result), nativeCatalogContentKey(relabeled), "provenance label changes update presentation");
console.log("Catalog identity: statistics exclusion, resource/launch changes and immutable relabeling passed");
