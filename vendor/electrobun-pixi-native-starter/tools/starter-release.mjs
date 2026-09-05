import { createHash } from "node:crypto";
import {
	closeSync,
	copyFileSync,
	cpSync,
	createReadStream,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = join(root, "package.json");
const devkit = join(root, ".hutch", "devkit-dcomp-2.0.1");
const nativeFrame = join(root, ".hutch", "native-frame", "native-frame.dll");
const nativeFrameSource = join(root, "src", "platform", "native-frame.rs");
const nativeWrapper = join(devkit, "libNativeWrapper.dll");
const host = join(root, "src", "platform", "native-frame-host.ts");
const smoke = join(root, "starter-consumer-smoke", "smoke.mjs");
const NATIVE_WRAPPER_SHA256 = "59ceec977f5922fe4d0904c325057d590897d38d0268ba9f0a81beeae01c6730";
const ROOT_FILES = [
	".gitignore", "README.md", "package.json", "package-lock.json", "electrobun.config.ts", "tsconfig.json",
];
const SOURCE_DIRECTORIES = ["src", "tools", "assets", "patches", "consumer", "starter-consumer-smoke"];

const CAPABILITIES = [
	[0, "multi-bundle"],
	[1, "surface-status-v2"],
	[2, "window-input"],
	[3, "text-input"],
	[4, "jobs"],
	[5, "accessibility-bridge"],
	[6, "uia-provider"],
	[7, "platform-files"],
	[8, "window-snapshot"],
	[9, "input-diagnostics"],
	[10, "input-wake"],
	[11, "lifecycle-events"],
	[12, "touch-input"],
];

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const posix = (path) => path.split(sep).join("/");

const run = (command, args, options = {}) => {
	const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(result.stderr?.trim() || `${command} exited ${result.status}`);
	return result.stdout?.trim() ?? "";
};

const sourceState = () => {
	try {
		if (resolve(run("git", ["rev-parse", "--show-toplevel"])).toLowerCase() !== realpathSync(root).toLowerCase()) {
			throw new Error("Starter root is not the current Git worktree root");
		}
		const commit = run("git", ["rev-parse", "HEAD"]);
		const sourceDateEpoch = Number(run("git", ["show", "-s", "--format=%ct", commit]));
		if (!/^[0-9a-f]{40}$/.test(commit) || !Number.isSafeInteger(sourceDateEpoch) || sourceDateEpoch <= 0) {
			throw new Error("invalid Git source metadata");
		}
		return {
			commit,
			dirty: run("git", ["status", "--porcelain=v1", "--untracked-files=all"]).length !== 0,
			sourceDateEpoch,
		};
	} catch (error) {
		const embedded = join(root, "starter-manifest.json");
		if (!existsSync(embedded)) throw error;
		const source = readJson(embedded).source;
		if (!/^[0-9a-f]{40}$/.test(source?.commit ?? "") || typeof source?.dirty !== "boolean"
			|| !Number.isSafeInteger(source?.sourceDateEpoch) || source.sourceDateEpoch <= 0) throw error;
		return source;
	}
};

const readHostContract = () => {
	const source = readFileSync(host, "utf8");
	const abi = source.match(/const ABI_VERSION = (\d+);/);
	const required = source.match(/const REQUIRED_CAPABILITIES = ([\s\S]*?);/);
	const bits = new Map([...source.matchAll(/const (CAP_[A-Z0-9_]+) = 1n << (\d+)n;/g)]
		.map((match) => [match[1], BigInt(match[2])]));
	if (!abi || !required) throw new Error("TypeScript host ABI contract is missing");
	let requiredMask = 0n;
	for (const name of required[1].match(/CAP_[A-Z0-9_]+/g) ?? []) {
		if (!bits.has(name)) throw new Error(`TypeScript host capability is undefined: ${name}`);
		requiredMask |= 1n << bits.get(name);
	}
	return { abiVersion: Number(abi[1]), requiredMask };
};

const walk = (directory) => {
	const result = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isSymbolicLink()) throw new Error(`release payload cannot contain a symlink: ${path}`);
		if (entry.isDirectory()) result.push(...walk(path));
		else if (entry.isFile()) result.push(path);
	}
	return result;
};

const sha256 = (path) => new Promise((accept, reject) => {
	const hash = createHash("sha256");
	createReadStream(path).on("data", (chunk) => hash.update(chunk)).on("error", reject)
		.on("end", () => accept(hash.digest("hex")));
});

