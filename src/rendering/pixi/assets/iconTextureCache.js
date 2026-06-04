import { Texture } from "pixi.js";
import { getPixiIconTextureSource } from "../../../domain/iconSource.js";

const textureCache = new Map();
const failedTextureSources = new Set();
const pendingTextureLoads = new Map();
const textureLoadListeners = new Map();

function notifyTextureLoaded(source) {
  const listeners = textureLoadListeners.get(source);
  textureLoadListeners.delete(source);
  if (!listeners) return;
  for (const listener of listeners) listener();
}

function addTextureLoadListener(source, listener) {
  if (typeof listener !== "function") return;
  let listeners = textureLoadListeners.get(source);
  if (!listeners) {
    listeners = new Set();
    textureLoadListeners.set(source, listeners);
  }
  listeners.add(listener);
}

function loadTextureFromImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        resolve(Texture.from(image));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error(`Failed to load icon texture: ${source}`));
    image.src = source;
  });
}

function requestTextureLoad(source) {
  if (pendingTextureLoads.has(source) || failedTextureSources.has(source)) return;
  const pending = loadTextureFromImage(source)
    .then((texture) => {
      textureCache.set(source, texture);
      failedTextureSources.delete(source);
      notifyTextureLoaded(source);
    })
    .catch(() => {
      failedTextureSources.add(source);
      notifyTextureLoaded(source);
    })
    .finally(() => {
      pendingTextureLoads.delete(source);
    });
  pendingTextureLoads.set(source, pending);
}

export function getCachedIconTexture(item, onLoad) {
  const source = getPixiIconTextureSource(item);
  if (!source) return null;
  if (textureCache.has(source)) return textureCache.get(source);
  if (!failedTextureSources.has(source)) addTextureLoadListener(source, onLoad);
  requestTextureLoad(source);
  return null;
}

export function clearIconTextureCache() {
  textureCache.clear();
  failedTextureSources.clear();
  pendingTextureLoads.clear();
  textureLoadListeners.clear();
}
