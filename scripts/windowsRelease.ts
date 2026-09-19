import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { PRODUCT } from "../src/platform/product.js";

export type ReleaseFile = Readonly<{ path: string; size: number; sha256: string }>;

export function assertReleaseOutput(project: string, output: string): string {
  const root = realpathSync(project), path = resolve(output);
  const rel = relative(root, path).split(sep).join("/");
  if (!(rel.startsWith("release/staging/") || rel.startsWith(".codex-dev/")) || rel.split("/").includes("..")) {
    throw new Error("Release staging must be a child of release/staging or .codex-dev inside the project");
  }
  let existing = path;
  while (!existsSync(existing)) existing = dirname(existing);
  const actual = relative(root, realpathSync(existing));
  if (isAbsolute(actual) || actual === ".." || actual.startsWith(".." + sep)) throw new Error("Release output escaped the project through a link");
  for (let current = existing; current !== root; current = dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw new Error("Release output must not traverse a symbolic link");
  }
  return path;
}

export function assertArchiveListing(listing: string, verboseListing: string): void {
  const entries = listing.split(/\r?\n/).filter(Boolean);
  if (!entries.length) throw new Error("Application archive is empty");
  for (const entry of entries) {
    if (!entry.startsWith(PRODUCT.name + "/") || /[\\:\x00-\x1f]/.test(entry) || entry.split("/").some(part => part === ".." || part === ".")) {
      throw new Error(`Unsafe application archive entry: ${entry}`);
    }
  }
  if (verboseListing.split(/\r?\n/).filter(Boolean).some(line => !line.startsWith("d") && !line.startsWith("-"))) {
    throw new Error("Application archive must contain only regular files and directories");
  }
}

export function releaseFiles(root: string): ReleaseFile[] {
  const files: ReleaseFile[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Release payload cannot contain symbolic links");
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        const bytes = readFileSync(path);
        files.push({ path: relative(root, path).split(sep).join("/"), size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      } else throw new Error("Release payload cannot contain special files");
    }
  };
  visit(root);
  return files;
}

export function assertReleaseFiles(root: string, expected: readonly ReleaseFile[]): void {
  const actual = releaseFiles(root);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Staged release files changed; run native:stage again");
}

export function nsisString(value: string): string {
  if (/[\r\n\x00]/.test(value)) throw new Error("NSIS values cannot contain line breaks or NUL");
  return value.replaceAll("$", () => "$$").replaceAll('"', '$\\"');
}
