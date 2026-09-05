import { nativeFrameHost } from "./platform/native-frame-host";
import { NativeJobs } from "./platform/native-jobs";
import { nativePlatform } from "./platform/native-platform";

process.once("exit", () => {
	try { NativeJobs.shutdown(); } catch (error) { console.error("[jobs] shutdown failed", error); }
});

export {
	createNativePixiApplication,
	type NativeAppFatalEvent,
	type NativeAppPresentedEvent,
	type NativeAppRecoveredEvent,
	type NativeAppResizeEvent,
	type NativeAppState,
	type NativeAppStateChangeEvent,
	type NativeGpuPreference,
	type NativePixiApplication,
	type NativePixiApplicationOptions,
	type NativePresentationMode,
	type NativeResizeMode,
} from "./runtime/native-app";
export { registerNativeFont, registerNativeFontData } from "./rendering/native-skia";

export const nativeHost = Object.freeze({
	platform: nativePlatform,
	jobs: NativeJobs,
	compatibility: Object.freeze({
		abiVersion: nativeFrameHost.abiVersion,
		capabilities: nativeFrameHost.capabilities,
	}),
});

export type {
	NativeFileDrop,
	NativePlatformErrorCode,
	NativePlatformResult,
	OpenFilesOptions,
	OpenFolderOptions,
	SaveFileOptions,
} from "./platform/native-platform";
export type {
	NativeDirectoryEntry,
	NativeDirectoryEntryType,
	NativeJobOptions,
	NativeJobProgress,
} from "./platform/native-jobs";
