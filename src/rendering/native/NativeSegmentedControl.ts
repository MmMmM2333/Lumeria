import { Container, Graphics, Text } from "pixi.js";
import { NativeFluentButton, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import type { NativeSettingsControl } from "./NativeSettingsShell.js";
import { nativeUiTheme } from "./ui/nativeUiTheme.js";

/** Mirrors settings-segmented-control: one clipped border and an active underline. */
export class NativeSegmentedControl extends Container {
  readonly controls:NativeSettingsControl[]=[];
  readonly controlWidth:number;
  constructor(entries:readonly {value:string;label:string;id:string;disabled?:boolean}[],selected:string,
    change:(value:string)=>void,invalidate:()=>void,theme:NativeTheme,maxWidth=Infinity){
    super({eventMode:"passive"});
    const style=nativeSettingsStyle(theme);
    const widths=entries.map(entry=>{
      const text=new Text({text:entry.label,style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12}});
      const width=Math.max(74,Math.ceil(text.width)+24);text.destroy();return width;
    });
    const naturalWidth=widths.reduce((sum,width)=>sum+width,0),scale=Math.min(1,maxWidth/naturalWidth);
    this.controlWidth=naturalWidth*scale+2;
    const clip=new Graphics({eventMode:"none"}).roundRect(0,0,this.controlWidth,34,6).fill(0xffffff);
    const content=new Container();this.addChild(content,clip);content.mask=clip;
    content.addChild(new Graphics({eventMode:"none"}).rect(0,0,this.controlWidth,34).fill(
      theme==="dark"?"rgba(0,0,0,0.14)":"rgba(0,0,0,0.035)"));
    let x=1;
    entries.forEach((entry,index)=>{
      const width=widths[index]!*scale;
      if(entry.value===selected)content.addChild(new Graphics({eventMode:"none"})
        .rect(x,1,width,32).fill(nativeUiTheme(theme).optionSelected).rect(x,32,width,2).fill(style.accent));
      if(index)content.addChild(new Graphics({eventMode:"none"}).rect(x,1,1,31).fill(style.border));
      const button=new NativeFluentButton(entry.label,width,()=>change(entry.value),invalidate,theme,"subtle",false,32);
      button.label=entry.id;button.position.set(x,1);button.caption.style.fontSize=12;
      button.caption.alpha=entry.value===selected?1:0.72;
      button.disabled=Boolean(entry.disabled);if(button.disabled)button.alpha=0.38;
      content.addChild(button);x+=width;
      this.controls.push({node:button,focus:active=>{button.focused=active;},disabled:()=>button.disabled,
        handleKey:key=>{if(key!==" "&&key!=="Enter")return false;button.activate();return true;}});
    });
    this.addChild(new Graphics({eventMode:"none"}).roundRect(0.5,0.5,this.controlWidth-1,33,6)
      .stroke({color:theme==="dark"?"rgba(255,255,255,0.12)":style.border,width:1}));
  }
}
