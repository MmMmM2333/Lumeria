import {
  formatFrameTiming,
  formatLastFrame,
  formatPixelProbe,
  formatWindowMeta,
  normalizeLiveDesktopStatus,
} from "./liveDesktopDiagnostics.js";

export function runLiveDesktopDiagnosticsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Live desktop diagnostics test failed] ${message}`);
  };

  const status = normalizeLiveDesktopStatus({
    active: true,
    diagnostics: {
      framesCopied: 10.8,
      frameTimeouts: -2,
      lastFrameWidth: 2560,
      lastFrameHeight: 1440,
      lastFrameFormat: 87,
      pixelProbeSamples: 2,
      lastPixelProbeWidth: 16,
      lastPixelProbeHeight: 16,
      lastPixelProbeMinRgb: 10,
      lastPixelProbeMaxRgb: 220,
      lastPixelProbeAvgRgb: 115,
      lastPixelProbeMinAlpha: 255,
      lastPixelProbeMaxAlpha: 255,
      lastPixelProbeAvgAlpha: 255,
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
  assert(formatLastFrame(status.diagnostics) === "2560x1440 fmt 87", "last frame formatter should include size and format");
  assert(formatPixelProbe(status.diagnostics).includes("16x16 rgb 10/220/115"), "pixel probe formatter should include sample size and rgb range");
  assert(status.windowDiagnostics.candidates.length === 1, "window diagnostics should normalize candidates");
  assert(status.windowDiagnostics.candidates[0].rect.top === -2, "window rect coordinates should keep signed integers");
  assert(formatWindowMeta(status.windowDiagnostics.candidates[0]).includes("WPEOverlappedWallpaper"), "window meta should include class name");
  assert(formatFrameTiming(2, 6000, 2500, 4000) === "avg 3.00ms / last 2.50ms / max 4.00ms", "frame timing should format micros as millis");
}
