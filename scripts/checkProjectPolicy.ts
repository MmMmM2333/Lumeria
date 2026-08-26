import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import {
  dirname,
  extname,
  join,
  normalize,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const CODE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx", ".vue"]);
const LEGACY_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs"]);
const TYPED_EXTENSIONS = new Set([".cts", ".mts", ".ts", ".tsx"]);
const EMITTED_TO_SOURCE_EXTENSION = new Map([
  [".cjs", ".cts"],
  [".js", ".ts"],
  [".jsx", ".tsx"],
  [".mjs", ".mts"],
]);
const STRICT_OPTION_NAMES = [
  "alwaysStrict",
  "noImplicitAny",
  "noImplicitThis",
  "strictBindCallApply",
  "strictBuiltinIteratorReturn",
  "strictFunctionTypes",
  "strictNullChecks",
  "strictPropertyInitialization",
  "useUnknownInCatchVariables",
] as const satisfies readonly (keyof ts.CompilerOptions)[];
const IGNORED_DIRECTORY_NAMES = new Set([
  ".agents",
  ".claude",
  ".codex",
  ".codex-dev",
  ".git",
  ".idea",
  ".vscode",
  ".worktrees",
  "dist",
  "docs-agents",
  "node_modules",
  "playwright-report",
  "src-tauri",
  "target",
  "test-results",
]);
const TYPE_DIRECTIVE_PREFIX = "@ts-";
const FORBIDDEN_TYPE_DIRECTIVE_PATTERN = new RegExp(`${TYPE_DIRECTIVE_PREFIX}(?:ignore|nocheck)\\b`);
const EXPECT_ERROR_DIRECTIVE_PATTERN = new RegExp(`${TYPE_DIRECTIVE_PREFIX}expect-error\\b`);
const TYPESCRIPT_SPECIFIER_PATTERN = /\.(?:cts|mts|ts|tsx)(?:[?#]|$)/i;

export type ProjectPolicyOptions = Readonly<{
  projectRoot: string;
  scanRoots: readonly string[];
  strictConfigs: readonly string[];
  testRoot?: string;
  testRunner?: string;
}>;

export type ProjectPolicyViolation = Readonly<{
  code: string;
  detail: string;
  path: string;
}>;

export type ProjectPolicyInventory = Readonly<{
  legacySources: number;
  runtimeTestSuites: number;
  typedSources: number;
  untypedVueFiles: number;
}>;

export type ProjectPolicyAnalysis = Readonly<{
  inventory: ProjectPolicyInventory;
  violations: readonly ProjectPolicyViolation[];
}>;

type SourceFile = Readonly<{
  absolutePath: string;
  relativePath: string;
  source: string;
  typed: boolean;
}>;

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function normalizeRelativePath(value: string): string {
  return toPosixPath(normalize(value));
}

function projectRelativePath(projectRoot: string, absolutePath: string): string {
  return toPosixPath(relative(projectRoot, absolutePath));
}

function isTypedVueSource(source: string): boolean {
  return /<script\b[^>]*\blang\s*=\s*["']ts["'][^>]*>/i.test(source);
}

function isTypedSource(path: string, source: string): boolean {
  const extension = extname(path).toLowerCase();
  return TYPED_EXTENSIONS.has(extension) || (extension === ".vue" && isTypedVueSource(source));
}

function readSourceForAnalysis(path: string, source: string): string {
  if (extname(path).toLowerCase() !== ".vue") return source;
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1] ?? "")
    .join("\n");
}

function collectFilesRecursively(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFilesRecursively(path));
    else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name).toLowerCase())) files.push(path);
  }
  return files;
}

