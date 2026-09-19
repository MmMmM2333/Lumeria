import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyDevkit, buildNativeFrame } from "../tools/native-toolchain.mjs";

const vendorRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const consumerRoot = realpathSync(process.cwd());
const vendorPackage = JSON.parse(readFileSync(join(vendorRoot, "package.json"), "utf8"));
const bytecode = process.argv[2] === "build-bytecode";
const args = { start: ["dev"], dev: ["dev", "--watch"], build: ["build", "--env=stable"], "build-bytecode": ["build", "--env=stable"] }[process.argv[2]];
if (!args) throw new Error("usage: node consumer/run-electrobun.mjs <start|dev|build|build-bytecode>");
for (const [name, version] of Object.entries(vendorPackage.dependencies ?? {})) {
	const packagePath = join(consumerRoot, "node_modules", ...name.split("/"), "package.json");
	if (!existsSync(packagePath) || JSON.parse(readFileSync(packagePath, "utf8")).version !== version) {
		throw new Error("Consumer dependency " + name + "@" + version + " is not installed exactly");
	}
}
await verifyDevkit();
buildNativeFrame();
const receiptDirectory = bytecode ? mkdtempSync(join(tmpdir(), "native-bytecode-build-")) : null;
const receiptPath = receiptDirectory ? join(receiptDirectory, "receipt.json") : "";
const env = {
	...process.env,
	NATIVE_PIXI_BYTECODE: bytecode ? "1" : "0",
	NATIVE_PIXI_BYTECODE_RECEIPT: receiptPath,
	HUTCH_ELECTROBUN_DEVKIT_ROOT: join(vendorRoot, ".hutch", "devkit-dcomp-2.0.1"),
	ELECTROBUN_PIXI_NATIVE_FRAME_DLL: join(vendorRoot, ".hutch", "native-frame", "native-frame.dll"),
};
const run = (command, commandArgs) => {
	const result = spawnSync(command, commandArgs, { cwd: consumerRoot, env, stdio: "inherit" });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`Native build command failed (${result.status})`);
};
try {
  run(process.execPath, [join(vendorRoot, "tools", "patch-electrobun.mjs"), "--consumer-root", consumerRoot, "--check"]);
  run(process.execPath, [join(consumerRoot, "node_modules", "electrobun", "bin", "electrobun.cjs"), ...args]);
  if (bytecode && !existsSync(receiptPath)) throw new Error("Bytecode mode requires buildNativeBytecode in the Electrobun postBuild hook");
} finally {
  if (receiptDirectory) rmSync(receiptDirectory, { recursive: true, force: true });
}
