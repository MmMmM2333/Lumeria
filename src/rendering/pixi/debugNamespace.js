export const LUMERIA_DEBUG_GLOBAL_KEY = "__LUMERIA_DEBUG__";

function getNamespace(target = globalThis, options = {}) {
  if (!target) return null;
  const existing = target[LUMERIA_DEBUG_GLOBAL_KEY];
  if (existing && typeof existing === "object") return existing;
  if (options.create === false) return null;
  const namespace = {};
  target[LUMERIA_DEBUG_GLOBAL_KEY] = namespace;
  return namespace;
}

export function readLaunchpadDebugValue(key, target = globalThis) {
  return getNamespace(target, { create: false })?.[key];
}

export function hasLaunchpadDebugValue(key, target = globalThis) {
  const namespace = getNamespace(target, { create: false });
  return Boolean(namespace && Object.prototype.hasOwnProperty.call(namespace, key));
}

export function setLaunchpadDebugValue(key, value, target = globalThis) {
  const namespace = getNamespace(target);
  if (!namespace) return value;
  namespace[key] = value;
  return value;
}

export function deleteLaunchpadDebugValue(key, target = globalThis) {
  const namespace = getNamespace(target, { create: false });
  if (!namespace) return;
  delete namespace[key];
  if (!Object.keys(namespace).length) delete target[LUMERIA_DEBUG_GLOBAL_KEY];
}
