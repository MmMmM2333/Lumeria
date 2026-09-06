import { Color, Graphics } from "pixi.js";
import type { TextInput, TextInputHost } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";

/** Draw RGBA chrome ourselves; the text host accepts opaque numeric colors only. */
export function createNativeSettingsInput(host:TextInputHost,options:{width:number;height?:number;value:string;theme:NativeTheme;
  variant?:"normal"|"label";readOnly?:boolean;disabled?:boolean;placeholder?:string;invalidate():void}):TextInput{
  const {width,theme,invalidate}=options,height=options.height??34,label=options.variant==="label",style=nativeSettingsStyle(theme);
  const input=host.create({width,height,value:options.value,chrome:false,readOnly:options.readOnly??false,placeholder:options.placeholder??"",
    style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:label?13:12,lineHeight:16,padding:label?4:6,
      textColor:new Color(style.text).toNumber(),caretColor:new Color(style.text).toNumber(),placeholderColor:new Color(style.muted).toNumber()}});
  const chrome=new Graphics({eventMode:"none",label:"native-settings-input:chrome"});input.addChildAt(chrome,0);
  let hover=false;
  const draw=()=>{
    const active=input.focused;
    chrome.clear();
    if(!label||hover||active){
      const fill=theme==="dark"?(label?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.1)"):(label?"rgba(0,0,0,0.025)":"rgba(255,255,255,0.7)");
      const border=theme==="dark"?(hover?"rgba(255,255,255,0.22)":"rgba(255,255,255,0.1)"):style.border;
      chrome.roundRect(0.5,0.5,width-1,height-1,4).fill(fill).stroke({color:border,width:1});
      chrome.moveTo(3,height-1).lineTo(width-3,height-1).stroke({color:active?style.accent:theme==="dark"?"rgba(255,255,255,0.2)":style.border,width:active?2:1});
    }
    input.alpha=options.disabled?0.5:1;invalidate();
  };
  input.on("pointerover",()=>{hover=true;draw();});input.on("pointerout",()=>{hover=false;draw();});
  input.on("focus",draw);input.on("blur",draw);input.disabled=options.disabled??false;draw();return input;
}
