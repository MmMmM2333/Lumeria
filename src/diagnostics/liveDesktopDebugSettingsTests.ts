import {
  createLiveDesktopDebugSettingsStore,
  DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS,
  LIVE_DESKTOP_DEBUG_STORAGE_KEYS,
  validateLiveDesktopDebugSettingsPatch,
} from "./liveDesktopDebugSettings.js";
import { DiagnosticError } from "./diagnosticError.js";
import type { LiveDesktopDebugSettingsSnapshot } from "./liveDesktopDebugSettings.js";

type MemoryStorage = ReturnType<typeof createMemoryStorage>;

function createMemoryStorage(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    removeItem(key: string): void {
      values.delete(key);
    },
    setItem(key: string, value: string): void {
      values.set(key, String(value));
    },
    values,
  };
}

export function runLiveDesktopDebugSettingsTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[live desktop debug settings test failed] ${message}`);
  };

  const changes: LiveDesktopDebugSettingsSnapshot[] = [];
  const storage = createMemoryStorage();
  const store = createLiveDesktopDebugSettingsStore({
    notify: (snapshot) => changes.push(snapshot),
    storage,
  });
  const initial = store.read();
  assert(initial.schema === "lumeria-live-desktop-debug-settings/v1", "settings snapshots should expose a stable schema");
  assert(initial.issues.length === 0, "an available empty store should not invent read issues");
  assert(JSON.stringify(initial.values) === JSON.stringify(DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS), "missing keys should decode to documented defaults");

  const written = store.write({
    compositorKeeper: true,
    debugFrameSourceOverride: "testPattern",
    disableMouseRelay: false,
    forceDwmFlush: true,
  });
  assert(written.values.compositorKeeper === true && written.values.disableMouseRelay === false, "writes should return the persisted normalized state");
  assert(storage.values.get(LIVE_DESKTOP_DEBUG_STORAGE_KEYS.debugFrameSourceOverride) === "testPattern", "frame source should use its stable storage encoding");
  assert(storage.values.get(LIVE_DESKTOP_DEBUG_STORAGE_KEYS.disableMouseRelay) === "false", "false mouse-relay setting should remain distinguishable from its true default");
  assert(changes.length === 1 && changes[0]?.values.forceDwmFlush === true, "successful writes should publish one consolidated change");

  for (const invalidPatch of [
    { alphaFloor: true },
    { forceDwmFlush: "true" },
    { debugFrameSourceOverride: "camera" },
    new Date(0),
  ]) {
    let validationFailure: DiagnosticError | null = null;
    try {
      validateLiveDesktopDebugSettingsPatch(invalidPatch);
    } catch (error) {
      validationFailure = error instanceof DiagnosticError ? error : null;
    }
    assert(validationFailure?.code === "diagnostic-params-invalid", "unknown names and coerced setting values should fail explicitly");
  }

  const beforeFailure = new Map(storage.values);
  const failingStorage = {
    ...storage,
    setItem(key: string, value: string) {
      if (key === LIVE_DESKTOP_DEBUG_STORAGE_KEYS.skipBlankFrames) throw new Error("quota denied");
      storage.setItem(key, value);
    },
  };
  const failingStore = createLiveDesktopDebugSettingsStore({ storage: failingStorage });
  let writeFailure: DiagnosticError | null = null;
  try {
    failingStore.write({ compositorKeeper: false, skipBlankFrames: true });
  } catch (error) {
    writeFailure = error instanceof DiagnosticError ? error : null;
  }
  assert(writeFailure?.code === "live-desktop-settings-write-failed", "storage write failures should use a stable explicit code");
  const sortedEntries = (map: ReadonlyMap<string, string>) => [...map].sort(([left], [right]) => left.localeCompare(right));
  assert(JSON.stringify(sortedEntries(storage.values)) === JSON.stringify(sortedEntries(beforeFailure)), "failed multi-key writes should roll back earlier key changes");

  const atomicValues = new Map(beforeFailure);
  let readCount = 0;
  let mutationCount = 0;
  const snapshotReadFailureStore = createLiveDesktopDebugSettingsStore({
    storage: {
      getItem(key: string) {
        readCount += 1;
        if (readCount === 4) throw new Error("read interrupted");
        return atomicValues.get(key) ?? null;
      },
      removeItem(key: string) {
        mutationCount += 1;
        atomicValues.delete(key);
      },
      setItem(key: string, value: string) {
        mutationCount += 1;
        atomicValues.set(key, String(value));
      },
    },
  });
  let snapshotReadFailure: DiagnosticError | null = null;
  try {
    snapshotReadFailureStore.write({ compositorKeeper: false });
  } catch (error) {
    snapshotReadFailure = error instanceof DiagnosticError ? error : null;
  }
  assert(snapshotReadFailure?.code === "live-desktop-settings-read-before-write-failed", "an incomplete rollback snapshot should fail before the first write");
  assert(mutationCount === 0, "a snapshot read failure must not remove or overwrite a setting");
  assert(JSON.stringify(sortedEntries(atomicValues)) === JSON.stringify(sortedEntries(beforeFailure)), "a snapshot read failure must leave storage byte-for-byte unchanged");

  const readFailureStore = createLiveDesktopDebugSettingsStore({
    storage: {
      getItem() {
        throw new Error("storage blocked");
      },
      removeItem() {},
      setItem() {},
    },
  });
  const readFailure = readFailureStore.read();
  assert(readFailure.issues.length === Object.keys(DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS).length, "read failures should be visible per setting");
  assert(readFailure.issues.every((issue) => issue.code === "live-desktop-settings-read-failed"), "read issues should use a stable machine code");
}
