// Native entry mode is resolved once at startup and drives diagnostic gating.
// Kept separate from the entry assembly so the guard rules stay testable and
// the diagnostic branches stay tree-shakeable behind `__LUMERIA_DIAGNOSTICS__`.

export type NativeMode = "app" | "dev" | "smoke";

export function resolveNativeMode(
  configuredMode: string | undefined,
  diagnosticsEnabled: boolean,
): NativeMode {
  if (!diagnosticsEnabled && configuredMode !== undefined) {
    throw new Error("This build excludes native diagnostics; use native:dev or native:smoke for diagnostic modes");
  }
  if (configuredMode !== undefined && configuredMode !== "dev" && configuredMode !== "smoke") {
    throw new Error(`LAUNCHPAD_NATIVE_MODE must be dev or smoke when set, received: ${configuredMode}`);
  }
  return configuredMode ?? "app";
}
