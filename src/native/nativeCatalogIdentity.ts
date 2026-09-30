import { createHash } from "node:crypto";
import type { CatalogScanFilters, CatalogScanRoot } from "../domain/applicationCatalog.js";
import type { ScanAppsResult } from "../platform/launchpadContracts.js";
import { nativeCatalogCacheKey } from "./nativeCatalogCache.js";

export type NativeCatalogRequest = { roots: readonly CatalogScanRoot[]; filters: CatalogScanFilters };

/** Labels affect provenance display, but do not require filesystem enumeration. */
export function nativeCatalogEnumerationKey(request: NativeCatalogRequest): string {
  return nativeCatalogCacheKey(request.roots.map(root => ({ ...root, label: "" })), request.filters);
}

/** Scan statistics are observations, not changes to catalog behavior. */
export function nativeCatalogContentKey(result: ScanAppsResult): string {
  return createHash("sha256").update(JSON.stringify([result.apps, result.excludedApps,
    result.keywordExcludedApps, result.warnings, result.stats.limitReached])).digest("hex");
}

export function relabelNativeCatalog(result: ScanAppsResult, request: NativeCatalogRequest): ScanAppsResult {
  const labels = new Map(request.roots.map(root => [root.id, root.label]));
  const relabel = (app: ScanAppsResult["apps"][number]) => ({ ...app,
    sources: app.sources.map(source => ({ ...source, rootLabel: labels.get(source.rootId) ?? source.rootLabel })),
  });
  return { ...result, apps: result.apps.map(relabel), excludedApps: result.excludedApps.map(relabel),
    keywordExcludedApps: result.keywordExcludedApps.map(entry => ({ ...entry, app: relabel(entry.app) })),
    warnings: result.warnings.map(warning => ({ ...warning, rootLabel: labels.get(warning.rootId) ?? warning.rootLabel })),
  };
}
