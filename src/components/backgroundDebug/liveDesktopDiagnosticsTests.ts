import {
  formatFrameArrived,
  formatFrameTiming,
  formatLastFrame,
  formatLiveDesktopRates,
  formatPixelProbe,
  formatWindowMeta,
  normalizeLiveDesktopStatus,
  type LiveDesktopTranslate,
} from "./liveDesktopDiagnostics.js";
import { createLocalization } from "../../i18n/localization.js";

function normalizeTranslationParams(params: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, string | number>> {
  const normalized: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string" && typeof value !== "number") {
      throw new TypeError(`Unsupported live desktop translation parameter: ${key}`);
    }
    normalized[key] = value;
  }
  return normalized;
}

export function runLiveDesktopDiagnosticsTests() {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[Live desktop diagnostics test failed] ${message}`);
  }
  const chinese = createLocalization({ issue: null, match: "exact", preference: "zh-CN", resolvedLocale: "zh-CN" }).text;
  const english = createLocalization({ issue: null, match: "exact", preference: "en-US", resolvedLocale: "en-US" }).text;
  const chineseTranslate: LiveDesktopTranslate = (key, params) => chinese.t(key, normalizeTranslationParams(params));
  const englishTranslate: LiveDesktopTranslate = (key, params) => english.t(key, normalizeTranslationParams(params));

  const status = normalizeLiveDesktopStatus({
    active: true,
    diagnostics: {
      framesCopied: 10.8,
      frameTimeouts: -2,
      lastFrameWidth: 2560,
      lastFrameHeight: 1440,
      lastFrameFormat: 87,
      pixelProbeSamples: 2,
      shaderCopyFallbacks: 1,
      lastPixelProbeWidth: 16,
      lastPixelProbeHeight: 16,
      lastPixelProbeMinRgb: 10,
      lastPixelProbeMaxRgb: 220,
      lastPixelProbeAvgRgb: 115,
      lastPixelProbeMinAlpha: 255,
      lastPixelProbeMaxAlpha: 255,
      lastPixelProbeAvgAlpha: 255,
      lastShaderCopyError: "shader failed",
    },
    windowDiagnostics: {
      candidates: [{
        hwnd: "0x1",
        pid: 42,
        className: "WPEOverlappedWallpaper",
        processName: "wallpaper64.exe",
        role: "wallpaperPopup",
        rect: { left: 1.2, top: -2.6, width: 2560, height: 1440 },
      }],
    },
  });

  assert(status.active, "status should preserve active flag");
  assert(status.diagnostics.framesCopied === 10, "diagnostics counts should floor valid numbers");
  assert(status.diagnostics.frameTimeouts === 0, "diagnostics counts should clamp negative values to zero");
  assert(status.diagnostics.shaderCopyFallbacks === 1, "diagnostics should include shader fallback counts");
  assert(status.diagnostics.lastShaderCopyError === "shader failed", "diagnostics should include the latest shader fallback error");
  assert(formatLastFrame(status.diagnostics, chineseTranslate) === "2560x1440 · 格式 87", "last frame formatter should include size and format in Chinese");
  assert(formatPixelProbe(status.diagnostics, chineseTranslate).includes("16x16 · RGB 10/220/115"), "pixel probe formatter should include sample size and rgb range in Chinese");
  assert(status.windowDiagnostics.candidates.length === 1, "window diagnostics should normalize candidates");
  const candidate = status.windowDiagnostics.candidates[0];
  assert(candidate !== undefined, "normalized candidates should retain the supplied window");
  assert(candidate.rect.top === -2, "window rect coordinates should keep signed integers");
  assert(formatWindowMeta(candidate, chineseTranslate).includes("WPEOverlappedWallpaper"), "window meta should include class name");
  assert(formatFrameTiming(2, 6000, 2500, 4000, chineseTranslate) === "平均 3.00ms / 最近 2.50ms / 最大 4.00ms", "frame timing should format micros as millis in Chinese");
  assert(formatFrameArrived({
    ...status.diagnostics,
    frameArrivedEvents: 3,
    frameArrivedDroppedSignals: 1,
  }, chineseTranslate) === "到达 3 / 丢弃 1", "frame arrival formatter should use readable Chinese labels");
  assert(
    formatLiveDesktopRates({ arrivedPerSecond: 2, copyErrorsPerSecond: 1, droppedPerSecond: 0, framesPerSecond: 60, timeoutsPerSecond: 0 }, chineseTranslate).includes("帧 60.0/s"),
    "rate formatter should use readable Chinese labels",
  );
  assert(formatLastFrame(status.diagnostics, englishTranslate) === "2560x1440 · format 87", "last frame formatter should follow the active locale");
}
