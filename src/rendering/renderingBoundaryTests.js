import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const ALLOWED_COMPOSITION_ROOT = join(SRC_DIR, "App.vue");
const PUBLIC_PORT_EXPORTS = new Map([
  ["rendering/backgroundPort.js", [
    "BackgroundEffectPreviewRenderer",
    "backgroundEffectUsesPixi",
    "resolveBackgroundEffectPreviewSizes",
    "shouldUsePixiBackgroundEffect",
  ]],
  ["rendering/desktopScenePort.js", [
    "ICON_BOUNDS_KIND",
    "ICON_BOUNDS_VARIANT",
    "appendGroupTrailPoint",
    "createIconBoundsRegistry",
    "getSingleStageDiagnosticsOptions",
    "getSingleStageRenderKey",
    "killMotionOf",
    "makeGroupTransferRuntimeEntries",
    "makeGroupTransferRuntimeReleasePlan",
    "makeIconVisualSpec",
    "motion",
    "motionSprings",
    "prefersReducedMotion",
    "resolveFolderClosingHandoffId",
    "resolveFolderPixiActivityUpdate",
    "resolveFolderSourceGhostedIds",
    "shouldClearFolderClosingHandoffRetainId",
    "stageLayoutRecordToClientRect",
  ]],
  ["rendering/diagnosticPort.js", [
    "deleteLaunchpadDebugValue",
    "readLaunchpadDebugValue",
    "setLaunchpadDebugValue",
  ]],
  ["rendering/motionLabRendererAdapter.js", ["createPixiApp", "createPixiText"]],
]);

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

function collectNamedReexports(source) {
  const names = [];
  const reexportPattern = /export\s*\{([\s\S]*?)\}\s*from\s*["'][^"']+["'];?/g;
  for (const match of source.matchAll(reexportPattern)) {
    for (const entry of match[1].split(",")) {
      const name = entry.trim().split(/\s+as\s+/).at(-1);
      if (name) names.push(name);
    }
  }
  return names.sort();
}

function assertExplicitPortExports() {
  for (const entry of readdirSync(join(SRC_DIR, "rendering"), { withFileTypes: true })) {
    if (!entry.isFile() || !/(?:Port|Adapter)\.js$/.test(entry.name)) continue;
    const relativePath = `rendering/${entry.name}`;
    const source = readFileSync(join(SRC_DIR, relativePath), "utf8");
    if (/export\s*\*/.test(source)) {
      throw new Error(`[Rendering boundary test failed] wildcard public export: ${relativePath}`);
    }
  }
  for (const [relativePath, expectedExports] of PUBLIC_PORT_EXPORTS) {
    const source = readFileSync(join(SRC_DIR, relativePath), "utf8");
    const actual = collectNamedReexports(source);
    const expected = [...expectedExports].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `[Rendering boundary test failed] unexpected public exports in ${relativePath}: ` +
        `expected ${expected.join(", ")}; received ${actual.join(", ")}`
      );
    }
  }
}

export function runRenderingBoundaryTests() {
  assertExplicitPortExports();
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
