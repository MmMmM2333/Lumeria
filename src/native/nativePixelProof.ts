export type NativePixelData = Readonly<{
  height: number;
  pixels: Uint8ClampedArray;
  width: number;
}>;

export type NativePixelRegion = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type NativeScenePixelProof = Readonly<{
  bottomForegroundPixels: number;
  coloredEmojiPixels: number;
  coloredIconPixels: number;
  emojiForegroundPixels: readonly number[];
  iconForegroundPixels: readonly number[];
  labelForegroundPixels: readonly number[];
}>;

export type NativeScenePixelProofOptions = Readonly<{
  background: readonly [number, number, number, number];
  contentBottom: number;
  contentEnd?: number;
  emojiRegions: readonly NativePixelRegion[];
  iconRegions: readonly NativePixelRegion[];
  labelRegions: readonly NativePixelRegion[];
}>;

function isForeground(
  pixels: Uint8ClampedArray,
  offset: number,
  background: readonly [number, number, number, number],
): boolean {
  return Math.abs(pixels[offset]! - background[0]) > 8
    || Math.abs(pixels[offset + 1]! - background[1]) > 8
    || Math.abs(pixels[offset + 2]! - background[2]) > 8
    || Math.abs(pixels[offset + 3]! - background[3]) > 8;
}

function assertRegion(data: NativePixelData, region: NativePixelRegion, name: string): void {
  const values = [region.x, region.y, region.width, region.height];
  if (!values.every(Number.isInteger) || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0) {
    throw new RangeError(`${name} must contain non-negative integer coordinates and positive integer dimensions`);
  }
  if (region.x + region.width > data.width || region.y + region.height > data.height) {
    throw new RangeError(`${name} exceeds the native pixel data bounds`);
  }
}

function countRegionPixels(
  data: NativePixelData,
  region: NativePixelRegion,
  predicate: (offset: number) => boolean,
): number {
  let count = 0;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      if (predicate((y * data.width + x) * 4)) count += 1;
    }
  }
  return count;
}

export function assertNativeScenePixels(
  data: NativePixelData,
  options: NativeScenePixelProofOptions,
): NativeScenePixelProof {
  if (!Number.isInteger(data.width) || !Number.isInteger(data.height) || data.width <= 0 || data.height <= 0) {
    throw new TypeError(`Native pixel data dimensions must be positive integers, received ${data.width}x${data.height}`);
  }
  if (data.pixels.length !== data.width * data.height * 4) {
    throw new RangeError(`Native pixel data length does not match ${data.width}x${data.height}`);
  }
  if (!Number.isInteger(options.contentBottom) || options.contentBottom < 0 || options.contentBottom > data.height) {
    throw new RangeError(`Native content bottom is outside the pixel data: ${options.contentBottom}`);
  }
  options.emojiRegions.forEach((region, index) => assertRegion(data, region, `Emoji region ${index}`));
  options.iconRegions.forEach((region, index) => assertRegion(data, region, `Icon region ${index}`));
  options.labelRegions.forEach((region, index) => assertRegion(data, region, `Label region ${index}`));

  let bottomForegroundPixels = 0;
  for (let y = options.contentBottom; y < (options.contentEnd ?? data.height); y += 1) {
    for (let x = 0; x < data.width; x += 1) {
      if (isForeground(data.pixels, (y * data.width + x) * 4, options.background)) {
        bottomForegroundPixels += 1;
      }
    }
  }
  if (bottomForegroundPixels > 0) {
    throw new Error(`Native scene lower empty area contains ${bottomForegroundPixels} foreground pixel${bottomForegroundPixels === 1 ? "" : "s"}`);
  }

  let coloredEmojiPixels = 0;
  const emojiForegroundPixels = options.emojiRegions.map((region, index) => {
    const foregroundPixels = countRegionPixels(
      data,
      region,
      (offset) => isForeground(data.pixels, offset, options.background),
    );
    if (foregroundPixels === 0) throw new Error(`Native Emoji region ${index} contains no foreground pixels`);
    coloredEmojiPixels += countRegionPixels(data, region, (offset) => {
      if (!isForeground(data.pixels, offset, options.background)) return false;
      const red = data.pixels[offset]!;
      const green = data.pixels[offset + 1]!;
      const blue = data.pixels[offset + 2]!;
      return Math.max(red, green, blue) >= 64 && Math.max(red, green, blue) - Math.min(red, green, blue) >= 24;
    });
    return foregroundPixels;
  });
  if (options.emojiRegions.length > 0 && coloredEmojiPixels === 0) {
    throw new Error("Native scene contains no color emoji pixels; the font likely rendered missing-glyph boxes");
  }
  let coloredIconPixels = 0;
  const iconForegroundPixels = options.iconRegions.map((region, index) => {
    const foregroundPixels = countRegionPixels(
      data,
      region,
      (offset) => isForeground(data.pixels, offset, options.background),
    );
    if (foregroundPixels === 0) throw new Error(`Native Icon region ${index} contains no foreground pixels`);
    coloredIconPixels += countRegionPixels(data, region, (offset) => {
      if (!isForeground(data.pixels, offset, options.background)) return false;
      const red = data.pixels[offset]!;
      const green = data.pixels[offset + 1]!;
      const blue = data.pixels[offset + 2]!;
      return Math.max(red, green, blue) - Math.min(red, green, blue) >= 24;
    });
    return foregroundPixels;
  });
  if (options.iconRegions.length > 0 && coloredIconPixels === 0) {
    throw new Error("Native scene contains no colored icon pixels");
  }
  const labelForegroundPixels = options.labelRegions.map((region, index) => {
    const foregroundPixels = countRegionPixels(
      data,
      region,
      (offset) => isForeground(data.pixels, offset, options.background),
    );
    if (foregroundPixels === 0) throw new Error(`Native Label region ${index} contains no foreground pixels`);
    return foregroundPixels;
  });
  return Object.freeze({
    bottomForegroundPixels,
    coloredEmojiPixels,
    coloredIconPixels,
    emojiForegroundPixels: Object.freeze(emojiForegroundPixels),
    iconForegroundPixels: Object.freeze(iconForegroundPixels),
    labelForegroundPixels: Object.freeze(labelForegroundPixels),
  });
}
