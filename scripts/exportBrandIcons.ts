import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import type { Page } from "playwright";

interface PixelBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

interface RenderedSvg {
  bounds: PixelBounds;
  png: string | null;
}

interface EncodedSvg extends RenderedSvg {
  png: string;
}

interface SquareCrop {
  size: number;
  x: number;
  y: number;
}

interface BrandVariant {
  readonly id: string;
  readonly source: string;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRECTORY = path.join(ROOT, "src", "assets", "branding");
const OUTPUT_DIRECTORY = path.join(SOURCE_DIRECTORY, "app-icons");
const SOURCE_SIZE = 1254;
const ANALYSIS_SIZE = 4096;
const ALPHA_THRESHOLD = 1;
const OUTPUT_SIZES = Object.freeze([16, 20, 24, 32, 40, 48, 64, 96, 256]);
const VARIANTS: readonly BrandVariant[] = Object.freeze([
  Object.freeze({ id: "light", source: "lumeria-app-icon.svg" }),
  Object.freeze({ id: "dark", source: "lumeria-app-icon-dark.svg" }),
  Object.freeze({ id: "pastelLight", source: "lumeria-app-icon-pastel-grid.svg" }),
  Object.freeze({ id: "pastelDark", source: "lumeria-app-icon-dark-pastel-grid.svg" }),
]);

function replaceSvgViewport(svg: string, width: number, height: number, viewBox: readonly number[]): string {
  return svg
    .replace(/\bwidth="[^"]+"/, `width="${width}"`)
    .replace(/\bheight="[^"]+"/, `height="${height}"`)
    .replace(/\bviewBox="[^"]+"/, `viewBox="${viewBox.join(" ")}"`);
}

function renderSvg(page: Page, svg: string, width: number, height: number, includePng: true): Promise<EncodedSvg>;
function renderSvg(page: Page, svg: string, width: number, height: number, includePng?: false): Promise<RenderedSvg>;
async function renderSvg(
  page: Page,
  svg: string,
  width: number,
  height: number,
  includePng = false,
): Promise<RenderedSvg> {
  return page.evaluate(async ({ source, outputWidth, outputHeight, shouldEncode }) => {
    const blobUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
    try {
      const image = new Image();
      image.decoding = "sync";
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Chromium could not decode a branding SVG"));
        image.src = blobUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
      if (!context) throw new Error("Chromium could not create a 2D canvas context");
      context.clearRect(0, 0, outputWidth, outputHeight);
      context.drawImage(image, 0, 0, outputWidth, outputHeight);
      const pixels = context.getImageData(0, 0, outputWidth, outputHeight).data;
      let minX = outputWidth;
      let minY = outputHeight;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < outputHeight; y += 1) {
        for (let x = 0; x < outputWidth; x += 1) {
          const alpha = pixels[(y * outputWidth + x) * 4 + 3];
          if (alpha === undefined) throw new RangeError("Branding SVG pixel buffer ended unexpectedly");
          if (alpha < 1) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (maxX < minX || maxY < minY) throw new Error("Branding SVG rendered no visible pixels");
      const png = shouldEncode ? canvas.toDataURL("image/png").split(",")[1] : null;
      if (shouldEncode && png === undefined) throw new Error("Chromium returned an invalid PNG data URL");
      return {
        bounds: { minX, minY, maxX: maxX + 1, maxY: maxY + 1 },
        png: png ?? null,
      };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }, {
    source: svg,
    outputWidth: width,
    outputHeight: height,
    shouldEncode: includePng,
  });
}

function makeSharedSquareCrop(bounds: PixelBounds): SquareCrop {
  const scale = SOURCE_SIZE / ANALYSIS_SIZE;
  const minX = Math.floor(bounds.minX * scale);
  const minY = Math.floor(bounds.minY * scale);
  const maxX = Math.ceil(bounds.maxX * scale);
  const maxY = Math.ceil(bounds.maxY * scale);
  const size = Math.max(maxX - minX, maxY - minY);
  let x = Math.floor((minX + maxX - size) / 2);
  let y = Math.floor((minY + maxY - size) / 2);
  x = Math.max(0, Math.min(SOURCE_SIZE - size, x));
  y = Math.max(0, Math.min(SOURCE_SIZE - size, y));
  return { x, y, size };
}

async function main(): Promise<void> {
  const sources = await Promise.all(VARIANTS.map(async (variant) => ({
    ...variant,
    svg: await readFile(path.join(SOURCE_DIRECTORY, variant.source), "utf8"),
  })));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const analyzed = await Promise.all(sources.map(async (variant) => ({
      ...variant,
      bounds: (await renderSvg(
        page,
        replaceSvgViewport(variant.svg, ANALYSIS_SIZE, ANALYSIS_SIZE, [0, 0, SOURCE_SIZE, SOURCE_SIZE]),
        ANALYSIS_SIZE,
        ANALYSIS_SIZE,
      )).bounds,
    })));
    const unionBounds = analyzed.reduce<PixelBounds>((union, variant) => ({
      minX: Math.min(union.minX, variant.bounds.minX),
      minY: Math.min(union.minY, variant.bounds.minY),
      maxX: Math.max(union.maxX, variant.bounds.maxX),
      maxY: Math.max(union.maxY, variant.bounds.maxY),
    }), { minX: ANALYSIS_SIZE, minY: ANALYSIS_SIZE, maxX: 0, maxY: 0 });
    const crop = makeSharedSquareCrop(unionBounds);
    const cropViewBox = [crop.x, crop.y, crop.size, crop.size];

    await mkdir(OUTPUT_DIRECTORY, { recursive: true });
    await writeFile(path.join(OUTPUT_DIRECTORY, "crop.json"), `${JSON.stringify({
      sourceSize: SOURCE_SIZE,
      analysisSize: ANALYSIS_SIZE,
      alphaThreshold: ALPHA_THRESHOLD,
      viewBox: cropViewBox,
    }, null, 2)}\n`);

    for (const variant of sources) {
      const variantDirectory = path.join(OUTPUT_DIRECTORY, variant.id);
      await mkdir(variantDirectory, { recursive: true });
      for (const size of OUTPUT_SIZES) {
        const croppedSvg = replaceSvgViewport(variant.svg, size, size, cropViewBox);
        const rendered = await renderSvg(page, croppedSvg, size, size, true);
        await writeFile(
          path.join(variantDirectory, `${size}x${size}.png`),
          Buffer.from(rendered.png, "base64"),
        );
      }
    }

    process.stdout.write(`Exported ${VARIANTS.length * OUTPUT_SIZES.length} icons with shared viewBox ${cropViewBox.join(" ")}\n`);
  } finally {
    await browser.close();
  }
}

await main();