const peMachine = (path) => {
	const file = openSync(path, "r");
	try {
		const dos = Buffer.alloc(64);
		if (readSync(file, dos, 0, dos.length, 0) !== dos.length || dos.readUInt16LE(0) !== 0x5a4d) {
			throw new Error(`not a PE binary: ${path}`);
		}
		const pe = Buffer.alloc(6);
		if (readSync(file, pe, 0, pe.length, dos.readUInt32LE(0x3c)) !== pe.length || pe.readUInt32LE(0) !== 0x00004550) {
			throw new Error(`invalid PE header: ${path}`);
		}
		return pe.readUInt16LE(4);
	} finally {
		closeSync(file);
	}
};

const probeNativeFrame = (dll) => {
	if (process.platform !== "win32" || process.arch !== "x64") {
		throw new Error(`this release can only be generated on win32/x64, got ${process.platform}/${process.arch}`);
	}
	const directory = mkdtempSync(join(realpathSync(tmpdir()), "electrobun-pixi-ffi-"));
	const script = join(directory, "probe.ps1");
	writeFileSync(script, String.raw`
param([string]$Dll)
$source = @'
using System;
using System.Runtime.InteropServices;
public static class NativeProbe {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr LoadLibraryW(string path);
    [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
    public static extern IntPtr GetProcAddress(IntPtr module, string name);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate UInt32 U32Fn();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate UInt64 U64Fn();
}
'@
Add-Type -TypeDefinition $source
$module = [NativeProbe]::LoadLibraryW($Dll)
if ($module -eq [IntPtr]::Zero) { throw "LoadLibraryW failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
$abiAddress = [NativeProbe]::GetProcAddress($module, "pixi_host_abi_version")
$capAddress = [NativeProbe]::GetProcAddress($module, "pixi_host_capabilities")
if ($abiAddress -eq [IntPtr]::Zero -or $capAddress -eq [IntPtr]::Zero) { throw "native-frame ABI exports are missing" }
$abi = [Runtime.InteropServices.Marshal]::GetDelegateForFunctionPointer($abiAddress, [NativeProbe+U32Fn]).Invoke()
$capabilities = [Runtime.InteropServices.Marshal]::GetDelegateForFunctionPointer($capAddress, [NativeProbe+U64Fn]).Invoke()
@{ abiVersion = [UInt32]$abi; capabilities = ([UInt64]$capabilities).ToString() } | ConvertTo-Json -Compress
`);
	try {
		const result = spawnSync("powershell.exe", [
			"-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, dll,
		], { encoding: "utf8" });
		if (result.error) throw result.error;
		if (result.status !== 0) throw new Error(result.stderr.trim() || `native-frame probe exited ${result.status}`);
		return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
	} finally {
		if (dirname(directory).toLowerCase() !== realpathSync(tmpdir()).toLowerCase()) {
			throw new Error(`refusing to clean unexpected temporary path: ${directory}`);
		}
		rmSync(directory, { recursive: true, force: true });
	}
};

const buildNativeFrame = (sourceDateEpoch) => {
	if (!existsSync(nativeFrameSource)) throw new Error(`native-frame source is missing: ${nativeFrameSource}`);
	const directory = mkdtempSync(join(realpathSync(tmpdir()), "electrobun-pixi-native-frame-"));
	const output = join(directory, "native-frame.dll");
	try {
		const result = spawnSync("rustc", [
			"--crate-type", "cdylib", nativeFrameSource,
			"-C", "opt-level=3", "-C", "link-arg=/Brepro", "-o", output,
		], { cwd: root, stdio: "inherit", env: { ...process.env, SOURCE_DATE_EPOCH: String(sourceDateEpoch) } });
		if (result.error) throw result.error;
		if (result.status !== 0 || !existsSync(output)) throw new Error("native-frame release build failed");
		mkdirSync(dirname(nativeFrame), { recursive: true });
		copyFileSync(output, nativeFrame);
	} finally {
		if (dirname(directory).toLowerCase() !== realpathSync(tmpdir()).toLowerCase()) {
			throw new Error(`refusing to clean unexpected temporary path: ${directory}`);
		}
		rmSync(directory, { recursive: true, force: true });
	}
};

