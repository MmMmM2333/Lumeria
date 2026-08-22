import {
  BACKGROUND_IMAGE_LAYOUT_CENTER,
  BACKGROUND_IMAGE_LAYOUT_FILL,
  BACKGROUND_IMAGE_LAYOUT_FIT,
  BACKGROUND_IMAGE_LAYOUT_STRETCH,
  BACKGROUND_IMAGE_LAYOUT_TILE,
  resolveBackgroundImagePlacement,
  resolveCssBackgroundImagePlacement,
  resolveCssBackgroundImageLayout,
  resolveCssBackgroundImageTransform,
  resolveImageLayout,
} from "./backgroundImageLayout.js";

export function runBackgroundImageLayoutTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Background image layout test failed] ${message}`);
  };

  const fill = resolveImageLayout(400, 200, 300, 300, BACKGROUND_IMAGE_LAYOUT_FILL);
  assert(fill.width === 600 && fill.height === 300, "fill should cover the target");
  assert(fill.x === -150 && fill.y === 0, "fill should center the covered image");

  const fit = resolveImageLayout(400, 200, 300, 300, BACKGROUND_IMAGE_LAYOUT_FIT);
  assert(fit.width === 300 && fit.height === 150, "fit should contain the source image");
  assert(fit.x === 0 && fit.y === 75, "fit should center the contained image");

  const stretch = resolveImageLayout(400, 200, 300, 300, BACKGROUND_IMAGE_LAYOUT_STRETCH);
  assert(stretch.width === 300 && stretch.height === 300, "stretch should use the full target size");
  assert(stretch.x === 0 && stretch.y === 0, "stretch should start at the target origin");

  const center = resolveImageLayout(400, 200, 300, 300, BACKGROUND_IMAGE_LAYOUT_CENTER, 0.5);
  assert(center.width === 200 && center.height === 100, "center should preserve scaled natural size");
  assert(center.x === 50 && center.y === 100, "center should align the scaled natural image");

  const tile = resolveImageLayout(400, 200, 300, 300, BACKGROUND_IMAGE_LAYOUT_TILE, 0.5);
  assert(tile.tile === true, "tile should mark the layout as tiled");
  assert(tile.width === 300 && tile.height === 300, "tile should cover the target area");
  assert(tile.tileScaleX === 0.5 && tile.tileScaleY === 0.5, "tile should expose the render scale");

  const tileCss = resolveCssBackgroundImageLayout(BACKGROUND_IMAGE_LAYOUT_TILE);
  assert(tileCss.backgroundRepeat === "repeat", "tile css should repeat");
  assert(tileCss.backgroundPosition === "left top", "tile css should originate at the top-left");

  const windowsContext = {
    monitorPhysicalHeight: 2160,
    monitorPhysicalWidth: 3840,
    monitorPhysicalX: 0,
    monitorPhysicalY: 0,
    monitorScaleFactor: 1.5,
    windowPhysicalX: 0,
    windowPhysicalY: 0,
  };
  const windowsCenter = resolveBackgroundImagePlacement({
    imagePixelSize: { height: 1080, width: 1920 },
    layout: BACKGROUND_IMAGE_LAYOUT_CENTER,
    layoutContext: windowsContext,
    targetHeight: 1440,
    targetWidth: 2560,
  });
  assert(windowsCenter.width === 1280 && windowsCenter.height === 720, "windows center should convert image pixels through monitor scale");
  assert(windowsCenter.x === 640 && windowsCenter.y === 360, "windows center should align against the monitor, not the local window");

  const shiftedTile = resolveBackgroundImagePlacement({
    imagePixelSize: { height: 1080, width: 1920 },
    layout: BACKGROUND_IMAGE_LAYOUT_TILE,
    layoutContext: {
      ...windowsContext,
      windowPhysicalX: 300,
      windowPhysicalY: 150,
    },
    targetHeight: 1440,
    targetWidth: 2560,
  });
  assert(shiftedTile.tile === true, "windows tile should stay tiled");
  assert(shiftedTile.tileWidth === 1280 && shiftedTile.tileHeight === 720, "windows tile should scale source pixels through monitor scale");
  assert(shiftedTile.tileX === -200 && shiftedTile.tileY === -100, "windows tile should offset by the window position inside the monitor");

  const renderedCenter = resolveBackgroundImagePlacement({
    imagePixelSize: { height: 1080, width: 1920 },
    layout: BACKGROUND_IMAGE_LAYOUT_CENTER,
    layoutContext: windowsContext,
    renderScaleX: 0.5,
    renderScaleY: 0.5,
    targetHeight: 1440,
    targetWidth: 2560,
  });
  assert(renderedCenter.width === 640 && renderedCenter.height === 360, "render placement should scale image size into the render texture");
  assert(renderedCenter.x === 320 && renderedCenter.y === 180, "render placement should scale image position into the render texture");

  const windowsCenterCss = resolveCssBackgroundImagePlacement(BACKGROUND_IMAGE_LAYOUT_CENTER, {
    imagePixelSize: { height: 1080, width: 1920 },
    layoutContext: windowsContext,
    targetHeight: 1440,
    targetWidth: 2560,
  });
  assert(windowsCenterCss.backgroundPosition === "640px 360px", "windows center css should use physical-pixel placement");
  assert(windowsCenterCss.backgroundSize === "1280px 720px", "windows center css should use scaled pixel size");
  assert(resolveCssBackgroundImageTransform(BACKGROUND_IMAGE_LAYOUT_FILL) === "scale(1.02)", "fill should keep css overscan");
  assert(resolveCssBackgroundImageTransform(BACKGROUND_IMAGE_LAYOUT_TILE) === "none", "tile should disable css overscan");

  const scaledPreviewCenterCss = resolveCssBackgroundImagePlacement(BACKGROUND_IMAGE_LAYOUT_CENTER, {
    imagePixelSize: { height: 1080, width: 1920 },
    layoutContext: windowsContext,
    renderScaleX: 0.125,
    renderScaleY: 0.125,
    targetHeight: 1440,
    targetWidth: 2560,
  });
  assert(scaledPreviewCenterCss.backgroundPosition === "80px 45px", "preview center css should scale full-window placement into the preview");
  assert(scaledPreviewCenterCss.backgroundSize === "160px 90px", "preview center css should scale full-window image size into the preview");

  const defaultFillCss = resolveCssBackgroundImagePlacement(BACKGROUND_IMAGE_LAYOUT_FILL, {
    imagePixelSize: { height: 300, width: 400 },
    renderScaleX: 0.2,
    renderScaleY: 0.2,
    targetHeight: 900,
    targetWidth: 1600,
  });
  assert(defaultFillCss.backgroundSize === "cover", "fill css should keep default cover behavior unless pixel placement is requested");

  const scaledPreviewFillCss = resolveCssBackgroundImagePlacement(BACKGROUND_IMAGE_LAYOUT_FILL, {
    imagePixelSize: { height: 300, width: 400 },
    preferPixelPlacement: true,
    renderScaleX: 0.2,
    renderScaleY: 0.2,
    targetHeight: 900,
    targetWidth: 1600,
  });
  assert(scaledPreviewFillCss.backgroundPosition === "0px -30px", "preview fill css should scale full-window crop into the preview");
  assert(scaledPreviewFillCss.backgroundSize === "320px 240px", "preview fill css should expose the scaled covered image size");

  const scaledPreviewFitCss = resolveCssBackgroundImagePlacement(BACKGROUND_IMAGE_LAYOUT_FIT, {
    imagePixelSize: { height: 300, width: 400 },
    preferPixelPlacement: true,
    renderScaleX: 0.2,
    renderScaleY: 0.2,
    targetHeight: 900,
    targetWidth: 1600,
  });
  assert(scaledPreviewFitCss.backgroundPosition === "40px 0px", "preview fit css should center the contained image in the preview");
  assert(scaledPreviewFitCss.backgroundSize === "240px 180px", "preview fit css should expose the scaled contained image size");

  const scaledPreviewStretchCss = resolveCssBackgroundImagePlacement(BACKGROUND_IMAGE_LAYOUT_STRETCH, {
    imagePixelSize: { height: 300, width: 400 },
    preferPixelPlacement: true,
    renderScaleX: 0.2,
    renderScaleY: 0.2,
    targetHeight: 900,
    targetWidth: 1600,
  });
  assert(scaledPreviewStretchCss.backgroundPosition === "0px 0px", "preview stretch css should start at the preview origin");
  assert(scaledPreviewStretchCss.backgroundSize === "320px 180px", "preview stretch css should fill the preview target");
}
