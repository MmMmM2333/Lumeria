import { DiagnosticError } from "./diagnosticError.js";

export const SCENE_DIAGNOSTICS_STATE_SCHEMA = "lumeria-scene-diagnostics-state/v1";
export const SCENE_DIAGNOSTIC_CHANNELS = Object.freeze(["dragHit", "folderHandoff", "singleStage"]);

const DEFAULT_FOLDER_HANDOFF_OPTIONS = Object.freeze({
  lineWidth: 3,
  log: true,
  overlay: true,
  timeline: false,
});

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function requireChannel(channelInput) {
  const channel = String(channelInput || "").trim();
  if (!SCENE_DIAGNOSTIC_CHANNELS.includes(channel)) {
    throw new DiagnosticError("scene-diagnostics-channel-invalid", `不支持场景诊断通道 ${channel || "(empty)"}`, {
      details: { channel: channel || null },
      nextActions: [`使用 ${SCENE_DIAGNOSTIC_CHANNELS.join("、")} 之一`],
    });
  }
  return channel;
}

function normalizeFolderHandoffOptions(value) {
  if (value == null || value === false) return null;
  if (value === true) return { ...DEFAULT_FOLDER_HANDOFF_OPTIONS };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new DiagnosticError("scene-diagnostics-config-invalid", "文件夹 handoff 诊断配置必须是布尔值、对象或 null", {
      details: { value },
      nextActions: ["传入 true 使用默认配置，或传入 lineWidth/log/overlay/timeline 对象"],
    });
  }
  return {
    lineWidth: Math.max(1, Number(value.lineWidth) || DEFAULT_FOLDER_HANDOFF_OPTIONS.lineWidth),
    log: value.log !== false,
    overlay: value.overlay !== false,
    timeline: value.timeline === true,
  };
}

export function createSceneDiagnosticsState(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const channels = new Map(SCENE_DIAGNOSTIC_CHANNELS.map((channel) => [channel, {
    snapshot: null,
    updatedAt: null,
  }]));
  const clearHandlers = new Map(SCENE_DIAGNOSTIC_CHANNELS.map((channel) => [channel, null]));
  let folderHandoffConfig = null;
  let revision = 0;

  function configureFolderHandoff(value) {
    folderHandoffConfig = normalizeFolderHandoffOptions(value);
    revision += 1;
    return cloneJson(folderHandoffConfig);
  }

  function folderHandoffOptions() {
    return cloneJson(folderHandoffConfig);
  }

  function publish(channelInput, value, publishOptions = {}) {
    const channel = requireChannel(channelInput);
    const current = channels.get(channel);
    if (value == null && current.snapshot == null && !publishOptions.merge) return null;
    let next = cloneJson(value);
    if (publishOptions.merge) {
      if (next == null || typeof next !== "object" || Array.isArray(next)) {
        throw new DiagnosticError("scene-diagnostics-snapshot-invalid", "合并发布需要普通对象快照", {
          details: { channel },
          nextActions: ["传入普通对象，或移除 merge 选项"],
        });
      }
      next = {
        ...(current.snapshot && typeof current.snapshot === "object" ? current.snapshot : {}),
        ...next,
      };
    }
    current.snapshot = next;
    current.updatedAt = String(now());
    revision += 1;
    return cloneJson(next);
  }

  function read(channelInput) {
    const channel = requireChannel(channelInput);
    return cloneJson(channels.get(channel).snapshot);
  }

  function registerClearHandler(channelInput, handler) {
    const channel = requireChannel(channelInput);
    if (typeof handler !== "function") throw new TypeError("Scene diagnostics clear handlers must be functions");
    const previous = clearHandlers.get(channel);
    clearHandlers.set(channel, handler);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      if (clearHandlers.get(channel) === handler) clearHandlers.set(channel, previous);
    };
  }

  function clear(channelInput = null) {
    const targetChannels = channelInput == null
      ? [...SCENE_DIAGNOSTIC_CHANNELS]
      : [requireChannel(channelInput)];
    const failures = [];
    for (const channel of targetChannels) {
      const handler = clearHandlers.get(channel);
      if (handler) {
        try {
          handler();
        } catch (error) {
          failures.push({
            channel,
            handlerIndex: 0,
            message: String(error?.message || error),
          });
        }
      }
    }
    if (failures.length) {
      throw new DiagnosticError("scene-diagnostics-clear-failed", "场景诊断视觉状态清理不完整", {
        details: { failures },
        nextActions: ["检查失败通道的图层生命周期后重试 state.clear"],
      });
    }
    for (const channel of targetChannels) {
      const current = channels.get(channel);
      current.snapshot = null;
      current.updatedAt = String(now());
    }
    revision += 1;
    return { clearedChannels: targetChannels, revision };
  }

  function status() {
    return {
      availableChannels: SCENE_DIAGNOSTIC_CHANNELS.filter((channel) => channels.get(channel).snapshot != null),
      folderHandoffEnabled: folderHandoffConfig != null,
      revision,
      state: "ready",
    };
  }

  function snapshot() {
    return {
      channels: Object.fromEntries(SCENE_DIAGNOSTIC_CHANNELS.map((channel) => {
        const current = channels.get(channel);
        return [channel, {
          available: current.snapshot != null,
          snapshot: cloneJson(current.snapshot),
          updatedAt: current.updatedAt,
        }];
      })),
      folderHandoffConfig: cloneJson(folderHandoffConfig),
      generatedAt: String(now()),
      revision,
      schema: SCENE_DIAGNOSTICS_STATE_SCHEMA,
    };
  }

  function reset() {
    const result = clear();
    folderHandoffConfig = null;
    revision += 1;
    return { ...result, revision };
  }

  return Object.freeze({
    clear,
    configureFolderHandoff,
    folderHandoffOptions,
    publish,
    read,
    registerClearHandler,
    reset,
    snapshot,
    status,
  });
}

export const sceneDiagnosticsState = createSceneDiagnosticsState();
