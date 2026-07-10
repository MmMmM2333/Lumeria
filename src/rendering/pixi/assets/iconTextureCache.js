import { Texture } from "pixi.js";
import { getPixiIconTextureSource } from "../../../domain/iconSource.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import {
  hashDebugSample,
  makeDebugSourceSnapshot,
} from "../renderDebugFingerprint.js";

const textureCache = new Map();
const failedTextureSources = new Set();
const pendingTextureLoads = new Map();
const textureLoadListeners = new Map();
const recentTextureErrors = [];
let textureCacheGeneration = 0;
let textureDebugOverride = false;
const TEXTURE_ERROR_LIMIT = 16;

function makeTextureErrorDebugMessage(source, error) {
  const sourceValue = String(source || "");
  const sourceLabel = `[icon-source:${hashDebugSample(sourceValue)}]`;
  let message = String(error?.message || error || "Unknown icon texture load error");
  if (sourceValue) message = message.split(sourceValue).join(sourceLabel);
  message = message.replace(/data:image\/[^\s"'<>)]*/gi, "[redacted-data-url]");
  if (message.length <= 512) return message;
  return `Icon texture error message fingerprint=${hashDebugSample(message)} length=${message.length}`;
}

function recordTextureError(source, error) {
  recentTextureErrors.push({
    error: makeTextureErrorDebugMessage(source, error),
    source: makeDebugSourceSnapshot(source),
    time: Date.now(),
  });
  if (recentTextureErrors.length > TEXTURE_ERROR_LIMIT) {
    recentTextureErrors.splice(0, recentTextureErrors.length - TEXTURE_ERROR_LIMIT);
  }
}

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
    image.onerror = () => reject(new Error("Failed to load icon texture"));
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
    .catch((error) => {
      if (generation !== textureCacheGeneration) return;
      if ((import.meta.env && import.meta.env.DEV) || textureDebugOverride) {
        recordTextureError(source, error);
      }
      failedTextureSources.add(source);
      notifyTextureLoaded(source);
    })
    .finally(() => {
      if (pendingTextureLoads.get(source) === pending) pendingTextureLoads.delete(source);
    });
  pendingTextureLoads.set(source, pending);
}

function waitForTextureLoad(source) {
  if (!source || textureCache.has(source) || failedTextureSources.has(source)) return Promise.resolve();
  requestTextureLoad(source);
  return pendingTextureLoads.get(source) || Promise.resolve();
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

export function preloadIconTexturesAsync(items, options = {}) {
  const seen = new Set();
  const loads = [];
  for (const item of items || []) {
    const source = getPixiIconTextureSource(item);
    if (!source || seen.has(source)) continue;
    seen.add(source);
    loads.push(waitForTextureLoad(source));
  }
  const timeoutMs = Math.max(0, Number(options.timeoutMs) || 0);
  const loaded = Promise.allSettled(loads);
  if (!timeoutMs) return loaded;
  return Promise.race([
    loaded,
    new Promise((resolve) => globalThis.setTimeout?.(resolve, timeoutMs)),
  ]);
}

export function clearIconTextureCache() {
  textureCacheGeneration += 1;
  for (const texture of textureCache.values()) destroyCachedTexture(texture);
  textureCache.clear();
  failedTextureSources.clear();
  pendingTextureLoads.clear();
  textureLoadListeners.clear();
  recentTextureErrors.length = 0;
}

export function getIconTextureCacheDebugSnapshot() {
  return {
    cached: Array.from(textureCache.entries()).map(([source, texture]) => ({
      source: makeDebugSourceSnapshot(source),
      sourceDestroyed: texture?.source?.destroyed === true,
      sourcePixelHeight: texture?.source?.pixelHeight ?? null,
      sourcePixelWidth: texture?.source?.pixelWidth ?? null,
      sourceUid: texture?.source?.uid ?? null,
      textureDestroyed: texture?.destroyed === true,
      textureUid: texture?.uid ?? null,
    })),
    failed: Array.from(failedTextureSources, makeDebugSourceSnapshot),
    generation: textureCacheGeneration,
    pending: Array.from(pendingTextureLoads.keys(), makeDebugSourceSnapshot),
    recentErrors: recentTextureErrors.map((entry) => ({
      ...entry,
      source: { ...entry.source },
    })),
  };
}

export function setIconTextureCacheDebugOverride(enabled) {
  textureDebugOverride = enabled === true;
}

reloadOnPixiHotUpdate(import.meta.hot);
