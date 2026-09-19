import { BufferImageSource, Texture } from "pixi.js";

// Original geometric test sprites: no third-party character artwork is bundled.
export function createDemoSpriteTextures(): Texture[] {
  return Array.from({ length: 12 }, (_, variant) => {
    const size = 32, pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if ((x - 15.5) ** 2 + (y - 15.5) ** 2 > 14 ** 2) continue;
      const offset = (y * size + x) * 4;
      pixels[offset] = 70 + (variant * 37) % 180;
      pixels[offset + 1] = 80 + (variant * 61) % 170;
      pixels[offset + 2] = 100 + (variant * 23) % 150;
      pixels[offset + 3] = 255;
    }
    return new Texture({ source: new BufferImageSource({ resource: pixels, width: size, height: size, format: "rgba8unorm", alphaMode: "no-premultiply-alpha" }) });
  });
}
