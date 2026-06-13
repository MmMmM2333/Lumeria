export const LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN = "testPattern";
export const LIVE_DESKTOP_DEBUG_FRAME_SOURCE_OVERRIDE_STORAGE_KEY = "launchpadLiveDesktopDebugFrameSourceOverride";
export const LIVE_DESKTOP_DISABLE_MOUSE_RELAY_STORAGE_KEY = "launchpadLiveDesktopDisableMouseRelay";
export const LIVE_DESKTOP_COMPOSITOR_KEEPER_STORAGE_KEY = "launchpadLiveDesktopCompositorKeeper";
export const LIVE_DESKTOP_COMPOSITOR_KEEPER_CHANGED_EVENT = "launchpad-live-desktop-compositor-keeper-change";
export const LIVE_DESKTOP_CSS_FALLBACK_EFFECTS_STORAGE_KEY = "launchpadLiveDesktopCssFallbackEffects";
export const LIVE_DESKTOP_CSS_FALLBACK_EFFECTS_CHANGED_EVENT = "launchpad-live-desktop-css-fallback-effects-change";
export const LIVE_DESKTOP_SKIP_BLANK_FRAMES_STORAGE_KEY = "launchpadLiveDesktopSkipBlankFrames";
export const LIVE_DESKTOP_FORCE_DWM_FLUSH_STORAGE_KEY = "launchpadLiveDesktopForceDwmFlush";

function readLocalStorageItem(key) {
  if (typeof window === "undefined") return null;
  return window.localStorage?.getItem(key) ?? null;
}

function setLocalStorageItem(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage?.setItem(key, value);
}

function removeLocalStorageItem(key) {
  if (typeof window === "undefined") return;
  window.localStorage?.removeItem(key);
}

export function readLiveDesktopDebugFrameSourceOverride() {
  try {
    const frameSourceOverride = readLocalStorageItem(LIVE_DESKTOP_DEBUG_FRAME_SOURCE_OVERRIDE_STORAGE_KEY);
    return frameSourceOverride === LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      ? LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      : null;
  } catch {
    return null;
  }
}

export function readLiveDesktopDisableMouseRelay() {
  try {
    return readLocalStorageItem(LIVE_DESKTOP_DISABLE_MOUSE_RELAY_STORAGE_KEY) !== "false";
  } catch (error) {
    console.warn("Failed to read live desktop mouse relay setting", error);
    return true;
  }
}

export function readLiveDesktopCompositorKeeper() {
  try {
    return readLocalStorageItem(LIVE_DESKTOP_COMPOSITOR_KEEPER_STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("Failed to read live desktop compositor keeper setting", error);
    return false;
  }
}

export function readLiveDesktopCssFallbackEffects() {
  try {
    return readLocalStorageItem(LIVE_DESKTOP_CSS_FALLBACK_EFFECTS_STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("Failed to read live desktop CSS fallback setting", error);
    return false;
  }
}

export function readLiveDesktopSkipBlankFrames() {
  try {
    return readLocalStorageItem(LIVE_DESKTOP_SKIP_BLANK_FRAMES_STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("Failed to read live desktop skip blank frames setting", error);
    return false;
  }
}

export function readLiveDesktopForceDwmFlush() {
  try {
    return readLocalStorageItem(LIVE_DESKTOP_FORCE_DWM_FLUSH_STORAGE_KEY) === "true";
  } catch (error) {
    console.warn("Failed to read live desktop DWM flush setting", error);
    return false;
  }
}

export function persistLiveDesktopDebugFrameSourceOverride(frameSourceOverride) {
  try {
    if (frameSourceOverride === LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN) {
      setLocalStorageItem(
        LIVE_DESKTOP_DEBUG_FRAME_SOURCE_OVERRIDE_STORAGE_KEY,
        LIVE_DESKTOP_FRAME_SOURCE_TEST_PATTERN
      );
      return;
    }
    removeLocalStorageItem(LIVE_DESKTOP_DEBUG_FRAME_SOURCE_OVERRIDE_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to persist live desktop debug frame source override", error);
  }
}

export function persistLiveDesktopDisableMouseRelay(disabled) {
  try {
    if (disabled) {
      removeLocalStorageItem(LIVE_DESKTOP_DISABLE_MOUSE_RELAY_STORAGE_KEY);
    } else {
      setLocalStorageItem(LIVE_DESKTOP_DISABLE_MOUSE_RELAY_STORAGE_KEY, "false");
    }
  } catch (error) {
    console.warn("Failed to persist live desktop mouse relay setting", error);
  }
}

export function persistLiveDesktopCompositorKeeper(enabled) {
  try {
    if (enabled) {
      setLocalStorageItem(LIVE_DESKTOP_COMPOSITOR_KEEPER_STORAGE_KEY, "true");
    } else {
      removeLocalStorageItem(LIVE_DESKTOP_COMPOSITOR_KEEPER_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist live desktop compositor keeper setting", error);
  }
}

export function persistLiveDesktopCssFallbackEffects(enabled) {
  try {
    if (enabled) {
      setLocalStorageItem(LIVE_DESKTOP_CSS_FALLBACK_EFFECTS_STORAGE_KEY, "true");
    } else {
      removeLocalStorageItem(LIVE_DESKTOP_CSS_FALLBACK_EFFECTS_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist live desktop CSS fallback setting", error);
  }
}

export function persistLiveDesktopSkipBlankFrames(enabled) {
  try {
    if (enabled) {
      setLocalStorageItem(LIVE_DESKTOP_SKIP_BLANK_FRAMES_STORAGE_KEY, "true");
    } else {
      removeLocalStorageItem(LIVE_DESKTOP_SKIP_BLANK_FRAMES_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist live desktop skip blank frames setting", error);
  }
}

export function persistLiveDesktopForceDwmFlush(enabled) {
  try {
    if (enabled) {
      setLocalStorageItem(LIVE_DESKTOP_FORCE_DWM_FLUSH_STORAGE_KEY, "true");
    } else {
      removeLocalStorageItem(LIVE_DESKTOP_FORCE_DWM_FLUSH_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist live desktop DWM flush setting", error);
  }
}

export function notifyLiveDesktopCompositorKeeperChanged(enabled) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LIVE_DESKTOP_COMPOSITOR_KEEPER_CHANGED_EVENT, {
    detail: { enabled },
  }));
}

export function notifyLiveDesktopCssFallbackEffectsChanged(enabled) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LIVE_DESKTOP_CSS_FALLBACK_EFFECTS_CHANGED_EVENT, {
    detail: { enabled },
  }));
}