const sourcePayload = () => {
	const entries = [];
	const add = (source, path, role) => {
		if (!existsSync(source)) throw new Error(`release input is missing: ${source}`);
		entries.push({ source, path: posix(path), role });
	};
	for (const path of ROOT_FILES) add(join(root, path), path, path.endsWith(".md") ? "documentation" : "starter-config");
	for (const directory of SOURCE_DIRECTORIES) {
		const directoryRoot = join(root, directory);
		if (!existsSync(directoryRoot)) throw new Error(`release source directory is missing: ${directoryRoot}`);
		for (const source of walk(directoryRoot)) {
			add(source, relative(root, source), directory === "assets" ? "demo-asset"
				: directory === "patches" ? "electrobun-patch"
					: directory === "tools" ? "starter-tool"
						: directory === "consumer" ? "consumer-integration"
						: directory === "starter-consumer-smoke" ? "consumer-smoke" : "starter-source");
		}
	}
	for (const source of walk(devkit)) {
		add(source, relative(root, source), source === nativeWrapper ? "electrobun-native-wrapper" : "electrobun-devkit");
	}
	add(nativeFrame, relative(root, nativeFrame), "native-frame-runtime");
	return entries.sort((a, b) => a.path.localeCompare(b.path, "en"));
};

const makeManifest = async () => {
	const source = sourceState();
	buildNativeFrame(source.sourceDateEpoch);
	for (const path of [packageJsonPath, join(devkit, "native-devkit.json"), nativeFrame, host, smoke]) {
		if (!existsSync(path)) throw new Error(`release input is missing: ${path}`);
	}
	const pkg = readJson(packageJsonPath);
	const devkitManifest = readJson(join(devkit, "native-devkit.json"));
	const electrobunVersion = pkg.dependencies?.electrobun;
	const pixiVersion = pkg.dependencies?.["pixi.js"];
	const nativeWrapperSha256 = pkg.electrobunPixiStarter?.nativeWrapperSha256;
	if (!/^\d+\.\d+\.\d+$/.test(pkg.version) || !/^\d+\.\d+\.\d+$/.test(electrobunVersion)
		|| !/^\d+\.\d+\.\d+$/.test(pixiVersion)) {
		throw new Error("starter, Electrobun and Pixi versions must be exact semver values");
	}
	if (devkitManifest.product?.version !== electrobunVersion || devkitManifest.target?.os !== "win"
		|| devkitManifest.target?.arch !== "x64" || devkitManifest.abi?.core?.name !== "electrobun-core"
		|| devkitManifest.abi?.core?.version !== 1 || devkitManifest.abi?.sdk?.name !== "electrobun-sdk"
		|| devkitManifest.abi?.sdk?.version !== 1) {
		throw new Error("patched Electrobun devkit version or target does not match package.json");
	}
	if (nativeWrapperSha256 !== NATIVE_WRAPPER_SHA256 || await sha256(nativeWrapper) !== NATIVE_WRAPPER_SHA256) {
		throw new Error("patched Electrobun native wrapper does not match the Starter contract");
	}
	const probe = probeNativeFrame(nativeFrame);
	const capabilityMask = BigInt(probe.capabilities);
	const hostContract = readHostContract();
	if (probe.abiVersion !== hostContract.abiVersion
		|| (capabilityMask & hostContract.requiredMask) !== hostContract.requiredMask) {
		throw new Error("native-frame DLL does not satisfy the TypeScript host ABI contract");
	}
	const capabilityNames = CAPABILITIES.filter(([bit]) => capabilityMask & (1n << BigInt(bit))).map(([, name]) => name);
	const knownMask = CAPABILITIES.reduce((mask, [bit]) => mask | (1n << BigInt(bit)), 0n);
	const unknownMask = capabilityMask & ~knownMask;
	for (let bit = 0n, remaining = unknownMask; remaining !== 0n; bit++, remaining >>= 1n) {
		if (remaining & 1n) capabilityNames.push(`unknown-bit-${bit}`);
	}
	const entries = sourcePayload();
	for (const { source } of entries) {
		if (/\.(?:dll|exe)$/i.test(source) && peMachine(source) !== 0x8664) {
			throw new Error(`release contains a non-x64 PE binary: ${source}`);
		}
	}
	const files = [];
	for (const entry of entries) {
		files.push({ path: entry.path, role: entry.role, size: statSync(entry.source).size, sha256: await sha256(entry.source) });
	}
	return {
		schemaVersion: 2,
		starter: { name: "electrobun-pixi-native-starter", version: pkg.version },
		product: { name: pkg.name, version: pkg.version },
		target: { platform: "win32", arch: "x64", minimumWindows: "10.0.19041" },
		source,
		build: {
			commit: source.commit,
			sourceDateEpoch: source.sourceDateEpoch,
			timestamp: new Date(source.sourceDateEpoch * 1000).toISOString(),
		},
		dependencies: { electrobun: electrobunVersion, pixi: pixiVersion },
		native: {
			electrobun: {
				coreAbi: devkitManifest.abi?.core,
				sdkAbi: devkitManifest.abi?.sdk,
				nativeWrapperSha256,
			},
			nativeFrame: {
				abiVersion: probe.abiVersion,
				sourceSha256: await sha256(nativeFrameSource),
				capabilities: {
					mask: `0x${capabilityMask.toString(16).padStart(16, "0")}`,
					requiredMask: `0x${hostContract.requiredMask.toString(16).padStart(16, "0")}`,
					unknownMask: `0x${unknownMask.toString(16).padStart(16, "0")}`,
					names: capabilityNames,
				},
			},
		},
		entrypoints: {
			publicApi: "src/native-host.ts",
			demo: "src/main.ts",
			config: "electrobun.config.ts",
			devkitManifest: ".hutch/devkit-dcomp-2.0.1/native-devkit.json",
			nativeWrapper: ".hutch/devkit-dcomp-2.0.1/libNativeWrapper.dll",
			nativeFrame: ".hutch/native-frame/native-frame.dll",
			typescriptHost: "src/platform/native-frame-host.ts",
			consumerRunner: "consumer/run-electrobun.mjs",
			consumerConfig: "consumer/electrobun.ts",
			consumerTsconfig: "consumer/tsconfig.json",
			consumerSmoke: "starter-consumer-smoke/smoke.mjs",
		},
		files,
	};
};

