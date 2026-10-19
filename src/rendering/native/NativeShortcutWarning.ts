import { Container, Graphics } from "pixi.js";
import { NativeFluentButton, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import type { NativeSettingsControl } from "./NativeSettingsShell.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { createNativeParagraph } from "./nativeParagraph.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { t } from "../../native/nativeLocalization.js";

/** Field-local warning with a tooltip placed in the owner's foreground layer. */
export function createNativeShortcutWarning(options:{field:NativeFluentButton;theme:NativeTheme;invalidate():void;label:string;tooltipLabel:string;width:number}){
  const {field,theme,invalidate}=options,style=nativeSettingsStyle(theme);
  const tooltip=new Container({label:options.tooltipLabel,eventMode:"none"});tooltip.visible=false;
  const button=new NativeFluentButton(t("settings.general.shortcut.warning"),32,()=>show(true),invalidate,theme,"subtle",false,32);
  button.label=options.label;button.caption.visible=false;button.position.set(2,0);button.visible=false;field.addChild(button);
  const mark=nativeFluentIcon("error-circle-20-regular",theme==="dark"?"#ffcf70":"#9d5d00",20);mark.position.set(6,6);button.addChild(mark);
  let message="",hovered=false,focused=false;
  const show=(active:boolean)=>{tooltip.visible=button.visible&&active;invalidate();};
  button.on("pointerover",()=>{hovered=true;show(true);});
  button.on("pointerout",()=>{hovered=false;show(focused);});
  const control:NativeSettingsControl={node:button,focus:active=>{focused=active;button.focused=active;show(active||hovered);},disabled:()=>!button.visible,
    handleKey:key=>{if(key==="Escape"){if(!tooltip.visible)return false;show(false);return true;}if(key!=="Enter"&&key!==" ")return false;show(true);return true;}};
  return {button,tooltip,control,show,update(next:string){
    button.visible=Boolean(next);
    if(next!==message){
      message=next;for(const child of tooltip.removeChildren())child.destroy({children:true});
      const copy=createNativeParagraph(message,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,lineHeight:18,fill:style.text},options.width-24);copy.position.set(12,10);
      tooltip.addChild(new Graphics({eventMode:"none"}).roundRect(0,0,options.width,copy.height+20,6)
        .fill(theme==="dark"?"#2d2d2d":"#ffffff").stroke({color:theme==="dark"?"#666666":"#a0a0a0",width:1}),copy);
    }
    if(!next)tooltip.visible=false;
  }};
}
