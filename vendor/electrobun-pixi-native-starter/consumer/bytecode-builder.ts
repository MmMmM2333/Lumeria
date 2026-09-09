import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [entrypoint, tsconfig, bundle, buildRoot] = process.argv.slice(2);
if (!entrypoint || !tsconfig || !bundle || !buildRoot || Bun.version !== "1.4.2") throw new Error("Invalid native bytecode build invocation");
const project = realpathSync(process.cwd()), output = join(bundle, "Resources/app/bun");
const rel = relative(realpathSync(buildRoot), realpathSync(output));
if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Bytecode output escaped the build directory");
const vendor = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const paths = JSON.parse(readFileSync(join(vendor, "consumer/tsconfig.json"), "utf8")).compilerOptions.paths;
const staging = mkdtempSync(join(output, ".bytecode-stage-"));
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
try {
  const result = await Bun.build({
    entrypoints: [entrypoint], target: "bun", format: "cjs", bytecode: true, tsconfig, outdir: staging, naming: "index.js",
    define: { "import.meta.env": "undefined", "import.meta.dir": "__nativeModuleDir", "import.meta.path": "__nativeModulePath", "import.meta.url": "__nativeModuleUrl" },
    banner: 'var __nativeModuleDir=__dirname;var __nativeModulePath=__filename;var __nativeModuleUrl=require("node:url").pathToFileURL(__filename).href;',
    plugins: [{ name: "native-sdk", setup(build) {
      build.onResolve({ filter: /^electrobun(?:\/.*)?$/ }, args => {
        const target = paths[args.path]?.[0];
        if (!target) throw new Error(`Unsupported Electrobun SDK entry: ${args.path}`);
        return { path: resolve(vendor, ".hutch/devkit-dcomp-2.0.1", target) };
      });
    } }],
  });
  if (!result.success) throw new AggregateError(result.logs, "Native bytecode build failed");
  if (result.outputs.some(item => !item)) throw new Error("Bun returned a missing bytecode output");
  const names = result.outputs.map(item => basename(item.path));
  if (new Set(names).size !== names.length || !names.includes("index.js") || !names.includes("index.js.jsc")) throw new Error("Incomplete or conflicting bytecode outputs");
  const source = readFileSync(join(staging, "index.js"), "utf8");
  if (!source.startsWith("// @bun @bytecode @bun-cjs") || /import\.meta/.test(source)) throw new Error("Unexpected bytecode module format");
  if ([project, project.replaceAll("\\", "\\\\"), project.replaceAll("\\", "/")].some(path => source.includes(path))) throw new Error("Bytecode bundle contains a build-machine source path");
  if (readFileSync(join(staging, "index.js.jsc")).length < 100) throw new Error("Bytecode output is empty");
  const files = result.outputs.map(item => {
    const name = basename(item.path), bytes = readFileSync(item.path);
    return { name, size: bytes.length, sha256: hash(bytes) };
  });
  for (const item of result.outputs) copyFileSync(item.path, join(output, basename(item.path)));
  const receipt = { schemaVersion: 1, bun: Bun.version, format: "cjs", bytecode: true, files };
  writeFileSync(join(output, "bytecode-manifest.json"), JSON.stringify(receipt, null, 2) + "\n");
  writeFileSync(join(buildRoot, "native-bytecode-build.json"), JSON.stringify(receipt, null, 2) + "\n");
  if (process.env.NATIVE_PIXI_BYTECODE_RECEIPT) writeFileSync(process.env.NATIVE_PIXI_BYTECODE_RECEIPT, JSON.stringify(receipt));
  console.log(`Native bytecode verified: ${files.length} files, Bun ${Bun.version}`);
} finally {
  if (dirname(staging) !== output) throw new Error("Unexpected bytecode staging cleanup path");
  rmSync(staging, { recursive: true, force: true });
}
