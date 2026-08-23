import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeTypeScriptMigration,
  collectRetiredReplacementSnapshots,
  collectSourceSnapshots,
  type TypeScriptMigrationManifest,
} from "./checkTypeScriptMigration.js";

type FixtureFiles = Readonly<Record<string, string>>;

function makeManifest(overrides: Partial<TypeScriptMigrationManifest> = {}): TypeScriptMigrationManifest {
  return {
    allowedTsToJsEdges: [],
    baselineCommit: "fixture-baseline",
    callerBaselines: {},
    directEntries: [],
    exportBaselines: {},
    legacyClosure: [],
    legacyClosureRoots: [],
    retiredSources: [],
    scanRoots: ["src"],
    strictConfigs: [],
    strictRoots: [],
    testRunners: [],
    zeroDebt: false,
    ...overrides,
  };
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "export { value } from './legacy.js';\n",
      "src/legacy.js": "export const value = 1;\n",
    },
    makeManifest({ legacyClosureRoots: ["src/entry.ts"] }),
    ["src/legacy.js"],
  );
  assert(codes.includes("unexpected-legacy-closure-source"), "the transitive legacy closure must be frozen as exact paths");
}

{
  const codes = violationCodes(
    { "src/entry.ts": "export const value = 1;\n" },
    makeManifest({
      legacyClosure: ["src/legacy.js"],
      legacyClosureRoots: ["src/entry.ts"],
    }),
  );
  assert(codes.includes("stale-legacy-closure-source"), "retired paths must be removed from the transitive legacy closure baseline");
}

{
  const codes = violationCodes(
    { "src/public.ts": "export type PublicType = string;\nexport const publicValue = 1;\n" },
    makeManifest({
      exportBaselines: {
        "src/public.ts": { types: [], values: ["publicValue"] },
      },
    }),
  );
  assert(codes.includes("export-baseline-mismatch"), "core value and type exports must match the frozen baseline");
}

{
  const codes = violationCodes(
    {
      "src/caller.ts": "import { publicValue } from './public.js'; void publicValue;\n",
      "src/public.ts": "export const publicValue = 1;\n",
    },
    makeManifest({ callerBaselines: { "src/public.ts": [] } }),
  );
  assert(codes.includes("caller-baseline-mismatch"), "core module callers must match the frozen baseline");
}

function withFixture(
  files: FixtureFiles,
  run: (projectRoot: string) => void,
): void {
  const projectRoot = mkdtempSync(join(tmpdir(), "lumeria-ts-migration-"));
  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(projectRoot, relativePath);
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, source, "utf8");
    }
    run(projectRoot);
  } finally {
    rmSync(projectRoot, { force: true, recursive: true });
  }
}

function violationCodes(
  files: FixtureFiles,
  manifest: TypeScriptMigrationManifest,
  baselineLegacyPaths: readonly string[] = [],
): string[] {
  let codes: string[] = [];
  withFixture(files, (projectRoot) => {
    codes = analyzeTypeScriptMigration({
      baselineLegacyPaths,
      manifest,
      projectRoot,
    }).violations.map(({ code }) => code);
  });
  return codes;
}

{
  const codes = violationCodes(
    {
      "src/value.js": "export const value = 1;\n",
      "src/value.ts": "export const value = 1;\n",
    },
    makeManifest(),
    ["src/value.js"],
  );
  assert(codes.includes("duplicate-source"), "same-stem JS and TS implementations must fail the migration policy");
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "import { value } from './value.js'; export { value };\n",
      "src/value.ts": "export const value = 1;\n",
    },
    makeManifest({ strictRoots: ["src/entry.ts"] }),
  );
  assert.deepEqual(codes, [], "a .js ESM specifier resolving to the sole .ts source must remain valid");
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "export { value } from './middle.js';\n",
      "src/legacy.js": "export const value = 1;\n",
      "src/middle.ts": "export { value } from './legacy.js';\n",
    },
    makeManifest({ strictRoots: ["src/entry.ts"] }),
    ["src/legacy.js"],
  );
  assert(codes.includes("unexpected-ts-js-edge"), "new direct TS to physical JS edges must fail");
  assert(codes.includes("strict-root-physical-js"), "strict roots must reject transitive physical JS dependencies");
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "import type { Legacy } from './legacy.js'; export type Current = Legacy;\n",
      "src/legacy.js": "/** @typedef {{ value: number }} Legacy */ export const marker = 1;\n",
    },
    makeManifest({ strictRoots: ["src/entry.ts"] }),
    ["src/legacy.js"],
  );
  assert(codes.includes("strict-root-physical-js"), "type-only imports must participate in strict physical closure checks");
}

