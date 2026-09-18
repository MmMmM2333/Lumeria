import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyDevkit, buildNativeFrame } from "./native-toolchain.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const devkit = join(root, ".hutch", "devkit-dcomp-2.0.1");
const mode = process.argv[2];
const args = {
	start: ["dev"],
	dev: ["dev", "--watch"],
	build: ["build", "--env=stable"],
}[mode];

if (!args) throw new Error("usage: node tools/run-electrobun.mjs <start|dev|build>");
await verifyDevkit();
buildNativeFrame();

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
