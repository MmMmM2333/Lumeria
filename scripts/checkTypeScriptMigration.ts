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
const TYPED_TO_LEGACY_EXTENSION = new Map([
  [".cts", ".cjs"],
  [".mts", ".mjs"],
  [".ts", ".js"],
  [".tsx", ".jsx"],
]);
const LEGACY_TO_TYPED_EXTENSION = new Map(
  [...TYPED_TO_LEGACY_EXTENSION].map(([typed, legacy]) => [legacy, typed]),
);
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
const FORBIDDEN_TYPE_DIRECTIVE_PATTERN = new RegExp(`${TYPE_DIRECTIVE_PREFIX}(?:ignore|nocheck)`);
const EXPECT_ERROR_DIRECTIVE_PATTERN = new RegExp(`${TYPE_DIRECTIVE_PREFIX}expect-error`);

export type MigrationTestRunner = Readonly<{
  root: string;
  runner: string;
}>;

export type MigrationExportBaseline = Readonly<{
  types: readonly string[];
  values: readonly string[];
}>;

export type TypeScriptMigrationManifest = Readonly<{
  allowedTsToJsEdges: readonly string[];
  baselineCommit: string;
  callerBaselines: Readonly<Record<string, readonly string[]>>;
  directEntries: readonly string[];
  exportBaselines: Readonly<Record<string, MigrationExportBaseline>>;
  legacyClosure: readonly string[];
  legacyClosureRoots: readonly string[];
  retiredSources: readonly string[];
  scanRoots: readonly string[];
  strictConfigs: readonly string[];
  strictRoots: readonly string[];
  testRunners: readonly MigrationTestRunner[];
  zeroDebt: boolean;
}>;

export type MigrationViolation = Readonly<{
  code: string;
  detail: string;
  path: string;
}>;

export type MigrationInventory = Readonly<{
  codeFiles: number;
  legacyClosureSources: number;
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

export type SourceSnapshots = Readonly<{
  callerBaselines: Readonly<Record<string, readonly string[]>>;
  exportBaselines: Readonly<Record<string, MigrationExportBaseline>>;
}>;

export type RetiredReplacementSnapshots = SourceSnapshots;

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

function collectProjectPaths(
  projectRoot: string,
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): string[] {
  const paths = new Set<string>();
  for (const root of manifest.scanRoots) {
    const absoluteRoot = resolve(projectRoot, root);
    if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) {
      violations.push({
        code: "missing-scan-root",
        detail: "declared migration scan root does not exist or is not a directory",
        path: normalizeRelativePath(root),
      });
      continue;
    }
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
      if (!sources.has(resolution.target)) {
        violations.push({
          code: "untracked-local-import",
          detail: `resolved local code import is outside declared migration coverage: ${resolution.target}`,
          path: sourceFile.relativePath,
        });
        continue;
      }
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

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind));
}

function collectBindingNames(name: ts.BindingName, names: Set<string>): void {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) collectBindingNames(element.name, names);
  }
}

function collectExportSurface(sourceFile: SourceFile): Readonly<{
  types: readonly string[];
  unsupportedExportAll: boolean;
  values: readonly string[];
}> {
  const parsed = ts.createSourceFile(
    sourceFile.relativePath,
    readSourceForImports(sourceFile.relativePath, sourceFile.source),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const types = new Set<string>();
  const values = new Set<string>();
  let unsupportedExportAll = false;
  for (const statement of parsed.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause) {
        unsupportedExportAll = true;
        continue;
      }
      if (ts.isNamespaceExport(statement.exportClause)) {
        values.add(statement.exportClause.name.text);
        continue;
      }
      for (const element of statement.exportClause.elements) {
        const target = statement.isTypeOnly || element.isTypeOnly ? types : values;
        target.add(element.name.text);
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      values.add(statement.isExportEquals ? "export=" : "default");
      continue;
    }
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    const exportName = hasModifier(statement, ts.SyntaxKind.DefaultKeyword) ? "default" : null;
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      types.add(exportName ?? statement.name.text);
    } else if (ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      const name = exportName ?? statement.name?.text;
      if (name) {
        types.add(name);
        values.add(name);
      }
    } else if (ts.isFunctionDeclaration(statement)) {
      const name = exportName ?? statement.name?.text;
      if (name) values.add(name);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBindingNames(declaration.name, values);
      }
    }
  }
  return Object.freeze({
    types: Object.freeze([...types].sort()),
    unsupportedExportAll,
    values: Object.freeze([...values].sort()),
  });
}

