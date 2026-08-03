import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getBundledMessages,
  validateBundledCatalogs,
} from "../src/i18n/catalogs.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");
const sourceExtensions = new Set([".css", ".html", ".js", ".jsx", ".mjs", ".ts", ".tsx", ".vue"]);
const testFilePattern = /Tests?\.[cm]?[jt]sx?$/i;
const nonLatinTextPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
const allowedSourceText = new Map([
  ["src/domain/launchpadData.js", new Set(["卸载"])],
]);

function normalizePath(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

async function collectSourceFiles(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "fixtures" && entry.name !== "__tests__") {
        await collectSourceFiles(entryPath, output);
      }
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name)) && !testFilePattern.test(entry.name)) {
      output.push(entryPath);
    }
  }
  return output;
}

function flattenMessages(value, prefix = "", output = new Set()) {
  if (typeof value === "string") {
    output.add(prefix);
    return output;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;
  for (const [key, child] of Object.entries(value)) {
    flattenMessages(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

function collectLiteralMessageKeys(source) {
  const keys = new Set();
  const patterns = [
    /\bt\(\s*(["'])([A-Za-z0-9_.-]+)\1/g,
    /\b(?:ariaLabel|description|label|message|status|subtitle|title)Key\s*:\s*(["'])([A-Za-z0-9_.-]+)\1/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) keys.add(match[2]);
  }
  return keys;
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

async function inspectSource(files, catalogKeys) {
  const issues = [];
  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const relativePath = normalizePath(filePath);
    const allowedText = allowedSourceText.get(relativePath) || new Set();
    for (const match of source.matchAll(nonLatinTextPattern)) {
      if (!allowedText.has(match[0])) {
        issues.push(`${relativePath}:${lineNumberAt(source, match.index)} contains unlocalized text ${JSON.stringify(match[0])}`);
      }
    }
    for (const key of collectLiteralMessageKeys(source)) {
      if (!catalogKeys.has(key)) {
        issues.push(`${relativePath} references missing message key ${key}`);
      }
    }
  }
  return issues;
}

const issues = validateBundledCatalogs();
const catalogs = getBundledMessages();
const referenceMessages = Object.values(catalogs)[0];
const catalogKeys = flattenMessages(referenceMessages);
const sourceFiles = await collectSourceFiles(sourceRoot);
issues.push(...await inspectSource(sourceFiles, catalogKeys));

if (issues.length) {
  console.error(`i18n checks failed (${issues.length}):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`i18n checks passed: ${Object.keys(catalogs).length} locales, ${catalogKeys.size} messages, ${sourceFiles.length} source files`);
}
