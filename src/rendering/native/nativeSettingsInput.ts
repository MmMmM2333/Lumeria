import { Color, Graphics } from "pixi.js";
import type { TextInput, TextInputHost } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { nativeFluentTheme, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";

/** Draw RGBA chrome ourselves; the text host accepts opaque numeric colors only. */
export function createNativeSettingsInput(host:TextInputHost,options:{width:number;height?:number;value:string;theme:NativeTheme;
  variant?:"normal"|"label";readOnly?:boolean;disabled?:boolean;placeholder?:string;leadingInset?:number;maxLength?:number;invalidate():void}):TextInput{
  const {width,theme,invalidate}=options,height=options.height??34,label=options.variant==="label",style=nativeSettingsStyle(theme);
  const inset=options.leadingInset??0;
  const input=host.create({width:width-inset,height,value:options.value,chrome:false,readOnly:options.readOnly??false,placeholder:options.placeholder??"",...(options.maxLength?{maxLength:options.maxLength}:{}),
    style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:label?13:12,fontWeight:label?"600":"normal",lineHeight:16,padding:label?4:6,paddingHorizontal:label?6:10,
      textColor:new Color(style.text).toNumber(),caretColor:new Color(style.text).toNumber(),
      // Same opaque token as the original Fluent text input. Converting the
      // settings RGBA white/muted color to RGB would discard its alpha.
      placeholderColor:new Color(nativeFluentTheme(theme).colorNeutralForeground4).toNumber()}});
  const chrome=new Graphics({eventMode:"none",label:"native-settings-input:chrome"});input.addChildAt(chrome,0);
  chrome.x=-inset;
  if(inset){chrome.eventMode="static";chrome.on("pointerdown",()=>input.focus());}
  let hover=false;
  const draw=()=>{
    const active=input.focused;
    chrome.clear();
    if(!label||hover||active){
      const fill=theme==="dark"?(label?"rgba(255,255,255,0.07)":hover?"rgba(255,255,255,0.065)":"rgba(0,0,0,0.16)"):(label?"rgba(0,0,0,0.025)":"rgba(255,255,255,0.7)");
      const border=theme==="dark"?(hover?"rgba(255,255,255,0.22)":"rgba(255,255,255,0.14)"):style.border;
      chrome.roundRect(0.5,0.5,width-1,height-1,4).fill(fill).stroke({color:border,width:1});
      chrome.moveTo(3,height-1).lineTo(width-3,height-1).stroke({color:active?style.accent:theme==="dark"?`rgba(255,255,255,${hover?0.48:0.34})`:style.border,width:active?2:1});
    }
    input.alpha=options.disabled?0.5:1;invalidate();
  };
  input.on("pointerover",()=>{hover=true;draw();});input.on("pointerout",()=>{hover=false;draw();});
  input.on("focus",draw);input.on("blur",draw);input.disabled=options.disabled??false;draw();return input;
}
