import { Utils } from "./electrobun-sdk";
import { homedir } from "os";
import { join } from "path";
import { nativeFrameHost } from "./native-frame-host";

export type NativePlatformErrorCode = "CANCELLED" | "UNAVAILABLE" | "PLATFORM_ERROR";

export type NativePlatformResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: { code: NativePlatformErrorCode; message: string } };

export interface OpenFilesOptions {
	startingFolder?: string;
	allowedFileTypes?: string;
	multiple?: boolean;
}

export interface OpenFolderOptions {
	startingFolder?: string;
}

export interface SaveFileOptions {
	startingFolder?: string;
	allowedFileTypes?: string;
	defaultName?: string;
}

export interface NativeFileDrop {
	paths: readonly string[];
	x: number;
	y: number;
}

export const nativePlatformCapabilities = Object.freeze({
	clipboard: Object.freeze({ text: true, image: true }),
	dialogs: Object.freeze({ openFiles: true, openFolder: true, saveFile: true }),
	fileTransfer: Object.freeze({ drop: true, dragOut: true }),
});

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

async function invoke<T>(operation: string, call: () => T | Promise<T>): Promise<NativePlatformResult<T>> {
	await nextTurn();
	try {
		return { ok: true, value: await call() };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, error: { code: "PLATFORM_ERROR", message: `${operation}: ${message}` } };
	}
}

const cancelled = <T>(operation: string): NativePlatformResult<T> => ({
	ok: false,
	error: { code: "CANCELLED", message: `${operation} was cancelled` },
});

const dropListeners = new Set<(drop: NativeFileDrop) => void>();
let dropTimer: ReturnType<typeof setInterval> | null = null;
const pollDrops = () => {
	try {
		for (let count = 0; count < 128; count++) {
			const event = nativeFrameHost.pollFileDrop();
			if (!event) break;
			const drop = Object.freeze({ paths: event.paths, x: event.x, y: event.y });
			for (const listener of [...dropListeners]) {
				try { listener(drop); } catch (error) { console.error("[native-platform] drop listener failed", error); }
			}
		}
	} catch (error) {
		console.error("[native-platform] file drop polling failed", error);
	}
};

const startDrops = () => {
	if (!dropTimer) dropTimer = setInterval(pollDrops, 8);
};
const stopDrops = () => {
	if (dropTimer && dropListeners.size === 0) clearInterval(dropTimer);
	if (dropListeners.size === 0) dropTimer = null;
};
const folderPath = (value?: string) => !value ? homedir()
	: value === "~" ? homedir()
		: value.startsWith("~/") || value.startsWith("~\\") ? join(homedir(), value.slice(2)) : value;
const saveFilter = (value = "*") => {
	const patterns = value.trim() === "" || value.trim() === "*" ? ["*.*"] : value
		.split(/[;,|]/)
		.map((item) => item.trim())
		.filter(Boolean)
		.map((item) => item.includes("*") ? item : item.startsWith(".") ? `*${item}` : `*.${item}`);
	return `Allowed files\0${patterns.join(";")}\0All files\0*.*\0\0`;
};

export const nativePlatform = Object.freeze({
	capabilities: nativePlatformCapabilities,
	clipboard: Object.freeze({
		readText: () => invoke("clipboard.readText", Utils.clipboardReadText),
		writeText: (text: string) => invoke("clipboard.writeText", () => Utils.clipboardWriteText(text)),
		clear: () => invoke("clipboard.clear", Utils.clipboardClear),
		readImage: () => invoke("clipboard.readImage", Utils.clipboardReadImage),
		writeImage: (pngData: Uint8Array) =>
			invoke("clipboard.writeImage", () => Utils.clipboardWriteImage(pngData)),
	}),
	dialogs: Object.freeze({
		async openFiles(options: OpenFilesOptions = {}): Promise<NativePlatformResult<string[]>> {
			const result = await invoke("dialogs.openFiles", () => Utils.openFileDialog({
				startingFolder: options.startingFolder ?? "~/",
				allowedFileTypes: options.allowedFileTypes ?? "*",
				canChooseFiles: true,
				canChooseDirectory: false,
				allowsMultipleSelection: options.multiple ?? true,
			}));
			return result.ok && result.value.length === 0 ? cancelled("dialogs.openFiles") : result;
		},
		async openFolder(options: OpenFolderOptions = {}): Promise<NativePlatformResult<string>> {
			const result = await invoke("dialogs.openFolder", () => Utils.openFileDialog({
				startingFolder: options.startingFolder ?? "~/",
				allowedFileTypes: "*",
				canChooseFiles: false,
				canChooseDirectory: true,
				allowsMultipleSelection: false,
			}));
			if (!result.ok) return result;
			return result.value[0] ? { ok: true, value: result.value[0] } : cancelled("dialogs.openFolder");
		},
		async saveFile(options: SaveFileOptions = {}): Promise<NativePlatformResult<string>> {
			const result = await invoke("dialogs.saveFile", () => nativeFrameHost.saveFileDialog(
				options.defaultName ?? "", folderPath(options.startingFolder), saveFilter(options.allowedFileTypes),
			));
			if (!result.ok) return result;
			return result.value === null ? cancelled("dialogs.saveFile") : { ok: true, value: result.value };
		},
	}),
	fileTransfer: Object.freeze({
		subscribeDrops: (listener: (drop: NativeFileDrop) => void) => invoke("fileTransfer.drop", () => {
			if (typeof listener !== "function") throw new TypeError("drop listener must be a function");
			dropListeners.add(listener);
			startDrops();
			return () => { dropListeners.delete(listener); stopDrops(); };
		}),
		dragOut: (windowHandle: number, paths: readonly string[]) => invoke("fileTransfer.dragOut", () => {
			return nativeFrameHost.dragOut(windowHandle, paths);
		}),
	}),
});
