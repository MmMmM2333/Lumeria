import { DiagnosticError } from "./diagnosticError.js";

export const SCENE_DIAGNOSTICS_STATE_SCHEMA = "lumeria-scene-diagnostics-state/v1";
export const SCENE_DIAGNOSTIC_CHANNELS = Object.freeze([
  "dragHit",
  "folderHandoff",
  "singleStage",
] as const);
export type SceneDiagnosticChannel = typeof SCENE_DIAGNOSTIC_CHANNELS[number];

export interface FolderHandoffDiagnosticOptions {
  lineWidth: number;
  log: boolean;
  overlay: boolean;
  timeline: boolean;
}

export interface SceneDiagnosticsPublishOptions {
  merge?: boolean;
}

export interface SceneDiagnosticsStateOptions {
  now?: () => unknown;
}

export interface SceneDiagnosticsChannelSnapshot {
  available: boolean;
  snapshot: unknown;
  updatedAt: string | null;
}

export interface SceneDiagnosticsSnapshot {
  channels: Record<SceneDiagnosticChannel, SceneDiagnosticsChannelSnapshot>;
  folderHandoffConfig: FolderHandoffDiagnosticOptions | null;
  generatedAt: string;
  revision: number;
  schema: typeof SCENE_DIAGNOSTICS_STATE_SCHEMA;
}

export interface SceneDiagnosticsStatus {
  availableChannels: SceneDiagnosticChannel[];
  folderHandoffEnabled: boolean;
  revision: number;
  state: "ready";
}

export interface SceneDiagnosticsClearResult {
  clearedChannels: SceneDiagnosticChannel[];
  revision: number;
}

export interface SceneDiagnosticsState {
  clear(channelInput?: unknown): SceneDiagnosticsClearResult;
  configureFolderHandoff(value: unknown): FolderHandoffDiagnosticOptions | null;
  folderHandoffOptions(): FolderHandoffDiagnosticOptions | null;
  publish(
    channelInput: unknown,
    value: unknown,
    publishOptions?: SceneDiagnosticsPublishOptions,
  ): unknown;
  read(channelInput: unknown): unknown;
  registerClearHandler(channelInput: unknown, handler: unknown): () => void;
  reset(): SceneDiagnosticsClearResult;
  snapshot(): SceneDiagnosticsSnapshot;
  status(): SceneDiagnosticsStatus;
}

interface MutableSceneDiagnosticsChannelState {
  snapshot: unknown;
  updatedAt: string | null;
}

const DEFAULT_FOLDER_HANDOFF_OPTIONS = Object.freeze({
  lineWidth: 3,
  log: true,
  overlay: true,
  timeline: false,
});

function cloneJson<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireChannel(channelInput: unknown): SceneDiagnosticChannel {
  const channel = String(channelInput || "").trim();
  if (!(SCENE_DIAGNOSTIC_CHANNELS as readonly string[]).includes(channel)) {
    throw new DiagnosticError(
      "scene-diagnostics-channel-invalid",
      `Unsupported scene diagnostic channel: ${channel || "(empty)"}`,
      {
        details: { channel: channel || null },
        nextActions: [`Use one of: ${SCENE_DIAGNOSTIC_CHANNELS.join(", ")}`],
      },
    );
  }
  return channel as SceneDiagnosticChannel;
}

function normalizeFolderHandoffOptions(value: unknown): FolderHandoffDiagnosticOptions | null {
  if (value == null || value === false) return null;
  if (value === true) return { ...DEFAULT_FOLDER_HANDOFF_OPTIONS };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new DiagnosticError(
      "scene-diagnostics-config-invalid",
      "Folder handoff diagnostic configuration must be a boolean, object, or null",
      {
        details: { value },
        nextActions: [
          "Pass true for default configuration, or an object containing lineWidth/log/overlay/timeline",
        ],
      },
    );
  }
  return {
    lineWidth: Math.max(
      1,
      Number((value as Readonly<Record<string, unknown>>).lineWidth)
        || DEFAULT_FOLDER_HANDOFF_OPTIONS.lineWidth,
    ),
    log: (value as Readonly<Record<string, unknown>>).log !== false,
    overlay: (value as Readonly<Record<string, unknown>>).overlay !== false,
    timeline: (value as Readonly<Record<string, unknown>>).timeline === true,
  };
}