{
  const codes = violationCodes(
    {
      "outside.js": "export const value = 1;\n",
      "src/entry.ts": "export { value } from '../outside.js';\n",
    },
    makeManifest({ strictRoots: ["src/entry.ts"] }),
    ["outside.js"],
  );
  assert(codes.includes("untracked-local-import"), "local imports outside declared scan roots must fail explicitly");
}

{
  const codes = violationCodes(
    {},
    makeManifest({ scanRoots: ["missing"] }),
  );
  assert(codes.includes("missing-scan-root"), "missing scan roots must not silently shrink migration coverage");
}

{
  const codes = violationCodes(
    { "src/newLegacy.js": "export const value = 1;\n" },
    makeManifest(),
  );
  assert(codes.includes("new-legacy-source"), "new legacy source paths after the baseline must fail");
}

{
  const codes = violationCodes(
    { "src/legacy.js": "export const value = 1;\n" },
    makeManifest({ zeroDebt: true }),
    ["src/legacy.js"],
  );
  assert(codes.includes("zero-debt-legacy-source"), "final zero-debt mode must reject baseline JavaScript that still exists");
  assert(codes.includes("zero-debt-unretired-baseline"), "final zero-debt mode must require every baseline JavaScript path to be retired");
}

{
  const codes = violationCodes(
    { "src/entry.ts": "export const value = 1;\n" },
    makeManifest({ zeroDebt: true }),
  );
  assert(codes.includes("zero-debt-missing-strict-root"), "final zero-debt mode must put every typed source under strict policy");
}

{
  const codes = violationCodes(
    { "src/entry.ts": "export const value = 1;\n" },
    makeManifest({
      allowedTsToJsEdges: ["src/entry.ts -> src/legacy.js"],
      legacyClosure: ["src/legacy.js"],
      retiredSources: ["src/legacy.js"],
      strictRoots: ["src/entry.ts"],
      zeroDebt: true,
    }),
    ["src/legacy.js"],
  );
  assert(codes.includes("zero-debt-allowlist"), "final zero-debt mode must reject compatibility edge allowlists");
  assert(codes.includes("zero-debt-legacy-closure"), "final zero-debt mode must reject legacy closure declarations");
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "export const value = 1;\n",
      "tsconfig.json": JSON.stringify({
        compilerOptions: { strict: true },
        include: ["src/**/*.ts"],
      }),
    },
    makeManifest({
      retiredSources: ["src/legacy.js"],
      strictConfigs: ["tsconfig.json"],
      strictRoots: ["src/entry.ts"],
      zeroDebt: true,
    }),
    ["src/legacy.js"],
  );
  assert.deepEqual(codes, [], "final zero-debt mode must accept a fully typed and explicitly retired source set");
}

{
  const codes = violationCodes(
    { "src/retired.js": "export const value = 1;\n" },
    makeManifest({ retiredSources: ["src/retired.js"] }),
    ["src/retired.js"],
  );
  assert(codes.includes("retired-source-present"), "a retired physical source must never reappear");
}

{
  const codes = violationCodes(
    { "src/value.ts": "export const value = 1;\n" },
    makeManifest(),
    ["src/value.js"],
  );
  assert(codes.includes("missing-retired-source"), "same-stem baseline JS paths replaced by TS must be declared retired");
}

{
  const codes = violationCodes(
    { "src/value.ts": "export const value = 1;\n" },
    makeManifest({ retiredSources: ["src/value.js"] }),
    ["src/value.js"],
  );
  assert(
    codes.includes("missing-retired-replacement-export-baseline"),
    "every retired source with a typed replacement must freeze the replacement export surface",
  );
  assert(
    codes.includes("missing-retired-replacement-caller-baseline"),
    "every retired source with a typed replacement must freeze the replacement caller set",
  );
}

{
  const codes = violationCodes(
    {
      "outside/value.ts": "export const value = 1;\n",
      "src/entry.ts": "export const entry = 1;\n",
    },
    makeManifest({ retiredSources: ["outside/value.js"] }),
    ["outside/value.js"],
  );
  assert(
    codes.includes("missing-retired-replacement-export-baseline")
      && codes.includes("missing-retired-replacement-caller-baseline"),
    "physical typed replacements outside scan roots must not evade baseline coverage",
  );
}

{
  withFixture({
    "src/caller.ts": "import { publicValue } from './public.js'; void publicValue;\n",
    "src/public.ts": "export type PublicType = string;\nexport const publicValue = 1;\n",
  }, (projectRoot) => {
    const snapshots = collectRetiredReplacementSnapshots({
      manifest: makeManifest({ retiredSources: ["src/public.js"] }),
      projectRoot,
    });
    assert.deepEqual(snapshots, {
      callerBaselines: {
        "src/public.ts": ["src/caller.ts"],
      },
      exportBaselines: {
        "src/public.ts": {
          types: ["PublicType"],
          values: ["publicValue"],
        },
      },
    }, "replacement snapshots must return exact, reviewable export and caller baselines without mutating the manifest");
  });
}

