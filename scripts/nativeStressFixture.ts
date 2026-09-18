import { createCanvas } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NativeStressConfig } from "../src/native/diagnostics/nativeStressConfig.js";

export function installNativeStressFixture(fixture: { pages: unknown[][]; settings: Record<string, unknown> }, directory: string, config: NativeStressConfig): void {
  const iconDir = join(directory, "icons"); mkdirSync(iconDir);
  const canvas = createCanvas(128, 128), context = canvas.getContext("2d");
  const items = Array.from({ length: config.icons }, (_, index) => {
    context.fillStyle = `hsl(${index * 137.5 % 360},75%,45%)`; context.fillRect(0, 0, 128, 128);
    context.fillStyle = "#fff"; context.font = "28px sans-serif"; context.fillText(String(index), 8, 72);
    const path = join(iconDir, `${index}.png`); writeFileSync(path, canvas.toBuffer("image/png"));
    return { id: `stress-${index}`, type: "manualApp", name: `压力应用 ${index}`, customIconPath: path,
      launchTarget: { kind: "url", path: "https://example.invalid/stress" } };
  });
  fixture.pages = [];
  for (let index = 0; index < items.length; index += 80) fixture.pages.push(items.slice(index, index + 80));
  Object.assign(fixture.settings, { gridRows: 8, gridCols: 10, iconSize: 64, folderRows: 4, folderCols: 7,
    mainWindowShortcut: null, scanRoots: [], windowMode: config.windowed ? "windowed" : "fullscreen",
    backgroundSource: "customImage", backgroundImagePath: items[0]!.customIconPath, backgroundBaseOpacity: 100 });
}
