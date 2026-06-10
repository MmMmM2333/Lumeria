export const BACKGROUND_IMAGE_LAYOUT_FILL = "fill";
export const BACKGROUND_IMAGE_LAYOUT_FIT = "fit";
export const BACKGROUND_IMAGE_LAYOUT_STRETCH = "stretch";
export const BACKGROUND_IMAGE_LAYOUT_TILE = "tile";
export const BACKGROUND_IMAGE_LAYOUT_CENTER = "center";
export const DEFAULT_BACKGROUND_IMAGE_LAYOUT = BACKGROUND_IMAGE_LAYOUT_FILL;

const BACKGROUND_IMAGE_LAYOUTS = new Set([
  BACKGROUND_IMAGE_LAYOUT_FILL,
  BACKGROUND_IMAGE_LAYOUT_FIT,
  BACKGROUND_IMAGE_LAYOUT_STRETCH,
  BACKGROUND_IMAGE_LAYOUT_TILE,
  BACKGROUND_IMAGE_LAYOUT_CENTER,
]);

export function normalizeBackgroundImageLayout(value) {
  return BACKGROUND_IMAGE_LAYOUTS.has(value) ? value : DEFAULT_BACKGROUND_IMAGE_LAYOUT;
}

export function resolveCssBackgroundImageLayout(value) {
  const layout = normalizeBackgroundImageLayout(value);
  if (layout === BACKGROUND_IMAGE_LAYOUT_FIT) {
    return {
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundSize: "contain",
    };
  }
  if (layout === BACKGROUND_IMAGE_LAYOUT_STRETCH) {
    return {
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundSize: "100% 100%",
    };
  }
  if (layout === BACKGROUND_IMAGE_LAYOUT_TILE) {
    return {
      backgroundPosition: "left top",
      backgroundRepeat: "repeat",
      backgroundSize: "auto",
    };
  }
  if (layout === BACKGROUND_IMAGE_LAYOUT_CENTER) {
    return {
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundSize: "auto",
    };
  }
  return {
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
  };
}

