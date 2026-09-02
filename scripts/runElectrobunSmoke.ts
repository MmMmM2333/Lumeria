import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modeArgument = process.argv[2] ?? "--smoke";
if (modeArgument !== "--dev" && modeArgument !== "--smoke") {
  throw new Error(`Expected --dev or --smoke, received: ${modeArgument}`);
}
const nativeMode = modeArgument === "--dev" ? "dev" : "smoke";
const runner = join(
  projectRoot,
  "vendor",
  "electrobun-pixi-native-starter",
  "consumer",
  "run-electrobun.mjs",
);
const markerPath = join(tmpdir(), `launchpad-native-smoke-${process.pid}.json`);
const iconPath = join(tmpdir(), `launchpad-native-icon-${process.pid}.png`);
const iconCanvas = createCanvas(64, 64);
const iconContext = iconCanvas.getContext("2d");
iconContext.fillStyle = "#ef3b6d";
iconContext.fillRect(0, 0, 64, 64);
iconContext.fillStyle = "#3b82f6";
iconContext.fillRect(16, 16, 32, 32);
writeFileSync(iconPath, iconCanvas.toBuffer("image/png"));
if (nativeMode === "smoke") rmSync(markerPath, { force: true });
try {
  const result = spawnSync(process.execPath, [runner, nativeMode === "dev" ? "dev" : "start"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      LAUNCHPAD_NATIVE_ICON_PATH: iconPath,
      LAUNCHPAD_NATIVE_MODE: nativeMode,
      ...(nativeMode === "smoke" ? { LAUNCHPAD_NATIVE_SMOKE_MARKER: markerPath } : {}),
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Electrobun exited with status ${String(result.status)}`);
  if (nativeMode === "smoke") {
    if (!existsSync(markerPath)) throw new Error("Electrobun worker exited without completing the native smoke test");
    const proof = JSON.parse(readFileSync(markerPath, "utf8")) as {
      backingHeight?: unknown;
      backingWidth?: unknown;
      coloredIconPixels?: unknown;
      height?: unknown;
      iconForegroundPixels?: unknown;
      reconciledNodes?: unknown;
      resizeObserved?: unknown;
      resizePresentCount?: unknown;
      resolution?: unknown;
      restoreObserved?: unknown;
      restorePresentCount?: unknown;
      presented?: unknown;
      visibleNodes?: unknown;
      width?: unknown;
    };
    if (proof.presented !== true) throw new Error("Native smoke proof did not observe a public presentation");
    if (
      !Number.isInteger(proof.coloredIconPixels)
      || Number(proof.coloredIconPixels) <= 0
      || !Array.isArray(proof.iconForegroundPixels)
      || proof.iconForegroundPixels.length !== 1
      || !Number.isInteger(proof.iconForegroundPixels[0])
      || Number(proof.iconForegroundPixels[0]) <= 0
    ) {
      throw new Error("Native smoke proof did not present the local PNG icon through the GPU texture path");
    }
    if (
      !Number.isInteger(proof.visibleNodes)
      || !Number.isInteger(proof.reconciledNodes)
      || Number(proof.visibleNodes) <= 0
      || proof.visibleNodes !== proof.reconciledNodes
    ) {
      throw new Error("Native smoke proof did not present every reconciled scene node visibly");
    }
    if (
      proof.resizeObserved !== true
      || !Number.isInteger(proof.resizePresentCount)
      || Number(proof.resizePresentCount) <= 0
      || proof.restoreObserved !== true
      || !Number.isInteger(proof.restorePresentCount)
      || Number(proof.restorePresentCount) <= 0
    ) {
      throw new Error("Native smoke proof did not complete resize and minimize/restore lifecycle checks");
    }
    if (
      typeof proof.width !== "number"
      || typeof proof.height !== "number"
      || typeof proof.resolution !== "number"
      || proof.backingWidth !== Math.round(proof.width * proof.resolution)
      || proof.backingHeight !== Math.round(proof.height * proof.resolution)
    ) {
      throw new Error("Native smoke proof has a mismatched logical viewport and GPU backing size");
    }
  }
} finally {
  rmSync(iconPath, { force: true });
  if (nativeMode === "smoke") rmSync(markerPath, { force: true });
}
