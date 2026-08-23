import type { LayoutSettings } from "../domain/layoutDocument.js";
import {
  backgroundEffectUsesPixi as backgroundEffectUsesPixiImplementation,
  shouldUsePixiBackgroundEffect as shouldUsePixiBackgroundEffectImplementation,
} from "./backgroundCapability.js";

export type PixiBackgroundCapabilityConfig = Readonly<{
  effect: LayoutSettings["backgroundEffect"];
  imageUrl: string | null | undefined;
  source: LayoutSettings["backgroundSource"];
}>;

/** Application-facing background rendering capabilities. */
export const backgroundEffectUsesPixi: (
  effect: LayoutSettings["backgroundEffect"],
) => boolean = backgroundEffectUsesPixiImplementation;

export const shouldUsePixiBackgroundEffect: (
  config: PixiBackgroundCapabilityConfig,
) => boolean = shouldUsePixiBackgroundEffectImplementation;
export {
  BackgroundEffectPreviewRenderer,
  resolveBackgroundEffectPreviewSizes,
} from "./pixi/background/backgroundEffectPreviewRenderer.js";
