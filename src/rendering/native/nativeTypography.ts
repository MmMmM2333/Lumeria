import { PIXI_UI_FONT_FAMILY } from "../typography.js";

export let NATIVE_UI_FONT_FAMILY: readonly string[] = PIXI_UI_FONT_FAMILY;

/** The native host supplies the OS UI font; Web and scene-label typography retain their own defaults. */
export function setNativeUiFontFamily(family: string | null): boolean {
  const name = family?.trim();
  const next = name ? [name, ...PIXI_UI_FONT_FAMILY.filter(value => value !== name)] : PIXI_UI_FONT_FAMILY;
  if (next.join("\0") === NATIVE_UI_FONT_FAMILY.join("\0")) return false;
  NATIVE_UI_FONT_FAMILY = Object.freeze([...next]);
  return true;
}
