import type { Ref } from "vue";
import { createAltEditMode, type AltEditModeOptions } from "../application/altEditMode.js";
import { vueStateHost } from "./vueStateHost.js";
export type { AltKeyEvent, AltEditEventTarget } from "../application/altEditMode.js";
export type { AltEditModeOptions } from "../application/altEditMode.js";

export function useAltEditMode(options: Omit<AltEditModeOptions, "eventTarget"> & { eventTarget?: AltEditModeOptions["eventTarget"] }) {
  const mode = createAltEditMode({ ...options, eventTarget: options.eventTarget ?? globalThis.window }, vueStateHost);
  return { ...mode, isEditMode: mode.isEditMode as Ref<boolean> };
}
