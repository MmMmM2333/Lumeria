import { PIXI_UI_FONT_FAMILY } from "../typography.js";
import { Text, type Container, type CanvasTextOptions } from "pixi.js";
import { getTextRenderResolution } from "../pixi/geometry/stageCoordinates.js";
import { syncPixiTextResolution } from "../pixi/pixiText.js";

/** Apply the desktop's minimum text density to native controls, including host inputs. */
let nativeTextResolution=2;
export function getNativeTextResolution():number{return nativeTextResolution;}
export function createNativeText(options:CanvasTextOptions={}):Text {
  return new Text({...options,resolution:nativeTextResolution});
}
export function configureNativeTextResolution(resolution:number,root?:Container):void {
  nativeTextResolution=getTextRenderResolution(resolution);
  if(root)syncPixiTextResolution(root,resolution);
}

export let NATIVE_UI_FONT_FAMILY: readonly string[] = PIXI_UI_FONT_FAMILY;

/** The native host supplies the OS UI font; Web and scene-label typography retain their own defaults. */
export function setNativeUiFontFamily(family: string | null): boolean {
  const name = family?.trim();
  const next = name ? [name, ...PIXI_UI_FONT_FAMILY.filter(value => value !== name)] : PIXI_UI_FONT_FAMILY;
  if (next.join("\0") === NATIVE_UI_FONT_FAMILY.join("\0")) return false;
  NATIVE_UI_FONT_FAMILY = Object.freeze([...next]);
  return true;
}