{
  withFixture({
    "src/caller.ts": "import { publicValue } from './public.js'; void publicValue;\n",
    "src/public.js": "export const publicValue = 1;\n",
    "src/reexport.js": "export { publicValue } from './public.js';\n",
  }, (projectRoot) => {
    const snapshots = collectSourceSnapshots({
      manifest: makeManifest(),
      projectRoot,
      sourcePaths: ["src/public.js"],
    });
    assert.deepEqual(snapshots, {
      callerBaselines: {
        "src/public.js": ["src/caller.ts", "src/reexport.js"],
      },
      exportBaselines: {
        "src/public.js": {
          types: [],
          values: ["publicValue"],
        },
      },
    }, "source snapshots must freeze legacy exports and all physical callers before a migration rename");
  });
}

{
  const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", join(scriptsDirectory, "checkTypeScriptMigration.ts"), "--print-retired-replacement-snapshots"],
    { cwd: dirname(scriptsDirectory), encoding: "utf8", shell: false },
  );
  assert.equal(result.status, 0, result.stderr || "the replacement snapshot CLI must exit successfully");
  const snapshots: unknown = JSON.parse(result.stdout);
  assert(
    snapshots !== null
      && typeof snapshots === "object"
      && !Array.isArray(snapshots)
      && Reflect.get(snapshots, "callerBaselines")
      && Reflect.get(snapshots, "exportBaselines"),
    "the replacement snapshot CLI must print reviewable export and caller JSON without editing the manifest",
  );
}

{
  const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      join(scriptsDirectory, "checkTypeScriptMigration.ts"),
      "--print-legacy-closure-snapshots",
      "--snapshot-limit",
      "1",
    ],
    { cwd: dirname(scriptsDirectory), encoding: "utf8", shell: false },
  );
  assert.equal(result.status, 0, result.stderr || "the legacy closure snapshot CLI must exit successfully");
  const snapshots: unknown = JSON.parse(result.stdout);
  const exportBaselines = Reflect.get(snapshots as object, "exportBaselines");
  const callerBaselines = Reflect.get(snapshots as object, "callerBaselines");
  const manifest: unknown = JSON.parse(readFileSync(join(scriptsDirectory, "typescript-migration-manifest.json"), "utf8"));
  const legacyClosure = Reflect.get(manifest as object, "legacyClosure");
  assert(Array.isArray(legacyClosure), "the migration manifest must declare the legacy closure as an array");
  const expectedPagePaths = legacyClosure.slice(0, 1);
  assert(
    exportBaselines !== null
      && typeof exportBaselines === "object"
      && callerBaselines !== null
      && typeof callerBaselines === "object"
      && JSON.stringify(Object.keys(exportBaselines as object)) === JSON.stringify(expectedPagePaths)
      && JSON.stringify(Object.keys(callerBaselines as object)) === JSON.stringify(expectedPagePaths),
    "the legacy closure snapshot CLI must emit the requested reviewable page, including an empty page after closure reaches zero",
  );
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "import { value } from './value.js'; export { value };\n",
      "src/value.ts": "export const value = 1;\n",
    },
    makeManifest({ allowedTsToJsEdges: ["src/entry.ts -> src/legacy.js"] }),
  );
  assert(codes.includes("stale-allowed-ts-js-edge"), "the allowed TS-to-JS edge baseline must exactly match physical debt");
}

{
  const codes = violationCodes(
    {
      "src/exampleTests.ts": "export function runExampleTests() {}\n",
      "src/runTests.ts": "export {};\n",
    },
    makeManifest({
      testRunners: [{ root: "src", runner: "src/runTests.ts" }],
    }),
  );
  assert(codes.includes("unregistered-test"), "ordinary tests missing from the declared runner must fail");
}

{
  const codes = violationCodes(
    {
      "src/exampleTests.ts": "export function runExampleTests() {}\n",
      "src/runTests.ts": "import { runExampleTests } from './exampleTests.js';\n",
    },
    makeManifest({
      testRunners: [{ root: "src", runner: "src/runTests.ts" }],
    }),
  );
  assert(codes.includes("uninvoked-test"), "importing a suite without invoking it must fail registration");
}

{
  const codes = violationCodes(
    {
      "src/exampleTests.ts": "export function helper() {}\nexport function runExampleTests() {}\n",
      "src/runTests.ts": "import { helper } from './exampleTests.js';\nhelper();\n",
    },
    makeManifest({
      testRunners: [{ root: "src", runner: "src/runTests.ts" }],
    }),
  );
  assert(codes.includes("unregistered-test"), "calling a non-suite helper from a test module must not count as suite registration");
}

