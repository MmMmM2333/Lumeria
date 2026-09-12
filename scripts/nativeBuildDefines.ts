/** Development and smoke runners opt in; release builds exclude diagnostics. */
export function nativeBuildDefines(value = process.env.LUMERIA_NATIVE_DIAGNOSTICS_BUILD): Record<string, string> {
  if (value !== undefined && value !== "0" && value !== "1") {
    throw new Error("LUMERIA_NATIVE_DIAGNOSTICS_BUILD must be 0 or 1");
  }
  return { __LUMERIA_DIAGNOSTICS__: value === "1" ? "true" : "false" };
}
