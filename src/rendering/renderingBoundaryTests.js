import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const ALLOWED_COMPOSITION_ROOT = join(SRC_DIR, "App.vue");

function collectSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(path));
    else if ([".js", ".vue", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

function isTestFile(path) {
  return /(?:Tests?\.js|runLaunchpadLayoutTests\.js)$/.test(path);
}

export function runRenderingBoundaryTests() {
  const violations = [];
  for (const path of collectSourceFiles(SRC_DIR)) {
    if (path.startsWith(join(SRC_DIR, "rendering", "pixi"))) continue;
    if (path.startsWith(join(SRC_DIR, "rendering"))) continue;
    if (isTestFile(path)) continue;
    if (path === ALLOWED_COMPOSITION_ROOT) continue;
    const source = readFileSync(path, "utf8");
    if (/rendering\/pixi\//.test(source)) violations.push(relative(SRC_DIR, path));
  }
  if (violations.length > 0) {
    throw new Error(`[Rendering boundary test failed] external modules import Pixi internals: ${violations.join(", ")}`);
  }
}
