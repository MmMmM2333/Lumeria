export type ContractPrimitive = boolean | null | number | string | undefined;

export type ContractValue =
  | ContractPrimitive
  | ContractRecord
  | readonly ContractValue[]
  | ReadonlyMap<ContractValue, ContractValue>
  | ReadonlySet<ContractValue>;

export type ContractRecord = Readonly<{
  [key: string]: ContractValue;
}>;

const readonlyContractCollections = new WeakSet<object>();

function mutationError(kind: "Map" | "Set"): never {
  throw new TypeError(`published contract ${kind} values are read-only`);
}

function makeReadonlyMap(values: Map<unknown, unknown>): Map<unknown, unknown> {
  let proxy: Map<unknown, unknown>;
  proxy = new Proxy(values, {
    get(target, property) {
      if (property === "set" || property === "delete" || property === "clear") {
        return () => mutationError("Map");
      }
      if (property === "forEach") {
        return (
          callback: (value: unknown, key: unknown, map: Map<unknown, unknown>) => void,
          thisArg?: unknown,
        ): void => {
          target.forEach((value, key) => callback.call(thisArg, value, key, proxy));
        };
      }
      const member = Reflect.get(target, property, target) as unknown;
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
  readonlyContractCollections.add(proxy);
  return Object.freeze(proxy);
}

function makeReadonlySet(values: Set<unknown>): Set<unknown> {
  let proxy: Set<unknown>;
  proxy = new Proxy(values, {
    get(target, property) {
      if (property === "add" || property === "delete" || property === "clear") {
        return () => mutationError("Set");
      }
      if (property === "forEach") {
        return (
          callback: (value: unknown, key: unknown, set: Set<unknown>) => void,
          thisArg?: unknown,
        ): void => {
          target.forEach((value) => callback.call(thisArg, value, value, proxy));
        };
      }
      const member = Reflect.get(target, property, target) as unknown;
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
  readonlyContractCollections.add(proxy);
  return Object.freeze(proxy);
}

function assertSupportedPrimitive(value: unknown, label: string): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError(`${label} must not contain non-finite numbers`);
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new TypeError(`${label} must contain only data values`);
  }
}

/**
 * Copy a renderer/session contract value into a detached, deeply immutable
 * snapshot. Map and Set retain their native read APIs and instanceof identity,
 * while every mutation method fails explicitly.
 */
export function snapshotContractValue<T>(
  value: T,
  label = "contract value",
  seen = new WeakMap<object, unknown>(),
): T {
  if (value == null || typeof value !== "object") {
    assertSupportedPrimitive(value, label);
    return value;
  }

  if (seen.has(value)) return seen.get(value) as T;

  if (Array.isArray(value)) {
    const snapshot: unknown[] = [];
    seen.set(value, snapshot);
    value.forEach((entry, index) => {
      snapshot.push(snapshotContractValue(entry, `${label}[${index}]`, seen));
    });
    return Object.freeze(snapshot) as T;
  }

  if (value instanceof Map) {
    const values = new Map<unknown, unknown>();
    const snapshot = makeReadonlyMap(values);
    seen.set(value, snapshot);
    for (const [key, entry] of value) {
      values.set(
        snapshotContractValue(key, `${label} Map key`, seen),
        snapshotContractValue(entry, `${label} Map value`, seen),
      );
    }
    return snapshot as T;
  }

  if (value instanceof Set) {
    const values = new Set<unknown>();
    const snapshot = makeReadonlySet(values);
    seen.set(value, snapshot);
    for (const entry of value) {
      values.add(snapshotContractValue(entry, `${label} Set value`, seen));
    }
    return snapshot as T;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must contain only plain records, arrays, Map, and Set values`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(`${label} must not contain symbol properties`);
  }

  const snapshot = (prototype === null ? Object.create(null) : {}) as Record<string, unknown>;
  seen.set(value, snapshot);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (descriptor.get || descriptor.set) {
      throw new TypeError(`${label}.${key} must be a data property`);
    }
    if (descriptor.enumerable) {
      snapshot[key] = snapshotContractValue(descriptor.value, `${label}.${key}`, seen);
    }
  }
  return Object.freeze(snapshot) as T;
}

/** Validate that a published value is the deep immutable snapshot form. */
export function assertContractSnapshot(
  value: unknown,
  label = "contract value",
  seen = new WeakSet<object>(),
): void {
  if (value == null || typeof value !== "object") {
    assertSupportedPrimitive(value, label);
    return;
  }
  if (seen.has(value)) return;
  seen.add(value);

  if (!Object.isFrozen(value)) throw new TypeError(`${label} must be immutable`);

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertContractSnapshot(entry, `${label}[${index}]`, seen));
    return;
  }

  if (value instanceof Map) {
    if (!readonlyContractCollections.has(value)) {
      throw new TypeError(`${label} Map must reject mutation`);
    }
    for (const [key, entry] of value) {
      assertContractSnapshot(key, `${label} Map key`, seen);
      assertContractSnapshot(entry, `${label} Map value`, seen);
    }
    return;
  }

  if (value instanceof Set) {
    if (!readonlyContractCollections.has(value)) {
      throw new TypeError(`${label} Set must reject mutation`);
    }
    for (const entry of value) assertContractSnapshot(entry, `${label} Set value`, seen);
    return;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain record`);
  }
  for (const [key, entry] of Object.entries(value)) {
    assertContractSnapshot(entry, `${label}.${key}`, seen);
  }
}
