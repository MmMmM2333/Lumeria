import { nativeFrameHost } from "./platform/native-frame-host";
import { NativeJobs } from "./platform/native-jobs";
import { nativePlatform } from "./platform/native-platform";
// Keep registrations on the same module instance that owns the native callback.
export { GlobalShortcut as NativeGlobalShortcut } from "../.hutch/devkit-dcomp-2.0.1/api/sdks/main/proc/native";
export { NativeTray, type NativeTrayOptions } from "./runtime/native-tray";
export { openPath as openNativePath } from "../.hutch/devkit-dcomp-2.0.1/api/sdks/main/core/Utils";
export { openExternal as openNativeExternalUrl } from "../.hutch/devkit-dcomp-2.0.1/api/sdks/main/core/Utils";

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
  type NativeWindowFrame,
} from "./runtime/native-app";
export { registerNativeFont, registerNativeFontData } from "./rendering/native-skia";
export { createTextInputHost, TextInput, TextInputHost } from "./input/text-input";
export { readNativeSystemPreferences, subscribeNativeSystemPreferences } from "./platform/native-system-preferences";
export { readNativeTouchpad,type NativeTouchpadMetadata } from "./platform/native-touchpad";
export { attachNativeDevtools, type NativeDevtoolsOptions } from "./diagnostics/native-devtools";
export type { NativeSystemPreferences } from "./platform/native-system-preferences";
export type { TextInputOptions, TextInputStyle, TextInputHostOptions } from "./input/text-input";

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

export type {NativeWindowMaterial,NativeWindowAppearance,NativeResizeDirection} from "./platform/native-window-presentation";
