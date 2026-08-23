let liveDesktopExperimentEnabledForTests: boolean | null = null;

export function isLiveDesktopExperimentEnabled(): boolean {
  if (typeof liveDesktopExperimentEnabledForTests === "boolean") {
    return liveDesktopExperimentEnabledForTests;
  }
  return import.meta.env?.VITE_EXPERIMENTAL_LIVE_DESKTOP === "true";
}

export function setLiveDesktopExperimentEnabledForTests(enabled: unknown): void {
  liveDesktopExperimentEnabledForTests = typeof enabled === "boolean" ? enabled : null;
}