function toPositiveNumber(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasUsableWindowsPlacementContext(context, sourceWidth, sourceHeight) {
  if (!context) return false;
  return toPositiveNumber(sourceWidth, 0) > 0
    && toPositiveNumber(sourceHeight, 0) > 0
    && toPositiveNumber(context.monitorPhysicalWidth, 0) > 0
    && toPositiveNumber(context.monitorPhysicalHeight, 0) > 0
    && toPositiveNumber(context.monitorScaleFactor, 0) > 0;
}

function resolveWindowsRelativeImageLayout(sourceWidth, sourceHeight, targetWidth, targetHeight, value, context) {
  const safeSourceWidth = toPositiveNumber(sourceWidth);
  const safeSourceHeight = toPositiveNumber(sourceHeight);
  const safeTargetWidth = toPositiveNumber(targetWidth);
  const safeTargetHeight = toPositiveNumber(targetHeight);
  const layout = normalizeBackgroundImageLayout(value);
  if (
    layout !== BACKGROUND_IMAGE_LAYOUT_CENTER
    && layout !== BACKGROUND_IMAGE_LAYOUT_TILE
  ) {
    return null;
  }
  if (!hasUsableWindowsPlacementContext(context, safeSourceWidth, safeSourceHeight)) return null;

  const monitorScaleFactor = toPositiveNumber(context.monitorScaleFactor);
  const monitorPhysicalX = toFiniteNumber(context.monitorPhysicalX);
  const monitorPhysicalY = toFiniteNumber(context.monitorPhysicalY);
  const monitorPhysicalWidth = toPositiveNumber(context.monitorPhysicalWidth);
  const monitorPhysicalHeight = toPositiveNumber(context.monitorPhysicalHeight);
  const windowPhysicalX = toFiniteNumber(context.windowPhysicalX, monitorPhysicalX);
  const windowPhysicalY = toFiniteNumber(context.windowPhysicalY, monitorPhysicalY);
  const windowOffsetCssX = (windowPhysicalX - monitorPhysicalX) / monitorScaleFactor;
  const windowOffsetCssY = (windowPhysicalY - monitorPhysicalY) / monitorScaleFactor;
  const width = safeSourceWidth / monitorScaleFactor;
  const height = safeSourceHeight / monitorScaleFactor;

  if (layout === BACKGROUND_IMAGE_LAYOUT_TILE) {
    return {
      height: safeTargetHeight,
      tile: true,
      tileHeight: height,
      tileScaleX: 1 / monitorScaleFactor,
      tileScaleY: 1 / monitorScaleFactor,
      tileWidth: width,
      width: safeTargetWidth,
      x: 0,
      y: 0,
      tileX: -windowOffsetCssX,
      tileY: -windowOffsetCssY,
    };
  }

  return {
    height,
    width,
    x: ((monitorPhysicalWidth - safeSourceWidth) / 2) / monitorScaleFactor - windowOffsetCssX,
    y: ((monitorPhysicalHeight - safeSourceHeight) / 2) / monitorScaleFactor - windowOffsetCssY,
  };
}

export function resolveImageLayout(sourceWidth, sourceHeight, targetWidth, targetHeight, value, naturalScale = 1) {
  const safeSourceWidth = toPositiveNumber(sourceWidth);
  const safeSourceHeight = toPositiveNumber(sourceHeight);
  const safeTargetWidth = toPositiveNumber(targetWidth);
  const safeTargetHeight = toPositiveNumber(targetHeight);
  const safeNaturalScale = toPositiveNumber(naturalScale);
  const layout = normalizeBackgroundImageLayout(value);

  if (layout === BACKGROUND_IMAGE_LAYOUT_STRETCH) {
    return {
      height: safeTargetHeight,
      width: safeTargetWidth,
      x: 0,
      y: 0,
    };
  }

  if (layout === BACKGROUND_IMAGE_LAYOUT_CENTER) {
    const width = safeSourceWidth * safeNaturalScale;
    const height = safeSourceHeight * safeNaturalScale;
    return {
      height,
      width,
      x: (safeTargetWidth - width) / 2,
      y: (safeTargetHeight - height) / 2,
    };
  }

  if (layout === BACKGROUND_IMAGE_LAYOUT_TILE) {
    return {
      height: safeTargetHeight,
      tile: true,
      tileScaleX: safeNaturalScale,
      tileScaleY: safeNaturalScale,
      width: safeTargetWidth,
      x: 0,
      y: 0,
    };
  }

  const scale = layout === BACKGROUND_IMAGE_LAYOUT_FIT
    ? Math.min(safeTargetWidth / safeSourceWidth, safeTargetHeight / safeSourceHeight)
    : Math.max(safeTargetWidth / safeSourceWidth, safeTargetHeight / safeSourceHeight);
  const width = safeSourceWidth * scale;
  const height = safeSourceHeight * scale;
  return {
    height,
    width,
    x: (safeTargetWidth - width) / 2,
    y: (safeTargetHeight - height) / 2,
  };
}

export function resolveBackgroundImagePlacement({
  imagePixelSize = null,
  layout,
  layoutContext = null,
  renderScaleX = 1,
  renderScaleY = renderScaleX,
  sourceHeight,
  sourceWidth,
  targetHeight,
  targetWidth,
} = {}) {
  const safeRenderScaleX = toPositiveNumber(renderScaleX);
  const safeRenderScaleY = toPositiveNumber(renderScaleY);
  const pixelWidth = toPositiveNumber(imagePixelSize?.width ?? sourceWidth);
  const pixelHeight = toPositiveNumber(imagePixelSize?.height ?? sourceHeight);
  const safeTargetWidth = toPositiveNumber(targetWidth);
  const safeTargetHeight = toPositiveNumber(targetHeight);
  const windowsLayout = resolveWindowsRelativeImageLayout(
    pixelWidth,
    pixelHeight,
    safeTargetWidth,
    safeTargetHeight,
    layout,
    layoutContext
  );
  const cssLayout = windowsLayout || resolveImageLayout(
    pixelWidth,
    pixelHeight,
    safeTargetWidth,
    safeTargetHeight,
    layout
  );

  const result = {
    ...cssLayout,
    height: cssLayout.height * safeRenderScaleY,
    width: cssLayout.width * safeRenderScaleX,
    x: cssLayout.x * safeRenderScaleX,
    y: cssLayout.y * safeRenderScaleY,
  };
  if (cssLayout.tile) {
    result.tile = true;
    result.tileHeight = toPositiveNumber(cssLayout.tileHeight, pixelHeight) * safeRenderScaleY;
    result.tileWidth = toPositiveNumber(cssLayout.tileWidth, pixelWidth) * safeRenderScaleX;
    result.tileScaleX = toPositiveNumber(cssLayout.tileScaleX) * safeRenderScaleX;
    result.tileScaleY = toPositiveNumber(cssLayout.tileScaleY) * safeRenderScaleY;
    result.tileX = toFiniteNumber(cssLayout.tileX) * safeRenderScaleX;
    result.tileY = toFiniteNumber(cssLayout.tileY) * safeRenderScaleY;
  }
  return result;
}

export function resolveCssBackgroundImageTransform(value) {
  return normalizeBackgroundImageLayout(value) === BACKGROUND_IMAGE_LAYOUT_FILL ? "scale(1.02)" : "none";
}

function toCssPixel(value) {
  const number = toFiniteNumber(value);
  return `${Number(number.toFixed(3))}px`;
}

export function resolveCssBackgroundImagePlacement(value, options = {}) {
  const layout = normalizeBackgroundImageLayout(value);
  const style = {
    ...resolveCssBackgroundImageLayout(layout),
    transform: resolveCssBackgroundImageTransform(layout),
  };
  const shouldUsePixelPlacement = options.preferPixelPlacement === true
    || layout === BACKGROUND_IMAGE_LAYOUT_CENTER
    || layout === BACKGROUND_IMAGE_LAYOUT_TILE;
  if (!shouldUsePixelPlacement) {
    return style;
  }

  const targetWidth = toPositiveNumber(options.targetWidth, 0);
  const targetHeight = toPositiveNumber(options.targetHeight, 0);
  const sourceWidth = toPositiveNumber(options.imagePixelSize?.width ?? options.sourceWidth, 0);
  const sourceHeight = toPositiveNumber(options.imagePixelSize?.height ?? options.sourceHeight, 0);
  if (!targetWidth || !targetHeight || !sourceWidth || !sourceHeight) return style;

  const placement = resolveBackgroundImagePlacement({
    imagePixelSize: options.imagePixelSize,
    layout,
    layoutContext: options.layoutContext,
    renderScaleX: options.renderScaleX,
    renderScaleY: options.renderScaleY,
    sourceHeight,
    sourceWidth,
    targetHeight,
    targetWidth,
  });

  if (placement.tile) {
    return {
      ...style,
      backgroundPosition: `${toCssPixel(placement.tileX)} ${toCssPixel(placement.tileY)}`,
      backgroundRepeat: "repeat",
      backgroundSize: `${toCssPixel(placement.tileWidth)} ${toCssPixel(placement.tileHeight)}`,
    };
  }

  return {
    ...style,
    backgroundPosition: `${toCssPixel(placement.x)} ${toCssPixel(placement.y)}`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${toCssPixel(placement.width)} ${toCssPixel(placement.height)}`,
  };
}
