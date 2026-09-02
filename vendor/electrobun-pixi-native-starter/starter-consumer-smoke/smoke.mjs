import { createHash } from "node:crypto";
import {
	closeSync,
	copyFileSync,
	createReadStream,
	existsSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const EXPECTED = {
	starter: "electrobun-pixi-native-starter",
	product: "electrobun-pixijs-webgpu",
	version: "0.1.0",
	electrobun: "2.0.1",
	pixi: "8.20.1",
	coreAbi: 1,
	sdkAbi: 1,
	nativeFrameAbi: 3,
	nativeWrapperSha256: "42091e3a0a65941624ee47401a9d6bb20324077c2dabe9a23faa50dd55a7491b",
	capabilities: "0x0000000000000fbf",
	hostCapabilityBits: [
		["CAP_MULTI_BUNDLE", 0], ["CAP_SURFACE_STATUS_V2", 1], ["CAP_WINDOW_INPUT", 2],
		["CAP_TEXT_INPUT", 3], ["CAP_JOBS", 4], ["CAP_ACCESSIBILITY_BRIDGE", 5],
		["CAP_PLATFORM_FILES", 7], ["CAP_WINDOW_SNAPSHOT", 8], ["CAP_INPUT_DIAGNOSTICS", 9],
		["CAP_INPUT_WAKE", 10], ["CAP_LIFECYCLE_EVENTS", 11],
	],
	capabilityNames: [
		"multi-bundle", "surface-status-v2", "window-input", "text-input", "jobs", "accessibility-bridge",
		"platform-files", "window-snapshot", "input-diagnostics", "input-wake", "lifecycle-events",
	],
};

const fail = (message) => { throw new Error(message); };
const posix = (path) => path.split(sep).join("/");
const sha256 = (path) => new Promise((accept, reject) => {
	const hash = createHash("sha256");
	createReadStream(path).on("data", (chunk) => hash.update(chunk)).on("error", reject)
		.on("end", () => accept(hash.digest("hex")));
});

const walk = (directory) => {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isSymbolicLink()) fail(`release contains a symlink: ${path}`);
		if (entry.isDirectory()) files.push(...walk(path));
		else if (entry.isFile()) files.push(path);
	}
	return files;
};

const peMachine = (path) => {
	const file = openSync(path, "r");
	try {
		const dos = Buffer.alloc(64);
		if (readSync(file, dos, 0, dos.length, 0) !== dos.length || dos.readUInt16LE(0) !== 0x5a4d) fail(`not a PE binary: ${path}`);
		const pe = Buffer.alloc(6);
		if (readSync(file, pe, 0, pe.length, dos.readUInt32LE(0x3c)) !== pe.length || pe.readUInt32LE(0) !== 0x00004550) {
			fail(`invalid PE header: ${path}`);
		}
		return pe.readUInt16LE(4);
	} finally {
		closeSync(file);
	}
};

