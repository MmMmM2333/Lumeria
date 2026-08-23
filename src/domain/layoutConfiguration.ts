import {
  DEFAULT_ICON_SIZE,
  ICON_SIZE_MAX,
  ICON_SIZE_MIN,
} from "./launchpadGridDefaults.js";
import { clamp } from "./launchpadLayout.js";

export const FOLDER_ICON_SIZE_MODE_CUSTOM = "custom";
export const FOLDER_ICON_SIZE_MODE_GLOBAL = "global";

export type FolderIconSizeMode =
  | typeof FOLDER_ICON_SIZE_MODE_CUSTOM
  | typeof FOLDER_ICON_SIZE_MODE_GLOBAL;

export function clampLaunchpadIconSize(value: unknown): number {
  return clamp(Number(value) || DEFAULT_ICON_SIZE, ICON_SIZE_MIN, ICON_SIZE_MAX);
}

export function normalizeFolderIconSizeMode(value: unknown): FolderIconSizeMode {
  return value === FOLDER_ICON_SIZE_MODE_CUSTOM
    ? FOLDER_ICON_SIZE_MODE_CUSTOM
    : FOLDER_ICON_SIZE_MODE_GLOBAL;
}
