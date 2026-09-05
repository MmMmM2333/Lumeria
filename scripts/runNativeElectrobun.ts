import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const nativeMode: "dev" | "smoke" = modeArgument === "--dev" ? "dev" : "smoke";
const runner = join(
  projectRoot,
  "vendor",
  "electrobun-pixi-native-starter",
  "consumer",
  "run-electrobun.mjs",
);
const artifactDir = join(projectRoot, "artifacts", "native-smoke");
if (nativeMode === "smoke") mkdirSync(artifactDir, { recursive: true });
const markerPath = join(tmpdir(), `launchpad-native-smoke-${process.pid}.json`);
const dataDir = mkdtempSync(join(tmpdir(), "launchpad-native-data-"));
const iconPath = join(dataDir, "smoke-icon.png");
const childLaunchHelperPath = join(dataDir, "child-launch.mjs");
const childLaunchMarkerPath = join(dataDir, "child-launched.txt");
const scanRoot = join(dataDir, "catalog");
mkdirSync(scanRoot);
writeFileSync(
  join(scanRoot, "Catalog Sample.url"),
  "[InternetShortcut]\r\nURL=https://example.invalid/native-catalog\r\n",
  "utf8",
);
const iconCanvas = createCanvas(64, 64);
const iconContext = iconCanvas.getContext("2d");
iconContext.fillStyle = "#ef3b6d";
iconContext.fillRect(0, 0, 64, 64);
iconContext.fillStyle = "#3b82f6";
iconContext.fillRect(16, 16, 32, 32);
writeFileSync(iconPath, iconCanvas.toBuffer("image/png"));
writeFileSync(
  childLaunchHelperPath,
  'import { writeFileSync } from "node:fs";\nwriteFileSync(process.argv[2], "launched", "utf8");\n',
  "utf8",
);
const fixture = JSON.parse(readFileSync(
  join(projectRoot, "src", "domain", "fixtures", "layout-v2-roundtrip.json"),
  "utf8",
)) as { pages: unknown[][]; settings: Record<string, unknown> };
fixture.pages = [[
  {
    id: "native-layout-icon",
    type: "manualApp",
    name: "已加载布局",
    emoji: "L",
    customIconPath: iconPath,
    launchTarget: { kind: "executable", path: process.execPath },
  },
  {
    id: "native-webgpu",
    type: "manualApp",
    name: "Native WebGPU",
    emoji: "🧭",
    launchTarget: { kind: "url", path: "https://example.invalid/webgpu" },
  },
  {
    id: "native-settings",
    type: "manualApp",
    name: "Settings",
    emoji: "⚙️",
    launchTarget: { kind: "url", path: "https://example.invalid/settings" },
  },
  {
    id: "native-folder",
    type: "folder",
    name: "原生文件夹",
    childPages: [[
      {
        id: "native-folder-child-1",
        type: "manualApp",
        name: "文件夹子项一",
        emoji: "1️⃣",
        launchTarget: { kind: "url", path: "https://example.invalid/folder-1" },
      },
      {
        id: "native-folder-child-2",
        type: "manualApp",
        name: "文件夹子项二",
        emoji: "2️⃣",
        launchTarget: { kind: "url", path: "https://example.invalid/folder-2" },
      },
      {
        id: "native-folder-child-3",
        type: "manualApp",
        name: "文件夹子项三",
        emoji: "3️⃣",
        launchTarget: { kind: "url", path: "https://example.invalid/folder-3" },
      },
      {
        id: "native-folder-child-4",
        type: "manualApp",
        name: "文件夹子项四",
        emoji: "4️⃣",
        launchTarget: { kind: "url", path: "https://example.invalid/folder-4" },
      },
    ], [
      {
        id: "native-folder-child-launch",
        type: "manualApp",
        name: "启动验证",
        emoji: "🚀",
        launchTarget: { kind: "executable", path: process.execPath },
        launchArgs: `"${childLaunchHelperPath}" "${childLaunchMarkerPath}"`,
      },
    ]],
  },
], [
  {
    id: "native-second-page",
    type: "manualApp",
    name: "Second Page",
    emoji: "2️⃣",
    launchTarget: { kind: "url", path: "https://example.invalid/second-page" },
  },
], [
  {
    id: "native-third-page",
    type: "manualApp",
    name: "Third Page",
    emoji: "3️⃣",
    launchTarget: { kind: "url", path: "https://example.invalid/third-page" },
  },
]];
fixture.settings.gridRows = 4;
fixture.settings.gridCols = 7;
fixture.settings.iconSize = 64;
fixture.settings.folderRows = 2;
fixture.settings.folderCols = 2;
fixture.settings.folderIconSizeMode = "global";
fixture.settings.textless = false;
fixture.settings.scanRoots = [{
  id: "native-smoke-catalog",
  type: "customDirectory",
  label: "Native smoke catalog",
  path: scanRoot,
  enabled: true,
  removable: true,
  maxDepth: 2,
  maxEntries: 20,
}];
fixture.settings.scanKeywordBlacklist = [];
fixture.settings.scanKeywordAllowlist = [];
fixture.settings.scanAppBlacklist = [];
writeFileSync(join(dataDir, "layout.json"), JSON.stringify(fixture), "utf8");
if (nativeMode === "smoke") rmSync(markerPath, { force: true });
if (nativeMode === "smoke") rmSync(childLaunchMarkerPath, { force: true });
try {
  const result = spawnSync(process.execPath, [runner, nativeMode === "dev" ? "dev" : "start"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      LAUNCHPAD_NATIVE_DATA_HOST: join(
        projectRoot,
        "src-tauri",
        "target",
        "release",
        "lumeria_native_data.exe",
      ),
      LAUNCHPAD_NATIVE_MODE: nativeMode,
      ...(nativeMode === "smoke" ? {
        LAUNCHPAD_NATIVE_SMOKE_MARKER: markerPath,
        LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR: artifactDir,
        LAUNCHPAD_NATIVE_CHILD_LAUNCH_MARKER: childLaunchMarkerPath,
        LUMERIA_NATIVE_DATA_DIR: dataDir,
      } : {}),
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
      cjkLabelPixels?: unknown;
      coloredIconPixels?: unknown;
      catalogApps?: unknown;
      desktopPageMotionObserved?: unknown;
      dpiResolution?: unknown;
      dpiTransition?: unknown;
      folderChildLaunchObserved?: unknown;
      folderCloseMotionObserved?: unknown;
      folderOpenMotionObserved?: unknown;
      folderPageMotionObserved?: unknown;
      folderPageNavigation?: unknown;
      height?: unknown;
      iconForegroundPixels?: unknown;
      reconciledNodes?: unknown;
      resizeLiveLogicalObserved?: unknown;
      resizeMode?: unknown;
      resizeObserved?: unknown;
      resizePresentCount?: unknown;
      resizeSettledBackingObserved?: unknown;
      resolution?: unknown;
      restoreObserved?: unknown;
      restorePresentCount?: unknown;
      presented?: unknown;
      loadedLayout?: unknown;
      pageCount?: unknown;
      pageNavigation?: unknown;
      inputNavigation?: unknown;
      structuredLaunchFailureObserved?: unknown;
      visibleNodes?: unknown;
      width?: unknown;
    };
    writeFileSync(join(artifactDir, "proof.json"), JSON.stringify(proof, null, 2), "utf8");
    if (proof.presented !== true) throw new Error("Native smoke proof did not observe a public presentation");
    if (proof.loadedLayout !== true || proof.catalogApps !== 1) {
      throw new Error("Native smoke proof did not load the isolated layout and scanned catalog");
    }
    if (
      !Number.isInteger(proof.coloredIconPixels)
      || Number(proof.coloredIconPixels) <= 0
      || !Array.isArray(proof.iconForegroundPixels)
      || proof.iconForegroundPixels.length < 1
      || proof.iconForegroundPixels.some((pixels) => (
        !Number.isInteger(pixels) || Number(pixels) <= 0
      ))
    ) {
      throw new Error("Native smoke proof did not present the local PNG icon through the GPU texture path");
    }
    if (
      !Array.isArray(proof.cjkLabelPixels)
      || proof.cjkLabelPixels.length < 1
      || proof.cjkLabelPixels.some((pixels) => !Number.isInteger(pixels) || Number(pixels) <= 0)
    ) {
      throw new Error("Native smoke proof did not render the CJK label through the configured font fallback");
    }
    if (
      !Number.isInteger(proof.visibleNodes)
      || !Number.isInteger(proof.reconciledNodes)
      || Number(proof.visibleNodes) <= 0
      || Number(proof.visibleNodes) > Number(proof.reconciledNodes)
    ) {
      throw new Error("Native smoke proof did not present every reconciled scene node visibly");
    }
    if (
      proof.resizeObserved !== true
      || proof.resizeMode !== "adaptive"
      || proof.resizeLiveLogicalObserved !== true
      || !Number.isInteger(proof.resizePresentCount)
      || Number(proof.resizePresentCount) <= 0
      || proof.resizeSettledBackingObserved !== true
      || proof.restoreObserved !== true
      || !Number.isInteger(proof.restorePresentCount)
      || Number(proof.restorePresentCount) <= 0
    ) {
      throw new Error("Native smoke proof did not complete resize and minimize/restore lifecycle checks");
    }
    if (
      (proof.dpiTransition !== "verified-display-fallback"
        && proof.dpiTransition !== "skipped-no-mixed-dpi-display")
      || typeof proof.dpiResolution !== "number"
      || !Number.isFinite(proof.dpiResolution)
      || proof.dpiResolution <= 0
    ) {
      throw new Error("Native smoke proof did not report a valid DPI transition result");
    }
    if (
      !Number.isInteger(proof.pageCount)
      || Number(proof.pageCount) < 1
      || proof.pageNavigation !== (Number(proof.pageCount) > 1 ? "verified" : "skipped-single-page")
      || (Number(proof.pageCount) > 1 && proof.desktopPageMotionObserved !== true)
      || proof.structuredLaunchFailureObserved !== true
      || proof.inputNavigation !== "verified"
    ) {
      throw new Error("Native smoke proof did not complete paging and structured launch failure checks");
    }
    if (
      proof.folderOpenMotionObserved !== true
      || proof.folderPageNavigation !== "verified"
      || proof.folderPageMotionObserved !== true
      || proof.folderChildLaunchObserved !== true
      || proof.folderCloseMotionObserved !== true
    ) {
      throw new Error("Native smoke proof did not complete the folder animation and child launch flow");
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
  rmSync(dataDir, { force: true, recursive: true });
  if (nativeMode === "smoke") rmSync(markerPath, { force: true });
}
