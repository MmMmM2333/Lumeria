import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
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
const IGNORED_DIRECTORY_NAMES = new Set([".git", ".worktrees", "dist", "node_modules", "target"]);

export type MigrationTestRunner = Readonly<{
  root: string;
  runner: string;
}>;

export type TypeScriptMigrationManifest = Readonly<{
  allowedTsToJsEdges: readonly string[];
  baselineCommit: string;
  directEntries: readonly string[];
  retiredSources: readonly string[];
  scanRoots: readonly string[];
  strictConfig?: string;
  strictRoots: readonly string[];
  testRunners: readonly MigrationTestRunner[];
}>;

export type MigrationViolation = Readonly<{
  code: string;
  detail: string;
  path: string;
}>;

export type MigrationInventory = Readonly<{
  codeFiles: number;
  legacySources: number;
  localEdges: number;
  testRunnerToLegacyEdges: number;
  tsToPhysicalJsEdges: number;
  typedSources: number;
  untypedVueFiles: number;
}>;

export type TypeScriptMigrationAnalysis = Readonly<{
  inventory: MigrationInventory;
  violations: readonly MigrationViolation[];
}>;

type AnalyzeTypeScriptMigrationOptions = Readonly<{
  baselineLegacyPaths?: readonly string[];
  manifest: TypeScriptMigrationManifest;
  projectRoot: string;
}>;

type SourceFile = Readonly<{
  absolutePath: string;
  relativePath: string;
  source: string;
  typed: boolean;
}>;

type ImportEdge = Readonly<{
  source: string;
  specifier: string;
  target: string;
}>;