const probeNativeFrame = (dll) => {
	const directory = mkdtempSync(join(realpathSync(tmpdir()), "electrobun-pixi-consumer-ffi-"));
	const script = join(directory, "probe.ps1");
	writeFileSync(script, String.raw`
param([string]$Dll)
$source = @'
using System;
using System.Runtime.InteropServices;
public static class NativeProbe {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern IntPtr LoadLibraryW(string path);
    [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)] public static extern IntPtr GetProcAddress(IntPtr module, string name);
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
		if (result.status !== 0) fail(result.stderr.trim() || `native-frame probe exited ${result.status}`);
		return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
	} finally {
		if (dirname(directory).toLowerCase() !== realpathSync(tmpdir()).toLowerCase()) {
			fail(`refusing to clean unexpected temporary path: ${directory}`);
		}
		rmSync(directory, { recursive: true, force: true });
	}
};

const [requestedMode = "validate", requestedRelease] = process.argv.slice(2);
const mode = requestedMode === "validate" || requestedMode === "app" ? requestedMode : "validate";
const release = resolve((mode === requestedMode ? requestedRelease : requestedMode)
	?? fail("usage: node smoke.mjs <validate|app> <release-directory>"));
if (process.platform !== "win32" || process.arch !== "x64") fail(`expected win32/x64, got ${process.platform}/${process.arch}`);
if (release.includes(`${sep}.hutch${sep}`) || release.includes(`${sep}node_modules${sep}`)) {
	fail("consumer release must not be loaded from .hutch or node_modules");
}

const manifestPath = join(release, "starter-manifest.json");
if (!existsSync(manifestPath)) fail("starter-manifest.json is missing");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.schemaVersion !== 2 || manifest.starter?.name !== EXPECTED.starter
	|| manifest.starter?.version !== EXPECTED.version || manifest.product?.name !== EXPECTED.product
	|| manifest.product?.version !== EXPECTED.version || manifest.target?.platform !== "win32"
	|| manifest.target?.arch !== "x64" || manifest.target?.minimumWindows !== "10.0.19041"
	|| manifest.dependencies?.electrobun !== EXPECTED.electrobun
	|| manifest.dependencies?.pixi !== EXPECTED.pixi) fail("starter identity, version or target mismatch");
if (!/^[0-9a-f]{40}$/.test(manifest.source?.commit ?? "") || typeof manifest.source?.dirty !== "boolean"
	|| !Number.isSafeInteger(manifest.source?.sourceDateEpoch) || manifest.source.sourceDateEpoch <= 0) {
	fail("source commit, dirty state or SOURCE_DATE_EPOCH metadata mismatch");
}
if (manifest.build?.commit !== manifest.source.commit
	|| manifest.build?.sourceDateEpoch !== manifest.source.sourceDateEpoch
	|| manifest.build?.timestamp !== new Date(manifest.source.sourceDateEpoch * 1000).toISOString()) {
	fail("reproducible build commit or timestamp mismatch");
}
if (manifest.native?.electrobun?.coreAbi?.name !== "electrobun-core"
	|| manifest.native?.electrobun?.coreAbi?.version !== EXPECTED.coreAbi
	|| manifest.native?.electrobun?.sdkAbi?.name !== "electrobun-sdk"
	|| manifest.native?.electrobun?.sdkAbi?.version !== EXPECTED.sdkAbi
	|| manifest.native?.electrobun?.nativeWrapperSha256 !== EXPECTED.nativeWrapperSha256
	|| manifest.native?.nativeFrame?.abiVersion !== EXPECTED.nativeFrameAbi
	|| !/^[a-f0-9]{64}$/.test(manifest.native?.nativeFrame?.sourceSha256 ?? "")
	|| manifest.native?.nativeFrame?.capabilities?.mask !== EXPECTED.capabilities
	|| manifest.native?.nativeFrame?.capabilities?.requiredMask !== EXPECTED.capabilities
	|| manifest.native?.nativeFrame?.capabilities?.unknownMask !== "0x0000000000000000"
	|| JSON.stringify(manifest.native?.nativeFrame?.capabilities?.names) !== JSON.stringify(EXPECTED.capabilityNames)) {
	fail("native ABI or capabilities mismatch");
}

const listed = new Map();
const rootFiles = new Set([".gitignore", "README.md", "package.json", "package-lock.json", "electrobun.config.ts", "tsconfig.json"]);
const allowedPath = (path) => rootFiles.has(path) || [
	"src/", "tools/", "assets/", "patches/", "consumer/", "starter-consumer-smoke/", ".hutch/devkit-dcomp-2.0.1/",
].some((prefix) => path.startsWith(prefix)) || path === ".hutch/native-frame/native-frame.dll";
for (const file of manifest.files ?? []) {
	if (typeof file.path !== "string" || typeof file.role !== "string" || file.role.length === 0
		|| file.path.startsWith("/") || file.path.includes("\\")
		|| file.path.split("/").includes("..") || listed.has(file.path)) fail(`unsafe or duplicate manifest path: ${file.path}`);
	if (!allowedPath(file.path) || file.path.includes("node_modules") || file.path.startsWith("artifacts/")
		|| file.path.startsWith("build/") || file.path.startsWith(".git/")) fail(`path is outside the Starter allowlist: ${file.path}`);
	listed.set(file.path, file);
}

const actualPaths = walk(release).map((path) => posix(relative(release, path)))
	.filter((path) => path !== "starter-manifest.json").sort((a, b) => a.localeCompare(b, "en"));
const listedPaths = [...listed.keys()].sort((a, b) => a.localeCompare(b, "en"));
if (JSON.stringify(actualPaths) !== JSON.stringify(listedPaths)) fail("release contains missing, extra or unlisted files");

for (const path of actualPaths) {
	const entry = listed.get(path);
	const file = join(release, ...path.split("/"));
	if (!Number.isSafeInteger(entry.size) || entry.size < 0 || statSync(file).size !== entry.size) fail(`size mismatch: ${path}`);
	if (!/^[a-f0-9]{64}$/.test(entry.sha256) || await sha256(file) !== entry.sha256) fail(`sha256 mismatch: ${path}`);
	if (/\.(?:dll|exe)$/i.test(path) && peMachine(file) !== 0x8664) fail(`non-x64 PE binary: ${path}`);
}

const expectedEntrypoints = {
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
};
if (JSON.stringify(manifest.entrypoints) !== JSON.stringify(expectedEntrypoints)) fail("release entrypoints mismatch");
for (const path of Object.values(manifest.entrypoints)) {
	if (!listed.has(path)) fail(`entrypoint is not in the payload: ${path}`);
}
for (const path of [
	...rootFiles,
	"src/native-host.ts", "src/main.ts", "src/platform/native-frame.rs", "tools/starter-release.mjs",
	"assets/bunnies/rabbitv3.png", "patches/electrobun-2.0.1-dcomp-atomic-resize.patch",
	"starter-consumer-smoke/smoke.mjs", ".hutch/devkit-dcomp-2.0.1/native-devkit.json",
	"consumer/run-electrobun.mjs", "consumer/electrobun.ts", "consumer/tsconfig.json",
	".hutch/devkit-dcomp-2.0.1/libNativeWrapper.dll", ".hutch/native-frame/native-frame.dll",
]) {
	if (!listed.has(path)) fail(`required Starter file is missing: ${path}`);
}
const devkit = JSON.parse(readFileSync(join(release, ".hutch", "devkit-dcomp-2.0.1", "native-devkit.json"), "utf8"));
if (devkit.product?.version !== EXPECTED.electrobun || devkit.target?.os !== "win" || devkit.target?.arch !== "x64"
	|| devkit.abi?.core?.name !== "electrobun-core" || devkit.abi?.core?.version !== EXPECTED.coreAbi
	|| devkit.abi?.sdk?.name !== "electrobun-sdk" || devkit.abi?.sdk?.version !== EXPECTED.sdkAbi) {
	fail("embedded Electrobun devkit metadata mismatch");
}

const pkg = JSON.parse(readFileSync(join(release, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(release, "package-lock.json"), "utf8"));
if (pkg.name !== EXPECTED.product || pkg.version !== EXPECTED.version || pkg.dependencies?.electrobun !== EXPECTED.electrobun
	|| pkg.dependencies?.["pixi.js"] !== EXPECTED.pixi
	|| pkg.electrobunPixiStarter?.nativeWrapperSha256 !== EXPECTED.nativeWrapperSha256
	|| lock.packages?.[""]?.version !== EXPECTED.version
	|| lock.packages?.[""]?.dependencies?.electrobun !== EXPECTED.electrobun
	|| lock.packages?.[""]?.dependencies?.["pixi.js"] !== EXPECTED.pixi) fail("package or lockfile contract mismatch");
if (await sha256(join(release, ".hutch", "devkit-dcomp-2.0.1", "libNativeWrapper.dll")) !== EXPECTED.nativeWrapperSha256
	|| await sha256(join(release, "src", "platform", "native-frame.rs")) !== manifest.native.nativeFrame.sourceSha256) {
	fail("native source or authoritative wrapper hash mismatch");
}

const probe = probeNativeFrame(join(release, ".hutch", "native-frame", "native-frame.dll"));
const probedMask = `0x${BigInt(probe.capabilities).toString(16).padStart(16, "0")}`;
if (probe.abiVersion !== EXPECTED.nativeFrameAbi || probedMask !== EXPECTED.capabilities) {
	fail(`loaded native-frame ABI mismatch: abi=${probe.abiVersion}, capabilities=${probedMask}`);
}
const host = readFileSync(join(release, "src", "platform", "native-frame-host.ts"), "utf8");
if (!host.includes('from "bun:ffi"')) fail("TypeScript host FFI contract is missing");
const requiredCapabilities = host.match(/const REQUIRED_CAPABILITIES = ([\s\S]*?);/)?.[1] ?? "";
if (!host.includes(`const ABI_VERSION = ${EXPECTED.nativeFrameAbi};`)
	|| EXPECTED.hostCapabilityBits.some(([name, bit]) => !host.includes(`const ${name} = 1n << ${bit}n;`)
		|| !requiredCapabilities.includes(name))) fail("TypeScript host ABI declaration mismatch");

const validationMessage = `consumer validate passed: ${manifest.starter.name}@${manifest.starter.version}, ${actualPaths.length} payload files, native ABI ${probe.abiVersion}/${probedMask}`;

const fileContains = (path, patterns) => new Promise((accept, reject) => {
	const overlap = Math.max(...patterns.map((pattern) => pattern.length)) - 1;
	let tail = Buffer.alloc(0);
	const stream = createReadStream(path);
	stream.on("data", (chunk) => {
		const bytes = tail.length ? Buffer.concat([tail, chunk]) : chunk;
		if (patterns.some((pattern) => bytes.indexOf(pattern) >= 0)) {
			stream.destroy();
			accept(true);
			return;
		}
		tail = overlap > 0 ? bytes.subarray(Math.max(0, bytes.length - overlap)) : Buffer.alloc(0);
	});
	stream.on("error", reject);
	stream.on("close", () => accept(false));
});

const assertNoSourcePathLeak = async () => {
	const forbidden = process.env.ELECTROBUN_PIXI_FORBIDDEN_SOURCE_ROOT;
	if (!forbidden) fail("app smoke requires ELECTROBUN_PIXI_FORBIDDEN_SOURCE_ROOT");
	const roots = new Set([resolve(forbidden), realpathSync(resolve(forbidden))]);
	const strings = new Set();
	for (const path of roots) {
		strings.add(path);
		strings.add(path.replaceAll("\\", "/"));
		strings.add(path.replaceAll("\\", "\\\\"));
	}
	const patterns = [...strings].flatMap((value) => [Buffer.from(value, "utf8"), Buffer.from(value, "utf16le")]);
	const compilerPathBinaries = new Set([
		".hutch/devkit-dcomp-2.0.1/extractor.exe",
		".hutch/devkit-dcomp-2.0.1/libNativeWrapper.dll",
		".hutch/devkit-dcomp-2.0.1/process_helper.exe",
		".hutch/native-frame/native-frame.dll",
	]);
	for (const path of actualPaths) {
		// These four hash-pinned PE files retain compiler source paths as diagnostics.
		// Their architecture, ABI and detached runtime loading are verified separately.
		if (compilerPathBinaries.has(path)) continue;
		if (await fileContains(join(release, ...path.split("/")), patterns)) {
			fail(`release contains the source repository absolute path: ${path}`);
		}
	}
};

const cleanEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => {
	const upper = key.toUpperCase();
	return !["NODE_PATH", "INIT_CWD", "PWD", "OLDPWD", "HUTCH_ELECTROBUN_DEVKIT_ROOT",
		"ELECTROBUN_PIXI_FORBIDDEN_SOURCE_ROOT"].includes(upper)
		&& !upper.startsWith("NPM_PACKAGE_") && !upper.startsWith("NPM_LIFECYCLE_")
		&& upper !== "NPM_CONFIG_LOCAL_PREFIX";
}));

const runSync = (command, args, options = {}) => {
	const result = spawnSync(command, args, {
		cwd: release,
		env: cleanEnvironment(),
		stdio: "inherit",
		windowsHide: true,
		...options,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) fail(`${command} ${args.join(" ")} exited ${result.status ?? result.signal}`);
};

let applicationRoot = release;
const createExternalConsumer = () => {
	const consumer = join(dirname(release), "launchpad-consumer");
	if (existsSync(consumer)) fail("external consumer directory already exists");
	mkdirSync(join(consumer, "src"), { recursive: true });
	const sourcePackage = JSON.parse(readFileSync(join(release, "package.json"), "utf8"));
	writeFileSync(join(consumer, "package.json"), JSON.stringify({
		name: "launchpad-consumer-smoke",
		version: sourcePackage.version,
		private: true,
		type: "module",
		scripts: {
			start: "node vendor/electrobun-pixi-native-starter/consumer/run-electrobun.mjs start",
			dev: "node vendor/electrobun-pixi-native-starter/consumer/run-electrobun.mjs dev",
			build: "node vendor/electrobun-pixi-native-starter/consumer/run-electrobun.mjs build",
			typecheck: "tsc --noEmit",
		},
		dependencies: sourcePackage.dependencies,
		devDependencies: sourcePackage.devDependencies,
	}, null, 2) + "\n");
	const lock = JSON.parse(readFileSync(join(release, "package-lock.json"), "utf8"));
	lock.name = "launchpad-consumer-smoke";
	lock.packages[""].name = "launchpad-consumer-smoke";
	writeFileSync(join(consumer, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
	writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({
		extends: "./vendor/electrobun-pixi-native-starter/consumer/tsconfig.json",
		compilerOptions: { noUnusedLocals: true, noUnusedParameters: true },
		include: ["src", "electrobun.config.ts"],
	}, null, 2) + "\n");
	writeFileSync(join(consumer, "electrobun.config.ts"), [
		'import type { ElectrobunConfig } from "electrobun";',
		'import { nativePixiElectrobunCopy } from "./vendor/electrobun-pixi-native-starter/consumer/electrobun";',
		'export default {',
		' app: { name: "LaunchPad Consumer Smoke", identifier: "dev.example.launchpad-consumer-smoke", version: "0.1.0" },',
		' build: { mainProcess: "bun", bun: { entrypoint: "src/main.ts" }, cottontail: { entrypoint: "src/main.ts" },',
		'  copy: nativePixiElectrobunCopy, win: { bundleWGPU: true } },',
		'} satisfies ElectrobunConfig;',
	].join("\n") + "\n");
	writeFileSync(join(consumer, "src", "main.ts"), [
		'import { createDemo } from "../vendor/electrobun-pixi-native-starter/src/demo/demo";',
		'import { createNativePixiApplication } from "../vendor/electrobun-pixi-native-starter/src/native-host";',
		'const app = await createNativePixiApplication({ title: "External Consumer", width: 900, height: 600 });',
		'try {',
		' await createDemo(app, { bunnyCount: 0, fastBundleSmokeBatches: 0, fpsHudScale: 2 });',
		' const presented = app.nextPresent(); app.invalidate(); await presented;',
		' if (process.env.PIXI_PRESENT_MARKER) await Bun.write(process.env.PIXI_PRESENT_MARKER, JSON.stringify({ presented: true }));',
		'} catch (error) { await app.dispose(); throw error; }',
	].join("\n") + "\n");
	runSync(process.execPath, [process.env.npm_execpath, "ci", "--no-audit", "--no-fund"], { cwd: consumer });
	const installer = join(release, "tools", "starter-release.mjs");
	runSync(process.execPath, [installer, "install-consumer", consumer], { cwd: release });
	runSync(process.execPath, [installer, "install-consumer", consumer], { cwd: release });
	const vendor = join(consumer, "vendor", "electrobun-pixi-native-starter");
	const installedManifest = join(vendor, "starter-manifest.json");
	const originalManifest = readFileSync(installedManifest, "utf8");
	writeFileSync(installedManifest, originalManifest + " ");
	const conflict = spawnSync(process.execPath, [installer, "install-consumer", consumer], {
		cwd: release, env: cleanEnvironment(), encoding: "utf8", windowsHide: true,
	});
	if (conflict.status === 0) fail("install-consumer overwrote a conflicting vendored Starter");
	copyFileSync(join(release, "starter-manifest.json"), installedManifest);
	runSync(process.execPath, [process.env.npm_execpath, "run", "typecheck"], { cwd: consumer });
	runSync(process.execPath, [process.env.npm_execpath, "run", "build"], { cwd: consumer });
	return { consumer, vendor };
};

const sleep = (milliseconds) => new Promise((accept) => setTimeout(accept, milliseconds));
const processCommandLine = (pid) => {
	const script = `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($p) { $p.CommandLine }`;
	const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
		encoding: "utf8", windowsHide: true,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) fail(result.stderr.trim() || `could not inspect process ${pid}`);
	return result.stdout.trim();
};

const waitForDiscovery = async (child, discoveryPath, timeout = 90_000) => {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (child.spawnError) throw child.spawnError;
		if (child.exitCode !== null) fail(`npm start exited before debug discovery with ${child.exitCode}`);
		if (existsSync(discoveryPath)) {
			try {
				const discovery = JSON.parse(readFileSync(discoveryPath, "utf8"));
				if (Number.isSafeInteger(discovery.pid) && discovery.pid > 0 && Number.isInteger(discovery.port)
					&& typeof discovery.token === "string" && discovery.token.length > 0) return discovery;
			} catch {}
		}
		await sleep(100);
	}
	const error = new Error("npm start did not publish debug discovery within 90 seconds");
	error.code = "START_TIMEOUT";
	throw error;
};

const waitForExit = (child, timeout) => new Promise((accept) => {
	if (child.exitCode !== null) {
		accept({ code: child.exitCode, signal: child.signalCode, timedOut: false });
		return;
	}
	const timer = setTimeout(() => accept({ timedOut: true }), timeout);
	child.once("exit", (code, signal) => {
		clearTimeout(timer);
		accept({ code, signal, timedOut: false });
	});
});

const killStartTree = (child) => {
	if (!child.pid || child.exitCode !== null) return;
	const result = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
		encoding: "utf8", windowsHide: true,
	});
	if (result.error) throw result.error;
	if (result.status !== 0 && child.exitCode === null) {
		fail(result.stderr.trim() || `taskkill failed for npm start PID ${child.pid}`);
	}
};

const processesPointingAtRelease = () => {
	const needle = applicationRoot.replaceAll("'", "''");
	const script = `$needle = '${needle}'; @((Get-CimInstance Win32_Process | Where-Object { `
		+ `$_.ProcessId -ne $PID -and $_.ProcessId -ne ${process.pid} -and $_.CommandLine -like ('*' + $needle + '*') `
		+ `} | Select-Object ProcessId,CommandLine)) | ConvertTo-Json -Compress`;
	const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
		encoding: "utf8", windowsHide: true,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) fail(result.stderr.trim() || "could not inspect residual processes");
	const parsed = JSON.parse(result.stdout.trim() || "[]");
	return Array.isArray(parsed) ? parsed : [parsed];
};

const assertNoResidualProcesses = async () => {
	for (let attempt = 0; attempt < 20; attempt++) {
		const processes = processesPointingAtRelease();
		if (processes.length === 0) return;
		if (attempt === 19) fail(`processes still point at the temp release: ${JSON.stringify(processes)}`);
		await sleep(250);
	}
};

const runAppSmoke = async () => {
	await assertNoSourcePathLeak();
	const npmExecPath = process.env.npm_execpath;
	if (!npmExecPath || !existsSync(npmExecPath)) fail("app smoke must be launched through an npm script");
	const { consumer, vendor } = createExternalConsumer();
	applicationRoot = consumer;

	const discoveryPath = join(consumer, ".electrobun-pixi-debug.json");
	const presentMarker = join(consumer, "presented.json");
	if (existsSync(discoveryPath)) fail(`debug discovery already exists: ${discoveryPath}`);
	const debugEnvironment = { ...cleanEnvironment(), PIXI_AGENT_DEBUG_DISCOVERY: discoveryPath };
	const start = spawn(process.execPath, [npmExecPath, "start"], {
		cwd: consumer,
		env: {
			...debugEnvironment,
			PIXI_AGENT_DEBUG: "1",
			PIXI_MAX_FPS: "60",
			PIXI_RESIZE_MODE: "smooth",
			PIXI_BUNNYMARK_COUNT: "0",
			PIXI_FAST_BUNDLE_SMOKE: "0",
			PIXI_PRESENT_MARKER: presentMarker,
		},
		stdio: "inherit",
		windowsHide: true,
	});
	start.spawnError = null;
	start.once("error", (error) => { start.spawnError = error; });
	let failure = null;
	let discovery = null;
	let startTimedOut = false;
	try {
		discovery = await waitForDiscovery(start, discoveryPath);
		const commandLine = processCommandLine(discovery.pid);
		if (!commandLine.toLowerCase().includes(consumer.toLowerCase())) {
			fail(`debug discovery belongs to a process outside the external consumer: ${discovery.pid}`);
		}
		for (let attempt = 0; attempt < 100 && !existsSync(presentMarker); attempt++) await sleep(50);
		if (!existsSync(presentMarker) || !JSON.parse(readFileSync(presentMarker, "utf8")).presented) {
			fail("public nextPresent did not observe a successful surface presentation");
		}
		runSync(process.execPath, [join(vendor, "tools", "pixi-debug.mjs"), "smoke"], { cwd: consumer, env: debugEnvironment, timeout: 5 * 60_000 });
	} catch (error) {
		failure = error;
		startTimedOut = error?.code === "START_TIMEOUT";
	} finally {
		if (startTimedOut) {
			try {
				killStartTree(start);
			} catch (error) {
				failure ??= error;
			}
		} else if (discovery) {
			try {
				runSync(process.execPath, [join(vendor, "tools", "pixi-debug.mjs"), "close"], { cwd: consumer, env: debugEnvironment, timeout: 15_000 });
			} catch (error) {
				failure ??= error;
			}
		}
		const exit = await waitForExit(start, startTimedOut ? 10_000 : 30_000);
		if (exit.timedOut) {
			try {
				killStartTree(start);
			} catch (error) {
				failure ??= error;
			}
			await waitForExit(start, 10_000);
			failure ??= new Error(`npm start PID ${start.pid} did not exit after debug close`);
		} else if (!startTimedOut && (exit.code !== 0 || exit.signal)) {
			failure ??= new Error(`npm start did not exit normally: code=${exit.code}, signal=${exit.signal}`);
		}
		await assertNoResidualProcesses().catch((error) => { failure ??= error; });
	}
	if (failure) throw failure;
	console.log(`external consumer app smoke passed: PID ${discovery.pid}`);
};

console.log(validationMessage);
if (mode === "app") await runAppSmoke();
