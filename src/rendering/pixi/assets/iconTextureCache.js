import { Texture } from "pixi.js";
import { getPixiIconTextureSource } from "../../../domain/iconSource.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";

const textureCache = new Map();
const failedTextureSources = new Set();
const pendingTextureLoads = new Map();
const textureLoadListeners = new Map();
let textureCacheGeneration = 0;

function notifyTextureLoaded(source) {
  const listeners = textureLoadListeners.get(source);
  textureLoadListeners.delete(source);
  if (!listeners) return;
  for (const listener of listeners.values()) listener();
}

function addTextureLoadListener(source, listener, listenerKey = listener) {
  if (typeof listener !== "function") return;
  let listeners = textureLoadListeners.get(source);
  if (!listeners) {
    listeners = new Map();
    textureLoadListeners.set(source, listeners);
  }
  listeners.set(listenerKey, listener);
}

function loadTextureFromImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        resolve(Texture.from(image, true));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error(`Failed to load icon texture: ${source}`));
    image.src = source;
  });
}

function destroyCachedTexture(texture) {
  if (!texture || texture.destroyed) return;
  texture.destroy(true);
}

function requestTextureLoad(source) {
  if (pendingTextureLoads.has(source) || failedTextureSources.has(source)) return;
  const generation = textureCacheGeneration;
  let pending = null;
  pending = loadTextureFromImage(source)
    .then((texture) => {
      if (generation !== textureCacheGeneration) {
        destroyCachedTexture(texture);
        return;
      }
      textureCache.set(source, texture);
      failedTextureSources.delete(source);
      notifyTextureLoaded(source);
    })
    .catch(() => {
      if (generation !== textureCacheGeneration) return;
      failedTextureSources.add(source);
      notifyTextureLoaded(source);
    })
    .finally(() => {
      if (pendingTextureLoads.get(source) === pending) pendingTextureLoads.delete(source);
    });
  pendingTextureLoads.set(source, pending);
}

export function getCachedIconTexture(item, onLoad, listenerKey = onLoad) {
  const source = getPixiIconTextureSource(item);
  if (!source) return null;
  if (textureCache.has(source)) return textureCache.get(source);
  if (!failedTextureSources.has(source)) addTextureLoadListener(source, onLoad, listenerKey);
  requestTextureLoad(source);
  return null;
}

export function preloadIconTextures(items) {
  const seen = new Set();
  for (const item of items || []) {
    const source = getPixiIconTextureSource(item);
    if (!source || seen.has(source) || textureCache.has(source) || failedTextureSources.has(source)) continue;
    seen.add(source);
    requestTextureLoad(source);
  }
}

export function clearIconTextureCache() {
  textureCacheGeneration += 1;
  for (const texture of textureCache.values()) destroyCachedTexture(texture);
  textureCache.clear();
  failedTextureSources.clear();
  pendingTextureLoads.clear();
  textureLoadListeners.clear();
}

reloadOnPixiHotUpdate(import.meta.hot);
