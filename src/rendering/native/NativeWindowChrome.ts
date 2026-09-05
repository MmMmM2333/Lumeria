import { Container, FillGradient, Graphics, Rectangle, Text } from "pixi.js";
import type { WindowResizeDirection } from "../../platform/windowChromeContracts.js";
import { t } from "../../native/nativeLocalization.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { NativeFluentButton } from "./NativeFluentButton.js";

export type NativeWindowChromeHost = {
  readonly contentSize:{width:number;height:number};
  window:{
    isMaximized():boolean;
    minimize():void;
    maximize():void;
    unmaximize():void;
    requestClose():void;
  };
  startWindowDrag():void;
  startWindowResize(direction:WindowResizeDirection):void;
  invalidate():void;
};

/** Mirrors WindowChromeOverlay: custom titlebar or drag strip and eight resize edges. */
export class NativeWindowChrome extends Container {
  #key="";
  #logoGradient:FillGradient|null=null;
  constructor(readonly app:NativeWindowChromeHost,readonly report:(error:unknown)=>void){
    super({label:"native-window-chrome",eventMode:"passive"});
  }
  update(showTitlebar:boolean,enabled:boolean):void{
    this.visible=enabled;if(!enabled)return;
    const {width,height}=this.app.contentSize;
    const key=`${width}/${height}/${showTitlebar}/${this.app.window.isMaximized()}/${t("common.actions.close")}`;
    if(key===this.#key)return;this.#key=key;
    for(const child of this.removeChildren())child.destroy({children:true});
    this.#logoGradient?.destroy();this.#logoGradient=null;
    const run=(action:()=>void)=>{try{action();}catch(error){this.report(error);}};
    const drag=new Container({eventMode:"static",cursor:"grab",label:"native-window-drag"});
    drag.hitArea=new Rectangle(showTitlebar?0:14,0,Math.max(1,width-(showTitlebar?126:28)),showTitlebar?44:24);
    drag.on("pointerdown",event=>{event.stopPropagation();if(event.button!==0||event.isPrimary===false)return;
      run(()=>{if(event.detail>1){this.app.window.isMaximized()?this.app.window.unmaximize():this.app.window.maximize();}
        else this.app.startWindowDrag();});});
    this.addChild(drag);
    if(showTitlebar){
      const background=new Graphics({eventMode:"none"}).rect(0,0,width,44).fill({color:0x141820,alpha:0.42})
        .moveTo(0,43.5).lineTo(width,43.5).stroke({color:0xffffff,alpha:0.14,width:1});
      this.addChildAt(background,0);
      this.#logoGradient=new FillGradient({start:{x:0,y:0},end:{x:1,y:1},colorStops:[{offset:0,color:0x8b5cf6},{offset:1,color:0xef5da8}]});
      const logo=new Graphics({eventMode:"none"}).roundRect(14,13,18,18,5).fill(this.#logoGradient);
      const brand=new Text({text:"L",eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:11,fontWeight:"700",fill:0xffffff}});
      brand.anchor.set(0.5);brand.position.set(23,22);
      const title=new Text({text:"Lumeria",eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:13,fontWeight:"600",fill:0xffffff}});title.position.set(40,13);
      this.addChild(logo,brand,title);
      const maximized=this.app.window.isMaximized();
      for(const [index,name,action] of [
        [0,"minimize",()=>this.app.window.minimize()],
        [1,maximized?"restore":"maximize",()=>maximized?this.app.window.unmaximize():this.app.window.maximize()],
        [2,"close",()=>this.app.window.requestClose()],
      ] as const){
        const button=new NativeFluentButton(t(name==="close"?"common.actions.close":`window.chrome.${name}`),42,()=>run(action),()=>this.app.invalidate(),"dark","subtle",name==="close",44);
        button.label=`native-window-chrome:${name}`;button.x=width-126+index*42;button.caption.visible=false;
        const icon=new Graphics({eventMode:"none"});
        if(name==="minimize")icon.moveTo(15,22).lineTo(27,22).stroke({color:0xffffff,width:1});
        else if(name==="close")icon.moveTo(16,17).lineTo(26,27).moveTo(26,17).lineTo(16,27).stroke({color:0xffffff,width:1});
        else {if(maximized)icon.rect(18,16,9,9).stroke({color:0xffffff,width:1});icon.rect(15,19,9,9).fill(0x20242b).stroke({color:0xffffff,width:1});}
        button.addChild(icon);this.addChild(button);
      }
    }
    if(!this.app.window.isMaximized())for(const [direction,x,y,w,h,cursor] of [
      ["North",8,0,width-16,5,"ns-resize"],["South",8,height-5,width-16,5,"ns-resize"],
      ["West",0,8,5,height-16,"ew-resize"],["East",width-5,8,5,height-16,"ew-resize"],
      ["NorthWest",0,0,8,8,"nwse-resize"],["NorthEast",width-8,0,8,8,"nesw-resize"],
      ["SouthWest",0,height-8,8,8,"nesw-resize"],["SouthEast",width-8,height-8,8,8,"nwse-resize"],
    ] as const){
      const edge=new Container({label:`native-window-resize:${direction}`,eventMode:"static",cursor});
      edge.hitArea=new Rectangle(x,y,w,h);
      edge.on("pointerdown",event=>{event.stopPropagation();if(event.button===0&&event.isPrimary!==false)run(()=>this.app.startWindowResize(direction));});
      this.addChild(edge);
    }
  }
  override destroy():void{
    super.destroy({children:true});this.#logoGradient?.destroy();this.#logoGradient=null;
  }
}
