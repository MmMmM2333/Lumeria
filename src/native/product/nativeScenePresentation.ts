import { Screen } from "../../../vendor/electrobun-pixi-native-starter/src/platform/electrobun-sdk.js";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";

// Presentation helpers shared by the entry assembly and its diagnostic
// scenarios. They only observe the live application; they never own product
// state, so both the normal and diagnostic paths can await the same frames.

export function displayFor(frame: Readonly<{ height: number; width: number; x: number; y: number }>) {
  const primary = Screen.getPrimaryDisplay();
  let best = primary;
  let bestArea = 0;
  for (const candidate of Screen.getAllDisplays()) {
    const { bounds } = candidate;
    const width = Math.max(
      0,
      Math.min(frame.x + frame.width, bounds.x + bounds.width) - Math.max(frame.x, bounds.x),
    );
    const height = Math.max(
      0,
      Math.min(frame.y + frame.height, bounds.y + bounds.height) - Math.max(frame.y, bounds.y),
    );
    const area = width * height;
    if (area <= bestArea) continue;
    best = candidate;
    bestArea = area;
  }
  return best;
}

export async function waitFor(
  description: string,
  predicate: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
}

export async function present(
  app: NativePixiApplication,
  description: string,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const presented = app.nextPresent();
  app.invalidate();
  try {
    await Promise.race([
      presented,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out waiting for ${description}`)),
          5000,
        );
      }),
    ]);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}
