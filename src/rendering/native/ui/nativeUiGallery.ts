import { createNativeText } from "../nativeTypography.js";
import { Container,EventBoundary,FederatedPointerEvent,Graphics,Text } from "pixi.js";
import type { TextInputHost } from "../../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { NativeFluentToggle } from "../NativeFluentToggle.js";
import { NativeSpinButton } from "../NativeSpinButton.js";
import { NativeDisclosureSurface } from "./NativeDisclosureSurface.js";
import { nativeSettingsStyle,type NativeTheme } from "../NativeFluentButton.js";
import { NATIVE_UI_FONT_FAMILY } from "../nativeTypography.js";

export function nativeUiGallery(host:TextInputHost,theme:NativeTheme,invalidate:()=>void):Container{
  const root=new Container({label:"native-ui-gallery"}),style=nativeSettingsStyle(theme);
  root.addChild(new Graphics().rect(0,0,760,380).fill(style.panel));
  const text=(value:string,x:number,y:number)=>{const label=createNativeText({text:value,style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:14,fill:style.text}});label.position.set(x,y);root.addChild(label);};
  text(`Native UI · ${theme}`,20,16);
  for(const [index,name] of ["Off","On","Disabled","Hover"].entries()){
    const x=20+index*180;text(name,x,56);
    const toggle=new NativeFluentToggle("switch",()=>{},invalidate,theme);toggle.checked=index>0;toggle.disabled=index===2;toggle.position.set(x,85);root.addChild(toggle);
    if(index===3)toggle.emit("pointerover",new FederatedPointerEvent(new EventBoundary(root)));
    const spin=new NativeSpinButton(host,110,0,10,1,index===0?0:index===1?10:4,()=>{},invalidate,theme);spin.position.set(x,138);spin.disabled=index===2;root.addChild(spin);
    if(index===3){const down=spin.getChildByLabel("native-action:−",true);down?.emit("pointerover",new FederatedPointerEvent(new EventBoundary(root)));}
  }
  const disclosure=new NativeDisclosureSurface(720,110,theme);disclosure.position.set(20,210);root.addChild(disclosure);
  disclosure.content.addChild(new Graphics().roundRect(14,0,210,110,8).fill(style.selected).stroke({color:style.accent,width:1}));
  disclosure.update(1,1,true);return root;
}
