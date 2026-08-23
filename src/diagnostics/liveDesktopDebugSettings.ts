import { DiagnosticError } from "./diagnosticError.js";

export const LIVE_DESKTOP_DEBUG_SETTINGS_SCHEMA = "lumeria-live-desktop-debug-settings/v1";
export const LIVE_DESKTOP_DEBUG_SETTINGS_CHANGED_EVENT = "lumeria-live-desktop-debug-settings-change";
export const LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN = "testPattern";

export const LIVE_DESKTOP_RESTART_OPTIONS_SCHEMA = Object.freeze({
  additionalProperties: false,
  properties: Object.freeze({
    restart: Object.freeze({ type: "boolean" }),
  }),
  type: "object",
});

export const LIVE_DESKTOP_DEBUG_STORAGE_KEYS = Object.freeze({
  compositorKeeper: "lumeriaLiveDesktopCompositorKeeper",
  cssFallbackEffects: "lumeriaLiveDesktopCssFallbackEffects",
  debugFrameSourceOverride: "lumeriaLiveDesktopDebugFrameSourceOverride",
  disableMouseRelay: "lumeriaLiveDesktopDisableMouseRelay",
  forceDwmFlush: "lumeriaLiveDesktopForceDwmFlush",
  skipBlankFrames: "lumeriaLiveDesktopSkipBlankFrames",
});

export type LiveDesktopDebugSettings = Readonly<{
  compositorKeeper: boolean;
  cssFallbackEffects: boolean;
  debugFrameSourceOverride: typeof LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN | null;
  disableMouseRelay: boolean;
  forceDwmFlush: boolean;
  skipBlankFrames: boolean;
}>;

export const DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS: LiveDesktopDebugSettings = Object.freeze({
  compositorKeeper: false,
  cssFallbackEffects: false,
  debugFrameSourceOverride: null,
  disableMouseRelay: true,
  forceDwmFlush: false,
  skipBlankFrames: false,
});

export type LiveDesktopDebugSettingName = keyof LiveDesktopDebugSettings;
export type LiveDesktopBooleanSettingName = Exclude<LiveDesktopDebugSettingName, "debugFrameSourceOverride">;
export type LiveDesktopDebugSettingsPatch = Partial<LiveDesktopDebugSettings>;
export type LiveDesktopRestartOptions = Readonly<{ restart?: boolean }>;

export type LiveDesktopDebugSettingsIssue = Readonly<{
  code: "live-desktop-settings-read-failed";
  message: string;
  name: LiveDesktopDebugSettingName;
  storageKey: string;
  technicalDetail: string;
}>;

export type LiveDesktopDebugSettingsSnapshot = Readonly<{
  issues: readonly LiveDesktopDebugSettingsIssue[];
  schema: typeof LIVE_DESKTOP_DEBUG_SETTINGS_SCHEMA;
  values: LiveDesktopDebugSettings;
}>;

export type LiveDesktopDebugSettingsStorage = Readonly<{
  getItem(key: string): unknown;
  removeItem(key: string): unknown;
  setItem(key: string, value: string): unknown;
}>;

export type LiveDesktopDebugSettingsStore = Readonly<{
  read(): LiveDesktopDebugSettingsSnapshot;
  write(patch?: unknown): LiveDesktopDebugSettingsSnapshot;
}>;

export type LiveDesktopDebugSettingsStoreOptions = Readonly<{
  notify?: (snapshot: LiveDesktopDebugSettingsSnapshot) => unknown;
  storage?: LiveDesktopDebugSettingsStorage | null;
}>;

type UnknownRecord = Record<string, unknown>;
type RawSettingValues = { [Name in LiveDesktopDebugSettingName]: string | null };

const SETTING_NAMES = Object.freeze(
  Object.keys(DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS) as LiveDesktopDebugSettingName[],
);
const BOOLEAN_SETTING_NAMES = Object.freeze(
  SETTING_NAMES.filter(
    (name): name is LiveDesktopBooleanSettingName => name !== "debugFrameSourceOverride",
  ),
);

function isPlainObject(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValues(values: LiveDesktopDebugSettings): LiveDesktopDebugSettings {
  return { ...values };
}

function resolveBrowserStorage(): LiveDesktopDebugSettingsStorage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage || null;
}

function decodeSetting(
  name: "debugFrameSourceOverride",
  rawValue: string | null,
): typeof LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN | null;
function decodeSetting(name: LiveDesktopBooleanSettingName, rawValue: string | null): boolean;
function decodeSetting(name: LiveDesktopDebugSettingName, rawValue: string | null): boolean | typeof LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN | null {
  if (name === "debugFrameSourceOverride") {
    return rawValue === LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      ? LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      : null;
  }
  if (name === "disableMouseRelay") return rawValue !== "false";
  return rawValue === "true";
}

