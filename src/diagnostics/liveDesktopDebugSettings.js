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

export const DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS = Object.freeze({
  compositorKeeper: false,
  cssFallbackEffects: false,
  debugFrameSourceOverride: null,
  disableMouseRelay: true,
  forceDwmFlush: false,
  skipBlankFrames: false,
});

const SETTING_NAMES = Object.freeze(Object.keys(DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS));
const BOOLEAN_SETTING_NAMES = Object.freeze(SETTING_NAMES.filter((name) => name !== "debugFrameSourceOverride"));

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValues(values) {
  return { ...values };
}

function resolveBrowserStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage || null;
}

function decodeSetting(name, rawValue) {
  if (name === "debugFrameSourceOverride") {
    return rawValue === LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      ? LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      : null;
  }
  if (name === "disableMouseRelay") return rawValue !== "false";
  return rawValue === "true";
}

function encodeSetting(name, value) {
  if (name === "debugFrameSourceOverride") {
    return value === LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      ? LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      : null;
  }
  if (name === "disableMouseRelay") return value ? null : "false";
  return value ? "true" : null;
}

export function normalizeLiveDesktopDebugSettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};
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

export function validateLiveDesktopDebugSettingsPatch(patch) {
  if (!isPlainObject(patch)) {
    throw new DiagnosticError("diagnostic-params-invalid", "Live Desktop 调试设置 patch 必须是对象", {
      details: { receivedType: Array.isArray(patch) ? "array" : typeof patch },
      nextActions: ["传入仅包含受支持设置名的对象"],
    });
  }
  const unknownNames = Object.keys(patch).filter((name) => !SETTING_NAMES.includes(name));
  const invalidBooleanNames = BOOLEAN_SETTING_NAMES.filter((name) => (
    Object.hasOwn(patch, name) && typeof patch[name] !== "boolean"
  ));
  const hasInvalidFrameSource = Object.hasOwn(patch, "debugFrameSourceOverride")
    && patch.debugFrameSourceOverride !== null
    && patch.debugFrameSourceOverride !== LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN;
  if (unknownNames.length || invalidBooleanNames.length || hasInvalidFrameSource) {
    throw new DiagnosticError("diagnostic-params-invalid", "Live Desktop 调试设置包含未知名称或非法值", {
      details: {
        invalidBooleanNames,
        invalidFrameSource: hasInvalidFrameSource ? patch.debugFrameSourceOverride : null,
        unknownNames,
      },
      nextActions: [
        `布尔设置必须使用 true/false；debugFrameSourceOverride 仅接受 null 或 ${LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN}`,
      ],
    });
  }
  return { ...patch };
}

export function validateLiveDesktopRestartOptions(options, label = "Live Desktop 运行时选项") {
  if (!isPlainObject(options)) {
    throw new DiagnosticError("diagnostic-params-invalid", `${label}必须是对象`, {
      details: { receivedType: Array.isArray(options) ? "array" : typeof options },
      nextActions: ["传入空对象，或仅传入布尔字段 restart"],
    });
  }
  const unknownNames = Object.keys(options).filter((name) => name !== "restart");
  const hasInvalidRestart = Object.hasOwn(options, "restart") && typeof options.restart !== "boolean";
  if (unknownNames.length || hasInvalidRestart) {
    throw new DiagnosticError("diagnostic-params-invalid", `${label}包含未知名称或非法值`, {
      details: {
        invalidRestart: hasInvalidRestart ? options.restart : null,
        unknownNames,
      },
      nextActions: ["restart 仅接受 true 或 false"],
    });
  }
  return { ...options };
}

export function createLiveDesktopDebugSettingsStore(options = {}) {
  const storage = options.storage === undefined ? resolveBrowserStorage() : options.storage;
  const notify = typeof options.notify === "function" ? options.notify : null;

  function readRaw(name) {
    if (!storage || typeof storage.getItem !== "function") {
      throw new Error("localStorage is unavailable");
    }
    return storage.getItem(LIVE_DESKTOP_DEBUG_STORAGE_KEYS[name]);
  }

  function read() {
    const values = {};
    const issues = [];
    for (const name of SETTING_NAMES) {
      try {
        values[name] = decodeSetting(name, readRaw(name));
      } catch (error) {
        values[name] = DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS[name];
        issues.push({
          code: "live-desktop-settings-read-failed",
          message: `读取 Live Desktop 调试设置 ${name} 失败`,
          name,
          storageKey: LIVE_DESKTOP_DEBUG_STORAGE_KEYS[name],
          technicalDetail: String(error?.message || error),
        });
      }
    }
    return {
      issues,
      schema: LIVE_DESKTOP_DEBUG_SETTINGS_SCHEMA,
      values: normalizeLiveDesktopDebugSettings(values),
    };
  }

  function writeRaw(name, rawValue) {
    const storageKey = LIVE_DESKTOP_DEBUG_STORAGE_KEYS[name];
    if (!storage || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") {
      throw new Error("localStorage is unavailable");
    }
    if (rawValue == null) storage.removeItem(storageKey);
    else storage.setItem(storageKey, rawValue);
  }

  function rollback(previousRawValues) {
    const rollbackFailures = [];
    for (const name of [...SETTING_NAMES].reverse()) {
      try {
        writeRaw(name, previousRawValues[name]);
      } catch (error) {
        rollbackFailures.push({ name, technicalDetail: String(error?.message || error) });
      }
    }
    return rollbackFailures;
  }

  function write(patch = {}) {
    const validatedPatch = validateLiveDesktopDebugSettingsPatch(patch);
    const previousRawValues = {};
    try {
      for (const name of SETTING_NAMES) previousRawValues[name] = readRaw(name);
    } catch (error) {
      throw new DiagnosticError("live-desktop-settings-read-before-write-failed", "写入前无法完整读取 Live Desktop 调试设置", {
        cause: error,
        details: { technicalDetail: String(error?.message || error) },
        nextActions: ["检查浏览器本地存储权限后重试"],
      });
    }
    const beforeValues = Object.fromEntries(SETTING_NAMES.map((name) => (
      [name, decodeSetting(name, previousRawValues[name])]
    )));
    const values = normalizeLiveDesktopDebugSettings({ ...beforeValues, ...validatedPatch });
    try {
      for (const name of SETTING_NAMES) writeRaw(name, encodeSetting(name, values[name]));
    } catch (error) {
      const rollbackFailures = rollback(previousRawValues);
      throw new DiagnosticError("live-desktop-settings-write-failed", "写入 Live Desktop 调试设置失败，已尝试回滚", {
        cause: error,
        details: {
          rollbackFailures,
          technicalDetail: String(error?.message || error),
        },
        nextActions: ["检查浏览器本地存储权限与剩余空间后重试"],
      });
    }
    const snapshot = {
      issues: [],
      schema: LIVE_DESKTOP_DEBUG_SETTINGS_SCHEMA,
      values: cloneValues(values),
    };
    if (notify) {
      try {
        notify(snapshot);
      } catch (error) {
        throw new DiagnosticError("live-desktop-settings-notify-failed", "Live Desktop 调试设置已保存，但通知应用失败", {
          cause: error,
          details: {
            persisted: true,
            technicalDetail: String(error?.message || error),
            values: cloneValues(values),
          },
          nextActions: ["刷新诊断状态，确认应用层是否已读取新设置"],
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
