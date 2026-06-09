import { Texture } from "pixi.js";

export function shouldRequestCorsForTextureImage(source) {
  const value = String(source || "").trim();
  return Boolean(value) && !/^data:/i.test(value) && !/^blob:/i.test(value);
}

export function loadBackgroundTextureFromImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    if (shouldRequestCorsForTextureImage(source)) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => {
      try {
        resolve(Texture.from(image, true));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error(`Failed to load background texture: ${source}`));
    image.src = source;
  });
}
