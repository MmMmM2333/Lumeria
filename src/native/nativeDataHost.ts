import { NativeDataTransport } from "./nativeDataTransport.js";
import { NativeTargetCheckCache } from "./nativeTargetCheckCache.js";
import { NATIVE_DATA_PROTOCOL_VERSION as PROTOCOL_VERSION, requireNativeRecord as requireRecord } from "./nativeDataProtocol.js";
import { isAbsolute, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nativeDataExecutableName, nativePlatform, nativeRuntimePaths } from "./runtimePaths.js";
import { createNativeCatalogCache, nativeCatalogCacheKey } from "./nativeCatalogCache.js";
import {
  assertCatalogScanFilters,
  assertCatalogScanRoot,
  assertCatalogScanWarning,
  assertScannedCatalogApp,
  type CatalogScanFilters,
  type CatalogScanRoot,
} from "../domain/applicationCatalog.js";
import { assertLayoutDocument, type LayoutDocument } from "../domain/layoutDocument.js";
import type { AppIconChoice, CachedCustomIconResult, PickedBackgroundImage, ScanAppsResult } from "../platform/launchpadContracts.js";

const SCAN_COUNT_FIELDS = [
  "dirsVisited",
  "entriesSeen",
  "physicalAppsFound",
  "startMenuOverlays",
  "equivalentAppsMerged",
  "unresolvedApps",
  "keywordExcludedApps",
  "excludedApps",
  "appsFound",
] as const;

export type NativeCatalogScanResult = ScanAppsResult;

function validateCachedIcon(value:unknown):CachedCustomIconResult {
  const icon=requireRecord(value,"cached icon");
  if(typeof icon.iconPath!=="string"||!isAbsolute(icon.iconPath)
    ||typeof icon.iconDataUrl!=="string"||!icon.iconDataUrl.startsWith("data:image/png;base64,")){
    throw new TypeError("Native cached icon must contain an absolute path and PNG data");
  }
  return {iconPath:icon.iconPath,iconDataUrl:icon.iconDataUrl};
}

function validateCatalogResult(value: unknown): NativeCatalogScanResult {
  const result = requireRecord(value, "scanApps result");
  if (
    !Array.isArray(result.apps)
    || !Array.isArray(result.excludedApps)
    || !Array.isArray(result.keywordExcludedApps)
    || !Array.isArray(result.warnings)
  ) {
    throw new TypeError("scanApps result must contain catalog arrays");
  }
  const stats = requireRecord(result.stats, "scanApps result.stats");
  for (const field of SCAN_COUNT_FIELDS) {
    if (!Number.isSafeInteger(stats[field]) || Number(stats[field]) < 0) {
      throw new TypeError(`scanApps result.stats.${field} must be a non-negative safe integer`);
    }
  }
  if (typeof stats.limitReached !== "boolean") {
    throw new TypeError("scanApps result.stats.limitReached must be a boolean");
  }
  const apps = result.apps.map((app, index) => assertScannedCatalogApp(app, `scanApps result.apps[${index}]`));
  const excludedApps = result.excludedApps.map((app, index) => (
    assertScannedCatalogApp(app, `scanApps result.excludedApps[${index}]`)
  ));
  const keywordExcludedApps = result.keywordExcludedApps.map((value, index) => {
    const entry = requireRecord(value, `scanApps result.keywordExcludedApps[${index}]`);
    const matchedKeyword = typeof entry.matchedKeyword === "string" ? entry.matchedKeyword.trim() : "";
    if (!matchedKeyword) {
      throw new TypeError(`scanApps result.keywordExcludedApps[${index}].matchedKeyword must be a non-empty string`);
    }
    return {
      app: assertScannedCatalogApp(entry.app, `scanApps result.keywordExcludedApps[${index}].app`),
      matchedKeyword,
    };
  });
  const warnings = result.warnings.map((warning, index) => (
    assertCatalogScanWarning(warning, `scanApps result.warnings[${index}]`)
  ));
  return {
    apps,
    excludedApps,
    keywordExcludedApps,
    warnings,
    stats: stats as NativeCatalogScanResult["stats"],
  };
}