function encodeSetting(
  name: LiveDesktopDebugSettingName,
  value: LiveDesktopDebugSettings[LiveDesktopDebugSettingName],
): string | null {
  if (name === "debugFrameSourceOverride") {
    return value === LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      ? LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      : null;
  }
  if (name === "disableMouseRelay") return value ? null : "false";
  return value ? "true" : null;
}

export function normalizeLiveDesktopDebugSettings(input: unknown = {}): LiveDesktopDebugSettings {
  const source = isPlainObject(input) ? input : {};
  return {
    compositorKeeper: source.compositorKeeper == null
      ? DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS.compositorKeeper
      : Boolean(source.compositorKeeper),
    cssFallbackEffects: source.cssFallbackEffects == null
      ? DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS.cssFallbackEffects
      : Boolean(source.cssFallbackEffects),
    debugFrameSourceOverride: source.debugFrameSourceOverride === LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      ? LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      : null,
    disableMouseRelay: source.disableMouseRelay == null
      ? DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS.disableMouseRelay
      : Boolean(source.disableMouseRelay),
    forceDwmFlush: source.forceDwmFlush == null
      ? DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS.forceDwmFlush
      : Boolean(source.forceDwmFlush),
    skipBlankFrames: source.skipBlankFrames == null
      ? DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS.skipBlankFrames
      : Boolean(source.skipBlankFrames),
  };
}

export function validateLiveDesktopDebugSettingsPatch(patch: unknown): LiveDesktopDebugSettingsPatch {
  if (!isPlainObject(patch)) {
    throw new DiagnosticError("diagnostic-params-invalid", "The Live Desktop debug-settings patch must be an object", {
      details: { receivedType: Array.isArray(patch) ? "array" : typeof patch },
      nextActions: ["Pass an object containing only supported setting names"],
    });
  }
  const unknownNames = Object.keys(patch).filter(
    (name) => !SETTING_NAMES.some((settingName) => settingName === name),
  );
  const invalidBooleanNames = BOOLEAN_SETTING_NAMES.filter((name) => (
    Object.hasOwn(patch, name) && typeof patch[name] !== "boolean"
  ));
  const hasInvalidFrameSource = Object.hasOwn(patch, "debugFrameSourceOverride")
    && patch.debugFrameSourceOverride !== null
    && patch.debugFrameSourceOverride !== LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN;
  if (unknownNames.length || invalidBooleanNames.length || hasInvalidFrameSource) {
    throw new DiagnosticError("diagnostic-params-invalid", "Live Desktop debug settings contain an unknown name or invalid value", {
      details: {
        invalidBooleanNames,
        invalidFrameSource: hasInvalidFrameSource ? patch.debugFrameSourceOverride : null,
        unknownNames,
      },
      nextActions: [
        `Boolean settings must use true/false; debugFrameSourceOverride accepts only null or ${LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN}`,
      ],
    });
  }
  return { ...patch } as LiveDesktopDebugSettingsPatch;
}

export function validateLiveDesktopRestartOptions(
  options: unknown,
  label = "Live Desktop runtime options",
): LiveDesktopRestartOptions {
  if (!isPlainObject(options)) {
    throw new DiagnosticError("diagnostic-params-invalid", `${label} must be an object`, {
      details: { receivedType: Array.isArray(options) ? "array" : typeof options },
      nextActions: ["Pass an empty object, or only the boolean restart field"],
    });
  }
  const unknownNames = Object.keys(options).filter((name) => name !== "restart");
  const hasInvalidRestart = Object.hasOwn(options, "restart") && typeof options.restart !== "boolean";
  if (unknownNames.length || hasInvalidRestart) {
    throw new DiagnosticError("diagnostic-params-invalid", `${label} contains an unknown name or invalid value`, {
      details: {
        invalidRestart: hasInvalidRestart ? options.restart : null,
        unknownNames,
      },
      nextActions: ["restart accepts only true or false"],
    });
  }
  return { ...options } as LiveDesktopRestartOptions;
}

function errorDetail(error: unknown): string {
  return String(error instanceof Error ? error.message : error);
}

function createRawSettingValues(): RawSettingValues {
  return {
    compositorKeeper: null,
    cssFallbackEffects: null,
    debugFrameSourceOverride: null,
    disableMouseRelay: null,
    forceDwmFlush: null,
    skipBlankFrames: null,
  };
}

function decodeRawSettings(rawValues: RawSettingValues): LiveDesktopDebugSettings {
  return {
    compositorKeeper: decodeSetting("compositorKeeper", rawValues.compositorKeeper),
    cssFallbackEffects: decodeSetting("cssFallbackEffects", rawValues.cssFallbackEffects),
    debugFrameSourceOverride: decodeSetting("debugFrameSourceOverride", rawValues.debugFrameSourceOverride),
    disableMouseRelay: decodeSetting("disableMouseRelay", rawValues.disableMouseRelay),
    forceDwmFlush: decodeSetting("forceDwmFlush", rawValues.forceDwmFlush),
    skipBlankFrames: decodeSetting("skipBlankFrames", rawValues.skipBlankFrames),
  };
}