function checkExportBaselines(
  sources: ReadonlyMap<string, SourceFile>,
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): void {
  for (const [rawPath, baseline] of Object.entries(manifest.exportBaselines)) {
    const path = normalizeRelativePath(rawPath);
    const sourceFile = sources.get(path);
    if (!sourceFile) {
      violations.push({ code: "missing-export-baseline-source", detail: "export baseline source does not exist", path });
      continue;
    }
    const actual = collectExportSurface(sourceFile);
    if (actual.unsupportedExportAll) {
      violations.push({
        code: "unsupported-export-baseline",
        detail: "export-star modules require an explicit public port before their surface can be frozen",
        path,
      });
      continue;
    }
    const expectedTypes = [...baseline.types].sort();
    const expectedValues = [...baseline.values].sort();
    if (
      JSON.stringify(actual.types) !== JSON.stringify(expectedTypes)
      || JSON.stringify(actual.values) !== JSON.stringify(expectedValues)
    ) {
      violations.push({
        code: "export-baseline-mismatch",
        detail: `expected types [${expectedTypes.join(", ")}], values [${expectedValues.join(", ")}]; actual types [${actual.types.join(", ")}], values [${actual.values.join(", ")}]`,
        path,
      });
    }
  }
}

function checkCallerBaselines(
  sources: ReadonlyMap<string, SourceFile>,
  edges: readonly ImportEdge[],
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): void {
  for (const [rawTarget, baseline] of Object.entries(manifest.callerBaselines)) {
    const target = normalizeRelativePath(rawTarget);
    if (!sources.has(target)) {
      violations.push({ code: "missing-caller-baseline-target", detail: "caller baseline target does not exist", path: target });
      continue;
    }
    const actual = [...new Set(edges.filter((edge) => edge.target === target).map((edge) => edge.source))].sort();
    const expected = [...baseline].map(normalizeRelativePath).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      violations.push({
        code: "caller-baseline-mismatch",
        detail: `expected callers [${expected.join(", ")}]; actual callers [${actual.join(", ")}]`,
        path: target,
      });
    }
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
  const retired = new Set(manifest.retiredSources.map(normalizeRelativePath));
  for (const sourceFile of sources.values()) {
    if (isLegacySource(sourceFile.relativePath, sourceFile.source) && !baseline.has(sourceFile.relativePath)) {
      violations.push({
        code: "new-legacy-source",
        detail: `legacy source did not exist at baseline ${manifest.baselineCommit}`,
        path: sourceFile.relativePath,
      });
    }
    if (!sourceFile.typed) continue;
    const extension = extname(sourceFile.relativePath).toLowerCase();
    const legacyExtension = TYPED_TO_LEGACY_EXTENSION.get(extension);
    if (!legacyExtension) continue;
    const legacyPath = `${sourceFile.relativePath.slice(0, -extension.length)}${legacyExtension}`;
    if (baseline.has(legacyPath) && !retired.has(legacyPath)) {
      violations.push({
        code: "missing-retired-source",
        detail: "same-stem baseline legacy source replaced by a typed module must be declared retired",
        path: legacyPath,
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

function collectRetiredTypedReplacements(
  projectRoot: string,
  sources: ReadonlyMap<string, SourceFile>,
  manifest: TypeScriptMigrationManifest,
): ReadonlyMap<string, string> {
  const replacements = new Map<string, string>();
  for (const rawRetiredSource of manifest.retiredSources) {
    const retiredSource = normalizeRelativePath(rawRetiredSource);
    const extension = extname(retiredSource).toLowerCase();
    const typedExtension = LEGACY_TO_TYPED_EXTENSION.get(extension);
    if (!typedExtension) continue;
    const replacement = `${retiredSource.slice(0, -extension.length)}${typedExtension}`;
    const absoluteReplacement = resolve(projectRoot, replacement);
    if (
      sources.get(replacement)?.typed
      || (existsSync(absoluteReplacement) && statSync(absoluteReplacement).isFile())
    ) {
      replacements.set(retiredSource, replacement);
    }
  }
  return new Map([...replacements].sort(([left], [right]) => left.localeCompare(right)));
}

function collectSnapshotsFromGraph(
  edges: readonly ImportEdge[],
  sources: ReadonlyMap<string, SourceFile>,
  sourcePaths: readonly string[],
): SourceSnapshots {
  const callerBaselines: Record<string, readonly string[]> = {};
  const exportBaselines: Record<string, MigrationExportBaseline> = {};
  for (const rawPath of [...new Set(sourcePaths.map(normalizeRelativePath))].sort()) {
    const sourceFile = sources.get(rawPath);
    if (!sourceFile) {
      throw new Error(`Cannot freeze ${rawPath}: source is outside the declared migration scan roots or does not exist`);
    }
    const exportSurface = collectExportSurface(sourceFile);
    if (exportSurface.unsupportedExportAll) {
      throw new Error(`Cannot freeze ${rawPath}: export-star modules require an explicit public surface`);
    }
    callerBaselines[rawPath] = Object.freeze([
      ...new Set(edges.filter((edge) => edge.target === rawPath).map((edge) => edge.source)),
    ].sort());
    exportBaselines[rawPath] = Object.freeze({
      types: Object.freeze([...exportSurface.types]),
      values: Object.freeze([...exportSurface.values]),
    });
  }
  return Object.freeze({
    callerBaselines: Object.freeze(callerBaselines),
    exportBaselines: Object.freeze(exportBaselines),
  });
}

function makeSnapshotGraph(
  projectRoot: string,
  manifest: TypeScriptMigrationManifest,
): Readonly<{ edges: readonly ImportEdge[]; sources: ReadonlyMap<string, SourceFile> }> {
  const graphViolations: MigrationViolation[] = [];
  const projectPaths = collectProjectPaths(projectRoot, manifest, graphViolations);
  const sources = makeSourceFiles(projectRoot, projectPaths);
  const edges = makeImportGraph(projectRoot, sources, graphViolations);
  if (graphViolations.length > 0) {
    const details = sortViolations(graphViolations)
      .map(({ code, detail, path }) => `[${code}] ${path}: ${detail}`)
      .join("\n");
    throw new Error(`Cannot collect source snapshots from an invalid source graph:\n${details}`);
  }
  return Object.freeze({ edges, sources });
}

export function collectSourceSnapshots(
  options: Readonly<{
    manifest: TypeScriptMigrationManifest;
    projectRoot: string;
    sourcePaths: readonly string[];
  }>,
): SourceSnapshots {
  const projectRoot = resolve(options.projectRoot);
  const { edges, sources } = makeSnapshotGraph(projectRoot, options.manifest);
  return collectSnapshotsFromGraph(edges, sources, options.sourcePaths);
}

export function collectRetiredReplacementSnapshots(
  options: Readonly<{ manifest: TypeScriptMigrationManifest; projectRoot: string }>,
): RetiredReplacementSnapshots {
  const projectRoot = resolve(options.projectRoot);
  const { edges, sources } = makeSnapshotGraph(projectRoot, options.manifest);
  return collectSnapshotsFromGraph(
    edges,
    sources,
    [...collectRetiredTypedReplacements(projectRoot, sources, options.manifest).values()],
  );
}

function checkRetiredReplacementBaselines(
  projectRoot: string,
  sources: ReadonlyMap<string, SourceFile>,
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): void {
  const exportBaselinePaths = new Set(Object.keys(manifest.exportBaselines).map(normalizeRelativePath));
  const callerBaselinePaths = new Set(Object.keys(manifest.callerBaselines).map(normalizeRelativePath));
  for (const [retiredSource, replacement] of collectRetiredTypedReplacements(projectRoot, sources, manifest)) {
    if (!exportBaselinePaths.has(replacement)) {
      violations.push({
        code: "missing-retired-replacement-export-baseline",
        detail: `typed replacement for retired source ${retiredSource} must freeze its exact export surface`,
        path: replacement,
      });
    }
    if (!callerBaselinePaths.has(replacement)) {
      violations.push({
        code: "missing-retired-replacement-caller-baseline",
        detail: `typed replacement for retired source ${retiredSource} must freeze its exact caller set`,
        path: replacement,
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
  const productionEdges = physicalJsEdges.filter((edge) => !testRunners.has(edge.source));
  const currentDescriptions = new Set(productionEdges.map((edge) => `${edge.source} -> ${edge.target}`));
  for (const edge of productionEdges) {
    const description = `${edge.source} -> ${edge.target}`;
    if (allowed.has(description)) continue;
    violations.push({
      code: "unexpected-ts-js-edge",
      detail: "typed source depends directly on a physical legacy source",
      path: description,
    });
  }
  for (const description of allowed) {
    if (currentDescriptions.has(description)) continue;
    violations.push({
      code: "stale-allowed-ts-js-edge",
      detail: "declared TS-to-JS debt edge no longer exists and must be removed from the manifest",
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

function checkLegacyClosure(
  sources: ReadonlyMap<string, SourceFile>,
  edges: readonly ImportEdge[],
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): ReadonlySet<string> {
  const adjacency = new Map<string, ImportEdge[]>();
  for (const edge of edges) {
    const outgoing = adjacency.get(edge.source) ?? [];
    outgoing.push(edge);
    adjacency.set(edge.source, outgoing);
  }
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const rawRoot of manifest.legacyClosureRoots) {
    const root = normalizeRelativePath(rawRoot);
    const sourceFile = sources.get(root);
    if (!sourceFile) {
      violations.push({ code: "missing-legacy-closure-root", detail: "declared legacy closure root does not exist", path: root });
      continue;
    }
    if (!sourceFile.typed) {
      violations.push({ code: "untyped-legacy-closure-root", detail: "legacy closure roots must be typed sources", path: root });
      continue;
    }
    if (!visited.has(root)) {
      visited.add(root);
      queue.push(root);
    }
  }
  const actual = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) continue;
    for (const edge of adjacency.get(current) ?? []) {
      const target = sources.get(edge.target);
      if (!target) continue;
      if (isLegacySource(target.relativePath, target.source)) actual.add(target.relativePath);
      if (!visited.has(target.relativePath)) {
        visited.add(target.relativePath);
        queue.push(target.relativePath);
      }
    }
  }
  const expected = new Set(manifest.legacyClosure.map(normalizeRelativePath));
  for (const path of actual) {
    if (!expected.has(path)) {
      violations.push({
        code: "unexpected-legacy-closure-source",
        detail: "typed production closure reaches an undeclared physical legacy source",
        path,
      });
    }
  }
  for (const path of expected) {
    if (!actual.has(path)) {
      violations.push({
        code: "stale-legacy-closure-source",
        detail: "declared physical legacy closure source is no longer reachable and must be removed",
        path,
      });
    }
  }
  return actual;
}

function checkZeroDebt(
  sources: ReadonlyMap<string, SourceFile>,
  baselineLegacyPaths: readonly string[],
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): void {
  if (!manifest.zeroDebt) return;
  const retiredSources = new Set(manifest.retiredSources.map(normalizeRelativePath));
  const strictRoots = new Set(manifest.strictRoots.map(normalizeRelativePath));
  for (const sourceFile of sources.values()) {
    if (isLegacySource(sourceFile.relativePath, sourceFile.source)) {
      violations.push({
        code: "zero-debt-legacy-source",
        detail: "final TypeScript mode forbids every physical JavaScript source and untyped Vue SFC",
        path: sourceFile.relativePath,
      });
    }
    if (sourceFile.typed && !strictRoots.has(sourceFile.relativePath)) {
      violations.push({
        code: "zero-debt-missing-strict-root",
        detail: "every first-party typed source must participate in the strict migration policy",
        path: sourceFile.relativePath,
      });
    }
  }
  for (const rawPath of baselineLegacyPaths) {
    const path = normalizeRelativePath(rawPath);
    if (LEGACY_EXTENSIONS.has(extname(path).toLowerCase()) && !retiredSources.has(path)) {
      violations.push({
        code: "zero-debt-unretired-baseline",
        detail: "every baseline JavaScript source must remain explicitly retired in final TypeScript mode",
        path,
      });
    }
  }
  for (const edge of manifest.allowedTsToJsEdges) {
    violations.push({
      code: "zero-debt-allowlist",
      detail: "final TypeScript mode forbids TS-to-JS compatibility allowlists",
      path: normalizeRelativePath(edge),
    });
  }
  for (const path of manifest.legacyClosure) {
    violations.push({
      code: "zero-debt-legacy-closure",
      detail: "final TypeScript mode forbids a declared physical JavaScript dependency closure",
      path: normalizeRelativePath(path),
    });
  }
}

function checkStrictConfigs(
  projectRoot: string,
  manifest: TypeScriptMigrationManifest,
  violations: MigrationViolation[],
): void {
  if (manifest.strictConfigs.length === 0) {
    if (manifest.zeroDebt) {
      violations.push({
        code: "missing-strict-config",
        detail: "final TypeScript mode must declare the strict tsconfigs that compile every strict root",
        path: "strictConfigs",
      });
    }
    return;
  }

  const compiledRoots = new Set<string>();
  const declaredConfigs = new Set<string>();
  for (const rawConfigPath of manifest.strictConfigs) {
    const relativeConfigPath = normalizeRelativePath(rawConfigPath);
    if (declaredConfigs.has(relativeConfigPath)) {
      violations.push({
        code: "strict-config-mismatch",
        detail: "strict tsconfig declarations must be unique",
        path: relativeConfigPath,
      });
      continue;
    }
    declaredConfigs.add(relativeConfigPath);
    const configPath = resolve(projectRoot, relativeConfigPath);
    if (!existsSync(configPath)) {
      violations.push({
        code: "missing-strict-config",
        detail: "declared strict tsconfig does not exist",
        path: relativeConfigPath,
      });
      continue;
    }

    const configReadResult = ts.readConfigFile(configPath, ts.sys.readFile);
    const effectiveConfig = configReadResult.error
      ? null
      : ts.parseJsonConfigFileContent(
        configReadResult.config,
        ts.sys,
        dirname(configPath),
        undefined,
        configPath,
        undefined,
        [{ extension: ".vue", isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }],
      );
    const hasStrictCompilerOptions = Boolean(
      effectiveConfig
      && effectiveConfig.errors.length === 0
      && effectiveConfig.options.allowJs !== true
      && effectiveConfig.options.checkJs !== true
      && effectiveConfig.options.strict === true
      && STRICT_OPTION_NAMES.every((name) => effectiveConfig.options[name] !== false)
    );
    if (!effectiveConfig || !hasStrictCompilerOptions) {
      violations.push({
        code: "strict-config-mismatch",
        detail: "strict tsconfig must parse successfully, enable strict mode, and keep JavaScript checking disabled",
        path: relativeConfigPath,
      });
      continue;
    }
    for (const fileName of effectiveConfig.fileNames) {
      compiledRoots.add(projectRelativePath(projectRoot, fileName));
    }
  }

  const actualRoots = [...compiledRoots].sort();
  const expectedRoots = [...new Set(manifest.strictRoots.map(normalizeRelativePath))].sort();
  if (JSON.stringify(actualRoots) !== JSON.stringify(expectedRoots)) {
    const missingRoots = expectedRoots.filter((path) => !compiledRoots.has(path));
    const unexpectedRoots = actualRoots.filter((path) => !expectedRoots.includes(path));
    violations.push({
      code: "strict-config-coverage-mismatch",
      detail: `strict tsconfig coverage must exactly match strictRoots (missing: ${missingRoots.join(", ") || "none"}; unexpected: ${unexpectedRoots.join(", ") || "none"})`,
      path: "strictConfigs",
    });
  }
}

function isOrdinaryTest(path: string): boolean {
  return /Tests\.(?:js|ts)$/.test(path) && !/\.typeTests\.ts$/.test(path);
}

function collectTestSuiteExports(sourceFile: SourceFile): ReadonlySet<string> {
  const parsed = ts.createSourceFile(
    sourceFile.relativePath,
    readSourceForImports(sourceFile.relativePath, sourceFile.source),
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
    const suiteExports = new Map<string, ReadonlySet<string>>();
    for (const [path, sourceFile] of sources) {
      if (path !== runner && path.startsWith(`${root}/`) && isOrdinaryTest(path)) {
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
    }
    const suiteBindings = new Map<string, Set<string>>();
    for (const statement of parsedRunner.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const resolution = resolveCodeImport(projectRoot, runnerSource.absolutePath, statement.moduleSpecifier.text);
      if (!resolution.target || !statement.importClause) continue;
      const exportedSuites = suiteExports.get(resolution.target);
      if (!exportedSuites?.size) continue;
      const bindings = suiteBindings.get(resolution.target) ?? new Set<string>();
      const namedBindings = statement.importClause.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (exportedSuites.has(importedName)) bindings.add(element.name.text);
        }
      }
      suiteBindings.set(resolution.target, bindings);
    }
    const callCounts = collectTopLevelCallCounts(parsedRunner);
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
    const forbiddenDirective = FORBIDDEN_TYPE_DIRECTIVE_PATTERN.test(source)
      || (!/\.typeTests\.ts$/.test(path) && EXPECT_ERROR_DIRECTIVE_PATTERN.test(source));
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
  const violations: MigrationViolation[] = [];
  const projectPaths = collectProjectPaths(projectRoot, options.manifest, violations);
  const sources = makeSourceFiles(projectRoot, projectPaths);
  const edges = makeImportGraph(projectRoot, sources, violations);
  const baselineLegacyPaths = options.baselineLegacyPaths
    ?? readBaselineLegacyPaths(projectRoot, options.manifest.baselineCommit);

  checkDirectEntries(projectRoot, projectPaths, options.manifest, violations);
  checkStrictConfigs(projectRoot, options.manifest, violations);
  checkDuplicateSources(sources, violations);
  checkLegacySources(projectRoot, sources, baselineLegacyPaths, options.manifest, violations);
  checkRetiredReplacementBaselines(projectRoot, sources, options.manifest, violations);
  checkExportBaselines(sources, options.manifest, violations);
  checkCallerBaselines(sources, edges, options.manifest, violations);
  const { physicalJsEdges, testRunnerEdges } = checkTsToJsEdges(sources, edges, options.manifest, violations);
  const strictClosure = checkStrictRoots(sources, edges, options.manifest, violations);
  const legacyClosure = checkLegacyClosure(sources, edges, options.manifest, violations);
  checkZeroDebt(sources, baselineLegacyPaths, options.manifest, violations);
  checkSourcePolicies(sources, edges, strictClosure, violations);
  checkTestRegistration(projectRoot, sources, edges, options.manifest, violations);

  const sourceValues = [...sources.values()];
  const inventory: MigrationInventory = Object.freeze({
    codeFiles: sources.size,
    legacyClosureSources: legacyClosure.size,
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

function requireStringArrayRecord(value: unknown, path: string): Readonly<Record<string, readonly string[]>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object of string arrays`);
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, entries]) => [key, requireStringArray(entries, `${path}.${key}`)]),
  ));
}

function requireExportBaselineRecord(
  value: unknown,
  path: string,
): Readonly<Record<string, MigrationExportBaseline>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object of export baselines`);
  }
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, baseline]) => {
    if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
      throw new TypeError(`${path}.${key} must be an object`);
    }
    return [key, Object.freeze({
      types: requireStringArray(Reflect.get(baseline, "types"), `${path}.${key}.types`),
      values: requireStringArray(Reflect.get(baseline, "values"), `${path}.${key}.values`),
    })];
  })));
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
  const zeroDebt = Reflect.get(parsed, "zeroDebt");
  if (typeof zeroDebt !== "boolean") {
    throw new TypeError("TypeScript migration manifest zeroDebt must be a boolean");
  }
  return Object.freeze({
    allowedTsToJsEdges: requireStringArray(Reflect.get(parsed, "allowedTsToJsEdges"), "allowedTsToJsEdges"),
    baselineCommit,
    callerBaselines: requireStringArrayRecord(Reflect.get(parsed, "callerBaselines"), "callerBaselines"),
    directEntries: requireStringArray(Reflect.get(parsed, "directEntries"), "directEntries"),
    exportBaselines: requireExportBaselineRecord(Reflect.get(parsed, "exportBaselines"), "exportBaselines"),
    legacyClosure: requireStringArray(Reflect.get(parsed, "legacyClosure"), "legacyClosure"),
    legacyClosureRoots: requireStringArray(Reflect.get(parsed, "legacyClosureRoots"), "legacyClosureRoots"),
    retiredSources: requireStringArray(Reflect.get(parsed, "retiredSources"), "retiredSources"),
    scanRoots: requireStringArray(Reflect.get(parsed, "scanRoots"), "scanRoots"),
    strictConfigs: requireStringArray(Reflect.get(parsed, "strictConfigs"), "strictConfigs"),
    strictRoots: requireStringArray(Reflect.get(parsed, "strictRoots"), "strictRoots"),
    testRunners: Object.freeze(testRunners),
    zeroDebt,
  });
}

function printSnapshotPage(snapshots: SourceSnapshots): void {
  const offsetFlagIndex = process.argv.indexOf("--snapshot-offset");
  const limitFlagIndex = process.argv.indexOf("--snapshot-limit");
  const offset = offsetFlagIndex >= 0 ? Number.parseInt(process.argv[offsetFlagIndex + 1] ?? "0", 10) : 0;
  const limit = limitFlagIndex >= 0
    ? Number.parseInt(process.argv[limitFlagIndex + 1] ?? "0", 10)
    : Number.POSITIVE_INFINITY;
  if (!Number.isSafeInteger(offset) || offset < 0 || !(Number.isSafeInteger(limit) || limit === Number.POSITIVE_INFINITY) || limit < 1) {
    throw new TypeError("snapshot offset must be non-negative and limit must be positive");
  }
  const paths = Object.keys(snapshots.exportBaselines).slice(offset, offset + limit);
  console.log(JSON.stringify({
    callerBaselines: Object.fromEntries(paths.map((path) => [path, snapshots.callerBaselines[path]])),
    exportBaselines: Object.fromEntries(paths.map((path) => [path, snapshots.exportBaselines[path]])),
  }, null, 2));
}

function runCli(): void {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const manifestPath = resolve(projectRoot, "scripts", "typescript-migration-manifest.json");
  const manifest = readManifest(manifestPath);
  if (process.argv.slice(2).includes("--print-retired-replacement-snapshots")) {
    printSnapshotPage(collectRetiredReplacementSnapshots({ manifest, projectRoot }));
    return;
  }
  if (process.argv.slice(2).includes("--print-legacy-closure-snapshots")) {
    printSnapshotPage(collectSourceSnapshots({
      manifest,
      projectRoot,
      sourcePaths: manifest.legacyClosure,
    }));
    return;
  }
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
    + `${inventory.tsToPhysicalJsEdges} allowed TS->JS edges, `
    + `${inventory.legacyClosureSources} transitive legacy closure sources`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === resolve(fileURLToPath(import.meta.url))) runCli();
