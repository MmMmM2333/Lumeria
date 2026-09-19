import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type FileEvidence = { path: string; sha256: string };
type PackageEvidence = { ecosystem: string; name: string; version: string; scope: string; license: string | null; source: string | null; texts: FileEvidence[] };
type Issue = { component: string; detail: string };
type Source = { id: string; path: string; url: string; sha256: string; offset: number; length: number };
type NativeComponent = { id: string; version: string; source: string; files: string[]; texts: string[]; pending: string[] };
type CargoPackage = { id: string; name: string; version: string; source: string | null; repository: string | null; manifest_path: string; license: string | null; license_file: string | null };
type Report = {
  schemaVersion: 1; status: "review-required" | "ready"; scopes: string[];
  inputs: FileEvidence[]; packages: PackageEvidence[]; native: NativeComponent[];
  payload: FileEvidence[]; textFiles: FileEvidence[]; issues: Issue[];
};
const hash = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const noticeName = /^(licen[cs]e|notice|copying|copyright)(?:[._-]|$)/i;
export function licenseSection(bytes: Buffer, source: Pick<Source, "id" | "offset" | "length" | "sha256">): Buffer {
  const { offset, length } = source;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length <= 0 || offset > bytes.length - length) throw new Error(`Invalid license section: ${source.id}`);
  const section = bytes.subarray(offset, offset + length);
  if (hash(section) !== source.sha256) throw new Error(`License source hash mismatch: ${source.id}`);
  return section;
}
function safeRelative(path: string): string {
  if (!path || isAbsolute(path) || /[\\:\x00-\x1f]/.test(path) || path.split("/").some(p => !p || p === "." || p === "..")) throw new Error("Invalid license evidence path");
  return path;
}
function containedFile(root: string, path: string): string {
  const target = join(root, safeRelative(path)), actual = realpathSync(target), rel = relative(realpathSync(root), actual);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || !lstatSync(actual).isFile() || lstatSync(target).isSymbolicLink()) throw new Error("License evidence escaped its root");
  return target;
}
function inventoryFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (path: string, prefix = "") => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (entry.isSymbolicLink()) throw new Error("License inventory does not follow links");
      const name = prefix + entry.name;
      if (entry.isDirectory()) visit(join(path, entry.name), name + "/");
      else if (entry.isFile()) files.push(name);
    }
  };
  visit(root); return files;
}
function textsAt(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isFile() && noticeName.test(entry.name)).map(entry => entry.name).sort();
}
export function nativeFileCovered(path: string, components: readonly NativeComponent[]): boolean {
  return components.some(component => component.files.some(pattern => pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern));
}

export function bundledNpmPaths(source: string): Set<string> {
  // Read bundler module headers, never package.json dependency strings.
  const paths = new Set<string>();
  for (const match of source.matchAll(/^\/\/ (node_modules\/[^\s]+)/gm)) {
    const parts = match[1]!.split("/"), start = parts.lastIndexOf("node_modules") + 1;
    const end = start + (parts[start]?.startsWith("@") ? 2 : 1);
    if (parts.length > end) paths.add(parts.slice(0, end).join("/"));
  }
  return paths;
}
type CargoNode = { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] };
export function nativeDataCargoPackage(
  packages: readonly Pick<CargoPackage, "id" | "name">[],
  workspaceMembers: readonly string[],
): string {
  const matches = packages.filter(pkg => pkg.name === "lumeria-native-data" && workspaceMembers.includes(pkg.id));
  if (matches.length !== 1) throw new Error("Cargo workspace must contain exactly one lumeria-native-data package");
  return matches[0]!.id;
}
export function runtimeCargoPackages(root: string, nodes: CargoNode[], macros: Set<string>): Set<string> {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const included = new Set<string>(), pending = [root];
  while (pending.length) {
    const id = pending.pop()!;
    if (included.has(id)) continue;
    included.add(id);
    for (const dependency of byId.get(id)?.deps ?? []) {
      if (dependency.dep_kinds.some(kind => kind.kind === null) && !macros.has(dependency.pkg)) pending.push(dependency.pkg);
    }
  }
  return included;
}

