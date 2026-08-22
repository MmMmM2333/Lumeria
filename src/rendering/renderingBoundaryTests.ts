import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const ALLOWED_COMPOSITION_ROOT = join(SRC_DIR, "App.vue");
const PUBLIC_PORT_EXPORTS = new Map<string, readonly string[]>([
  ["rendering/backgroundPort.ts", [
    "BackgroundEffectPreviewRenderer",
    "backgroundEffectUsesPixi",
    "resolveBackgroundEffectPreviewSizes",
    "shouldUsePixiBackgroundEffect",
  ]],
  ["rendering/desktopScenePort.ts", [
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
  ["rendering/diagnosticPort.ts", [
    "deleteLaunchpadDebugValue",
    "readLaunchpadDebugValue",
    "setLaunchpadDebugValue",
  ]],
  ["rendering/motionLabRendererAdapter.ts", ["createPixiApp", "createPixiText"]],
]);

function collectSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(filePath));
    else if ([".js", ".ts", ".vue", ".mjs"].includes(extname(entry.name))) files.push(filePath);
  }
  return files;
}

function isTestFile(filePath: string): boolean {
  return /(?:Tests?\.(?:js|ts)|runLaunchpadLayoutTests\.(?:js|ts))$/.test(filePath);
}

function collectPublicValueExports(source: string): string[] {
  const names: string[] = [];
  const reexportPattern = /export\s*\{([\s\S]*?)\}\s*from\s*["'][^"']+["'];?/g;
  for (const match of source.matchAll(reexportPattern)) {
    const exportList = match[1];
    if (!exportList) continue;
    for (const entry of exportList.split(",")) {
      const name = entry.trim().split(/\s+as\s+/).at(-1);
      if (name) names.push(name);
    }
  }
  const directExportPattern = /export\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(directExportPattern)) {
    const name = match[1];
    if (name) names.push(name);
  }
  return [...new Set(names)].sort();
}

function assertExplicitPortExports(): void {
  for (const entry of readdirSync(join(SRC_DIR, "rendering"), { withFileTypes: true })) {
    if (!entry.isFile() || !/(?:Port|Adapter)\.(?:js|ts)$/.test(entry.name)) continue;
    const relativePath = `rendering/${entry.name}`;
    const source = readFileSync(join(SRC_DIR, relativePath), "utf8");
    if (/export\s*\*/.test(source)) {
      throw new Error(`[Rendering boundary test failed] wildcard public export: ${relativePath}`);
    }
  }
  for (const [relativePath, expectedExports] of PUBLIC_PORT_EXPORTS) {
    if (relativePath.endsWith(".ts")) {
      const legacyPath = join(SRC_DIR, relativePath.replace(/\.ts$/, ".js"));
      if (existsSync(legacyPath)) {
        throw new Error(`[Rendering boundary test failed] duplicate legacy port implementation: ${legacyPath}`);
      }
    }
    const source = readFileSync(join(SRC_DIR, relativePath), "utf8");
    const actual = collectPublicValueExports(source);
    const expected = [...expectedExports].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `[Rendering boundary test failed] unexpected public exports in ${relativePath}: ` +
        `expected ${expected.join(", ")}; received ${actual.join(", ")}`
      );
    }
  }
}

export function runRenderingBoundaryTests(): void {
  assertExplicitPortExports();
  const violations: string[] = [];
  for (const filePath of collectSourceFiles(SRC_DIR)) {
    if (filePath.startsWith(join(SRC_DIR, "rendering", "pixi"))) continue;
    if (filePath.startsWith(join(SRC_DIR, "rendering"))) continue;
    if (isTestFile(filePath)) continue;
    if (filePath === ALLOWED_COMPOSITION_ROOT) continue;
    const source = readFileSync(filePath, "utf8");
    if (/rendering\/pixi\//.test(source)) violations.push(relative(SRC_DIR, filePath));
  }
  if (violations.length > 0) {
    throw new Error(`[Rendering boundary test failed] external modules import Pixi internals: ${violations.join(", ")}`);
  }
}
