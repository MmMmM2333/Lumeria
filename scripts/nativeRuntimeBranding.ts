import { copyFileSync, existsSync, readdirSync, renameSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { PRODUCT } from "../src/platform/product.js";
import { windowsBuildTools } from "./windowsBuildTools.js";

/** Electrobun build adapter. The final product layout is produced by native:stage. */
export function brandNativeRuntime(): void {
  if (process.env.ELECTROBUN_OS !== "win" || process.env.ELECTROBUN_ARCH !== "x64") {
    throw new Error("The current native host supports Windows x64; other platforms still need their native host adapter");
  }
  if (!process.env.ELECTROBUN_BUILD_DIR) throw new Error("Runtime branding requires the Electrobun postBuild environment");
  const project = realpathSync(process.cwd());
  const within = (path: string) => {
    const result = realpathSync(path), rel = relative(project, result);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Runtime branding output must stay inside the project");
    return result;
  };
  const build = within(resolve(process.env.ELECTROBUN_BUILD_DIR));
  const bundles = readdirSync(build, { withFileTypes: true }).filter(item => item.isDirectory())
    .map(item => join(build, item.name)).filter(path => existsSync(join(path, "Resources/app/bun/index.js")));
  if (bundles.length !== 1) throw new Error("Expected one freshly built native application");
  const bundle = within(bundles[0]!);
  const tools = windowsBuildTools(project);
  const launcher = within(join(bundle, "bin/launcher.exe"));
  copyFileSync(tools.launcher(false), launcher);
  const runtime = join(bundle, "bin/Lumeria.exe");
  if (existsSync(runtime)) throw new Error("Fresh bundle unexpectedly contains Lumeria.exe");
  renameSync(within(join(bundle, "bin/bun.exe")), runtime);
  tools.brand(runtime, PRODUCT.version); tools.brand(launcher, PRODUCT.version);
  console.log("Native runtime branded; independent product layout is available through native:stage");
}
