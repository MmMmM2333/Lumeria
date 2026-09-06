import type { Container } from "pixi.js";
import { NativeSingleLineText } from "./NativeSingleLineText.js";
import { nativeFluentTheme,type NativeTheme } from "../NativeFluentButton.js";
import { NATIVE_UI_FONT_FAMILY } from "../nativeTypography.js";

/** Summary column ends before the 18px arrow slot plus its 12px column gap. */
export function nativeRowSummary(parent:Container,value:string,width:number,y:number,theme:NativeTheme,id:string):NativeSingleLineText{
  const summary=new NativeSingleLineText(value,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,lineHeight:15.6,
    fill:theme==="dark"?"rgba(255,255,255,0.74)":nativeFluentTheme(theme).colorNeutralForeground2},Math.min(180,Math.max(0,width-260)));
  summary.label=id;summary.anchor.x=1;summary.position.set(width-47,y);parent.addChild(summary);return summary;
}
