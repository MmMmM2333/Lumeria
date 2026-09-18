import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const diagnosticMarkers = [
  "LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR",
  "startup notice cancellation",
  "Native closing folder context menu:",
  "Native activation click:",
  "Application list memory benchmark",
  "touchpad-native-",
  "lumeria-native-product-diagnostics/v1",
  "LAUNCHPAD_LIVE_DESKTOP_PROOF",
  "LAUNCHPAD_INTERACTION_BENCH",
] as const;

export function assertNativeDiagnosticsArtifact(source: string, enabled: boolean): void {
  const shortcutRegistries=source.match(/\.symbols\.setGlobalShortcutCallback\(/g)?.length??0;
  if(shortcutRegistries!==1)throw new Error(`Native bundle must contain exactly one SDK callback registry, got ${shortcutRegistries}`);
  if (source.includes("__LUMERIA_DIAGNOSTICS__")) {
    throw new Error("Native diagnostics build flag was not resolved by the bundler");
  }
  for (const marker of diagnosticMarkers) {
    if (source.includes(marker) !== enabled) {
      throw new Error(`Native diagnostics artifact mismatch (${enabled ? "enabled" : "excluded"}): ${marker}`);
    }
  }
}

/** Fail the build before packaging if its diagnostic capability does not match. */
export function checkNativeDiagnosticsArtifact(enabled: boolean): void {
  if (!process.env.ELECTROBUN_BUILD_DIR) throw new Error("Diagnostics artifact check requires the postBuild environment");
  const project = realpathSync(process.cwd());
  const build = realpathSync(resolve(process.env.ELECTROBUN_BUILD_DIR));
  const rel = relative(project, build);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Native build output escaped the project");
  const entries = readdirSync(build, { withFileTypes: true }).filter(entry => entry.isDirectory())
    .map(entry => join(build, entry.name, "Resources/app/bun/index.js")).filter(existsSync);
  if (entries.length !== 1) throw new Error("Expected one native entry bundle for diagnostics validation");
  assertNativeDiagnosticsArtifact(readFileSync(entries[0]!, "utf8"), enabled);
  console.log(`Native diagnostics: ${enabled ? "included for development/smoke" : "excluded from production"}`);
}
