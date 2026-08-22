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
    directEntries: [],
    retiredSources: [],
    scanRoots: ["src"],
    strictRoots: [],
    testRunners: [],
    ...overrides,
  };
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

console.log("TypeScript migration policy tests passed");