function collectSourceFiles(
  projectRoot: string,
  scanRoots: readonly string[],
  violations: ProjectPolicyViolation[],
): Map<string, SourceFile> {
  const absolutePaths = new Set<string>();
  for (const rawRoot of scanRoots) {
    const root = normalizeRelativePath(rawRoot);
    const absoluteRoot = resolve(projectRoot, root);
    if (!existsSync(absoluteRoot)) {
      violations.push({ code: "missing-scan-root", detail: "declared source-policy scan root does not exist", path: root });
      continue;
    }
    for (const path of collectFilesRecursively(absoluteRoot)) absolutePaths.add(resolve(path));
  }

  const sources = new Map<string, SourceFile>();
  for (const absolutePath of [...absolutePaths].sort()) {
    const relativePath = projectRelativePath(projectRoot, absolutePath);
    const source = readFileSync(absolutePath, "utf8");
    sources.set(relativePath, Object.freeze({
      absolutePath,
      relativePath,
      source,
      typed: isTypedSource(relativePath, source),
    }));
  }
  return sources;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function collectStrictConfigCoverage(
  projectRoot: string,
  configPaths: readonly string[],
  violations: ProjectPolicyViolation[],
): ReadonlySet<string> {
  const compiledPaths = new Set<string>();
  const seenConfigs = new Set<string>();
  for (const rawConfigPath of configPaths) {
    const configPath = normalizeRelativePath(rawConfigPath);
    if (seenConfigs.has(configPath)) {
      violations.push({ code: "duplicate-strict-config", detail: "strict config declarations must be unique", path: configPath });
      continue;
    }
    seenConfigs.add(configPath);
    const absoluteConfigPath = resolve(projectRoot, configPath);
    if (!existsSync(absoluteConfigPath)) {
      violations.push({ code: "missing-strict-config", detail: "declared strict TypeScript config does not exist", path: configPath });
      continue;
    }

    const configReadResult = ts.readConfigFile(absoluteConfigPath, ts.sys.readFile);
    if (configReadResult.error) {
      violations.push({ code: "invalid-strict-config", detail: formatDiagnostic(configReadResult.error), path: configPath });
      continue;
    }
    const effectiveConfig = ts.parseJsonConfigFileContent(
      configReadResult.config,
      ts.sys,
      dirname(absoluteConfigPath),
      undefined,
      absoluteConfigPath,
      undefined,
      [{ extension: ".vue", isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }],
    );
    if (effectiveConfig.errors.length > 0) {
      violations.push({
        code: "invalid-strict-config",
        detail: effectiveConfig.errors.map(formatDiagnostic).join("; "),
        path: configPath,
      });
      continue;
    }

    const options = effectiveConfig.options;
    const strict = options.strict === true
      && options.allowJs !== true
      && options.checkJs !== true
      && STRICT_OPTION_NAMES.every((name) => options[name] !== false);
    if (!strict) {
      violations.push({
        code: "non-strict-config",
        detail: "TypeScript configs must enable strict mode and keep JavaScript compilation disabled",
        path: configPath,
      });
      continue;
    }
    for (const fileName of effectiveConfig.fileNames) {
      compiledPaths.add(projectRelativePath(projectRoot, fileName));
    }
  }
  return compiledPaths;
}

function checkSourcePolicies(
  sources: ReadonlyMap<string, SourceFile>,
  compiledPaths: ReadonlySet<string>,
  violations: ProjectPolicyViolation[],
): void {
  for (const sourceFile of sources.values()) {
    const extension = extname(sourceFile.relativePath).toLowerCase();
    if (LEGACY_EXTENSIONS.has(extension)) {
      violations.push({
        code: "legacy-source",
        detail: "first-party JavaScript sources are forbidden after the TypeScript migration",
        path: sourceFile.relativePath,
      });
      continue;
    }
    if (extension === ".vue" && !sourceFile.typed) {
      violations.push({
        code: "untyped-vue-source",
        detail: "first-party Vue components must use a TypeScript script block",
        path: sourceFile.relativePath,
      });
      continue;
    }
    if (!sourceFile.typed) continue;
    if (!compiledPaths.has(sourceFile.relativePath)) {
      violations.push({
        code: "uncovered-typed-source",
        detail: "typed source is not covered by a declared strict TypeScript config",
        path: sourceFile.relativePath,
      });
    }

    const source = readSourceForAnalysis(sourceFile.relativePath, sourceFile.source);
    const forbiddenDirective = FORBIDDEN_TYPE_DIRECTIVE_PATTERN.test(source)
      || (!/\.typeTests\.ts$/.test(sourceFile.relativePath) && EXPECT_ERROR_DIRECTIVE_PATTERN.test(source));
    if (forbiddenDirective) {
      violations.push({
        code: "forbidden-type-directive",
        detail: "first-party typed sources may not suppress type checking",
        path: sourceFile.relativePath,
      });
    }

    const scriptKind = extension === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const parsed = ts.createSourceFile(sourceFile.relativePath, source, ts.ScriptTarget.Latest, true, scriptKind);
    let containsAny = false;
    const visit = (node: ts.Node): void => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) containsAny = true;
      if (!containsAny) ts.forEachChild(node, visit);
    };
    visit(parsed);
    if (containsAny) {
      violations.push({
        code: "forbidden-any",
        detail: "first-party typed sources may not contain explicit any types",
        path: sourceFile.relativePath,
      });
    }

    for (const importedFile of ts.preProcessFile(source, true, true).importedFiles) {
      if (TYPESCRIPT_SPECIFIER_PATTERN.test(importedFile.fileName)) {
        violations.push({
          code: "forbidden-ts-specifier",
          detail: `ESM imports must use emitted module identifiers: ${importedFile.fileName}`,
          path: sourceFile.relativePath,
        });
      }
    }
  }
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(ts.getModifiers(node as ts.HasModifiers)?.some((modifier) => modifier.kind === kind));
}