type ImportResolution = Readonly<{
  external: boolean;
  target: string | null;
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

function isWithinRoot(relativePath: string): boolean {
  return relativePath !== ".." && !relativePath.startsWith("../") && !isAbsolute(relativePath);
}

function isCodePath(path: string): boolean {
  return CODE_EXTENSIONS.has(extname(path).toLowerCase());
}

function isTypedVueSource(source: string): boolean {
  return /<script\b[^>]*\blang\s*=\s*["']ts["'][^>]*>/i.test(source);
}

function isTypedSource(path: string, source: string): boolean {
  const extension = extname(path).toLowerCase();
  if (TYPED_EXTENSIONS.has(extension)) return true;
  return extension === ".vue" && isTypedVueSource(source);
}

function isLegacySource(path: string, source: string): boolean {
  const extension = extname(path).toLowerCase();
  if (LEGACY_EXTENSIONS.has(extension)) return true;
  return extension === ".vue" && !isTypedVueSource(source);
}

function extractVueScripts(source: string): string {
  const scripts: string[] = [];
  const pattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of source.matchAll(pattern)) scripts.push(match[1] ?? "");
  return scripts.join("\n");
}

function readSourceForImports(path: string, source: string): string {
  return extname(path).toLowerCase() === ".vue" ? extractVueScripts(source) : source;
}

function collectFilesRecursively(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFilesRecursively(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function collectProjectPaths(projectRoot: string, manifest: TypeScriptMigrationManifest): string[] {
  const paths = new Set<string>();
  for (const root of manifest.scanRoots) {
    const absoluteRoot = resolve(projectRoot, root);
    for (const path of collectFilesRecursively(absoluteRoot)) paths.add(resolve(path));
  }
  for (const entry of manifest.directEntries) {
    const absoluteEntry = resolve(projectRoot, entry);
    if (existsSync(absoluteEntry) && statSync(absoluteEntry).isFile()) paths.add(absoluteEntry);
  }
  return [...paths].sort();
}

function makeSourceFiles(projectRoot: string, paths: readonly string[]): Map<string, SourceFile> {
  const sources = new Map<string, SourceFile>();
  for (const absolutePath of paths) {
    if (!isCodePath(absolutePath)) continue;
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

function stripResourceSuffix(specifier: string): string {
  return specifier.split(/[?#]/, 1)[0] ?? specifier;
}

function outputExtensionCandidates(absolutePath: string): string[] {
  const extension = extname(absolutePath).toLowerCase();
  const withoutExtension = absolutePath.slice(0, -extension.length);
  if (extension === ".js") return [`${withoutExtension}.ts`, `${withoutExtension}.tsx`];
  if (extension === ".mjs") return [`${withoutExtension}.mts`];
  if (extension === ".cjs") return [`${withoutExtension}.cts`];
  if (extension === ".jsx") return [`${withoutExtension}.tsx`];
  return [];
}

function resolveCodeImport(
  projectRoot: string,
  sourceAbsolutePath: string,
  rawSpecifier: string,
): ImportResolution {
  const specifier = stripResourceSuffix(rawSpecifier);
  const isRootPath = specifier.startsWith("/");
  if (!isRootPath && !specifier.startsWith(".")) return { external: true, target: null };
  const unresolvedPath = isRootPath
    ? resolve(projectRoot, specifier.slice(1))
    : resolve(dirname(sourceAbsolutePath), specifier);
  const candidates = [unresolvedPath];
  if (extname(unresolvedPath)) candidates.push(...outputExtensionCandidates(unresolvedPath));
  else {
    for (const extension of [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue"]) {
      candidates.push(`${unresolvedPath}${extension}`);
    }
    for (const extension of [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"]) {
      candidates.push(join(unresolvedPath, `index${extension}`));
    }
  }
  const target = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
  if (!target) return { external: false, target: null };
  const relativeTarget = projectRelativePath(projectRoot, target);
  return { external: !isWithinRoot(relativeTarget), target: relativeTarget };
}

function makeImportGraph(
  projectRoot: string,
  sources: ReadonlyMap<string, SourceFile>,
  violations: MigrationViolation[],
): ImportEdge[] {
  const edges: ImportEdge[] = [];
  for (const sourceFile of sources.values()) {
    const preprocessed = ts.preProcessFile(
      readSourceForImports(sourceFile.relativePath, sourceFile.source),
      true,
      true,
    );
    for (const importedFile of preprocessed.importedFiles) {
      const resolution = resolveCodeImport(projectRoot, sourceFile.absolutePath, importedFile.fileName);
      if (resolution.external) continue;
      if (!resolution.target) {
        violations.push({
          code: "unresolved-import",
          detail: `cannot resolve ${importedFile.fileName}`,
          path: sourceFile.relativePath,
        });
        continue;
      }
      if (!isCodePath(resolution.target)) continue;
      edges.push(Object.freeze({
        source: sourceFile.relativePath,
        specifier: importedFile.fileName,
        target: resolution.target,
      }));
    }
  }
  return edges;
}

function checkDirectEntries(
  projectRoot: string,
  projectPaths: readonly string[],
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): void {
  for (const entry of manifest.directEntries) {
    if (!existsSync(resolve(projectRoot, entry))) {
      violations.push({ code: "missing-direct-entry", detail: "declared direct entry does not exist", path: entry });
    }
  }

  for (const absolutePath of projectPaths) {
    const extension = extname(absolutePath).toLowerCase();
    if (extension === ".html") {
      const source = readFileSync(absolutePath, "utf8");
      for (const match of source.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
        const specifier = stripResourceSuffix(match[1] ?? "");
        if (!specifier || /^(?:[a-z]+:)?\/\//i.test(specifier)) continue;
        const target = specifier.startsWith("/")
          ? resolve(projectRoot, specifier.slice(1))
          : resolve(dirname(absolutePath), specifier);
        if (!existsSync(target) || !statSync(target).isFile()) {
          violations.push({
            code: "unresolved-entry-reference",
            detail: `HTML script source does not exist: ${specifier}`,
            path: projectRelativePath(projectRoot, absolutePath),
          });
        }
      }
    }
    if (projectRelativePath(projectRoot, absolutePath) === "package.json") {
      const parsed: unknown = JSON.parse(readFileSync(absolutePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const scripts = Reflect.get(parsed, "scripts");
      if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) continue;
      for (const [scriptName, command] of Object.entries(scripts)) {
        if (typeof command !== "string") continue;
        const pathPattern = /(?:^|[\s=])([\w./\\-]+\.(?:[cm]?[jt]s|vue|html))(?=$|\s)/g;
        for (const match of command.matchAll(pathPattern)) {
          const referencedPath = match[1];
          if (!referencedPath) continue;
          const target = resolve(projectRoot, referencedPath);
          if (!existsSync(target) || !statSync(target).isFile()) {
            violations.push({
              code: "unresolved-entry-reference",
              detail: `package script ${scriptName} references a missing file: ${referencedPath}`,
              path: "package.json",
            });
          }
        }
      }
    }
  }
}

function checkDuplicateSources(sources: ReadonlyMap<string, SourceFile>, violations: MigrationViolation[]): void {
  const groups = new Map<string, string[]>();
  for (const path of sources.keys()) {
    const extension = extname(path).toLowerCase();
    let family: string | null = null;
    if ([".js", ".ts"].includes(extension)) family = ".module";
    else if ([".jsx", ".tsx"].includes(extension)) family = ".jsx-module";
    else if ([".mjs", ".mts"].includes(extension)) family = ".esm-module";
    else if ([".cjs", ".cts"].includes(extension)) family = ".cjs-module";
    if (!family) continue;
    const key = `${path.slice(0, -extension.length)}${family}`;
    const members = groups.get(key) ?? [];
    members.push(path);
    groups.set(key, members);
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const sorted = members.sort();
    violations.push({
      code: "duplicate-source",
      detail: `multiple physical implementations share one logical module: ${sorted.join(", ")}`,
      path: sorted[0] ?? "",
    });
  }
}

function checkLegacySources(
  projectRoot: string,
  sources: ReadonlyMap<string, SourceFile>,
  baselineLegacyPaths: readonly string[],
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): void {
  const baseline = new Set(baselineLegacyPaths.map(normalizeRelativePath));
  for (const sourceFile of sources.values()) {
    if (!isLegacySource(sourceFile.relativePath, sourceFile.source)) continue;
    if (!baseline.has(sourceFile.relativePath)) {
      violations.push({
        code: "new-legacy-source",
        detail: `legacy source did not exist at baseline ${manifest.baselineCommit}`,
        path: sourceFile.relativePath,
      });
    }
  }
  for (const retiredSource of manifest.retiredSources) {
    const normalizedPath = normalizeRelativePath(retiredSource);
    if (existsSync(resolve(projectRoot, normalizedPath))) {
      violations.push({
        code: "retired-source-present",
        detail: "retired physical source must not reappear",
        path: normalizedPath,
      });
    }
  }
}

function checkTsToJsEdges(
  sources: ReadonlyMap<string, SourceFile>,
  edges: readonly ImportEdge[],
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): Readonly<{ physicalJsEdges: readonly ImportEdge[]; testRunnerEdges: readonly ImportEdge[] }> {
  const allowed = new Set(manifest.allowedTsToJsEdges.map(normalizeRelativePath));
  const testRunners = new Set(manifest.testRunners.map(({ runner }) => normalizeRelativePath(runner)));
  const physicalJsEdges = edges.filter((edge) => {
    const source = sources.get(edge.source);
    const target = sources.get(edge.target);
    return Boolean(source?.typed && target && isLegacySource(target.relativePath, target.source));
  });
  const testRunnerEdges = physicalJsEdges.filter((edge) => testRunners.has(edge.source));
  for (const edge of physicalJsEdges.filter((edge) => !testRunners.has(edge.source))) {
    const description = `${edge.source} -> ${edge.target}`;
    if (allowed.has(description)) continue;
    violations.push({
      code: "unexpected-ts-js-edge",
      detail: "typed source depends directly on a physical legacy source",
      path: description,
    });
  }
  return Object.freeze({ physicalJsEdges, testRunnerEdges });
}

function checkStrictRoots(
  sources: ReadonlyMap<string, SourceFile>,
  edges: readonly ImportEdge[],
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): Set<string> {
  const adjacency = new Map<string, ImportEdge[]>();
  for (const edge of edges) {
    const outgoing = adjacency.get(edge.source) ?? [];
    outgoing.push(edge);
    adjacency.set(edge.source, outgoing);
  }
  const strictClosure = new Set<string>();
  for (const rawRoot of manifest.strictRoots) {
    const root = normalizeRelativePath(rawRoot);
    const rootSource = sources.get(root);
    if (!rootSource) {
      violations.push({ code: "missing-strict-root", detail: "declared strict root does not exist", path: root });
      continue;
    }
    if (!rootSource.typed) {
      violations.push({ code: "untyped-strict-root", detail: "declared strict root is not a typed source", path: root });
      continue;
    }
    strictClosure.add(root);
    const queue: Array<Readonly<{ chain: readonly string[]; path: string }>> = [{ chain: [root], path: root }];
    const visited = new Set([root]);
    let reported = false;
    for (let index = 0; index < queue.length && !reported; index += 1) {
      const current = queue[index];
      if (!current) continue;
      for (const edge of adjacency.get(current.path) ?? []) {
        const target = sources.get(edge.target);
        if (!target) continue;
        const chain = [...current.chain, edge.target];
        if (isLegacySource(target.relativePath, target.source)) {
          violations.push({
            code: "strict-root-physical-js",
            detail: `strict dependency closure reaches a physical legacy source: ${chain.join(" -> ")}`,
            path: root,
          });
          reported = true;
          break;
        }
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          strictClosure.add(edge.target);
          queue.push({ chain, path: edge.target });
        }
      }
    }
  }
  return strictClosure;
}

function checkStrictConfig(
  projectRoot: string,
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): void {
  if (!manifest.strictConfig) return;
  const configPath = resolve(projectRoot, manifest.strictConfig);
  if (!existsSync(configPath)) {
    violations.push({
      code: "missing-strict-config",
      detail: "declared strict frontier tsconfig does not exist",
      path: manifest.strictConfig,
    });
    return;
  }
  const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    violations.push({ code: "strict-config-mismatch", detail: "strict config must be a JSON object", path: manifest.strictConfig });
    return;
  }
  const compilerOptions = Reflect.get(parsed, "compilerOptions");
  const files = Reflect.get(parsed, "files");
  const include = Reflect.get(parsed, "include");
  const hasStrictCompilerOptions = Boolean(
    compilerOptions
    && typeof compilerOptions === "object"
    && !Array.isArray(compilerOptions)
    && Reflect.get(compilerOptions, "allowJs") === false
    && Reflect.get(compilerOptions, "checkJs") === false,
  );
  const configFiles = Array.isArray(files) && files.every((entry) => typeof entry === "string")
    ? files.map((entry) => projectRelativePath(projectRoot, resolve(dirname(configPath), entry))).sort()
    : [];
  const manifestRoots = manifest.strictRoots.map(normalizeRelativePath).sort();
  const hasEmptyInclude = Array.isArray(include) && include.length === 0;
  if (
    !hasStrictCompilerOptions
    || !hasEmptyInclude
    || JSON.stringify(configFiles) !== JSON.stringify(manifestRoots)
  ) {
    violations.push({
      code: "strict-config-mismatch",
      detail: "strict config must disable JS, use include: [], and list exactly the manifest strictRoots",
      path: manifest.strictConfig,
    });
  }
}

function isOrdinaryTest(path: string): boolean {
  return /Tests\.(?:js|ts)$/.test(path) && !/\.typeTests\.ts$/.test(path);
}

function checkTestRegistration(
  projectRoot: string,
  sources: ReadonlyMap<string, SourceFile>,
  edges: readonly ImportEdge[],
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): void {
  for (const declaration of manifest.testRunners) {
    const root = normalizeRelativePath(declaration.root).replace(/\/$/, "");
    const runner = normalizeRelativePath(declaration.runner);
    if (!sources.has(runner)) {
      violations.push({ code: "missing-test-runner", detail: "declared test runner does not exist", path: runner });
      continue;
    }
    const runnerSource = sources.get(runner);
    if (!runnerSource) continue;
    const parsedRunner = ts.createSourceFile(
      runner,
      readSourceForImports(runner, runnerSource.source),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const suiteBindings = new Map<string, Set<string>>();
    for (const statement of parsedRunner.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const resolution = resolveCodeImport(projectRoot, runnerSource.absolutePath, statement.moduleSpecifier.text);
      if (!resolution.target || !statement.importClause) continue;
      const bindings = suiteBindings.get(resolution.target) ?? new Set<string>();
      if (statement.importClause.name) bindings.add(statement.importClause.name.text);
      const namedBindings = statement.importClause.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) bindings.add(element.name.text);
      } else if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        bindings.add(namedBindings.name.text);
      }
      suiteBindings.set(resolution.target, bindings);
    }
    const callCounts = new Map<string, number>();
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        callCounts.set(name, (callCounts.get(name) ?? 0) + 1);
      }
      ts.forEachChild(node, visit);
    };
    visit(parsedRunner);
    for (const path of sources.keys()) {
      if (path === runner || !path.startsWith(`${root}/`) || !isOrdinaryTest(path)) continue;
      const bindings = suiteBindings.get(path);
      if (!bindings?.size) {
        violations.push({
          code: "unregistered-test",
          detail: `ordinary test is not imported by ${runner}`,
          path,
        });
        continue;
      }
      const invocationCount = [...bindings].reduce((count, binding) => count + (callCounts.get(binding) ?? 0), 0);
      if (invocationCount === 0) {
        violations.push({
          code: "uninvoked-test",
          detail: `ordinary test is imported but not invoked by ${runner}`,
          path,
        });
      } else if (invocationCount > 1) {
        violations.push({
          code: "duplicate-test-invocation",
          detail: `ordinary test is invoked ${invocationCount} times by ${runner}`,
          path,
        });
      }
    }
  }
}

function checkSourcePolicies(
  sources: ReadonlyMap<string, SourceFile>,
  edges: readonly ImportEdge[],
  strictClosure: ReadonlySet<string>,
  violations: MigrationViolation[],
): void {
  for (const edge of edges) {
    if (/\.(?:cts|mts|ts|tsx)(?:[?#]|$)/i.test(edge.specifier)) {
      violations.push({
        code: "forbidden-ts-specifier",
        detail: `first-party ESM imports must use emitted module identifiers: ${edge.specifier}`,
        path: edge.source,
      });
    }
  }
  for (const path of strictClosure) {
    const sourceFile = sources.get(path);
    if (!sourceFile) continue;
    const source = readSourceForImports(path, sourceFile.source);
    const forbiddenDirective = /@ts-(?:ignore|nocheck)/.test(source)
      || (!/\.typeTests\.ts$/.test(path) && /@ts-expect-error/.test(source));
    if (forbiddenDirective) {
      violations.push({
        code: "forbidden-type-directive",
        detail: "strict sources may not suppress type checking",
        path,
      });
    }
    const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let containsAny = false;
    const visit = (node: ts.Node): void => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) containsAny = true;
      if (!containsAny) ts.forEachChild(node, visit);
    };
    visit(parsed);
    if (containsAny) {
      violations.push({
        code: "forbidden-any",
        detail: "strict dependency closure contains an explicit any type",
        path,
      });
    }
  }
}

function sortViolations(violations: MigrationViolation[]): MigrationViolation[] {
  return violations.sort((left, right) => (
    left.code.localeCompare(right.code)
    || left.path.localeCompare(right.path)
    || left.detail.localeCompare(right.detail)
  ));
}

function readBaselineLegacyPaths(projectRoot: string, baselineCommit: string): string[] {
  const result = spawnSync("git", ["ls-tree", "-r", "--name-only", baselineCommit], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`Unable to read migration baseline ${baselineCommit}: ${result.stderr || result.stdout}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map(normalizeRelativePath)
    .filter((path) => LEGACY_EXTENSIONS.has(extname(path).toLowerCase()) || extname(path).toLowerCase() === ".vue");
}

export function analyzeTypeScriptMigration(
  options: AnalyzeTypeScriptMigrationOptions,
): TypeScriptMigrationAnalysis {
  const projectRoot = resolve(options.projectRoot);
  const projectPaths = collectProjectPaths(projectRoot, options.manifest);
  const sources = makeSourceFiles(projectRoot, projectPaths);
  const violations: MigrationViolation[] = [];
  const edges = makeImportGraph(projectRoot, sources, violations);
  const baselineLegacyPaths = options.baselineLegacyPaths
    ?? readBaselineLegacyPaths(projectRoot, options.manifest.baselineCommit);

  checkDirectEntries(projectRoot, projectPaths, options.manifest, violations);
  checkStrictConfig(projectRoot, options.manifest, violations);
  checkDuplicateSources(sources, violations);
  checkLegacySources(projectRoot, sources, baselineLegacyPaths, options.manifest, violations);
  const { physicalJsEdges, testRunnerEdges } = checkTsToJsEdges(sources, edges, options.manifest, violations);
  const strictClosure = checkStrictRoots(sources, edges, options.manifest, violations);
  checkSourcePolicies(sources, edges, strictClosure, violations);
  checkTestRegistration(projectRoot, sources, edges, options.manifest, violations);

  const sourceValues = [...sources.values()];
  const inventory: MigrationInventory = Object.freeze({
    codeFiles: sources.size,
    legacySources: sourceValues.filter(({ relativePath, source }) => isLegacySource(relativePath, source)).length,
    localEdges: edges.length,
    testRunnerToLegacyEdges: testRunnerEdges.length,
    tsToPhysicalJsEdges: physicalJsEdges.length - testRunnerEdges.length,
    typedSources: sourceValues.filter(({ typed }) => typed).length,
    untypedVueFiles: sourceValues.filter(({ relativePath, source }) => (
      extname(relativePath).toLowerCase() === ".vue" && !isTypedVueSource(source)
    )).length,
  });
  return Object.freeze({ inventory, violations: Object.freeze(sortViolations(violations)) });
}

function requireStringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`${path} must be an array of strings`);
  }
  return Object.freeze([...value]);
}

function readManifest(path: string): TypeScriptMigrationManifest {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("TypeScript migration manifest must be an object");
  }
  const baselineCommit = Reflect.get(parsed, "baselineCommit");
  if (typeof baselineCommit !== "string" || !baselineCommit) {
    throw new TypeError("TypeScript migration manifest baselineCommit must be a non-empty string");
  }
  const rawTestRunners = Reflect.get(parsed, "testRunners");
  if (!Array.isArray(rawTestRunners)) throw new TypeError("TypeScript migration manifest testRunners must be an array");
  const testRunners = rawTestRunners.map((value, index): MigrationTestRunner => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`testRunners[${index}] must be an object`);
    }
    const root = Reflect.get(value, "root");
    const runner = Reflect.get(value, "runner");
    if (typeof root !== "string" || typeof runner !== "string") {
      throw new TypeError(`testRunners[${index}] must contain string root and runner fields`);
    }
    return Object.freeze({ root, runner });
  });
  const strictConfig = Reflect.get(parsed, "strictConfig");
  if (strictConfig !== undefined && typeof strictConfig !== "string") {
    throw new TypeError("TypeScript migration manifest strictConfig must be a string when provided");
  }
  return Object.freeze({
    allowedTsToJsEdges: requireStringArray(Reflect.get(parsed, "allowedTsToJsEdges"), "allowedTsToJsEdges"),
    baselineCommit,
    directEntries: requireStringArray(Reflect.get(parsed, "directEntries"), "directEntries"),
    retiredSources: requireStringArray(Reflect.get(parsed, "retiredSources"), "retiredSources"),
    scanRoots: requireStringArray(Reflect.get(parsed, "scanRoots"), "scanRoots"),
    ...(typeof strictConfig === "string" ? { strictConfig } : {}),
    strictRoots: requireStringArray(Reflect.get(parsed, "strictRoots"), "strictRoots"),
    testRunners: Object.freeze(testRunners),
  });
}

function runCli(): void {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const manifestPath = resolve(projectRoot, "scripts", "typescript-migration-manifest.json");
  const manifest = readManifest(manifestPath);
  const result = analyzeTypeScriptMigration({ manifest, projectRoot });
  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      console.error(`[${violation.code}] ${violation.path}: ${violation.detail}`);
    }
    process.exitCode = 1;
    return;
  }
  const inventory = result.inventory;
  console.log(
    `TypeScript migration checks passed: ${inventory.typedSources} typed, `
    + `${inventory.legacySources} legacy, ${inventory.untypedVueFiles} untyped Vue, `
    + `${inventory.tsToPhysicalJsEdges} allowed TS->JS edges`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === resolve(fileURLToPath(import.meta.url))) runCli();