export function createSceneDiagnosticsState(
  options: SceneDiagnosticsStateOptions = {},
): Readonly<SceneDiagnosticsState> {
  const now = typeof options.now === "function"
    ? options.now
    : () => new Date().toISOString();
  const channels = new Map<SceneDiagnosticChannel, MutableSceneDiagnosticsChannelState>(
    SCENE_DIAGNOSTIC_CHANNELS.map((channel) => [channel, {
      snapshot: null,
      updatedAt: null,
    }]),
  );
  const clearHandlers = new Map<SceneDiagnosticChannel, (() => void) | null | undefined>(
    SCENE_DIAGNOSTIC_CHANNELS.map((channel) => [channel, null]),
  );
  let folderHandoffConfig: FolderHandoffDiagnosticOptions | null = null;
  let revision = 0;

  function configureFolderHandoff(value: unknown): FolderHandoffDiagnosticOptions | null {
    folderHandoffConfig = normalizeFolderHandoffOptions(value);
    revision += 1;
    return cloneJson(folderHandoffConfig);
  }

  function folderHandoffOptions(): FolderHandoffDiagnosticOptions | null {
    return cloneJson(folderHandoffConfig);
  }

  function publish(
    channelInput: unknown,
    value: unknown,
    publishOptions: SceneDiagnosticsPublishOptions = {},
  ): unknown {
    const channel = requireChannel(channelInput);
    const current = channels.get(channel)!;
    if (value == null && current.snapshot == null && !publishOptions.merge) return null;
    let next = cloneJson(value);
    if (publishOptions.merge) {
      if (next == null || typeof next !== "object" || Array.isArray(next)) {
        throw new DiagnosticError(
          "scene-diagnostics-snapshot-invalid",
          "Merged publication requires a plain-object snapshot",
          {
            details: { channel },
            nextActions: ["Pass a plain object, or remove the merge option"],
          },
        );
      }
      next = {
        ...(current.snapshot && typeof current.snapshot === "object"
          ? current.snapshot as Record<string, unknown>
          : {}),
        ...next as Record<string, unknown>,
      };
    }
    current.snapshot = next;
    current.updatedAt = String(now());
    revision += 1;
    return cloneJson(next);
  }

  function read(channelInput: unknown): unknown {
    const channel = requireChannel(channelInput);
    return cloneJson(channels.get(channel)!.snapshot);
  }

  function registerClearHandler(channelInput: unknown, handler: unknown): () => void {
    const channel = requireChannel(channelInput);
    if (typeof handler !== "function") {
      throw new TypeError("Scene diagnostics clear handlers must be functions");
    }
    const clearHandler = handler as () => void;
    const previous = clearHandlers.get(channel);
    clearHandlers.set(channel, clearHandler);
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      if (clearHandlers.get(channel) === clearHandler) {
        clearHandlers.set(channel, previous);
      }
    };
  }

  function clear(channelInput: unknown = null): SceneDiagnosticsClearResult {
    const targetChannels: SceneDiagnosticChannel[] = channelInput == null
      ? [...SCENE_DIAGNOSTIC_CHANNELS]
      : [requireChannel(channelInput)];
    const failures: Array<{
      channel: SceneDiagnosticChannel;
      handlerIndex: number;
      message: string;
    }> = [];
    for (const channel of targetChannels) {
      const handler = clearHandlers.get(channel);
      if (handler) {
        try {
          handler();
        } catch (error) {
          failures.push({
            channel,
            handlerIndex: 0,
            message: String((error as { message?: unknown } | null | undefined)?.message || error),
          });
        }
      }
    }
    if (failures.length) {
      throw new DiagnosticError(
        "scene-diagnostics-clear-failed",
        "Scene diagnostic visual state was not completely cleared",
        {
          details: { failures },
          nextActions: [
            "Inspect the failed channel layer lifecycle, then retry state.clear",
          ],
        },
      );
    }
    for (const channel of targetChannels) {
      const current = channels.get(channel)!;
      current.snapshot = null;
      current.updatedAt = String(now());
    }
    revision += 1;
    return { clearedChannels: targetChannels, revision };
  }

  function status(): SceneDiagnosticsStatus {
    return {
      availableChannels: SCENE_DIAGNOSTIC_CHANNELS.filter(
        (channel) => channels.get(channel)!.snapshot != null,
      ),
      folderHandoffEnabled: folderHandoffConfig != null,
      revision,
      state: "ready",
    };
  }

  function snapshot(): SceneDiagnosticsSnapshot {
    const channelSnapshots = Object.fromEntries(
      SCENE_DIAGNOSTIC_CHANNELS.map((channel) => {
        const current = channels.get(channel)!;
        return [channel, {
          available: current.snapshot != null,
          snapshot: cloneJson(current.snapshot),
          updatedAt: current.updatedAt,
        } satisfies SceneDiagnosticsChannelSnapshot];
      }),
    ) as Record<SceneDiagnosticChannel, SceneDiagnosticsChannelSnapshot>;
    return {
      channels: channelSnapshots,
      folderHandoffConfig: cloneJson(folderHandoffConfig),
      generatedAt: String(now()),
      revision,
      schema: SCENE_DIAGNOSTICS_STATE_SCHEMA,
    };
  }

  function reset(): SceneDiagnosticsClearResult {
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
