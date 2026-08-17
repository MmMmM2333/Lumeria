import {
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  backgroundSourceUsesImage,
  normalizeBackgroundEffect,
} from "../domain/backgroundSettings.js";

/**
 * Renderer capability decision. Persisted settings remain renderer-neutral;
 * this adapter decides whether the active Pixi background can realize them.
 */
export function backgroundEffectUsesPixi(effect) {
  const normalizedEffect = normalizeBackgroundEffect(effect);
  return normalizedEffect === BACKGROUND_EFFECT_BLUR || normalizedEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL;
}

export function shouldUsePixiBackgroundEffect(config = {}) {
  return Boolean(
    backgroundEffectUsesPixi(config.effect) &&
    backgroundSourceUsesImage(config.source) &&
    config.imageUrl
  );
}