{
  const codes = violationCodes(
    {
      "src/exampleTests.ts": "export function runFirstTests() {}\nexport function runSecondTests() {}\n",
      "src/runTests.ts": "import { runFirstTests } from './exampleTests.js';\nrunFirstTests();\n",
    },
    makeManifest({
      testRunners: [{ root: "src", runner: "src/runTests.ts" }],
    }),
  );
  assert(codes.includes("invalid-test-suite-export-count"), "each ordinary test module must expose exactly one run*Tests suite");
}

{
  const codes = violationCodes(
    {
      "src/exampleTests.ts": "export function runExampleTests() {}\n",
      "src/runTests.ts": [
        "import { runExampleTests } from './exampleTests.js';",
        "runExampleTests();",
        "runExampleTests();",
        "",
      ].join("\n"),
    },
    makeManifest({
      testRunners: [{ root: "src", runner: "src/runTests.ts" }],
    }),
  );
  assert(codes.includes("duplicate-test-invocation"), "invoking one suite more than once must fail registration");
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "import { value } from './value.ts'; export { value };\n",
      "src/value.ts": "export const value = 1;\n",
    },
    makeManifest(),
  );
  assert(codes.includes("forbidden-ts-specifier"), "first-party imports must preserve emitted .js module identifiers");
}

{
  const ignoredDirective = `// @ts-${"ignore"}`;
  const codes = violationCodes(
    { "src/entry.ts": `${ignoredDirective}\nexport const value: number = 'wrong';\n` },
    makeManifest({ strictRoots: ["src/entry.ts"] }),
  );
  assert(codes.includes("forbidden-type-directive"), "strict sources must not suppress type checking");
}

{
  const codes = violationCodes(
    { "src/entry.ts": "export const value: any = 1;\n" },
    makeManifest({ strictRoots: ["src/entry.ts"] }),
  );
  assert(codes.includes("forbidden-any"), "strict sources must not introduce explicit any");
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "export const value = 1;\n",
      "src/other.ts": "export const other = 1;\n",
      "tsconfig.json": JSON.stringify({
        compilerOptions: { strict: true },
        files: ["src/other.ts"],
      }),
    },
    makeManifest({
      directEntries: ["tsconfig.json"],
      strictConfigs: ["tsconfig.json"],
      strictRoots: ["src/entry.ts"],
    }),
  );
  assert(codes.includes("strict-config-coverage-mismatch"), "strict tsconfigs must exactly cover manifest strict roots");
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "export const value = 1;\n",
      "tsconfig.json": JSON.stringify({
        compilerOptions: { strict: false },
        include: ["src/**/*.ts"],
      }),
    },
    makeManifest({
      directEntries: ["tsconfig.json"],
      strictConfigs: ["tsconfig.json"],
      strictRoots: ["src/entry.ts"],
    }),
  );
  assert(codes.includes("strict-config-mismatch"), "declared strict configs must enable effective strict mode");
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "export const value = 1;\n",
      "src/view.vue": "<script setup lang=\"ts\">const value = 1;</script>\n",
      "scripts/tool.ts": "export const tool = 1;\n",
      "tsconfig.json": JSON.stringify({
        compilerOptions: { strict: true },
        include: ["src/**/*.ts", "src/**/*.vue"],
      }),
      "tsconfig.tools.json": JSON.stringify({
        extends: "./tsconfig.json",
        include: ["scripts/**/*.ts"],
      }),
    },
    makeManifest({
      directEntries: ["tsconfig.json", "tsconfig.tools.json"],
      scanRoots: ["."],
      strictConfigs: ["tsconfig.json", "tsconfig.tools.json"],
      strictRoots: ["scripts/tool.ts", "src/entry.ts", "src/view.vue"],
      zeroDebt: true,
    }),
  );
  assert.deepEqual(codes, [], "multiple strict configs must jointly cover every typed source");
}

{
  const codes = violationCodes(
    { "src/entry.ts": "void import('./missing.dev.js');\n" },
    makeManifest(),
  );
  assert(codes.includes("unresolved-import"), "literal dynamic imports must participate in path validation");
}

{
  const codes = violationCodes(
    { "index.html": "<script type=\"module\" src=\"/src/missing.ts\"></script>\n" },
    makeManifest({ directEntries: ["index.html"], scanRoots: [] }),
  );
  assert(codes.includes("unresolved-entry-reference"), "HTML module entry references must resolve physically");
}

{
  const codes = violationCodes(
    { "package.json": JSON.stringify({ scripts: { tool: "tsx scripts/missing.ts" } }) },
    makeManifest({ directEntries: ["package.json"], scanRoots: [] }),
  );
  assert(codes.includes("unresolved-entry-reference"), "package script physical entries must resolve without output-extension remapping");
}

console.log("TypeScript migration policy tests passed");
