export const NATIVE_DATA_PROTOCOL_VERSION = 1;

export class NativeLaunchError extends Error {
  readonly detail: string;
  readonly kind: string;

  constructor(kind: string, detail: string) {
    super(detail);
    this.name = "NativeLaunchError";
    this.kind = kind;
    this.detail = detail;
  }
}

export function requireNativeRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  return value as Record<string, unknown>;
}

export function readNativeResponse(line: string, operation: string, id: number): unknown {
  const response = requireNativeRecord(JSON.parse(line) as unknown, `${operation} response`);
  if (response.version !== NATIVE_DATA_PROTOCOL_VERSION || response.id !== id || typeof response.ok !== "boolean") {
    throw new Error(`Native data host returned an invalid ${operation} envelope`);
  }
  if (!response.ok) {
    if (operation === "launchApp" && response.error && typeof response.error === "object") {
      const error = requireNativeRecord(response.error, "launchApp response.error");
      if (typeof error.kind === "string" && typeof error.detail === "string") {
        throw new NativeLaunchError(error.kind, error.detail);
      }
    }
    throw new Error(typeof response.error === "string" ? response.error : `${operation} failed`);
  }
  if (!("value" in response)) throw new Error(`Native data host ${operation} response is missing value`);
  return response.value;
}