export function createLiveDesktopDebugSettingsStore(
  options: LiveDesktopDebugSettingsStoreOptions = {},
): LiveDesktopDebugSettingsStore {
  const storage = options.storage === undefined ? resolveBrowserStorage() : options.storage;
  const notify = typeof options.notify === "function" ? options.notify : null;

  function readRaw(name: LiveDesktopDebugSettingName): string | null {
    if (!storage || typeof storage.getItem !== "function") {
      throw new Error("localStorage is unavailable");
    }
    const value = storage.getItem(LIVE_DESKTOP_DEBUG_STORAGE_KEYS[name]);
    if (value !== null && typeof value !== "string") {
      throw new TypeError(`localStorage value for ${name} must be a string or null`);
    }
    return value;
  }

  function read(): LiveDesktopDebugSettingsSnapshot {
    const values = createRawSettingValues();
    const issues: LiveDesktopDebugSettingsIssue[] = [];
    for (const name of SETTING_NAMES) {
      try {
        values[name] = readRaw(name);
      } catch (error) {
        values[name] = encodeSetting(name, DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS[name]);
        issues.push({
          code: "live-desktop-settings-read-failed",
          message: `Failed to read Live Desktop debug setting ${name}`,
          name,
          storageKey: LIVE_DESKTOP_DEBUG_STORAGE_KEYS[name],
          technicalDetail: errorDetail(error),
        });
      }
    }
    return {
      issues,
      schema: LIVE_DESKTOP_DEBUG_SETTINGS_SCHEMA,
      values: decodeRawSettings(values),
    };
  }

  function writeRaw(name: LiveDesktopDebugSettingName, rawValue: string | null): void {
    const storageKey = LIVE_DESKTOP_DEBUG_STORAGE_KEYS[name];
    if (!storage || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") {
      throw new Error("localStorage is unavailable");
    }
    if (rawValue == null) storage.removeItem(storageKey);
    else storage.setItem(storageKey, rawValue);
  }

  function rollback(previousRawValues: RawSettingValues) {
    const rollbackFailures: Array<Readonly<{ name: LiveDesktopDebugSettingName; technicalDetail: string }>> = [];
    for (const name of [...SETTING_NAMES].reverse()) {
      try {
        writeRaw(name, previousRawValues[name]);
      } catch (error) {
        rollbackFailures.push({ name, technicalDetail: errorDetail(error) });
      }
    }
    return rollbackFailures;
  }

  function write(patch: unknown = {}): LiveDesktopDebugSettingsSnapshot {
    const validatedPatch = validateLiveDesktopDebugSettingsPatch(patch);
    const previousRawValues = createRawSettingValues();
    try {
      for (const name of SETTING_NAMES) previousRawValues[name] = readRaw(name);
    } catch (error) {
      throw new DiagnosticError("live-desktop-settings-read-before-write-failed", "Live Desktop debug settings could not be read completely before writing", {
        cause: error,
        details: { technicalDetail: errorDetail(error) },
        nextActions: ["Check browser local-storage permissions, then retry"],
      });
    }
    const beforeValues = decodeRawSettings(previousRawValues);
    const values = normalizeLiveDesktopDebugSettings({ ...beforeValues, ...validatedPatch });
    try {
      for (const name of SETTING_NAMES) writeRaw(name, encodeSetting(name, values[name]));
    } catch (error) {
      const rollbackFailures = rollback(previousRawValues);
      throw new DiagnosticError("live-desktop-settings-write-failed", "Writing Live Desktop debug settings failed; rollback was attempted", {
        cause: error,
        details: {
          rollbackFailures,
          technicalDetail: errorDetail(error),
        },
        nextActions: ["Check browser local-storage permissions and remaining space, then retry"],
      });
    }
    const snapshot: LiveDesktopDebugSettingsSnapshot = {
      issues: [],
      schema: LIVE_DESKTOP_DEBUG_SETTINGS_SCHEMA,
      values: cloneValues(values),
    };
    if (notify) {
      try {
        notify(snapshot);
      } catch (error) {
        throw new DiagnosticError("live-desktop-settings-notify-failed", "Live Desktop debug settings were saved, but notifying the application failed", {
          cause: error,
          details: {
            persisted: true,
            technicalDetail: errorDetail(error),
            values: cloneValues(values),
          },
          nextActions: ["Refresh diagnostic state and confirm the application read the new settings"],
        });
      }
    }
    return snapshot;
  }

  return Object.freeze({ read, write });
}

export function createBrowserLiveDesktopDebugSettingsStore() {
  return createLiveDesktopDebugSettingsStore({
    notify(snapshot) {
      if (typeof window === "undefined" || typeof CustomEvent !== "function") return;
      window.dispatchEvent(new CustomEvent(LIVE_DESKTOP_DEBUG_SETTINGS_CHANGED_EVENT, {
        detail: snapshot,
      }));
    },
  });
}

export function readLiveDesktopDebugSettings() {
  return createLiveDesktopDebugSettingsStore().read();
}
