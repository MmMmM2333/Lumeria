let liveDesktopExperimentEnabledForTests = null;

export function isLiveDesktopExperimentEnabled() {
  if (typeof liveDesktopExperimentEnabledForTests === "boolean") {
    return liveDesktopExperimentEnabledForTests;
  }
  return import.meta.env?.VITE_EXPERIMENTAL_LIVE_DESKTOP === "true";
}

export function setLiveDesktopExperimentEnabledForTests(enabled) {
  liveDesktopExperimentEnabledForTests = typeof enabled === "boolean" ? enabled : null;
}