const manifestText = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;
const manifestName = (manifest) => `${manifest.starter.name}-${manifest.starter.version}-win-x64.manifest.json`;
const packageName = (manifest) => `${manifest.starter.name}-${manifest.starter.version}-win-x64`;

const generate = async () => {
	const manifest = await makeManifest();
	const destination = join(root, "artifacts", manifestName(manifest));
	mkdirSync(dirname(destination), { recursive: true });
	writeFileSync(destination, manifestText(manifest));
	console.log(`generated ${destination} (${manifest.files.length} payload files)`);
	return manifest;
};

const runConsumerSmoke = (packageDirectory, mode = "validate", smokePath = smoke, cwd = root) => {
	const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "NODE_PATH"));
	if (mode === "app") env.ELECTROBUN_PIXI_FORBIDDEN_SOURCE_ROOT = root;
	const result = spawnSync(process.execPath, [smokePath, mode, packageDirectory], {
		cwd,
		stdio: "inherit",
		env,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`consumer smoke exited ${result.status}`);
};

const materializeRelease = (manifest, output) => {
	if (existsSync(output)) throw new Error(`refusing to overwrite existing release directory: ${output}`);
	mkdirSync(output, { recursive: true });
	for (const entry of sourcePayload()) {
		const destination = join(output, ...entry.path.split("/"));
		mkdirSync(dirname(destination), { recursive: true });
		copyFileSync(entry.source, destination);
	}
	writeFileSync(join(output, "starter-manifest.json"), manifestText(manifest));
};

const packageRelease = async (destination) => {
	const manifest = await makeManifest();
	if (manifest.source.dirty) throw new Error("refusing to package a dirty Git worktree; commit the Starter sources first");
	const output = resolve(destination ?? join(root, "artifacts", packageName(manifest)));
	mkdirSync(dirname(output), { recursive: true });
	materializeRelease(manifest, output);
	runConsumerSmoke(output, "validate", join(output, "starter-consumer-smoke", "smoke.mjs"), dirname(output));
	console.log(`packaged ${output}`);
	return output;
};

const matchesInstalledDevkit = async (destination, manifest) => {
	const prefix = ".hutch/devkit-dcomp-2.0.1/";
	const expected = manifest.files.filter(({ path }) => path.startsWith(prefix));
	const actual = walk(destination).map((path) => posix(relative(destination, path))).sort((a, b) => a.localeCompare(b, "en"));
	const listed = expected.map(({ path }) => path.slice(prefix.length)).sort((a, b) => a.localeCompare(b, "en"));
	if (JSON.stringify(actual) !== JSON.stringify(listed)) return false;
	for (const entry of expected) {
		const path = join(destination, ...entry.path.slice(prefix.length).split("/"));
		if (statSync(path).size !== entry.size || await sha256(path) !== entry.sha256) return false;
	}
	return true;
};

