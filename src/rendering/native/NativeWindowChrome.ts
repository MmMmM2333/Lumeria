import { createNativeText } from "./nativeTypography.js";
import { Container, Graphics, Rectangle, Sprite, type Texture } from "pixi.js";
import type { WindowResizeDirection } from "../../platform/windowChromeContracts.js";
import { t } from "../../native/nativeLocalization.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { NativeCaptionButton } from "./NativeCaptionButton.js";

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
  #logo:Sprite|null=null;
  constructor(readonly app:NativeWindowChromeHost,readonly report:(error:unknown)=>void,readonly icon:()=>Texture){
    super({label:"native-window-chrome",eventMode:"passive"});
  }
  update(showTitlebar:boolean,enabled:boolean):void{
    this.visible=enabled;if(!enabled)return;
    if(this.#logo&&this.#logo.texture!==this.icon()){
      this.#logo.texture=this.icon();this.#logo.width=this.#logo.height=20;this.app.invalidate();
    }
    const {width,height}=this.app.contentSize;
    const key=`${width}/${height}/${showTitlebar}/${this.app.window.isMaximized()}/${t("common.actions.close")}`;
    if(key===this.#key)return;this.#key=key;
    for(const child of this.removeChildren())child.destroy({children:true});
    this.#logo=null;
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
      const logo=new Sprite({texture:this.icon(),eventMode:"none",label:"native-window-brand-icon"});
      logo.position.set(13,12);logo.width=logo.height=20;this.#logo=logo;
      const title=createNativeText({text:"Lumeria",eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:13,fontWeight:"600",fill:0xffffff}});title.position.set(40,13);
      this.addChild(logo,title);
      const maximized=this.app.window.isMaximized();
      for(const [index,name,action] of [
        [0,"minimize",()=>this.app.window.minimize()],
        [1,maximized?"restore":"maximize",()=>maximized?this.app.window.unmaximize():this.app.window.maximize()],
        [2,"close",()=>this.app.window.requestClose()],
      ] as const){
        const button=new NativeCaptionButton(name,()=>run(action),()=>this.app.invalidate());
        button.x=width-126+index*42;this.addChild(button);
      }
    }
    if(!this.app.window.isMaximized())for(const [direction,x,y,w,h,cursor] of [
      ["North",14,0,width-28,8,"ns-resize"],["South",14,height-8,width-28,8,"ns-resize"],
      ["West",0,14,8,height-28,"ew-resize"],["East",width-8,14,8,height-28,"ew-resize"],
      ["NorthWest",0,0,14,14,"nwse-resize"],["NorthEast",width-14,0,14,14,"nesw-resize"],
      ["SouthWest",0,height-14,14,14,"nesw-resize"],["SouthEast",width-14,height-14,14,14,"nwse-resize"],
    ] as const){
      const edge=new Container({label:`native-window-resize:${direction}`,eventMode:"static",cursor});
      edge.hitArea=new Rectangle(x,y,w,h);
      edge.on("pointerdown",event=>{event.stopPropagation();if(event.button===0&&event.isPrimary!==false)run(()=>this.app.startWindowResize(direction));});
      this.addChild(edge);
    }
    this.app.invalidate();
  }
  override destroy():void{
    super.destroy({children:true});this.#logo=null;
  }
}