function isOrdinaryTest(path: string): boolean {
  return /Tests\.ts$/.test(path) && !/\.typeTests\.ts$/.test(path);
}

function collectTestSuiteExports(sourceFile: SourceFile): ReadonlySet<string> {
  const parsed = ts.createSourceFile(
    sourceFile.relativePath,
    readSourceForAnalysis(sourceFile.relativePath, sourceFile.source),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const exports = new Set<string>();
  for (const statement of parsed.statements) {
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name && /^run.+Tests$/.test(statement.name.text)) {
      exports.add(statement.name.text);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && /^run.+Tests$/.test(declaration.name.text)) {
          exports.add(declaration.name.text);
        }
      }
    }
  }
  return exports;
}

function collectTopLevelCallCounts(parsedRunner: ts.SourceFile): ReadonlyMap<string, number> {
  const callCounts = new Map<string, number>();
  for (const statement of parsedRunner.statements) {
    if (!ts.isExpressionStatement(statement)) continue;
    const expression = ts.isAwaitExpression(statement.expression)
      ? statement.expression.expression
      : statement.expression;
    if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) continue;
    const name = expression.expression.text;
    callCounts.set(name, (callCounts.get(name) ?? 0) + 1);
  }
  return callCounts;
}

function resolveImportedSource(
  projectRoot: string,
  importer: SourceFile,
  specifier: string,
  sources: ReadonlyMap<string, SourceFile>,
): string | null {
  if (!specifier.startsWith(".")) return null;
  const resourcePath = specifier.split(/[?#]/, 1)[0];
  if (!resourcePath) return null;
  const absolutePath = resolve(dirname(importer.absolutePath), resourcePath);
  const extension = extname(absolutePath).toLowerCase();
  const candidates = [absolutePath];
  const sourceExtension = EMITTED_TO_SOURCE_EXTENSION.get(extension);
  if (sourceExtension) candidates.unshift(`${absolutePath.slice(0, -extension.length)}${sourceExtension}`);
  if (!extension) {
    candidates.push(`${absolutePath}.ts`, `${absolutePath}.tsx`, join(absolutePath, "index.ts"), join(absolutePath, "index.tsx"));
  }
  for (const candidate of candidates) {
    const path = projectRelativePath(projectRoot, candidate);
    if (sources.has(path)) return path;
  }
  return null;
}

function checkTestRegistration(
  projectRoot: string,
  sources: ReadonlyMap<string, SourceFile>,
  testRoot: string | undefined,
  testRunner: string | undefined,
  violations: ProjectPolicyViolation[],
): number {
  if (Boolean(testRoot) !== Boolean(testRunner)) {
    violations.push({
      code: "invalid-test-policy",
      detail: "testRoot and testRunner must either both be declared or both be omitted",
      path: "test-policy",
    });
    return 0;
  }
  if (!testRoot || !testRunner) return 0;

  const root = normalizeRelativePath(testRoot).replace(/\/$/, "");
  const runner = normalizeRelativePath(testRunner);
  const runnerSource = sources.get(runner);
  if (!runnerSource) {
    violations.push({ code: "missing-test-runner", detail: "declared test runner does not exist", path: runner });
    return 0;
  }
  const parsedRunner = ts.createSourceFile(runner, runnerSource.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const suiteExports = new Map<string, ReadonlySet<string>>();
  for (const [path, sourceFile] of sources) {
    if (path === runner || !path.startsWith(`${root}/`) || !isOrdinaryTest(path)) continue;
    const exports = collectTestSuiteExports(sourceFile);
    suiteExports.set(path, exports);
    if (exports.size !== 1) {
      violations.push({
        code: "invalid-test-suite-export-count",
        detail: `ordinary test modules must export exactly one run*Tests suite; found ${exports.size}`,
        path,
      });
    }
  }

  const suiteBindings = new Map<string, Set<string>>();
  for (const statement of parsedRunner.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const target = resolveImportedSource(projectRoot, runnerSource, statement.moduleSpecifier.text, sources);
    if (!target || !statement.importClause) continue;
    const exportedSuites = suiteExports.get(target);
    if (!exportedSuites?.size) continue;
    const bindings = suiteBindings.get(target) ?? new Set<string>();
    const namedBindings = statement.importClause.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (exportedSuites.has(importedName)) bindings.add(element.name.text);
      }
    }
    suiteBindings.set(target, bindings);
  }

  const callCounts = collectTopLevelCallCounts(parsedRunner);
  for (const path of suiteExports.keys()) {
    const bindings = suiteBindings.get(path);
    if (!bindings?.size) {
      violations.push({ code: "unregistered-test", detail: `ordinary test is not imported by ${runner}`, path });
      continue;
    }
    const invocationCount = [...bindings].reduce((count, binding) => count + (callCounts.get(binding) ?? 0), 0);
    if (invocationCount === 0) {
      violations.push({ code: "uninvoked-test", detail: `ordinary test is imported but not invoked by ${runner}`, path });
    } else if (invocationCount > 1) {
      violations.push({
        code: "duplicate-test-invocation",
        detail: `ordinary test is invoked ${invocationCount} times by ${runner}`,
        path,
      });
    }
  }
  return suiteExports.size;
}

function sortViolations(violations: ProjectPolicyViolation[]): ProjectPolicyViolation[] {
  return violations.sort((left, right) => (
    left.code.localeCompare(right.code)
    || left.path.localeCompare(right.path)
    || left.detail.localeCompare(right.detail)
  ));
}

export function analyzeProjectPolicy(options: ProjectPolicyOptions): ProjectPolicyAnalysis {
  const projectRoot = resolve(options.projectRoot);
  const violations: ProjectPolicyViolation[] = [];
  const sources = collectSourceFiles(projectRoot, options.scanRoots, violations);
  const compiledPaths = collectStrictConfigCoverage(projectRoot, options.strictConfigs, violations);
  checkSourcePolicies(sources, compiledPaths, violations);
  const runtimeTestSuites = checkTestRegistration(
    projectRoot,
    sources,
    options.testRoot,
    options.testRunner,
    violations,
  );
  const sourceValues = [...sources.values()];
  return Object.freeze({
    inventory: Object.freeze({
      legacySources: sourceValues.filter(({ relativePath }) => LEGACY_EXTENSIONS.has(extname(relativePath).toLowerCase())).length,
      runtimeTestSuites,
      typedSources: sourceValues.filter(({ typed }) => typed).length,
      untypedVueFiles: sourceValues.filter(({ relativePath, typed }) => relativePath.endsWith(".vue") && !typed).length,
    }),
    violations: Object.freeze(sortViolations(violations)),
  });
}

function runCli(): void {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = analyzeProjectPolicy({
    projectRoot,
    scanRoots: ["."],
    strictConfigs: ["tsconfig.json", "tsconfig.tools.json"],
    testRoot: "src",
    testRunner: "src/domain/runLaunchpadLayoutTests.ts",
  });
  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      console.error(`[${violation.code}] ${violation.path}: ${violation.detail}`);
    }
    process.exitCode = 1;
    return;
  }
  const inventory = result.inventory;
  console.log(
    `Project policy checks passed: ${inventory.typedSources} typed sources, `
    + `${inventory.runtimeTestSuites} runtime test suites, ${inventory.legacySources} legacy sources, `
    + `${inventory.untypedVueFiles} untyped Vue files`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === resolve(fileURLToPath(import.meta.url))) runCli();