const install = async (releaseDirectory) => {
	if (!releaseDirectory) throw new Error("usage: node tools/starter-release.mjs install <release-directory>");
	const release = resolve(releaseDirectory);
	runConsumerSmoke(release, "validate", join(release, "starter-consumer-smoke", "smoke.mjs"), dirname(release));
	const manifest = readJson(join(release, "starter-manifest.json"));
	const hostEntry = manifest.files.find(({ path }) => path === "src/platform/native-frame-host.ts");
	const dllEntry = manifest.files.find(({ path }) => path === ".hutch/native-frame/native-frame.dll");
	if (!hostEntry || !dllEntry || await sha256(host) !== hostEntry.sha256) {
		throw new Error("repository TypeScript host does not match the verified release ABI contract");
	}
	const devkitDestination = join(root, ".hutch", `devkit-dcomp-${manifest.dependencies.electrobun}`);
	const dllDestination = join(root, ".hutch", "native-frame", "native-frame.dll");
	if (existsSync(devkitDestination) && !await matchesInstalledDevkit(devkitDestination, manifest)) {
		throw new Error(`refusing to overwrite a different devkit: ${devkitDestination}`);
	}
	if (existsSync(dllDestination) && (statSync(dllDestination).size !== dllEntry.size
		|| await sha256(dllDestination) !== dllEntry.sha256)) {
		throw new Error(`refusing to overwrite a different native-frame DLL: ${dllDestination}`);
	}
	mkdirSync(join(root, ".hutch"), { recursive: true });
	mkdirSync(dirname(dllDestination), { recursive: true });
	const devkitStaging = `${devkitDestination}.install-${process.pid}`;
	const dllStaging = `${dllDestination}.install-${process.pid}`;
	if (existsSync(devkitStaging) || existsSync(dllStaging)) throw new Error("refusing to overwrite an existing install staging path");
	try {
		if (!existsSync(devkitDestination)) {
			cpSync(join(release, ".hutch", "devkit-dcomp-2.0.1"), devkitStaging, { recursive: true, errorOnExist: true, force: false });
			if (!await matchesInstalledDevkit(devkitStaging, manifest)) throw new Error("installed devkit verification failed");
			renameSync(devkitStaging, devkitDestination);
		}
		if (!existsSync(dllDestination)) {
			cpSync(join(release, ".hutch", "native-frame", "native-frame.dll"), dllStaging, { errorOnExist: true, force: false });
			if (statSync(dllStaging).size !== dllEntry.size || await sha256(dllStaging) !== dllEntry.sha256) {
				throw new Error("installed native-frame DLL verification failed");
			}
			renameSync(dllStaging, dllDestination);
		}
	} catch (error) {
		if (existsSync(devkitStaging) && dirname(devkitStaging) === join(root, ".hutch")) rmSync(devkitStaging, { recursive: true, force: true });
		if (existsSync(dllStaging) && dirname(dllStaging) === dirname(dllDestination)) rmSync(dllStaging, { force: true });
		throw error;
	}
	console.log(`installed or verified devkit and native-frame DLL for ${manifest.starter.name}@${manifest.starter.version}`);
};

const containsPath = (parent, candidate) => {
	const path = relative(parent, candidate);
	return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(".." + sep));
};

