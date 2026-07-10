import {
  buildRenderProbeCandidateRows,
  buildRenderProbeArmConfig,
  buildRenderProbePhaseRows,
  buildRenderProbeStatusRows,
  RENDER_PROBE_TARGET_OPTIONS,
  resolveRenderProbeDisplaySession,
} from "./renderProbePanelModel.js";

export function runRenderProbePanelModelTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Render probe panel model test failed] ${message}`);
  };

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
  assert(itemConfig.target?.itemId === "app-mi", "targeted form values should trim and preserve the selected target kind");
  assert(itemConfig.autoFreeze === false && itemConfig.pixels === "off", "targeted configs should preserve pixel and freeze controls");

  let emptyTargetError = null;
  try {
    buildRenderProbeArmConfig({ targetKind: "folderId", targetValue: "   " });
  } catch (error) {
    emptyTargetError = error;
  }
  assert(emptyTargetError instanceof TypeError, "targeted configs should reject empty target values explicitly");

  const summary = {
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
  assert(session?.id === "drag-render-2", "the latest completed session should drive panel detail when no drag is active");

  const statusRows = buildRenderProbeStatusRows(summary);
  assert(statusRows.some((row) => row.label === "State" && row.value === "armed"), "status rows should expose whether the probe is armed");
  assert(statusRows.some((row) => row.label === "Target" && row.value === "itemName: MiService"), "status rows should expose the active target");
  assert(statusRows.some((row) => row.label === "Sessions / events" && row.value === "2 / 12"), "status rows should expose retained session and event counts");
  assert(statusRows.some((row) => row.label === "Frozen" && row.value.includes("pixel-diff")), "status rows should expose the latest freeze reason");

  const phaseRows = buildRenderProbePhaseRows(session);
  assert(phaseRows.map((row) => row.phase).join(",") === "pointerdown,drag-start,drag-end", "phase rows should preserve diagnostic capture order");
  assert(phaseRows[0].framebuffer === "off", "phase rows should distinguish metadata-only captures");
  assert(phaseRows[1].framebuffer.includes("6 slots") && phaseRows[1].framebuffer.includes("2.35ms"), "phase rows should summarize successful framebuffer work");
  assert(phaseRows[2].framebuffer.includes("pixel-read-failed"), "phase rows should expose framebuffer failure reasons");
  assert(phaseRows[2].violations === "1 · framebuffer-capture-unavailable", "phase rows should expose the first invariant failure");

  const candidateRows = buildRenderProbeCandidateRows(session);
  assert(candidateRows[0]?.title === "MiService", "candidate rows should prefer the icon name");
  assert(candidateRows[0]?.identity.includes("folder-tools") && candidateRows[0]?.identity.includes("slot 5"), "candidate rows should retain stable folder and slot identity");
  assert(candidateRows[0]?.detail.includes("strong") && candidateRows[0]?.detail.includes("Δ 25.0%"), "candidate rows should format ranking evidence");
}
