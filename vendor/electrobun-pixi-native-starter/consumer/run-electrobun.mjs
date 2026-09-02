import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const vendorRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const consumerRoot = realpathSync(process.cwd());
const manifest = JSON.parse(readFileSync(join(vendorRoot, "starter-manifest.json"), "utf8"));
const vendorPackage = JSON.parse(readFileSync(join(vendorRoot, "package.json"), "utf8"));
const args = { start: ["dev"], dev: ["dev", "--watch"], build: ["build", "--env=stable"] }[process.argv[2]];
if (!args) throw new Error("usage: node consumer/run-electrobun.mjs <start|dev|build>");
if (manifest.schemaVersion !== 2 || manifest.starter?.name !== "electrobun-pixi-native-starter"
	|| manifest.dependencies?.electrobun !== "2.0.1" || manifest.dependencies?.pixi !== "8.20.1") {
	throw new Error("Vendored Starter manifest is incompatible");
}
for (const [name, version] of Object.entries(vendorPackage.dependencies ?? {})) {
	const packagePath = join(consumerRoot, "node_modules", ...name.split("/"), "package.json");
	if (!existsSync(packagePath) || JSON.parse(readFileSync(packagePath, "utf8")).version !== version) {
		throw new Error("Consumer dependency " + name + "@" + version + " is not installed exactly");
	}
}
const listed = new Map(manifest.files.map((entry) => [entry.path, entry]));
for (const path of [
	"src/native-host.ts",
	"consumer/tsconfig.json",
	"tools/patch-electrobun.mjs",
	".hutch/devkit-dcomp-2.0.1/native-devkit.json",
	".hutch/devkit-dcomp-2.0.1/api/sdks/main/webgpuAdapter.ts",
	".hutch/devkit-dcomp-2.0.1/libNativeWrapper.dll",
	".hutch/native-frame/native-frame.dll",
]) {
	const entry = listed.get(path);
	const file = join(vendorRoot, ...path.split("/"));
	if (!entry || !existsSync(file) || statSync(file).size !== entry.size
		|| createHash("sha256").update(readFileSync(file)).digest("hex") !== entry.sha256) {
		throw new Error("Vendored Starter file does not match its manifest: " + path);
	}
}
const env = {
	...process.env,
	HUTCH_ELECTROBUN_DEVKIT_ROOT: join(vendorRoot, ".hutch", "devkit-dcomp-2.0.1"),
	ELECTROBUN_PIXI_NATIVE_FRAME_DLL: join(vendorRoot, ".hutch", "native-frame", "native-frame.dll"),
};
const run = (command, commandArgs) => {
	const result = spawnSync(command, commandArgs, { cwd: consumerRoot, env, stdio: "inherit" });
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
};
run(process.execPath, [join(vendorRoot, "tools", "patch-electrobun.mjs"), "--consumer-root", consumerRoot]);
run(process.execPath, [join(consumerRoot, "node_modules", "electrobun", "bin", "electrobun.cjs"), ...args]);