function resolveExecutable(): string {
  const configured = process.env.LAUNCHPAD_NATIVE_DATA_HOST;
  if (configured) {
    if (!isAbsolute(configured)) throw new Error("LAUNCHPAD_NATIVE_DATA_HOST must be an absolute path");
    return configured;
  }
  const moduleDir = (import.meta as ImportMeta & { dir?: string }).dir
    ?? dirname(fileURLToPath(import.meta.url));
  return join(moduleDir, nativeDataExecutableName(nativePlatform(process.platform)));
}

export class NativeDataHost {
  autostartAvailable = false;
  readonly #transport: NativeDataTransport;
  readonly #catalogCache = createNativeCatalogCache(nativeRuntimePaths().data, validateCatalogResult,
    error=>console.warn("Native catalog cache unavailable", error));
  #backgroundScanning=false;
  #disposed=false;
  #catalogRevision=0;
  get catalogRevision():number{return this.#catalogRevision;}
  readonly #targetChecks = new NativeTargetCheckCache((targets, force) => this.#checkLaunchTargets(targets, force));

  constructor(executable = resolveExecutable()) {
    this.#transport = new NativeDataTransport(executable);
  }

  async connect(): Promise<void> {
    const value = requireRecord(await this.#transport.request("hello"), "hello result");
    if (value.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(`Native data host protocol mismatch: ${String(value.protocolVersion)}`);
    }
    if(typeof value.autostartAvailable!=="boolean")throw new TypeError("Native hello must report autostart availability");
    this.autostartAvailable=value.autostartAvailable;
  }

  async loadLayout(): Promise<LayoutDocument | null> {
    const value = await this.#transport.request("loadLayout");
    return value === null ? null : assertLayoutDocument(value);
  }
  async revealLayout():Promise<void>{await this.#transport.request("revealLayout");}
  async backupResetLayout():Promise<string>{
    const result=requireRecord(await this.#transport.request("backupResetLayout"),"backupResetLayout");
    if(typeof result.backupPath!=="string")throw new TypeError("Missing layout backup path");
    return result.backupPath;
  }

  async saveLayout(layout: LayoutDocument): Promise<void> {
    await this.#transport.request("saveLayout", { layout: assertLayoutDocument(layout) });
  }
  async loadIconChoices(targetPath:string):Promise<readonly AppIconChoice[]> {
    const result=await this.#transport.request("loadIconChoices",{targetPath});
    if(!Array.isArray(result))throw new TypeError("Native icon choices must be an array");
    return result.map(value=>{
      const entry=requireRecord(value,"icon choice");
      if(typeof entry.id!=="string"||!entry.id)throw new TypeError("Native icon choice must have an id");
      return {id:entry.id,...validateCachedIcon(entry)};
    });
  }
  async cacheCustomIcon(dataUrl:string):Promise<CachedCustomIconResult> {
    return validateCachedIcon(await this.#transport.request("cacheCustomIcon",{dataUrl}));
  }
  async background(request:{path:string}|{rect:readonly [number,number,number,number]}):Promise<PickedBackgroundImage|null>{
    const value=await this.#transport.request("path" in request?"cacheBackground":"wallpaper",request);
    if(value===null)return null;
    const result=requireRecord(value,"background result");
    if(typeof result.name!=="string"||typeof result.imagePath!=="string"||!isAbsolute(result.imagePath))throw new TypeError("Invalid background result");
    return {name:result.name,imagePath:result.imagePath};
  }
  async autostart(enabled?:boolean):Promise<boolean>{
    const value=await this.#transport.request("autostart",enabled===undefined?{}:{enabled});
    if(typeof value!=="boolean")throw new TypeError("Native autostart must return a boolean");
    return value;
  }

  async scanApps(
    roots: readonly CatalogScanRoot[],
    filters: CatalogScanFilters,
  ): Promise<NativeCatalogScanResult> {
    roots.forEach((root, index) => assertCatalogScanRoot(root, `scanApps roots[${index}]`));
    assertCatalogScanFilters(filters);
    this.#catalogRevision++;
    this.#targetChecks.clear();
    try {
      const result=validateCatalogResult(await this.#transport.request("scanApps", { roots, filters }));
      await this.#catalogCache.save(nativeCatalogCacheKey(roots,filters),result);
      return result;
    }
    finally { this.#targetChecks.clear(); }
  }

  async cachedCatalog(roots:readonly CatalogScanRoot[],filters:CatalogScanFilters):Promise<NativeCatalogScanResult|null>{
    roots.forEach((root,index)=>assertCatalogScanRoot(root,`cached catalog roots[${index}]`));assertCatalogScanFilters(filters);
    const result=await this.#catalogCache.load(nativeCatalogCacheKey(roots,filters));
    if(result)await this.adoptCatalog(result);
    return result;
  }

  async refreshCatalog(roots:readonly CatalogScanRoot[],filters:CatalogScanFilters):Promise<NativeCatalogScanResult>{
    roots.forEach((root,index)=>assertCatalogScanRoot(root,`background catalog roots[${index}]`));assertCatalogScanFilters(filters);
    if(this.#backgroundScanning)throw new Error("Background catalog scan is already running");
    this.#backgroundScanning=true;
    const revision=this.#catalogRevision;
    try{
      await this.#transport.request("startCatalogScan",{roots,filters});
      while(!this.#disposed){
        const value=await this.#transport.request("pollCatalogScan");
        if(value!==null){
          const result=validateCatalogResult(value);
          if(revision===this.#catalogRevision&&!this.#disposed)await this.#catalogCache.save(nativeCatalogCacheKey(roots,filters),result);
          return result;
        }
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error("Native data host disposed during background scan");
    }finally{this.#backgroundScanning=false;}
  }

  async adoptCatalog(result:NativeCatalogScanResult):Promise<void>{
    await this.#transport.request("adoptCatalog",{apps:result.apps});this.#targetChecks.clear();
  }

  async launchApp(appId: string, elevated = false): Promise<void> {
    if (!appId.trim()) throw new TypeError("launchApp appId must be a non-empty string");
    await this.#transport.request("launchApp", { appId, elevated });
  }
  async revealPath(path: string, folder = false): Promise<void> {
    if (!isAbsolute(path)) throw new TypeError("File location must be absolute");
    await this.#transport.request("revealPath", {path, folder});
  }
  retainLaunchTargets(targets: readonly import("../platform/launchpadContracts.js").LaunchTargetCheckRequest[]): void {
    this.#targetChecks.retain(targets);
  }

  checkLaunchTargets(targets:readonly import("../platform/launchpadContracts.js").LaunchTargetCheckRequest[], force=false):Promise<readonly import("../platform/launchpadContracts.js").LaunchTargetCheckResult[]>{
    return this.#targetChecks.check(targets, force);
  }

  async #checkLaunchTargets(targets:readonly import("../platform/launchpadContracts.js").LaunchTargetCheckRequest[], force:boolean):Promise<readonly import("../platform/launchpadContracts.js").LaunchTargetCheckResult[]>{
    const value=await this.#transport.request("checkLaunchTargets",{targets,force});
    if(!Array.isArray(value))throw new TypeError("Launch target checks must return an array");
    return value.map(item=>{
      const entry=requireRecord(item,"launch target check");
      if(typeof entry.id!=="string"||!["ok","missing","unknown"].includes(String(entry.status)))throw new TypeError("Invalid launch target check");
      if (typeof entry.canElevate !== "boolean" || typeof entry.requiresAdmin !== "boolean" || typeof entry.adminRequirementKnown !== "boolean" || typeof entry.locationIsFolder !== "boolean"
        || (entry.fileLocation !== null && typeof entry.fileLocation !== "string") || (entry.shortcutLocation !== null && typeof entry.shortcutLocation !== "string")) throw new TypeError("Invalid launch target capabilities");
      return {id:entry.id,status:entry.status as "ok"|"missing"|"unknown",canElevate:entry.canElevate,requiresAdmin:entry.requiresAdmin,adminRequirementKnown:entry.adminRequirementKnown,
        locationIsFolder:entry.locationIsFolder,fileLocation:entry.fileLocation as string|null,shortcutLocation:entry.shortcutLocation as string|null};
    });
  }

  async dispose(): Promise<void> {
    this.#disposed=true;this.#targetChecks.clear();await this.#transport.dispose();
  }
}
