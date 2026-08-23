import {
  buildRenderProbeCandidateRows,
  buildRenderProbeArmConfig,
  buildRenderProbePhaseRows,
  buildRenderProbeStatusRows,
  RENDER_PROBE_TARGET_OPTIONS,
  requireRenderProbeSummary,
  resolveRenderProbeDisplaySession,
  type RenderProbeSummary,
  type RenderProbeTranslate,
} from "./renderProbePanelModel.js";
import { createLocalization } from "../../i18n/localization.js";

function normalizeTranslationParams(params: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, string | number>> {
  const normalized: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string" && typeof value !== "number") {
      throw new TypeError(`Unsupported render probe translation parameter: ${key}`);
    }
    normalized[key] = value;
  }
  return normalized;
}

export function runRenderProbePanelModelTests() {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[Render probe panel model test failed] ${message}`);
  }
  const chinese = createLocalization({ issue: null, match: "exact", preference: "zh-CN", resolvedLocale: "zh-CN" }).text;
  const english = createLocalization({ issue: null, match: "exact", preference: "en-US", resolvedLocale: "en-US" }).text;
  const chineseTranslate: RenderProbeTranslate = (key, params) => chinese.t(key, normalizeTranslationParams(params));
  const englishTranslate: RenderProbeTranslate = (key, params) => english.t(key, normalizeTranslationParams(params));

  assert(
    RENDER_PROBE_TARGET_OPTIONS.map((option) => option.value).join(",") === "all-folders,folderId,itemId,itemName",
    "the model should expose the complete ordered target descriptor set for the panel",
  );

  const globalConfig = buildRenderProbeArmConfig({
    autoFreeze: true,
    pixels: "phase-diff",
    targetKind: "all-folders",
    targetValue: "ignored",
  });
  assert(
    JSON.stringify(globalConfig) === JSON.stringify({
      autoFreeze: true,
      clear: true,
      pixels: "phase-diff",
      target: "all-folders",
    }),
    "global form values should produce the arm-and-clear probe config",
  );

  const itemConfig = buildRenderProbeArmConfig({
    autoFreeze: false,
    pixels: "off",
    targetKind: "itemId",
    targetValue: "  app-mi  ",
  });
  assert(itemConfig.target !== "all-folders", "targeted form values should produce a keyed target");
  assert(itemConfig.target.itemId === "app-mi", "targeted form values should trim and preserve the selected target kind");
  assert(itemConfig.autoFreeze === false && itemConfig.pixels === "off", "targeted configs should preserve pixel and freeze controls");

  let emptyTargetError: unknown = null;
  try {
    buildRenderProbeArmConfig({ targetKind: "folderId", targetValue: "   " });
  } catch (error) {
    emptyTargetError = error;
  }
  assert(emptyTargetError instanceof TypeError, "targeted configs should reject empty target values explicitly");

  const summary: RenderProbeSummary = {
    activeSession: null,
    config: {
      autoFreeze: true,
      enabled: true,
      pixels: "phase-diff",
      target: { itemName: "MiService" },
    },
    lastSession: {
      captures: [{
        firstViolation: null,
        framebuffer: null,
        phase: "pointerdown",
        timeMs: 10,
        violationCount: 0,
      }, {
        firstViolation: null,
        framebuffer: {
          available: true,
          captureDurationMs: 2.345,
          readPixelsCallCount: 1,
          region: { height: 100, width: 200 },
          skippedSlotCount: 1,
          slotCount: 6,
          warningCount: 0,
        },
        phase: "drag-start",
        timeMs: 12,
        violationCount: 0,
      }, {
        firstViolation: { code: "framebuffer-capture-unavailable" },
        framebuffer: {
          available: false,
          reason: "pixel-read-failed",
        },
        phase: "drag-end",
        timeMs: 20,
        violationCount: 1,
      }],
      dragItem: { id: "app-dragged", name: "Dragged App" },
      frozenReason: "pixel-diff:folder-tools:mi-service:5",
      id: "drag-render-2",
      pixelComparison: {
        available: true,
        candidates: [{
          alphaGainAfterRelease: 0.1,
          brightnessGainAfterRelease: 0.2,
          changedSampleRatio: 0.75,
          folderId: "folder-tools",
          folderName: "工具",
          itemId: "mi-service",
          itemName: "MiService",
          meanAbsoluteDelta: 0.25,
          slot: 5,
          strongCandidate: true,
        }],
        changedSlotCount: 1,
        comparableSlotCount: 6,
        strongCandidateCount: 1,
      },
      status: "complete",
    },
    recentEventCount: 12,
    sessionCount: 2,
  };
  const session = resolveRenderProbeDisplaySession(summary);
  const decodedSummary = requireRenderProbeSummary(summary);
  assert(decodedSummary.lastSession?.id === "drag-render-2", "summary decoder should preserve a fully validated session");
  let malformedSummaryError: unknown = null;
  try {
    requireRenderProbeSummary({
      ...summary,
      lastSession: { ...summary.lastSession, pixelComparison: { available: "yes" } },
    });
  } catch (error) {
    malformedSummaryError = error;
  }
  assert(malformedSummaryError instanceof TypeError, "summary decoder should reject malformed nested comparison fields");
  let nullConfigError: unknown = null;
  try {
    requireRenderProbeSummary({ config: null });
  } catch (error) {
    nullConfigError = error;
  }
  assert(nullConfigError instanceof TypeError, "summary decoder should reject null for non-nullable sections");
  assert(session !== null && session.id === "drag-render-2", "the latest completed session should drive panel detail when no drag is active");

  const statusRows = buildRenderProbeStatusRows(summary, chineseTranslate);
  assert(statusRows.some((row) => row.label === "状态" && row.value === "已布防"), "status rows should expose whether the probe is armed in Chinese");
  assert(statusRows.some((row) => row.label === "目标" && row.value === "项目名称: MiService"), "status rows should expose the active target with a readable field label");
  assert(statusRows.some((row) => row.label === "会话 / 事件" && row.value === "2 / 12"), "status rows should expose retained session and event counts");
  assert(statusRows.some((row) => row.label === "冻结原因" && row.value.includes("pixel-diff")), "status rows should expose the latest freeze reason");

  const phaseRows = buildRenderProbePhaseRows(session, chineseTranslate);
  assert(phaseRows.map((row) => row.phase).join(",") === "pointerdown,drag-start,drag-end", "phase rows should preserve diagnostic capture order");
  const pointerDownPhase = phaseRows[0];
  const dragStartPhase = phaseRows[1];
  const dragEndPhase = phaseRows[2];
  assert(pointerDownPhase !== undefined && dragStartPhase !== undefined && dragEndPhase !== undefined, "phase rows should retain all three captures");
  assert(pointerDownPhase.framebuffer === "未采样", "phase rows should distinguish metadata-only captures");
  assert(dragStartPhase.framebuffer.includes("6 个槽位") && dragStartPhase.framebuffer.includes("2.35ms"), "phase rows should summarize successful framebuffer work in Chinese");
  assert(dragEndPhase.framebuffer.includes("pixel-read-failed"), "phase rows should expose framebuffer failure reasons");
  assert(dragEndPhase.violations === "1 · framebuffer-capture-unavailable", "phase rows should expose the first invariant failure");

  const candidateRows = buildRenderProbeCandidateRows(session, chineseTranslate);
  assert(candidateRows[0]?.title === "MiService", "candidate rows should prefer the icon name");
  assert(candidateRows[0]?.identity.includes("folder-tools") && candidateRows[0]?.identity.includes("槽位 5"), "candidate rows should retain stable folder and slot identity");
  assert(candidateRows[0]?.detail.includes("强候选") && candidateRows[0]?.detail.includes("Δ 25.0%"), "candidate rows should format ranking evidence in Chinese");
  const englishStatusRows = buildRenderProbeStatusRows(summary, englishTranslate);
  assert(englishStatusRows.some((row) => row.label === "State" && row.value === "Armed"), "status rows should follow the active locale");
}
