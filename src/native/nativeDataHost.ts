import { spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { isAbsolute, dirname, join } from "node:path";
import { createInterface, type Interface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  assertCatalogScanFilters,
  assertCatalogScanRoot,
  assertCatalogScanWarning,
  assertScannedCatalogApp,
  type CatalogScanFilters,
  type CatalogScanRoot,
  type CatalogScanWarning,
  type ScannedCatalogApp,
} from "../domain/applicationCatalog.js";
import { assertLayoutDocument, type LayoutDocument } from "../domain/layoutDocument.js";

const PROTOCOL_VERSION = 1;
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

type UnknownRecord = Record<string, unknown>;
type NativeDataProcess = ChildProcessByStdio<Writable, Readable, null>;

export type NativeCatalogScanResult = Readonly<{
  apps: readonly ScannedCatalogApp[];
  excludedApps: readonly ScannedCatalogApp[];
  keywordExcludedApps: readonly Readonly<{
    app: ScannedCatalogApp;
    matchedKeyword: string;
  }>[];
  warnings: readonly CatalogScanWarning[];
  stats: Readonly<Record<(typeof SCAN_COUNT_FIELDS)[number], number> & {
    limitReached: boolean;
  }>;
}>;

export class NativeLaunchError extends Error {
  readonly detail: string;
  readonly kind: string;

  constructor(kind: string, detail: string) {
    super(detail);
    this.name = "NativeLaunchError";
    this.kind = kind;
    this.detail = detail;
  }
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as UnknownRecord;
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
  return join(moduleDir, "lumeria-native-data.exe");
}

export class NativeDataHost {
  readonly #process: NativeDataProcess;
  readonly #lines: AsyncIterator<string>;
  readonly #lineReader: Interface;
  #closed = false;
  #nextId = 1;
  #processError: Error | null = null;
  #tail: Promise<void> = Promise.resolve();

  constructor(executable = resolveExecutable()) {
    this.#process = spawn(executable, [], {
      env: process.env,
      stdio: ["pipe", "pipe", "inherit"],
      windowsHide: true,
    });
    this.#process.on("error", (error) => {
      this.#processError = error;
    });
    this.#lineReader = createInterface({ input: this.#process.stdout, crlfDelay: Infinity });
    this.#lines = this.#lineReader[Symbol.asyncIterator]();
  }

  async connect(): Promise<void> {
    const value = requireRecord(await this.#request("hello"), "hello result");
    if (value.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(`Native data host protocol mismatch: ${String(value.protocolVersion)}`);
    }
  }

  async loadLayout(): Promise<LayoutDocument | null> {
    const value = await this.#request("loadLayout");
    return value === null ? null : assertLayoutDocument(value);
  }

  async saveLayout(layout: LayoutDocument): Promise<void> {
    await this.#request("saveLayout", { layout: assertLayoutDocument(layout) });
  }

  async scanApps(
    roots: readonly CatalogScanRoot[],
    filters: CatalogScanFilters,
  ): Promise<NativeCatalogScanResult> {
    roots.forEach((root, index) => assertCatalogScanRoot(root, `scanApps roots[${index}]`));
    assertCatalogScanFilters(filters);
    return validateCatalogResult(await this.#request("scanApps", { roots, filters }));
  }

  async launchApp(appId: string): Promise<void> {
    if (!appId.trim()) throw new TypeError("launchApp appId must be a non-empty string");
    await this.#request("launchApp", { appId });
  }

  async dispose(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#tail;
    this.#lineReader.close();
    this.#process.stdin.end();
    if (this.#process.exitCode === null && this.#processError === null) await once(this.#process, "close");
  }

  #request(operation: string, fields: UnknownRecord = {}): Promise<unknown> {
    if (this.#closed) return Promise.reject(new Error("Native data host has been disposed"));
    const id = this.#nextId++;
    // ponytail: requests stay serial while the Rust host is serial; add id-based dispatch only if parallel host work is introduced.
    const task = this.#tail.then(async () => {
      await new Promise<void>((resolve, reject) => {
        this.#process.stdin.write(
          `${JSON.stringify({ version: PROTOCOL_VERSION, id, operation, ...fields })}\n`,
          (error) => error ? reject(error) : resolve(),
        );
      });
      const line = await this.#lines.next();
      if (line.done) {
        throw this.#processError
          ?? new Error(`Native data host exited before responding to ${operation}`);
      }
      const response = requireRecord(JSON.parse(line.value) as unknown, `${operation} response`);
      if (response.version !== PROTOCOL_VERSION || response.id !== id || typeof response.ok !== "boolean") {
        throw new Error(`Native data host returned an invalid ${operation} envelope`);
      }
      if (!response.ok) {
        if (operation === "launchApp" && response.error && typeof response.error === "object") {
          const error = requireRecord(response.error, "launchApp response.error");
          if (typeof error.kind === "string" && typeof error.detail === "string") {
            throw new NativeLaunchError(error.kind, error.detail);
          }
        }
        throw new Error(typeof response.error === "string" ? response.error : `${operation} failed`);
      }
      if (!("value" in response)) throw new Error(`Native data host ${operation} response is missing value`);
      return response.value;
    });
    this.#tail = task.then(() => undefined, () => undefined);
    return task;
  }
}
