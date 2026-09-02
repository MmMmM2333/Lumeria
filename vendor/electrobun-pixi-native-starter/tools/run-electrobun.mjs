import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const devkit = join(root, ".hutch", "devkit-dcomp-2.0.1");
const manifestPath = join(devkit, "native-devkit.json");
const nativeWrapperPath = join(devkit, "libNativeWrapper.dll");
const packageContract = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).electrobunPixiStarter;
const nativeWrapperHash = packageContract?.nativeWrapperSha256?.toUpperCase();
const mode = process.argv[2];
const args = {
	start: ["dev"],
	dev: ["dev", "--watch"],
	build: ["build", "--env=stable"],
}[mode];

if (!args) throw new Error("usage: node tools/run-electrobun.mjs <start|dev|build>");
if (!existsSync(manifestPath)) {
	throw new Error("Patched Electrobun devkit is missing; see patches/electrobun-2.0.1-dcomp-atomic-resize.md");
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (
	manifest.product?.version !== "2.0.1"
	|| manifest.target?.os !== "win"
	|| manifest.target?.arch !== "x64"
	|| !/^[0-9A-F]{64}$/.test(nativeWrapperHash ?? "")
	|| manifest.layout?.runtime?.nativeWrapper !== "libNativeWrapper.dll"
	|| !existsSync(nativeWrapperPath)
	|| createHash("sha256").update(readFileSync(nativeWrapperPath)).digest("hex").toUpperCase() !== nativeWrapperHash
) {
	throw new Error("Patched Electrobun devkit metadata is invalid");
}

const env = {
	...process.env,
	HUTCH_ELECTROBUN_DEVKIT_ROOT: devkit,
};
const run = (command, commandArgs) => {
	const result = spawnSync(command, commandArgs, { cwd: root, env, stdio: "inherit" });
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
};

if (!process.env.npm_execpath) throw new Error("Run Electrobun through an npm script");
run(process.execPath, [process.env.npm_execpath, "run", "prepare:electrobun"]);
run(process.execPath, [join(root, "node_modules", "electrobun", "bin", "electrobun.cjs"), ...args]);
