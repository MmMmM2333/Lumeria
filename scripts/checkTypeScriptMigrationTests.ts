import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  analyzeTypeScriptMigration,
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
    strictRoots: [],
    testRunners: [],
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
  const codes = violationCodes(
    { "src/entry.ts": "// @ts-ignore\nexport const value: number = 'wrong';\n" },
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
      "tsconfig.strict.json": JSON.stringify({
        compilerOptions: { allowJs: false, checkJs: false },
        files: ["src/other.ts"],
        include: [],
      }),
    },
    makeManifest({
      directEntries: ["tsconfig.strict.json"],
      strictConfig: "tsconfig.strict.json",
      strictRoots: ["src/entry.ts"],
    }),
  );
  assert(codes.includes("strict-config-mismatch"), "strict tsconfig files must exactly match manifest strict roots");
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "export const value = 1;\n",
      "tsconfig.strict.json": JSON.stringify({
        compilerOptions: { allowJs: false, checkJs: false, strict: true },
        files: ["src/entry.ts"],
        include: [],
      }),
    },
    makeManifest({
      directEntries: ["tsconfig.strict.json"],
      strictConfig: "tsconfig.strict.json",
      strictRoots: ["src/entry.ts"],
    }),
  );
  assert(codes.includes("strict-config-mismatch"), "strict frontier config must extend the main project config");
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "export const value = 1;\n",
      "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }),
      "tsconfig.strict.json": JSON.stringify({
        extends: "./tsconfig.json",
        compilerOptions: { allowJs: false, checkJs: false, noImplicitAny: false },
        files: ["src/entry.ts"],
        include: [],
      }),
    },
    makeManifest({
      directEntries: ["tsconfig.json", "tsconfig.strict.json"],
      strictConfig: "tsconfig.strict.json",
      strictRoots: ["src/entry.ts"],
    }),
  );
  assert(codes.includes("strict-config-mismatch"), "strict frontier config must not disable individual strict-mode options");
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
