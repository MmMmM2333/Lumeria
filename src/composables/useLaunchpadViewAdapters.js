export function createSettingsPanelState(settingsPanel, appVersion) {
  return {
    ...settingsPanel,
    appVersion,
  };
}

export function createDialogState(dialogs) {
  return dialogs;
}

export function createFolderOverlayState(folderOverlay) {
  return folderOverlay;
}

export function createOverlayState(overlays) {
  return overlays;
}
