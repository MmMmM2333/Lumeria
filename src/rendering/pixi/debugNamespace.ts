export const LUMERIA_DEBUG_GLOBAL_KEY = "__LUMERIA_DEBUG__";

type DebugTarget = Record<string, unknown>;

function getNamespace(
  target: DebugTarget | null | undefined = globalThis as unknown as DebugTarget,
  options: { create?: boolean } = {},
): DebugTarget | null {
  if (!target) return null;
  const existing = target[LUMERIA_DEBUG_GLOBAL_KEY];
  if (existing && typeof existing === "object") return existing as DebugTarget;
  if (options.create === false) return null;
  const namespace = {};
  target[LUMERIA_DEBUG_GLOBAL_KEY] = namespace;
  return namespace;
}

export function readLaunchpadDebugValue(
  key: string,
  target: DebugTarget = globalThis as unknown as DebugTarget,
): unknown {
  return getNamespace(target, { create: false })?.[key];
}

export function hasLaunchpadDebugValue(
  key: string,
  target: DebugTarget = globalThis as unknown as DebugTarget,
): boolean {
  const namespace = getNamespace(target, { create: false });
  return Boolean(namespace && Object.prototype.hasOwnProperty.call(namespace, key));
}

export function setLaunchpadDebugValue<T>(
  key: string,
  value: T,
  target: DebugTarget = globalThis as unknown as DebugTarget,
): T {
  const namespace = getNamespace(target);
  if (!namespace) return value;
  namespace[key] = value;
  return value;
}

export function deleteLaunchpadDebugValue(
  key: string,
  target: DebugTarget = globalThis as unknown as DebugTarget,
): void {
  const namespace = getNamespace(target, { create: false });
  if (!namespace) return;
  delete namespace[key];
  if (!Object.keys(namespace).length) delete target[LUMERIA_DEBUG_GLOBAL_KEY];
}
