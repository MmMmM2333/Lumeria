import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  analyzeProjectPolicy,
  type ProjectPolicyOptions,
} from "./checkProjectPolicy.js";

type FixtureFiles = Readonly<Record<string, string>>;

const STRICT_TSCONFIG = JSON.stringify({
  compilerOptions: {
    allowJs: false,
    checkJs: false,
    strict: true,
  },
  include: ["src/**/*.ts", "src/**/*.vue"],
});

function withFixture(files: FixtureFiles, run: (projectRoot: string) => void): void {
  const projectRoot = mkdtempSync(join(tmpdir(), "lumeria-project-policy-"));
  try {
    const completeFiles = { "tsconfig.json": STRICT_TSCONFIG, ...files };
    for (const [relativePath, source] of Object.entries(completeFiles)) {
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
  overrides: Partial<Omit<ProjectPolicyOptions, "projectRoot">> = {},
): string[] {
  let codes: string[] = [];
  withFixture(files, (projectRoot) => {
    codes = analyzeProjectPolicy({
      projectRoot,
      scanRoots: ["src"],
      strictConfigs: ["tsconfig.json"],
      ...overrides,
    }).violations.map(({ code }) => code);
  });
  return codes;
}

function registrationCodes(testSource: string, runnerSource: string): string[] {
  return violationCodes(
    {
      "src/exampleTests.ts": testSource,
      "src/runTests.ts": runnerSource,
    },
    { testRoot: "src", testRunner: "src/runTests.ts" },
  );
}

{
  const codes = violationCodes(
    {
      "src/entry.ts": "export const value = 1;\n",
      "src/exampleTests.ts": "export function runExampleTests() {}\n",
      "src/runTests.ts": "import { runExampleTests } from './exampleTests.js';\nrunExampleTests();\n",
      "src/view.vue": "<script setup lang=\"ts\">const value = 1;</script>\n",
    },
    { testRoot: "src", testRunner: "src/runTests.ts" },
  );
  assert.deepEqual(codes, [], "a fully typed strict project with registered tests must satisfy the policy");
}

{
  const codes = violationCodes({
    "src/entry.ts": "export const value = 1;\n",
    "src/legacy.js": "export const legacy = true;\n",
  });
  assert(codes.includes("legacy-source"), "physical first-party JavaScript must be rejected");
}

{
  const codes = violationCodes({
    "src/entry.ts": "export const value = 1;\n",
    "src/view.vue": "<script setup>const value = 1;</script>\n",
  });
  assert(codes.includes("untyped-vue-source"), "Vue components without TypeScript must be rejected");
}

{
  const ignoredDirective = `// @ts-${"ignore"}`;
  const codes = violationCodes({
    "src/entry.ts": `${ignoredDirective}\nexport const value: number = 'wrong';\n`,
  });
  assert(codes.includes("forbidden-type-directive"), "type-checking suppression directives must be rejected");
}

{
  const expectErrorDirective = `// @ts-${"expect-error"}`;
  const ordinaryCodes = violationCodes({
    "src/entry.ts": `${expectErrorDirective}\nexport const value: number = 'expected';\n`,
  });
  const typeTestCodes = violationCodes({
    "src/entry.ts": "export const value = 1;\n",
    "src/value.typeTests.ts": `${expectErrorDirective}\nconst value: number = 'expected';\nvoid value;\n`,
  });
  assert(ordinaryCodes.includes("forbidden-type-directive"), "expect-error must be restricted to type-test modules");
  assert(!typeTestCodes.includes("forbidden-type-directive"), "type-test modules must retain targeted expect-error assertions");
}

{
  const codes = violationCodes({ "src/entry.ts": "export const value: any = 1;\n" });
  assert(codes.includes("forbidden-any"), "explicit any types must be rejected");
}

{
  const codes = violationCodes({
    "src/entry.ts": "import { value } from './value.ts'; export { value };\n",
    "src/value.ts": "export const value = 1;\n",
  });
  assert(codes.includes("forbidden-ts-specifier"), "ESM imports must use emitted module identifiers");
}

{
  const codes = violationCodes({
    "src/entry.ts": "export const value = 1;\n",
    "src/other.ts": "export const other = 1;\n",
    "tsconfig.json": JSON.stringify({
      compilerOptions: { strict: true },
      files: ["src/entry.ts"],
    }),
  });
  assert(codes.includes("uncovered-typed-source"), "every typed source must be covered by a strict config");
}

{
  const codes = violationCodes({
    "src/entry.ts": "export const value = 1;\n",
    "tsconfig.json": JSON.stringify({
      compilerOptions: { strict: false },
      include: ["src/**/*.ts"],
    }),
  });
  assert(codes.includes("non-strict-config"), "strict mode must not be disabled");
}

{
  const codes = registrationCodes(
    "export function runExampleTests() {}\n",
    "export {};\n",
  );
  assert(codes.includes("unregistered-test"), "ordinary tests must be imported by the declared runner");
}

{
  const codes = registrationCodes(
    "export function runExampleTests() {}\n",
    "import { runExampleTests } from './exampleTests.js';\nvoid runExampleTests;\n",
  );
  assert(codes.includes("uninvoked-test"), "imported test suites must be invoked by the declared runner");
}

{
  const codes = registrationCodes(
    "export function runExampleTests() {}\n",
    [
      "import { runExampleTests } from './exampleTests.js';",
      "runExampleTests();",
      "runExampleTests();",
      "",
    ].join("\n"),
  );
  assert(codes.includes("duplicate-test-invocation"), "test suites must not be invoked more than once");
}

{
  const codes = registrationCodes(
    "export function runFirstTests() {}\nexport function runSecondTests() {}\n",
    "import { runFirstTests } from './exampleTests.js';\nrunFirstTests();\n",
  );
  assert(codes.includes("invalid-test-suite-export-count"), "ordinary test modules must expose one suite entry");
}

console.log("Project policy checker tests passed");
