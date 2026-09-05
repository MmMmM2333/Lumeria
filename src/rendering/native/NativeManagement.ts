import { t } from "../../native/nativeLocalization.js";
import { Color, Container, Graphics, Rectangle, Text } from "pixi.js";
import type { TextInputHost, TextInput } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { NATIVE_UI_FONT_FAMILY as PIXI_UI_FONT_FAMILY } from "./nativeTypography.js";
import { killMotionOf, motion } from "../pixi/animation/motionTween.js";
import { NativeFluentButton, nativeFluentTheme, type NativeTheme, type NativeButtonAppearance } from "./NativeFluentButton.js";
import { NativeScrollView } from "./NativeScrollView.js";

export type NativeFormField = { label: string; value: string; readOnly?: boolean; browse?:()=>Promise<string|null> };
type ModalFrame = {
  panel:Container;
  fields:TextInput[];
  submit:(()=>void)|null;
  controls:{node:Container;activate?:()=>void}[];
  focusIndex:number;
  menu:boolean;
  scroll:NativeScrollView|null;
};
export class NativeManagement extends Container {
  #panel: Container | null = null;
  #fields: TextInput[] = [];
  #submit: (() => void) | null = null;
  #busy = false;
  #controls: { node: Container; activate?: () => void }[] = [];
  #focusIndex = -1;
  readonly #focusRing = new Graphics({ eventMode: "none" });
  #menu = false;
  #scroll:NativeScrollView|null=null;
  readonly #parents:ModalFrame[]=[];
  #restoreInput:TextInput|null=null;
  constructor(readonly host: TextInputHost, readonly size: () => { width: number; height: number }, readonly invalidate:()=>void, readonly themeSource:NativeTheme|(()=>NativeTheme)="dark") {
    super({ label: "native-management", eventMode: "passive" });
  }
  get theme():NativeTheme{return typeof this.themeSource==="function"?this.themeSource():this.themeSource;}
  get modal(): boolean { return this.#panel !== null; }
  focusNext(reverse=false):void {
    if(!this.#controls.length)return;
    this.#focus((this.#focusIndex+(reverse?-1:1)+this.#controls.length)%this.#controls.length);
  }
  #focus(index:number):void {
    this.#focusIndex=index;
    this.#focusRing.removeFromParent();
    const control=this.#controls[index];
    if(!control)return;
    if(this.#scroll){
      const point=this.#scroll.content.toLocal(control.node.toGlobal({x:0,y:0}));
      this.#scroll.reveal(point.y,34);
    }
    if(!control.activate) {(control.node as TextInput).focus();return;}
    this.host.blur();
    const area=control.node.hitArea as Rectangle;
    this.#focusRing.clear().roundRect(1,1,area.width-2,area.height-2,4).stroke({color:0x60aaff,width:2});
    control.node.addChild(this.#focusRing);
  }
  handleKey(event: {type?:string;key?:string;shiftKey?:boolean;isComposing?:boolean}):boolean {
    if(event.isComposing || this.host.focused?.composing)return false;
    if(event.type!=="down")return true;
    if(event.key==="Escape"){this.close();return true;}
    if(event.key==="Tab"){this.focusNext(event.shiftKey);return true;}
    if(this.#menu && (event.key==="ArrowDown" || event.key==="ArrowUp")){
      this.focusNext(event.key==="ArrowUp");return true;
    }
    const action=this.#controls[this.#focusIndex]?.activate;
    if(action && (event.key==="Enter" || event.key===" ")){action();return true;}
    if(event.key==="Enter" && this.#submit){this.#submit();return true;}
    return !this.host.focused;
  }
  button(label: string, width: number, action: () => void, appearance:NativeButtonAppearance="outline"): NativeFluentButton {
    const button = new NativeFluentButton(label,width,action,this.invalidate,this.theme,appearance);
    button.on("pointerdown", event=>{
      event.stopPropagation();
      const index=this.#controls.findIndex(control=>control.node===button);
      if(index>=0)this.#focus(index);
    });
    return button;
  }
  #modalButton(label:string,width:number,action:()=>void,appearance:NativeButtonAppearance="outline"):Container {
    const button=this.button(label,width,action,appearance);
    this.#controls.push({node:button,activate:action});
    return button;
  }
  #begin():boolean {
    if(this.#busy)return false;
    this.parent?.setChildIndex(this,this.parent.children.length-1);
    if(this.#menu)this.close();
    if(this.#panel){
      this.#focusRing.removeFromParent();
      this.#parents.push({panel:this.#panel,fields:this.#fields,submit:this.#submit,controls:this.#controls,
        focusIndex:this.#focusIndex,menu:this.#menu,scroll:this.#scroll});
      this.#panel.eventMode="none";
      this.host.blur();
      this.#panel=null;this.#fields=[];this.#controls=[];this.#submit=null;this.#focusIndex=-1;this.#scroll=null;
    }else{
      this.#restoreInput=this.host.focused;this.host.blur();
    }
    return true;
  }
  close(force=false): void {
    if(this.#busy && !force)return;
    this.#focusRing.removeFromParent();
    this.#controls=[];this.#focusIndex=-1;this.#menu=false;
    this.host.blur();
    this.#submit=null;
    this.#scroll=null;
    for(const input of this.#fields) input.destroy();
    this.#fields=[];
    if(this.#panel) {killMotionOf(this.#panel);this.#panel.destroy({children:true});this.#panel=null;}
    const parent=this.#parents.pop();
    if(parent){
      this.#panel=parent.panel;this.#fields=parent.fields;this.#controls=parent.controls;this.#submit=parent.submit;
      this.#menu=parent.menu;this.#scroll=parent.scroll;this.#panel.eventMode="static";this.#focus(parent.focusIndex);
    }else{
      if(this.#restoreInput&&!this.#restoreInput.destroyed)this.#restoreInput.focus();
      this.#restoreInput=null;
    }
    this.invalidate();
  }
  form(title: string, fields: NativeFormField[], confirm: string, submit: (values: string[]) => void | Promise<void>, message?:string): void {
    if(!this.#begin())return;
    const {width,height}=this.size();
    const colors=nativeFluentTheme(this.theme);
    const overlay=new Container({eventMode:"static",label:"native-form-overlay"});
    const shade=new Graphics().rect(0,0,width,height).fill({color:0,alpha:0.5});
    overlay.addChild(shade); overlay.hitArea=new Rectangle(0,0,width,height);
    overlay.on("pointerdown",event=>event.stopPropagation());
    const panel=new Container({eventMode:"static",label:"native-form-panel"});
    const w=Math.min(540,width-48);
    const description=message?new Text({text:message,eventMode:"none",style:{
      fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,fill:colors.colorNeutralForeground2,wordWrap:true,wordWrapWidth:w-40,
    }}):null;
    const messageHeight=description?description.height+20:0;
    const h=130+fields.length*70+messageHeight;
    panel.position.set((width-w)/2,Math.max(24,(height-h)/2));
    panel.addChild(new Graphics().roundRect(0,0,w,h,8).fill(colors.colorNeutralBackground2).stroke({color:colors.colorNeutralStroke2,width:1}));
    const heading=new Text({text:title,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:20,fontWeight:"600",fill:colors.colorNeutralForeground1}});
    heading.position.set(20,20);panel.addChild(heading);
    if(description){description.position.set(20,58);panel.addChild(description);}
    fields.forEach((field,index)=>{
      const label=new Text({text:field.label,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12,fill:colors.colorNeutralForeground2}});
      label.position.set(20,58+messageHeight+index*70);panel.addChild(label);
      const input=this.host.create({width:w-40-(field.browse?86:0),height:34,value:field.value,readOnly:field.readOnly,
        style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,lineHeight:18,padding:8,
          backgroundColor:new Color(colors.colorNeutralBackground3).toNumber(),
          borderColor:new Color(colors.colorNeutralStroke1).toNumber(),
          focusColor:new Color(colors.colorBrandStroke1).toNumber(),
          textColor:new Color(colors.colorNeutralForeground1).toNumber()}});
      input.position.set(20,78+messageHeight+index*70);panel.addChild(input);this.#fields.push(input);
      this.#controls.push({node:input});
      input.on("focus",()=>{
        this.#focusIndex=this.#controls.findIndex(control=>control.node===input);
        this.#focusRing.removeFromParent();
      });
      if(field.browse){const browse=this.#modalButton(t("common.actions.browse"),76,()=>{
        void field.browse!().then(value=>{if(value!==null)input.value=value;},reason=>{error.text=String(reason);});
      });browse.position.set(w-96,78+messageHeight+index*70);panel.addChild(browse);}
    });
    const error=new Text({text:"",style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12,fill:colors.colorPaletteRedForeground1}});
    error.position.set(20,h-42);panel.addChild(error);
    const saveAction=()=>{
      if(this.#busy)return;this.#busy=true;
      const values=this.#fields.map(input=>input.value);
      Promise.resolve().then(()=>submit(values)).then(()=>{this.#busy=false;this.close();this.invalidate();},reason=>{
        this.#busy=false;error.text=reason instanceof Error?reason.message:String(reason);this.invalidate();
      });
    };
    this.#submit=saveAction;
    const cancel=this.#modalButton(t("common.actions.cancel"),76,()=>this.close());cancel.position.set(w-182,h-48);
    const save=this.#modalButton(confirm,76,saveAction,"primary");save.position.set(w-96,h-48);
    panel.addChild(cancel,save);overlay.addChild(panel);this.addChild(overlay);this.#panel=overlay;
    this.#focus(0);
    overlay.alpha=0;motion(overlay).preset("fade").to({alpha:1}).start();
  }
  menu(x:number,y:number,actions:readonly {label:string;run:()=>void;selected?:boolean}[],minimumWidth=210):void {
    if(!this.#begin())return;
    const {width,height}=this.size();
    const layer=new Container({eventMode:"static",label:"native-context-menu"});
    layer.hitArea=new Rectangle(0,0,width,height);layer.on("pointerdown",event=>{event.stopPropagation();if(event.target===layer)this.close();});
    const panel=new Container();
    const panelWidth=Math.min(minimumWidth,Math.max(1,width-16));
    const panelHeight=Math.min(actions.length*36+8,Math.max(1,height-16));
    panel.position.set(Math.max(8,Math.min(x,width-panelWidth-8)),Math.max(8,Math.min(y,height-panelHeight-8)));
    const colors=nativeFluentTheme(this.theme);
    panel.addChild(new Graphics().roundRect(0,0,panelWidth,panelHeight,8).fill(colors.colorNeutralBackground1).stroke({color:colors.colorNeutralStroke2,width:1}));
    this.#scroll=new NativeScrollView(this.invalidate,()=>{},this.theme);
    this.#scroll.position.set(4,4);this.#scroll.resize(panelWidth-8,panelHeight-8,actions.length*36);
    panel.addChild(this.#scroll);
    actions.forEach((action,index)=>{
      const button=this.#modalButton(action.label,panelWidth-12,()=>{this.close();action.run();},"subtle");
      button.position.set(0,index*36);this.#scroll!.content.addChild(button);
      if(action.selected)button.addChild(new Graphics({eventMode:"none"}).roundRect(4,8,3,18,1.5).fill(0x4ba3f6));
    });
    layer.addChild(panel);this.addChild(layer);this.#panel=layer;
    this.#menu=true;this.#focus(Math.max(0,actions.findIndex(action=>action.selected)));
  }
  override destroy():void {
    this.#restoreInput=null;
    while(this.#panel)this.close(true);
    this.#focusRing.destroy();super.destroy({children:true});
  }
}
