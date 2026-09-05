import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const discoveryPath = process.env.PIXI_AGENT_DEBUG_DISCOVERY
	? resolve(process.env.PIXI_AGENT_DEBUG_DISCOVERY)
	: join(tmpdir(), "electrobun-pixi-debug.json");
const discovery = JSON.parse(await readFile(discoveryPath, "utf8"));
const base = `http://127.0.0.1:${discovery.port}`;
const headers = { authorization: `Bearer ${discovery.token}` };
const request = async (path, options = {}) => {
	const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...options.headers } });
	const body = await response.json();
	if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`);
	return body;
};
const command = (body) => request("/command", {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify(body),
});
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitForStatus = async (predicate, message, timeout = 15_000) => {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const status = await request("/status");
		if (predicate(status)) return status;
		await sleep(100);
	}
	throw new Error(message);
};
const sendMouseGesture = ({ windowHandle, screen, frame }, gesture = "click") => {
	for (const value of [windowHandle, screen.x, screen.y, frame.x, frame.y]) {
		if (!Number.isSafeInteger(value)) throw new Error("native mouse target contains an invalid coordinate");
	}
	const destination = gesture === "drag-outside" ? { x: frame.x - 24, y: frame.y - 24 } : screen;
	const script = String.raw`
$ErrorActionPreference = "Stop"
$source = @'
using System;
using System.Runtime.InteropServices;
public static class NativeMouse {
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] public struct MouseInput {
        public int X; public int Y; public uint Data; public uint Flags; public uint Time; public UIntPtr Extra;
    }
    [StructLayout(LayoutKind.Explicit)] public struct InputUnion {
        [FieldOffset(0)] public MouseInput Mouse;
    }
    [StructLayout(LayoutKind.Sequential)] public struct Input {
        public uint Type; public InputUnion Data;
    }
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] public static extern void keybd_event(byte virtualKey, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint count, Input[] inputs, int size);
    static Input MouseEvent(int x, int y, uint flags, uint data = 0) {
        return new Input { Type = 0, Data = new InputUnion { Mouse = new MouseInput { X = x, Y = y, Data = data, Flags = flags } } };
    }
    static Input Move(int x, int y) {
        int left = GetSystemMetrics(76), top = GetSystemMetrics(77);
        int width = Math.Max(1, GetSystemMetrics(78) - 1), height = Math.Max(1, GetSystemMetrics(79) - 1);
        x = Math.Max(left, Math.Min(left + width, x));
        y = Math.Max(top, Math.Min(top + height, y));
        return MouseEvent((int)Math.Round((x - left) * 65535.0 / width), (int)Math.Round((y - top) * 65535.0 / height), 0xC001);
    }
    public static bool SendGesture(int x, int y, int destinationX, int destinationY, bool dragOutside) {
        int size = Marshal.SizeOf(typeof(Input));
        if (!dragOutside) {
            Input[] click = { Move(x, y), MouseEvent(0, 0, 0x0002), MouseEvent(0, 0, 0x0004) };
            return SendInput((uint)click.Length, click, size) == click.Length;
        }
        Input[] down = { Move(x, y), MouseEvent(0, 0, 0x0002) };
        if (SendInput((uint)down.Length, down, size) != down.Length) return false;
        System.Threading.Thread.Sleep(80);
        Input[] release = { Move(destinationX, destinationY), MouseEvent(0, 0, 0x0004) };
        return SendInput((uint)release.Length, release, size) == release.Length;
    }
    public static bool SendWheelContract(int x, int y) {
        int size = Marshal.SizeOf(typeof(Input));
        Input[] input = {
            Move(x, y),
            MouseEvent(0, 0, 0x0800, 120), MouseEvent(0, 0, 0x0800, unchecked((uint)-120)),
            MouseEvent(0, 0, 0x1000, 120), MouseEvent(0, 0, 0x1000, unchecked((uint)-120)),
            MouseEvent(0, 0, 0x1000, 30), MouseEvent(0, 0, 0x1000, 30),
            MouseEvent(0, 0, 0x1000, 30), MouseEvent(0, 0, 0x1000, 30)
        };
        return SendInput((uint)input.Length, input, size) == input.Length;
    }
    public static bool SendModifiedWheelContract(int x, int y) {
        int size = Marshal.SizeOf(typeof(Input));
        keybd_event(0x11, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(20);
        bool control;
        try {
            Input[] input = { Move(x, y), MouseEvent(0, 0, 0x0800, 120) };
            control = SendInput((uint)input.Length, input, size) == input.Length;
        } finally { keybd_event(0x11, 0, 2, UIntPtr.Zero); }
        keybd_event(0x10, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(20);
        bool shift;
        try {
            Input[] input = { MouseEvent(0, 0, 0x0800, 120) };
            shift = SendInput((uint)input.Length, input, size) == input.Length;
        } finally { keybd_event(0x10, 0, 2, UIntPtr.Zero); }
        return control && shift;
    }
}
'@
Add-Type -TypeDefinition $source
[NativeMouse]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
$window = [IntPtr]${windowHandle}
[NativeMouse]::ShowWindow($window, 9) | Out-Null
[NativeMouse]::SetWindowPos($window, [IntPtr](-1), 0, 0, 0, 0, 0x43) | Out-Null
[NativeMouse]::SetWindowPos($window, [IntPtr](-2), 0, 0, 0, 0, 0x43) | Out-Null
[NativeMouse]::SetForegroundWindow($window) | Out-Null
$point = New-Object NativeMouse+Point
$point.X = ${screen.x}
$point.Y = ${screen.y}
$hit = [NativeMouse]::GetAncestor([NativeMouse]::WindowFromPoint($point), 2)
if ($hit -ne $window) { throw "native mouse target is obscured by HWND $hit" }
if (-not ${gesture === "wheel"
		? `[NativeMouse]::SendWheelContract(${screen.x}, ${screen.y})`
		: gesture === "modified-wheel"
			? `[NativeMouse]::SendModifiedWheelContract(${screen.x}, ${screen.y})`
			: `[NativeMouse]::SendGesture(${screen.x}, ${screen.y}, ${destination.x}, ${destination.y}, ${gesture === "drag-outside" ? "$true" : "$false"})`}) {
    throw "SendInput did not accept the complete native mouse gesture"
}
`;
	const result = spawnSync("powershell.exe", [
		"-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script,
	], { encoding: "utf8", windowsHide: true });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(result.stderr.trim() || `native mouse gesture exited ${result.status}`);
};
const realInputCheck = async () => {
	const target = await command({ action: "native-input-target", label: "interactive-mark" });
	await command({ action: "input-reset" });
	const beforeClick = await command({ action: "input-status" });
	sendMouseGesture(target);
	await sleep(250);
	const click = await command({ action: "input-status" });
	const clickDown = click.events.filter(({ kind }) => kind === 2).length;
	const clickUp = click.events.filter(({ kind }) => kind === 3).length;
	if (clickDown !== 1 || clickUp !== 1 || click.activationCount !== beforeClick.activationCount + 1) {
		throw new Error(`real Win32 click was duplicated or lost: down=${clickDown}, up=${clickUp}, activations=${click.activationCount - beforeClick.activationCount}`);
	}

	await command({ action: "input-reset" });
	sendMouseGesture(target, "wheel");
	await sleep(250);
	const wheel = await command({ action: "input-status" });
	const rawWheel = wheel.events.filter(({ kind }) => kind === 9);
	const expected = [
		[0, -100], [0, 100], [100, 0], [-100, 0],
		[25, 0], [25, 0], [25, 0], [25, 0],
	];
	const actual = wheel.wheelEvents.map(({ deltaX, deltaY, deltaMode }) => [deltaX, deltaY, deltaMode]);
	const publicTimes = wheel.wheelEvents.map(({ timeStamp }) => timeStamp);
	if (rawWheel.length !== expected.length
		|| JSON.stringify(actual) !== JSON.stringify(expected.map(([x, y]) => [x, y, 0]))
		|| publicTimes.some((timestamp, index) => index > 0 && timestamp <= publicTimes[index - 1])
		|| publicTimes.some((timestamp, index) => Math.abs(timestamp - Number(rawWheel[index]?.timestamp)) >= 0.01)) {
		throw new Error(`real Win32 wheel contract failed: raw=${rawWheel.length}, public=${JSON.stringify(actual)}`);
	}

	await command({ action: "input-reset" });
	sendMouseGesture(target, "modified-wheel");
	await sleep(250);
	const modified = await command({ action: "input-status" });
	const rawModified = modified.events.filter(({ kind }) => kind === 9);
	if (rawModified.length !== 2 || rawModified[0].modifiers !== 2 || rawModified[1].modifiers !== 1
		|| modified.wheelEvents.length !== 2
		|| !modified.wheelEvents[0].ctrlKey || modified.wheelEvents[0].shiftKey
		|| modified.wheelEvents[1].ctrlKey || !modified.wheelEvents[1].shiftKey) {
		throw new Error(`real Win32 wheel modifiers failed: ${JSON.stringify({ rawModified, public: modified.wheelEvents })}`);
	}

	await command({ action: "input-reset" });
	const beforeDrag = await command({ action: "input-status" });
	sendMouseGesture(target, "drag-outside");
	await sleep(250);
	const drag = await command({ action: "input-status" });
	const dragDown = drag.events.filter(({ kind }) => kind === 2).length;
	const dragUp = drag.events.filter(({ kind }) => kind === 3).length;
	if (dragDown !== 1 || dragUp !== 1 || drag.captured || drag.nativeCaptured
		|| drag.activationCount !== beforeDrag.activationCount) {
		throw new Error(`real capture/outside release failed: down=${dragDown}, up=${dragUp}, captured=${drag.captured}/${drag.nativeCaptured}`);
	}
	return {
		passed: true,
		click: { down: clickDown, up: clickUp, activations: 1 },
		outsideRelease: { down: dragDown, up: dragUp, captured: false },
		wheel: { events: actual },
		modifiers: { control: true, shift: true },
	};
};
const injectRecoverableFault = async (kind) => {
	const before = await request("/status");
	const beforeEvent = before.events.at(-1)?.sequence ?? 0;
	await command({ action: "fault", kind });
	if (kind === "surface-outdated") {
		return waitForStatus((status) =>
			status.runtime.state === "running"
			&& status.runtime.recoveryCount === before.runtime.recoveryCount
			&& status.runtime.deviceGeneration === before.runtime.deviceGeneration
			&& status.runtime.surfaceGeneration === before.runtime.surfaceGeneration
			&& status.events.some((event) => event.sequence > beforeEvent
				&& event.type === "surface-reconfigured"
				&& event.data?.reason === "surface outdated")
			&& status.frame.renderCount > before.frame.renderCount,
		"surface-outdated did not reconfigure in place within 15 seconds");
	}
	await waitForStatus((status) => {
		const deviceAdvanced = status.runtime.deviceGeneration > before.runtime.deviceGeneration;
		const surfaceAdvanced = kind !== "surface-lost"
			|| status.runtime.surfaceGeneration > before.runtime.surfaceGeneration;
		const recoveryAdvanced = status.runtime.recoveryCount > before.runtime.recoveryCount;
		return status.runtime.state === "running" && recoveryAdvanced && deviceAdvanced && surfaceAdvanced
			&& status.frame.renderCount > before.frame.renderCount;
	}, `${kind} recovery did not resume presentation within 15 seconds`);
	await sleep(750);
	const settled = await request("/status");
	if (kind !== "surface-outdated") {
		const newEvents = settled.events.filter((event) => event.sequence > beforeEvent);
		if (settled.runtime.recoveryCount !== before.runtime.recoveryCount + 1) {
			throw new Error(`${kind} cascaded into ${settled.runtime.recoveryCount - before.runtime.recoveryCount} recoveries`);
		}
		if (newEvents.some((event) => /0x80070005|IDXGISwapChain1/i.test(JSON.stringify(event)))) {
			throw new Error(`${kind} recreated an unauthorized Dawn HWND swap chain`);
		}
	}
	return settled;
};
const resizeLifecycleCheck = async () => {
	const before = await request("/status");
	const baseline = await command({ action: "standard-render-check" });
	const target = {
		width: Math.max(320, before.window.frame.width + (before.window.frame.width > 1100 ? -80 : 80)),
		height: Math.max(240, before.window.frame.height + (before.window.frame.height > 750 ? -60 : 60)),
	};
	const verify = (status, expected, afterEvent, afterFrame) => {
		const targetSize = status.renderTarget;
		const expectedPixelWidth = Math.round(status.window.contentSize.width * status.window.resolution);
		const expectedPixelHeight = Math.round(status.window.contentSize.height * status.window.resolution);
		return status.runtime.state === "running"
			&& status.runtime.recoveryCount === before.runtime.recoveryCount
			&& status.runtime.deviceGeneration === before.runtime.deviceGeneration
			&& status.runtime.surfaceGeneration === before.runtime.surfaceGeneration
			&& status.window.frame.width === expected.width
			&& status.window.frame.height === expected.height
			&& status.events.some((event) => event.sequence > afterEvent
				&& event.type === "surface-reconfigured"
				&& event.data?.reason === "window resize")
			&& status.frame.renderCount > afterFrame
			&& targetSize.canvas.width === expectedPixelWidth
			&& targetSize.canvas.height === expectedPixelHeight
			&& targetSize.canvas.width === targetSize.context.width
			&& targetSize.canvas.height === targetSize.context.height
			&& targetSize.canvas.width === targetSize.gpuTarget.width
			&& targetSize.canvas.height === targetSize.gpuTarget.height;
	};
	let resized;
	let adaptiveIntermediate = null;
	try {
		const event = before.events.at(-1)?.sequence ?? 0;
		await command({ action: "resize", ...target });
		if (before.window.resizeMode === "adaptive") {
			adaptiveIntermediate = await waitForStatus((status) =>
				status.window.frame.width === target.width
				&& status.window.frame.height === target.height
				&& status.window.contentSize.width !== before.window.contentSize.width
				&& status.renderTarget.canvas.width === before.renderTarget.canvas.width
				&& status.renderTarget.canvas.height === before.renderTarget.canvas.height
				&& status.events.some((item) => item.sequence > event && item.type === "logical-resized"),
			"adaptive resize did not update logical layout before its backing surface",
			1_000);
		}
		resized = await waitForStatus(
			(status) => verify(status, target, event, before.frame.renderCount),
			"window resize did not reconfigure and present in place within 15 seconds",
		);
		const standard = await command({ action: "standard-render-check" });
		if (JSON.stringify(standard) !== JSON.stringify(baseline)) {
			throw new Error("window resize changed standard filter/mask/RenderTexture output");
		}
	} finally {
		const current = await request("/status");
		const event = current.events.at(-1)?.sequence ?? 0;
		await command({ action: "resize", width: before.window.frame.width, height: before.window.frame.height });
		await waitForStatus(
			(status) => verify(status, before.window.frame, event, current.frame.renderCount),
			"window size did not restore in place within 15 seconds",
		);
	}
	return {
		passed: true,
		from: before.window.frame,
		to: resized.window.frame,
		runtime: resized.runtime,
		renderTarget: resized.renderTarget,
		adaptiveIntermediate: adaptiveIntermediate && {
			contentSize: adaptiveIntermediate.window.contentSize,
			renderTarget: adaptiveIntermediate.renderTarget,
		},
		standard: baseline,
	};
};
const dpiLifecycleCheck = async () => {
	const before = await request("/status");
	const target = before.window.displays.find((candidate) =>
		candidate.id !== before.window.display.id
		&& Math.abs(candidate.scaleFactor - before.window.resolution) > 0.01);
	if (!target) {
		return { passed: true, skipped: true, reason: "no second display with a different scale factor" };
	}
	const baseline = await command({ action: "standard-render-check" });
	const targetPosition = {
		x: Math.round(target.bounds.x + Math.max(0, target.bounds.width - before.window.frame.width) / 2),
		y: Math.round(target.bounds.y + Math.max(0, target.bounds.height - before.window.frame.height) / 2),
	};
	const runtimeStable = (status) =>
		status.runtime.state === "running"
		&& status.runtime.recoveryCount === before.runtime.recoveryCount
		&& status.runtime.deviceGeneration === before.runtime.deviceGeneration
		&& status.runtime.surfaceGeneration === before.runtime.surfaceGeneration;
	let moved;
	let inputAtTarget;
	try {
		const event = before.events.at(-1)?.sequence ?? 0;
		await command({ action: "move", ...targetPosition });
		const refreshed = await waitForStatus((status) => {
			const events = status.events.filter((item) => item.sequence > event);
			return runtimeStable(status)
				&& status.window.display.id === target.id
				&& Math.abs(status.window.resolution - target.scaleFactor) < 0.01
				&& events.some((item) => item.type === "surface-reconfigured"
					&& item.data?.reason === "window resize")
				&& events.some((item) => item.type === "display-changed")
				&& events.some((item) => item.type === "scene-texture-resolution");
		}, "cross-DPI move did not reconfigure, present, and refresh RenderTextures in place within 15 seconds");
		moved = await waitForStatus((status) => runtimeStable(status)
			&& status.window.display.id === target.id
			&& status.frame.renderCount > refreshed.frame.renderCount,
		"cross-DPI move did not present after refreshing RenderTextures within 15 seconds");
		const scaled = await command({ action: "standard-render-check" });
		const ratio = moved.window.resolution / before.window.resolution;
		for (let index = 0; index < baseline.textures.length; index++) {
			const expectedWidth = Math.round(baseline.textures[index].width * ratio);
			const expectedHeight = Math.round(baseline.textures[index].height * ratio);
			if (scaled.textures[index].width !== expectedWidth
				|| scaled.textures[index].height !== expectedHeight
				|| scaled.textures[index].visiblePixels <= 0) {
				throw new Error("cross-DPI move produced an invalid standard RenderTexture");
			}
		}
		inputAtTarget = await realInputCheck();
	} finally {
		const current = await request("/status");
		const event = current.events.at(-1)?.sequence ?? 0;
		await command({ action: "move", x: before.window.frame.x, y: before.window.frame.y });
		await waitForStatus((status) => {
			const events = status.events.filter((item) => item.sequence > event);
			return runtimeStable(status)
				&& status.window.display.id === before.window.display.id
				&& Math.abs(status.window.resolution - before.window.resolution) < 0.01
				&& events.some((item) => item.type === "scene-texture-resolution")
				&& status.frame.renderCount > current.frame.renderCount;
		}, "cross-DPI move did not restore the original display in place within 15 seconds");
	}
	const restored = await command({ action: "standard-render-check" });
	if (JSON.stringify(restored) !== JSON.stringify(baseline)) {
		throw new Error("cross-DPI restore changed standard filter/mask/RenderTexture output");
	}
	return {
		passed: true,
		skipped: false,
		from: { display: before.window.display.id, resolution: before.window.resolution },
		to: { display: moved.window.display.id, resolution: moved.window.resolution },
		runtime: moved.runtime,
		input: inputAtTarget,
	};
};

const [name = "status", ...args] = process.argv.slice(2);
if (name === "status") {
	console.log(JSON.stringify(await request("/status"), null, 2));
} else if (name === "animation-check") {
	const before = await request("/status");
	await sleep(300);
	const after = await request("/status");
	const frames = after.frame.renderCount - before.frame.renderCount;
	if (!Number.isFinite(frames) || frames <= 0) throw new Error("demo animation lease did not present frames");
	console.log(JSON.stringify({ passed: true, frames }, null, 2));
} else if (name === "tree") {
	console.log(JSON.stringify(await request(`/tree?depth=${args[0] ?? 4}&limit=${args[1] ?? 200}`), null, 2));
} else if (name === "capture") {
	console.log(JSON.stringify(await request("/capture", { method: "POST" }), null, 2));
} else if (name === "multi-bundle") {
	const expected = Number(args[0]);
	if (!Number.isInteger(expected) || expected < 1) throw new Error("usage: pixi-debug multi-bundle <expected-count>");
	const status = await waitForStatus(
		(value) => value.runtime.state === "running" && value.frame.fastBundleCount === expected
			&& value.frame.submitCount > 0 && value.frame.presentCount > 0,
		`native fast path did not compile ${expected} bundles`,
	);
	const capture = await request("/capture", { method: "POST" });
	if (!(capture.bytes > 0)) throw new Error("multi-bundle capture is empty");
	console.log(JSON.stringify({ passed: true, expected, frame: status.frame, capture }, null, 2));
} else if (name === "smoke") {
	const results = [];
	let status = await request("/status");
	if (status.runtime.state !== "running") throw new Error(`runtime starts in ${status.runtime.state}`);
	const standardBaseline = await command({ action: "standard-render-check" });
	results.push({ check: "standard-render-baseline", ...standardBaseline });
	const resize = await resizeLifecycleCheck();
	results.push({ check: "window-resize", ...resize });
	const dpi = await dpiLifecycleCheck();
	results.push({ check: "cross-dpi", ...dpi });
	const hover = await command({ action: "hover", label: "interactive-mark" });
	if (!hover.hovered) throw new Error(`logical pointer coordinates missed at ${status.window.resolution}x DPI`);
	results.push({ check: "logical-pointer-hit", resolution: status.window.resolution });
	let realInputFailure = null;
	try {
		results.push({ check: "real-win32-input", ...await realInputCheck() });
	} catch (error) {
		realInputFailure = error;
		results.push({ check: "real-win32-input", passed: false, error: error instanceof Error ? error.message : String(error) });
	}
	const textBegin = await command({ action: "text-begin", text: "中文" });
	status = await request("/status");
	if (!status.host.textInputActive) throw new Error("native text input session did not start");
	const textEnd = await command({ action: "text-end" });
	results.push({ check: "text-input-session", begin: textBegin, end: textEnd });
	const textControl = await command({ action: "text-control-check" });
	results.push({ check: "text-input-render", samples: textControl.samples });
	const jobRead = await command({ action: "job-read" });
	if (!(jobRead.bytes > 0)) throw new Error("native async file read returned no data");
	const jobScan = await command({ action: "job-scan" });
	if (!(jobScan.count > 0)) throw new Error("native async directory scan returned no entries");
	results.push({ check: "async-jobs", readBytes: jobRead.bytes, scanEntries: jobScan.count });
	const animatedAt = (await request("/status")).frame.renderCount;
	await sleep(200);
	status = await request("/status");
	if (status.frame.renderCount <= animatedAt) throw new Error("demo animation lease did not present frames");
	results.push({ check: "animation-lease", frames: status.frame.renderCount - animatedAt });
	await command({ action: "animation", enabled: false });
	await sleep(300);
	const idleAt = (await request("/status")).frame.renderCount;
	await sleep(500);
	status = await request("/status");
	if (status.frame.renderCount !== idleAt) throw new Error("idle product window continued presenting frames");
	results.push({ check: "dirty-frame-idle", renderCount: idleAt });
	await command({ action: "animation", enabled: true });
	const timeoutPresent = status.frame.renderCount;
	await command({ action: "fault", kind: "surface-timeout" });
	status = await waitForStatus((value) => value.runtime.state === "running"
		&& value.frame.renderCount > timeoutPresent, "surface timeout did not resume");
	results.push({ check: "surface-timeout", renderCount: status.frame.renderCount });
	for (const kind of ["surface-outdated", "surface-lost", "device-lost", "internal"]) {
		if (kind === "internal") await sleep(30_500);
		status = await injectRecoverableFault(kind);
		const standard = await command({ action: "standard-render-check" });
		if (JSON.stringify(standard) !== JSON.stringify(standardBaseline)) {
			throw new Error(`${kind} changed standard filter/mask/RenderTexture output`);
		}
		results.push({ check: kind, runtime: status.runtime, renderCount: status.frame.renderCount, standard });
	}
	await command({ action: "pause" });
	await sleep(200);
	const pausedAt = (await request("/status")).frame.renderCount;
	await sleep(500);
	status = await request("/status");
	if (status.frame.renderCount !== pausedAt) throw new Error("pause continued presenting frames");
	await command({ action: "step", frames: 3 });
	status = await waitForStatus((value) => value.frame.renderCount >= pausedAt + 3, "step did not present three frames");
	results.push({ check: "pause-step", frames: status.frame.renderCount - pausedAt });
	await command({ action: "resume" });
	await command({ action: "minimize" });
	status = await waitForStatus((value) => value.runtime.state === "suspended", "window did not suspend after minimize");
	const minimizedAt = status.frame.renderCount;
	await sleep(700);
	status = await request("/status");
	if (status.frame.renderCount !== minimizedAt) throw new Error("minimized window continued presenting frames");
	await command({ action: "restore" });
	status = await waitForStatus((value) => value.runtime.state === "running"
		&& value.frame.renderCount > minimizedAt, "window did not resume presentation");
	results.push({ check: "minimize-restore", runtime: status.runtime });
	const capture = await request("/capture", { method: "POST" });
	if (!(capture.bytes > 0)) throw new Error("capture is empty");
	results.push({ check: "capture", ...capture });
	console.log(JSON.stringify({ passed: !realInputFailure, results }, null, 2));
	if (realInputFailure) throw realInputFailure;
} else if (name === "fault") {
	const kind = args[0];
	if (!kind) throw new Error("usage: pixi-debug fault <device-lost|validation|out-of-memory|internal|surface-timeout|surface-outdated|surface-lost>");
	const before = await request("/status");
	const beforeEvent = before.events.at(-1)?.sequence ?? 0;
	console.log(JSON.stringify(await command({ action: "fault", kind }), null, 2));
	if (["device-lost", "internal", "surface-outdated", "surface-lost"].includes(kind)) {
		const recovered = await waitForStatus((status) => {
			if (kind === "surface-outdated") {
				return status.runtime.state === "running"
					&& status.runtime.recoveryCount === before.runtime.recoveryCount
					&& status.runtime.deviceGeneration === before.runtime.deviceGeneration
					&& status.runtime.surfaceGeneration === before.runtime.surfaceGeneration
					&& status.events.some((event) => event.sequence > beforeEvent
						&& event.type === "surface-reconfigured"
						&& event.data?.reason === "surface outdated")
					&& status.frame.renderCount > before.frame.renderCount;
			}
			const deviceAdvanced = status.runtime.deviceGeneration > before.runtime.deviceGeneration;
			const surfaceAdvanced = kind !== "surface-lost"
				|| status.runtime.surfaceGeneration > before.runtime.surfaceGeneration;
			const recoveryAdvanced = status.runtime.recoveryCount > before.runtime.recoveryCount;
			return status.runtime.state === "running" && recoveryAdvanced && deviceAdvanced && surfaceAdvanced
				&& status.frame.renderCount > before.frame.renderCount;
		}, `${kind} recovery did not resume presentation within 15 seconds`);
		console.log(JSON.stringify({
			recovered: kind !== "surface-outdated",
			reconfigured: kind === "surface-outdated",
			runtime: recovered.runtime,
			frame: recovered.frame,
		}, null, 2));
	}
} else if (name === "resize-check") {
	console.log(JSON.stringify(await resizeLifecycleCheck(), null, 2));
} else if (name === "dpi-check") {
	console.log(JSON.stringify(await dpiLifecycleCheck(), null, 2));
} else if (name === "switch") {
	console.log(JSON.stringify(await command({ action: "switch-gpu", preference: args[0] }), null, 2));
} else if (name === "recover") {
	console.log(JSON.stringify(await command({ action: "recover" }), null, 2));
} else if (name === "standard-render-check") {
	console.log(JSON.stringify(await command({ action: "standard-render-check" }), null, 2));
} else if (name === "text-control-check") {
	console.log(JSON.stringify(await command({ action: "text-control-check" }), null, 2));
} else if (name === "text-control-status") {
	console.log(JSON.stringify(await command({ action: "text-control-status" }), null, 2));
} else if (name === "input-status") {
	console.log(JSON.stringify(await command({ action: "input-status" }), null, 2));
} else if (name === "native-input-check") {
	console.log(JSON.stringify(await realInputCheck(), null, 2));
} else if (name === "native-input-target") {
	console.log(JSON.stringify(await command({ action: "native-input-target", label: args.join(" ") || "interactive-mark" }), null, 2));
} else if (name === "input-reset") {
	console.log(JSON.stringify(await command({ action: "input-reset" }), null, 2));
} else if (name === "animation") {
	console.log(JSON.stringify(await command({ action: "animation", enabled: args[0] !== "off" }), null, 2));
} else if (name === "capture-start") {
	console.log(JSON.stringify(await command({ action: "capture-start" }), null, 2));
} else if (name === "capture-release") {
	console.log(JSON.stringify(await command({ action: "capture-release" }), null, 2));
} else if (name === "file-drop-status") {
	console.log(JSON.stringify(await command({ action: "file-drop-status" }), null, 2));
} else if (name === "file-drop-reset") {
	console.log(JSON.stringify(await command({ action: "file-drop-reset" }), null, 2));
} else if (name === "save-dialog") {
	console.log(JSON.stringify(await command({
		action: "save-dialog",
		startingFolder: args[0],
		defaultName: args[1],
		allowedFileTypes: args[2],
	}), null, 2));
} else if (name === "drag-out-prepare") {
	console.log(JSON.stringify(await command({ action: "drag-out-prepare", path: args[0] }), null, 2));
} else if (name === "drag-out-status") {
	console.log(JSON.stringify(await command({ action: "drag-out-status" }), null, 2));
} else if (name === "text-begin") {
	console.log(JSON.stringify(await command({ action: "text-begin", text: args.join(" ") }), null, 2));
} else if (name === "text-status") {
	console.log(JSON.stringify(await command({ action: "text-status" }), null, 2));
} else if (name === "text-end") {
	console.log(JSON.stringify(await command({ action: "text-end" }), null, 2));
} else if (name === "close") {
	console.log(JSON.stringify(await command({ action: "close" }), null, 2));
} else if (["pause", "resume", "minimize", "restore"].includes(name)) {
	console.log(JSON.stringify(await command({ action: name }), null, 2));
} else if (name === "step") {
	console.log(JSON.stringify(await command({ action: "step", frames: Number(args[0] ?? 1) }), null, 2));
} else if (name === "click") {
	console.log(JSON.stringify(await command({ action: "click", label: args.join(" ") }), null, 2));
} else if (name === "drag") {
	const [label, dx, dy] = args;
	if (!label || !Number.isFinite(Number(dx)) || !Number.isFinite(Number(dy))) {
		throw new Error("usage: pixi-debug drag <label> <dx> <dy>");
	}
	console.log(JSON.stringify(await command({ action: "drag", label, dx: Number(dx), dy: Number(dy) }), null, 2));
} else if (name === "hover") {
	const result = await command({ action: "hover", label: args.join(" ") });
	console.log(JSON.stringify(result, null, 2));
	if (!result.hovered) throw new Error(`hover missed ${result.label} at ${result.x},${result.y}`);
} else {
	throw new Error(`unknown command: ${name}`);
}
