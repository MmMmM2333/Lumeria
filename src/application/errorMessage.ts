export function readErrorMessage(error: unknown): string {
  const structuredMessage = error != null
    && (typeof error === "object" || typeof error === "function")
    && "message" in error
    ? error.message
    : undefined;
  return String(structuredMessage || error || "").trim();
}
