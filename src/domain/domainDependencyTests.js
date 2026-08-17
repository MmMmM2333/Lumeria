import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DOMAIN_DIR = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN_IMPORTS = [
  "../rendering/",
  "../composables/",
  "../platform/",
  "@tauri-apps/",
];

function readDomainProductionFiles() {
  return readdirSync(DOMAIN_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .filter((entry) => !entry.name.endsWith("Tests.js") && entry.name !== "runLaunchpadLayoutTests.js")
    .map((entry) => ({
      name: entry.name,
      source: readFileSync(join(DOMAIN_DIR, entry.name), "utf8"),
    }));
}

export function runDomainDependencyTests() {
  const violations = [];
  const importPattern = /(?:from\s*["']|import\s*\(\s*["'])([^"']+)["']/g;

  for (const file of readDomainProductionFiles()) {
    for (const match of file.source.matchAll(importPattern)) {
      const specifier = match[1];
      if (FORBIDDEN_IMPORTS.some((prefix) => specifier.startsWith(prefix))) {
        violations.push(`${file.name} -> ${specifier}`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(`[Domain dependency test failed] domain imports rendering/platform/composable runtime code: ${violations.join(", ")}`);
  }
}