const installConsumerRelease = async (release, consumerDirectory) => {
	const consumer = realpathSync(resolve(consumerDirectory));
	const releaseRoot = realpathSync(release);
	if (containsPath(releaseRoot, consumer) || containsPath(consumer, releaseRoot)) {
		throw new Error("release and consumer directories must not contain each other");
	}
	runConsumerSmoke(releaseRoot, "validate", join(releaseRoot, "starter-consumer-smoke", "smoke.mjs"), dirname(releaseRoot));
	const releasePackage = readJson(join(releaseRoot, "package.json"));
	const consumerPackagePath = join(consumer, "package.json");
	if (!existsSync(consumerPackagePath)) throw new Error("consumer package.json is missing: " + consumerPackagePath);
	const consumerPackage = readJson(consumerPackagePath);
	for (const [name, version] of Object.entries(releasePackage.dependencies ?? {})) {
		const declared = consumerPackage.dependencies?.[name] ?? consumerPackage.devDependencies?.[name];
		const installed = join(consumer, "node_modules", ...name.split("/"), "package.json");
		if (declared !== version || !existsSync(installed) || readJson(installed).version !== version) {
			throw new Error("consumer must declare and install exact dependency " + name + "@" + version);
		}
	}
	const destination = join(consumer, "vendor", "electrobun-pixi-native-starter");
	const sourceManifest = readFileSync(join(releaseRoot, "starter-manifest.json"), "utf8");
	if (existsSync(destination)) {
		const installedManifest = join(destination, "starter-manifest.json");
		if (!existsSync(installedManifest) || readFileSync(installedManifest, "utf8") !== sourceManifest) {
			throw new Error("refusing to overwrite a different vendored Starter: " + destination);
		}
		runConsumerSmoke(destination, "validate", join(destination, "starter-consumer-smoke", "smoke.mjs"), dirname(destination));
		console.log("consumer already has the verified Starter release at " + destination);
		return destination;
	}
	const parent = dirname(destination);
	const staging = destination + ".install-" + process.pid;
	mkdirSync(parent, { recursive: true });
	if (existsSync(staging)) throw new Error("refusing to overwrite existing consumer install staging path");
	try {
		cpSync(releaseRoot, staging, { recursive: true, errorOnExist: true, force: false });
		runConsumerSmoke(staging, "validate", join(staging, "starter-consumer-smoke", "smoke.mjs"), dirname(staging));
		renameSync(staging, destination);
	} catch (error) {
		if (existsSync(staging) && dirname(staging) === parent) rmSync(staging, { recursive: true, force: true });
		throw error;
	}
	console.log("installed verified Starter release into " + destination);
	return destination;
};

const installConsumer = async (consumerDirectory) => {
	if (!consumerDirectory) throw new Error("usage: node tools/starter-release.mjs install-consumer <consumer-directory>");
	if (existsSync(join(root, "starter-manifest.json"))) return installConsumerRelease(root, consumerDirectory);
	const temporaryRoot = mkdtempSync(join(realpathSync(tmpdir()), "electrobun-pixi-install-consumer-"));
	try {
		const manifest = await makeManifest();
		if (manifest.source.dirty) throw new Error("refusing to install a dirty Starter worktree; commit it first");
		const release = join(temporaryRoot, "release");
		materializeRelease(manifest, release);
		return await installConsumerRelease(release, consumerDirectory);
	} finally {
		if (dirname(temporaryRoot).toLowerCase() !== realpathSync(tmpdir()).toLowerCase()) {
			throw new Error("refusing to clean unexpected temporary path: " + temporaryRoot);
		}
		rmSync(temporaryRoot, { recursive: true, force: true });
	}
};

const verify = async (target) => {
	if (target && lstatSync(resolve(target)).isDirectory()) {
		const release = resolve(target);
		runConsumerSmoke(release, "validate", join(release, "starter-consumer-smoke", "smoke.mjs"), dirname(release));
		return;
	}
	const actual = await makeManifest();
	const path = resolve(target ?? join(root, "artifacts", manifestName(actual)));
	if (!existsSync(path)) throw new Error(`manifest is missing: ${path}`);
	const expected = readFileSync(path, "utf8");
	if (expected !== manifestText(actual)) throw new Error(`release manifest is stale or does not match its payload: ${path}`);
	console.log(`verified ${path}`);
};

const consumerSmoke = async () => {
	const temporaryRoot = mkdtempSync(join(realpathSync(tmpdir()), "electrobun-pixi-consumer-"));
	try {
		const manifest = await makeManifest();
		const output = join(temporaryRoot, "release");
		materializeRelease(manifest, output);
		runConsumerSmoke(output, "app", join(output, "starter-consumer-smoke", "smoke.mjs"), temporaryRoot);
	} finally {
		if (dirname(temporaryRoot).toLowerCase() !== realpathSync(tmpdir()).toLowerCase()) {
			throw new Error(`refusing to clean unexpected temporary path: ${temporaryRoot}`);
		}
		rmSync(temporaryRoot, { recursive: true, force: true });
	}
};

const [command, argument] = process.argv.slice(2);
switch (command) {
	case "generate": await generate(); break;
	case "verify": await verify(argument); break;
	case "package": await packageRelease(argument); break;
	case "install": await install(argument); break;
	case "install-consumer": await installConsumer(argument); break;
	case "smoke": await consumerSmoke(); break;
	default:
		throw new Error("usage: node tools/starter-release.mjs <generate|verify|package|install|install-consumer|smoke>");
}
