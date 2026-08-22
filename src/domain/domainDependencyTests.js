import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const DOMAIN_DIR = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN_LAYER_PREFIXES = ["rendering/", "composables/", "platform/"];

function readDomainProductionFiles(directory, root = directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...readDomainProductionFiles(path, root));
      continue;
    }
    if (![".js", ".ts", ".vue"].includes(extname(entry.name))) continue;
    if (/(?:Tests|\.typeTests)\.(?:js|ts)$/.test(entry.name) || /^run.*Tests\.(?:js|ts)$/.test(entry.name)) continue;
    files.push({
      name: relative(root, path).replaceAll("\\", "/"),
      source: readFileSync(path, "utf8"),
    });
  }
  return files;
}

function sourceForImports(file) {
  if (!file.name.endsWith(".vue")) return file.source;
  return [...file.source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1] || "")
    .join("\n");
}

function isForbiddenImport(specifier) {
  if (specifier.startsWith("@tauri-apps/")) return true;
  if (!specifier.startsWith("../")) return false;
  const normalizedTarget = specifier.replace(/^(?:\.\.\/)+/, "");
  return FORBIDDEN_LAYER_PREFIXES.some((prefix) => normalizedTarget.startsWith(prefix));
}

function collectDomainDependencyViolations(directory = DOMAIN_DIR) {
  const violations = [];
  for (const file of readDomainProductionFiles(directory)) {
    const imports = ts.preProcessFile(sourceForImports(file), true, true).importedFiles;
    for (const { fileName: specifier } of imports) {
      if (isForbiddenImport(specifier)) violations.push(`${file.name} -> ${specifier}`);
    }
  }
  return violations;
}

export function runDomainDependencyTests() {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "lumeria-domain-dependency-"));
  try {
    const nestedDirectory = join(fixtureDirectory, "nested");
    mkdirSync(nestedDirectory, { recursive: true });
    writeFileSync(
      join(nestedDirectory, "violation.ts"),
      'export { motion } from "../../rendering/motionPort.js";\n',
      "utf8",
    );
    const fixtureViolations = collectDomainDependencyViolations(fixtureDirectory);
    if (fixtureViolations.length !== 1 || !fixtureViolations[0].startsWith("nested/violation.ts ->")) {
      throw new Error("[Domain dependency test failed] scanner must include nested TypeScript production modules");
    }
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
  const violations = collectDomainDependencyViolations();

  if (violations.length > 0) {
    throw new Error(`[Domain dependency test failed] domain imports rendering/platform/composable runtime code: ${violations.join(", ")}`);
  }
}