/** Full audits are optional local artifacts; product output is two consolidated files. */
export function generateLicenseBundle(project: string, output: string, payload?: string): Report {
  project = realpathSync(project); output = resolve(output);
  if (existsSync(output)) throw new Error("License bundle output must be a new directory");
  const relativeOutput = relative(project, output);
  if (!relativeOutput || relativeOutput.startsWith("..") || isAbsolute(relativeOutput)) throw new Error("License output must stay in project");
  if (!payload && !/^(artifacts|\.codex-dev)\//.test(relativeOutput.replaceAll("\\", "/"))) throw new Error("Full license audits belong in artifacts/ or .codex-dev/");
  let ancestor = dirname(output); while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (realpathSync(ancestor) !== ancestor) throw new Error("License output must not traverse links");
  const projectLicenseId = readJson<{ license: string }>(join(project, "package.json")).license;
  const lock = readJson<{ packages: Record<string, { version?: string; dev?: boolean; optional?: boolean; os?: string[]; cpu?: string[]; license?: string; resolved?: string }> }>(join(project, "package-lock.json"));
  const sourceIndex = readJson<{ schemaVersion: number; sources: Source[] }>(join(project, "legal/sources.json"));
  if (sourceIndex.schemaVersion !== 2) throw new Error("Unsupported license source index");
  const sources = sourceIndex.sources;
  const overrides = readJson<Record<string, string[]>>(join(project, "legal/package-overrides.json"));
  let native = readJson<{ components: NativeComponent[] }>(join(project, "legal/native-components.json")).components;
  const issues: Issue[] = [], packages: PackageEvidence[] = [];
  const payloadPaths = payload ? inventoryFiles(payload).filter(path => !path.startsWith("licenses/")) : [];
  const bundled = new Set<string>();
  if (payload) {
    for (const path of payloadPaths.filter(path => path.endsWith(".js"))) {
      for (const name of bundledNpmPaths(readFileSync(join(payload, path), "utf8"))) bundled.add(name);
    }
    if (!bundled.size) {
      issues.push({ component: "JavaScript bundle", detail: "Module headers unavailable; conservatively including the production npm graph, not claiming exact linkage" });
      for (const [path, entry] of Object.entries(lock.packages)) if (path && !entry.dev) bundled.add(path);
    }
    // These paths are copied into the product or embedded as icon geometry.
    bundled.add("node_modules/@iconify-json/fluent");
    if (payloadPaths.some(path => /skia.*\.node$/.test(path))) bundled.add("node_modules/@napi-rs/canvas-win32-x64-msvc");
    native = native.filter(component => payloadPaths.some(path => nativeFileCovered(path, [component])));
  }
  mkdirSync(output, { recursive: true });
  if (!payload) mkdirSync(join(output, "texts"));
  const collected = new Map<string, string>();
  function collectText(bytes: Buffer): FileEvidence {
    const sha256 = hash(bytes), path = `texts/${sha256}.txt`;
    collected.set(sha256, bytes.toString("utf8"));
    if (!payload && !existsSync(join(output, path))) writeFileSync(join(output, path), bytes);
    return { path, sha256 };
  }
  function copyText(source: string): FileEvidence { return collectText(readFileSync(source)); }
  const originalTexts = readFileSync(containedFile(join(project, "legal"), "THIRD_PARTY_LICENSES.txt"));
  const sourceText = new Map<string, FileEvidence>();
  function collectSource(id: string): FileEvidence {
    const cached = sourceText.get(id); if (cached) return cached;
    const source = sources.find(value => value.id === id);
    if (!source) throw new Error(`Unknown license source: ${id}`);
    if (source.path !== "THIRD_PARTY_LICENSES.txt") throw new Error(`Unexpected license source file: ${source.id}`);
    const text = collectText(licenseSection(originalTexts, source)); sourceText.set(id, text); return text;
  }
  function evidence(ecosystem: string, name: string, version: string, directory: string, licenseFile?: string | null): FileEvidence[] {
    const texts = textsAt(directory).map(path => copyText(containedFile(directory, path)));
    if (licenseFile && !isAbsolute(licenseFile) && !licenseFile.replaceAll("\\", "/").split("/").includes("..")) {
      texts.push(copyText(containedFile(directory, licenseFile.replaceAll("\\", "/"))));
    }
    for (const id of overrides[`${ecosystem}:${name}@${version}`] ?? []) {
      texts.push(collectSource(id));
    }
    return [...new Map(texts.map(text => [text.sha256, text])).values()];
  }
  for (const [path, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b, "en"))) {
    if (!path || (payload && !bundled.has(path))) continue;
    safeRelative(path);
    const directory = join(project, path);
    if (!existsSync(directory)) {
      if (!entry.optional || (payload && bundled.has(path))) issues.push({ component: path, detail: "Locked package is not installed; license not inspected" });
      continue;
    }
    const pkg = readJson<{ name: string; version: string; license?: string; repository?: string | { url: string } }>(join(directory, "package.json"));
    if (pkg.version !== entry.version) throw new Error(`Installed package differs from lock: ${path}`);
    const texts = evidence("npm", pkg.name, pkg.version, directory);
    const scope = payload ? "Native bundle/asset selection (production graph fallback if module headers are absent)" : entry.dev ? "development/build dependency (may include copied assets)" : "production dependency graph superset (Native and retained Web paths)";
    if (!texts.length) issues.push({ component: `${pkg.name}@${pkg.version}`, detail: "Package has no collected LICENSE/NOTICE text; check exact upstream source" });
    packages.push({ ecosystem: "npm", name: pkg.name, version: pkg.version, scope, license: pkg.license ?? entry.license ?? null,
      source: typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? entry.resolved ?? null, texts });
  }
  const result = spawnSync("cargo", ["metadata", "--locked", "--offline", "--format-version", "1", "--manifest-path", join(project, "Cargo.toml"), "--filter-platform", "x86_64-pc-windows-msvc"], { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Cargo license inventory failed; fetch the locked Windows dependencies first: ${result.stderr}`);
  const cargo = JSON.parse(result.stdout) as { packages: (CargoPackage & { targets: { kind: string[] }[] })[]; workspace_members: string[]; resolve: { nodes: CargoNode[] } };
  const macros=new Set(cargo.packages.filter(pkg => pkg.targets.some(target => target.kind.includes("proc-macro"))).map(pkg => pkg.id));
  const liveDesktop=cargo.packages.find(pkg=>pkg.name==="lumeria-live-desktop"&&cargo.workspace_members.includes(pkg.id));
  if(!liveDesktop)throw new Error("Cargo workspace must contain the Live Desktop runtime package");
  const runtimeIds = new Set([
    ...runtimeCargoPackages(nativeDataCargoPackage(cargo.packages, cargo.workspace_members), cargo.resolve.nodes, macros),
    ...runtimeCargoPackages(liveDesktop.id,cargo.resolve.nodes,macros),
  ]);
  for (const pkg of cargo.packages.filter(pkg => pkg.source && (!payload || runtimeIds.has(pkg.id))).sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, "en"))) {
    const texts = evidence("cargo", pkg.name, pkg.version, dirname(pkg.manifest_path), pkg.license_file);
    if (!texts.length) issues.push({ component: `${pkg.name}@${pkg.version}`, detail: "Crate has no collected LICENSE/NOTICE text; check exact upstream source" });
    packages.push({ ecosystem: "cargo", name: pkg.name, version: pkg.version, scope: payload ? "Windows runtime dependency graph; linker dead-code removal is not inferred" : "Windows Cargo resolved graph including build dependencies; not proof of final linkage", license: pkg.license,
      source: pkg.source?.startsWith("registry+") ? `https://crates.io/crates/${pkg.name}/${pkg.version}` : pkg.repository, texts });
  }
  for (const component of native) {
    for (const id of component.texts) collectSource(id);
    for (const detail of component.pending) issues.push({ component: component.id, detail });
  }
  const payloadEvidence: FileEvidence[] = [];
  if (payload) {
    for (const path of inventoryFiles(payload)) {
      if (path.startsWith("licenses/")) continue;
      payloadEvidence.push({ path, sha256: hash(readFileSync(join(payload, path))) });
      if (/\.(dll|exe|node|dat)$/i.test(path) && !nativeFileCovered(path, native)) issues.push({ component: path, detail: "Unclassified native payload file" });
    }
  }
  if (payload) {
    const projectLicense = copyText(join(project, "LICENSE"));
    const text = ["Third-party license texts", "", "Applies to the components listed in THIRD_PARTY_NOTICES.md. Each original text is included once.", "",
      ...[...collected].flatMap(([sha, content]) => [`===== ${sha} =====`, content, ""])].join("\n");
    writeFileSync(join(output, "LICENSES.txt"), text);
    const notice = ["# Third-party components in this Native build", "",
      "JavaScript entries come from bundle module headers plus copied/embedded assets (production graph fallback if headers are absent). Rust entries cover normal Windows dependencies, excluding build-only dependencies and procedural macros; unused linked-code elimination is not inferred.", "",
      "Original copyright and license texts are in LICENSES.txt, located by their SHA-256 headings. This collection is not a declaration of complete redistribution clearance.", "",
      ...packages.map(pkg => `- ${pkg.name}@${pkg.version} (${pkg.license ?? "see upstream"}) — ${pkg.source ?? "see source package"}; text: ${pkg.texts.map(text => text.sha256).join(", ") || "not collected"}`),
      "", "## Native libraries", "", ...native.flatMap(component => [
        `- ${component.id} ${component.version} — ${component.source}; text: ${component.texts.map(id => sourceText.get(id)!.sha256).join(", ") || "see upstream"}`,
      ]), "", "## Lumeria", "", `Original Lumeria source: ${projectLicenseId}; full license text: ${projectLicense.sha256}.`, "",
      readFileSync(join(project, "LICENSING.md"), "utf8"), "",
      "## Brand policy", "", readFileSync(join(project, "TRADEMARKS.md"), "utf8"), ""];
    writeFileSync(join(output, "THIRD_PARTY_NOTICES.md"), notice.join("\n"));
    return { schemaVersion: 1, status: issues.length ? "review-required" : "ready", scopes: ["Native build notice collection"], inputs: [], packages, native,
      payload: payloadEvidence, textFiles: inventoryFiles(output).map(path => ({ path, sha256: hash(readFileSync(join(output, path))) })), issues };
  }
  for (const file of ["LICENSE", "LICENSING.md", "THIRD_PARTY_NOTICES.md", "TRADEMARKS.md"]) copyFileSync(join(project, file), join(output, file));
  writeFileSync(join(output, "sources.json"), JSON.stringify({ schemaVersion: 1, sources: sources.filter(source => sourceText.has(source.id)).map(source => ({
    id: source.id, url: source.url, sha256: source.sha256, repositoryPath: `legal/${source.path}`, path: sourceText.get(source.id)!.path,
  })) }, null, 2) + "\n");
  copyFileSync(join(project, "legal/README.md"), join(output, "README.md"));
  const clean = (value: string) => value.replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
  const index = ["# Collected license texts", "", "This inventory is a dependency-graph superset. See inventory.json for scope, payload hashes and unresolved review items.", "",
    "## Packages", "", "| Package | Scope | Declared license | Collected text |", "| --- | --- | --- | --- |",
    ...packages.map(pkg => `| ${clean(`${pkg.ecosystem}:${pkg.name}@${pkg.version}`)} | ${clean(pkg.scope)} | ${clean(pkg.license ?? "not declared")} | ${pkg.texts.map((text, i) => `[text ${i + 1}](${text.path})`).join(", ") || "MISSING"} |`),
    "", "## Native components", "", ...native.flatMap(component => [
      `### ${component.id}`, "", `${component.version}; source: ${component.source}`, "",
      component.texts.map(id => `[${id}](${sourceText.get(id)!.path})`).join(", ") || "No collected text.", "",
      ...component.pending.map(item => `- Pending: ${item}`), "",
    ]), "## Outstanding review items", "", ...issues.map(issue => `- ${issue.component}: ${issue.detail}`), ""];
  writeFileSync(join(output, "INDEX.md"), index.join("\n"));
  const textFiles = inventoryFiles(output).map(path => ({ path, sha256: hash(readFileSync(join(output, path))) }));
  const inputs = ["package-lock.json", "Cargo.lock", "legal/sources.json", "legal/THIRD_PARTY_LICENSES.txt", "legal/package-overrides.json", "legal/native-components.json", "vendor/electrobun-pixi-native-starter/native-toolchain.lock.json"]
    .map(path => ({ path, sha256: hash(readFileSync(join(project, path))) }));
  const report: Report = { schemaVersion: 1, status: issues.length ? "review-required" : "ready",
    scopes: ["Installed packages from npm lock, including build/dev dependencies", "Windows Cargo graph, including build dependencies", "Explicit native component review; transitive binary coverage is not inferred from an MIT package label"],
    inputs, packages, native, payload: payloadEvidence, textFiles, issues };
  writeFileSync(join(output, "inventory.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

export function checkLicenseAudit(directory: string): Issue[] {
  const report = readJson<Report>(join(directory, "inventory.json"));
  if (report.schemaVersion !== 1 || !Array.isArray(report.issues) || !report.textFiles?.length) throw new Error("Invalid local license audit");
  for (const file of report.textFiles) if (hash(readFileSync(containedFile(directory, file.path))) !== file.sha256) throw new Error("License evidence changed after collection");
  return report.issues;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, path] = process.argv.slice(2);
  if (mode === "check" && path) {
    const issues = checkLicenseAudit(resolve(path));
    console.log(`Local audit: ${issues.length} follow-up items (advisory; does not block packaging)`);
    for (const issue of issues) console.log(`- ${issue.component}: ${issue.detail}`);
  }
  else if (mode === "generate" && path) {
    const report = generateLicenseBundle(process.cwd(), path);
    console.log(`Collected ${report.packages.length} package records; ${report.issues.length} review items; status=${report.status}`);
  } else throw new Error("Usage: thirdPartyLicenses.ts generate <new-project-directory> | check <local-audit-directory>");
}
