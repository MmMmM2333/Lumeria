import { createNativeParagraph } from "./nativeParagraph.js";
import { createNativeText } from "./nativeTypography.js";
import { t } from "../../native/nativeLocalization.js";
import { Container, Graphics, Rectangle, Text } from "pixi.js";
import type { TextInputHost, TextInput } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { NATIVE_UI_FONT_FAMILY as PIXI_UI_FONT_FAMILY } from "./nativeTypography.js";
import { killMotionOf, motion } from "../pixi/animation/motionTween.js";
import { NativeFluentButton, nativeFluentTheme, type NativeTheme, type NativeButtonAppearance } from "./NativeFluentButton.js";
import { NativeScrollView } from "./NativeScrollView.js";
import { NativeModalPanel, type NativeModalSpec } from "./NativeModalPanel.js";
import type { LaunchpadWarningDialog } from "../../application/launchpadNotices.js";
import { nativeSettingsStyle } from "./NativeFluentButton.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { createNativeSettingsInput } from "./nativeSettingsInput.js";
import type { NativeSettingsControl } from "./NativeSettingsShell.js";
import { clampIconContextMenuPosition } from "../../components/iconContextMenuGeometry.js";
import { nativePanelShadow } from "./ui/nativePanelShadow.js";

export type NativeFormField = { label: string; value: string; readOnly?: boolean; browse?:()=>Promise<string|null> };
export type NativeMenuAction={label:string;run:()=>void;selected?:boolean;disabled?:boolean;danger?:boolean;separatorBefore?:boolean;icon?:Parameters<typeof nativeFluentIcon>[0]};
type ModalFrame = {
  panel:Container;
  controls:{node:Container;activate?:()=>void}[];
  focusIndex:number;
  menu:boolean;
  scroll:NativeScrollView|null;
  custom:NativeModalPanel|null;
};
export class NativeManagement extends Container {
  #panel: Container | null = null;
  #controls: { node: Container; activate?: () => void }[] = [];
  #focusIndex = -1;
  readonly #focusRing = new Graphics({ eventMode: "none", label: "native-management:keyboard-focus" });
  #menu = false;
  #scroll:NativeScrollView|null=null;
  readonly #parents:ModalFrame[]=[];
  #restoreInput:TextInput|null=null;
  #menuRestore:(()=>void)|null=null;
  #selectionMenu=false;
  #custom:NativeModalPanel|null=null;
  captureReturnFocus:(()=>()=>void)|null=null;
  #returnFocus:(()=>void)|null=null;
  constructor(readonly host: TextInputHost, readonly size: () => { width: number; height: number }, readonly invalidate:()=>void, readonly themeSource:NativeTheme|(()=>NativeTheme)="dark") {
    super({ label: "native-management", eventMode: "passive" });
  }
  get theme():NativeTheme{return typeof this.themeSource==="function"?this.themeSource():this.themeSource;}
  get modal(): boolean { return this.#panel !== null; }
  get activeId():string|null{return this.#custom?.spec.id??null;}
  hasDialog(id:string):boolean{return this.activeId===id||this.#parents.some(frame=>frame.custom?.spec.id===id);}
  refresh():void{this.#custom?.refresh();}
  resize():void{if(this.#menu)this.close();for(const parent of this.#parents)parent.custom?.redraw();this.#custom?.redraw();}
  focusNext(reverse=false):void {
    if(!this.#controls.length)return;
    let index=this.#focusIndex;
    for(let count=0;count<this.#controls.length;count++){index=(index+(reverse?-1:1)+this.#controls.length)%this.#controls.length;if(!(this.#controls[index]!.node as NativeFluentButton).disabled){this.#focus(index);break;}}
  }
  #focus(index:number,visible=true):void {
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
    if(!visible)return;
    const area=control.node.hitArea as Rectangle;
    this.#focusRing.clear().roundRect(1,1,area.width-2,area.height-2,4).stroke({color:0x60aaff,width:2});
    control.node.addChild(this.#focusRing);
  }
  handleKey(event: {type?:string;key?:string;shiftKey?:boolean;isComposing?:boolean}):boolean {
    if(this.#custom)return this.#custom.handleKey(event);
    if(event.isComposing || this.host.focused?.composing)return false;
    if(event.type!=="down")return true;
    if(event.key==="Escape"){this.close();return true;}
    if(event.key==="Tab"){this.focusNext(event.shiftKey);return true;}
    if(this.#menu && (event.key==="ArrowDown" || event.key==="ArrowUp")){
      this.focusNext(event.key==="ArrowUp");return true;
    }
    if(this.#menu&&(event.key==="Home"||event.key==="End")){this.#focusIndex=event.key==="Home"?-1:0;this.focusNext(event.key==="End");return true;}
    const action=this.#controls[this.#focusIndex]?.activate;
    if(action && (event.key==="Enter" || event.key===" ")){action();return true;}
    return !this.host.focused;
  }
  button(label: string, width: number, action: () => void, appearance:NativeButtonAppearance="outline"): NativeFluentButton {
    const button = new NativeFluentButton(label,width,action,this.invalidate,this.theme,appearance);
    button.on("pointerdown", event=>{
      event.stopPropagation();
      const index=this.#controls.findIndex(control=>control.node===button);
      if(index>=0)this.#focus(index,!this.#selectionMenu);
    });
    return button;
  }
  #begin():boolean {
    if(this.#custom?.busy)return false;
    this.parent?.setChildIndex(this,this.parent.children.length-1);
    if(this.#menu)this.close();
    if(this.#panel){
      this.#focusRing.removeFromParent();
      this.#parents.push({panel:this.#panel,controls:this.#controls,
        focusIndex:this.#focusIndex,menu:this.#menu,scroll:this.#scroll,custom:this.#custom});
      this.#panel.eventMode="none";
      this.host.blur();
      this.#panel=null;this.#controls=[];this.#focusIndex=-1;this.#scroll=null;this.#custom=null;
    }else{
      this.#returnFocus=this.captureReturnFocus?.()??null;
      this.#restoreInput=this.host.focused;this.host.blur();
    }
    return true;
  }
  close(force=false): void {
    if(this.#custom&&!force){this.#custom.requestClose();return;}
    this.#focusRing.removeFromParent();
    const restoreMenu=this.#menuRestore;this.#menuRestore=null;this.#selectionMenu=false;
    this.#controls=[];this.#focusIndex=-1;this.#menu=false;
    this.host.blur();
    this.#scroll=null;
    const onClose=this.#custom?.spec.onClose;this.#custom=null;
    if(this.#panel) {killMotionOf(this.#panel);this.#panel.destroy({children:true});this.#panel=null;}
    const parent=this.#parents.pop();
    if(parent){
      this.#panel=parent.panel;this.#controls=parent.controls;
      this.#menu=parent.menu;this.#scroll=parent.scroll;this.#custom=parent.custom;this.#panel.eventMode="static";if(this.#custom){this.#custom.refresh();this.#custom.resumeFocus();}else this.#focus(parent.focusIndex);
    }else{
      if(this.#restoreInput&&!this.#restoreInput.destroyed)this.#restoreInput.focus();
      this.#restoreInput=null;
      this.#returnFocus?.();this.#returnFocus=null;
    }
    this.invalidate();
    restoreMenu?.();
    onClose?.();
  }
  dialog(spec:NativeModalSpec):void{
    if(!this.#begin())return;
    const modal=new NativeModalPanel(spec,this.host,this.size,()=>this.theme,this.invalidate,()=>{if(this.#custom===modal)this.close(true);});
    this.#custom=modal;this.#panel=modal;this.addChild(modal);this.invalidate();
  }
  warning(config:LaunchpadWarningDialog & {onConfirm?:()=>void|Promise<void>;onCancel?:()=>void}):void{
    const intent=config.intent??"warning",style=nativeSettingsStyle(this.theme);
    const color={error:"#ffb4a9",warning:"#f2b24a",success:"#8fd9a8",info:"#4ba3f6"}[intent];
    this.dialog({id:"warning",title:config.title,width:420,showClose:false,warningAnimation:true,
      headerIcon:{name:intent==="error"?"error-circle-20-regular":intent==="success"?"checkmark-circle-20-regular":intent==="info"?"info-20-regular":"warning-20-regular",color},
      ...(config.cancelText?{cancelText:config.cancelText}:{}),...(config.confirmText?{confirmText:config.confirmText}:{}),
        danger:config.confirmTone==="danger",outlineConfirm:config.confirmAppearance==="outline",confirm:async()=>{await config.onConfirm?.();},
        ...(config.onCancel?{cancel:()=>{this.close();config.onCancel?.();}}:{}),
      build:width=>{const node=new Container();
        const message=createNativeParagraph(config.message,{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,lineHeight:18.85,fill:style.muted,wordWrap:true,wordWrapWidth:width-52,breakWords:true},width-52);message.x=52;node.addChild(message);
        let height=message.height;
        if(config.suggestion){const hint=createNativeParagraph(t("dialogs.warning.suggestion",{suggestion:config.suggestion}),{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12,fill:style.muted,wordWrap:true,wordWrapWidth:width-52,breakWords:true},width-52);hint.position.set(52,height+10);node.addChild(hint);height+=hint.height+10;}
        return {node,height,controls:[]};}});
  }
  form(title:string,fields:NativeFormField[],confirm:string,submit:(values:string[])=>void|Promise<void>,message?:string):void{
    const values=fields.map(field=>field.value);
    this.dialog({id:"form",title,width:540,subtitle:message??"",cancelText:t("common.actions.cancel"),confirmText:confirm,enterSubmit:true,
      confirm:()=>submit(values),build:width=>{
        const node=new Container(),controls:NativeSettingsControl[]=[];
        const style=nativeSettingsStyle(this.theme);let y=0;
        fields.forEach((field,index)=>{
          const label=createNativeText({text:field.label,eventMode:"none",style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12,fill:style.muted}});
          label.y=y;node.addChild(label);y+=20;
          const input=createNativeSettingsInput(this.host,{width:width-(field.browse?86:0),height:34,value:values[index]!,readOnly:field.readOnly??false,theme:this.theme,invalidate:this.invalidate});
          input.label=`native-form:field-${index}`;input.y=y;node.addChild(input);
          input.on("input",()=>{values[index]=input.value;});
          controls.push({node:input,disabled:()=>input.disabled,focus:value=>{if(value)input.focus();else input.blur();},handleKey:()=>false,restoreFocus:true,selection:()=>input.selection,restoreSelection:value=>input.setSelectionRange(value.anchor,value.focus)});
          if(field.browse){
            const browse=new NativeFluentButton(t("common.actions.browse"),76,()=>{
              browse.disabled=true;void field.browse!().then(value=>{if(!input.destroyed&&value!==null){values[index]=value;input.value=value;}},error=>{if(!node.destroyed)this.warning({title:t("errors.launch.genericTitle"),message:String(error),intent:"error",confirmText:t("common.actions.close")});}).finally(()=>{if(!browse.destroyed)browse.disabled=false;});
            },this.invalidate,this.theme);browse.position.set(width-76,y);node.addChild(browse);
            controls.push({node:browse,disabled:()=>browse.disabled,focus:value=>{browse.focused=value;},handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;browse.activate();return true;}});
          }
          y+=50;
        });
        return {node,height:y,controls,update:()=>false};
      }});
  }
  menu(x:number,y:number,actions:readonly NativeMenuAction[],minimumWidth=204,selection?:{restore():void}):void {
    if(!this.#begin())return;
    const {width,height}=this.size();
    const layer=new Container({eventMode:"static",label:"native-context-menu"});
    layer.hitArea=new Rectangle(0,0,width,height);layer.on("pointerdown",event=>{event.stopPropagation();if(event.button===0&&event.target===layer)this.close();});
    layer.on("wheelcapture",()=>this.close());
    layer.on("rightclick",event=>{if(event.target===layer){this.close();this.emit("context-request",event.global.x,event.global.y);}event.stopPropagation();});
    const panel=new Container();
    this.#selectionMenu=Boolean(selection);this.#menuRestore=selection?.restore??null;
    const hasIcons=actions.some(action=>Boolean(action.icon));
    const measured=actions.map(action=>{const label=createNativeText({text:action.label,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:14}});const w=label.width+(hasIcons?60:40);label.destroy();return w;});
      const panelWidth=Math.min(selection?Math.max(176,minimumWidth):Math.max(minimumWidth,Math.min(360,...[Math.max(...measured)])),Math.max(1,width-16));
    const stride=selection?38:36;
    const contentHeight=actions.length*stride+actions.filter(action=>action.separatorBefore).length*9;
    const panelHeight=Math.min(contentHeight+8,Math.max(1,height-16));
    const position=clampIconContextMenuPosition({anchorX:x,anchorY:y,menuWidth:panelWidth,menuHeight:panelHeight,viewportWidth:width,viewportHeight:height});panel.position.set(position.x,position.y);
    const colors=nativeFluentTheme(this.theme);
    panel.addChild(new Graphics().roundRect(0,0,panelWidth,panelHeight,8).fill(colors.colorNeutralBackground1).stroke({color:colors.colorNeutralStroke2,width:1}));
    this.#scroll=new NativeScrollView(this.invalidate,()=>{},this.theme);
    {
      panel.addChildAt(nativePanelShadow(panelWidth,panelHeight,selection?colors.shadow16:"0 18px 42px rgba(0, 0, 0, 0.32)"),0);
    }
    this.#scroll.position.set(4,4);this.#scroll.resize(panelWidth-8,panelHeight-8,contentHeight);
    panel.addChild(this.#scroll);
    let rowY=0;
    actions.forEach(action=>{
      if(action.separatorBefore){this.#scroll!.content.addChild(new Graphics({eventMode:"none"}).rect(8,rowY+4,panelWidth-24,1).fill({color:colors.colorNeutralStroke2,alpha:0.56}));rowY+=9;}
      const button=new NativeFluentButton(action.label,panelWidth-10,()=>{this.close();action.run();},this.invalidate,this.theme,"subtle",Boolean(action.danger));
      button.on("pointerdown",()=>{const index=this.#controls.findIndex(control=>control.node===button);if(index>=0)this.#focus(index,false);});
      this.#controls.push({node:button,activate:()=>button.activate()});button.disabled=Boolean(action.disabled);
      button.position.set(0,rowY);rowY+=stride;this.#scroll!.content.addChild(button);
      button.caption.anchor.x=0;button.caption.x=hasIcons?38:selection?19:12;button.caption.style.fontSize=14;
      if(button.caption.width>panelWidth-button.caption.x-18){let label=action.label;while(label.length&&button.caption.width>panelWidth-button.caption.x-18){label=label.slice(0,-1);button.caption.text=label+"…";}}
      if(action.icon){const icon=nativeFluentIcon(action.icon,action.danger?(this.theme==="dark"?"#ffb4a9":colors.colorPaletteRedForeground1):colors.colorNeutralForeground1,18);icon.position.set(10,8);icon.alpha=action.disabled?0.38:1;button.addChild(icon);}
      if(action.selected){
        if(selection)button.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,panelWidth-10,36,4).fill(colors.colorNeutralBackground1Selected),0);
        button.addChild(new Graphics({eventMode:"none",label:"native-menu:selected-indicator"}).roundRect(selection?8:4,selection?10:8,3,selection?16:18,1.5).fill(0x4ba3f6));
      }
    });
    layer.addChild(panel);this.addChild(layer);this.#panel=layer;
    // Opening a pointer menu keeps its keyboard anchor without painting keyboard focus.
    this.#menu=true;const first=actions.findIndex(action=>action.selected&&!action.disabled);const focus=first>=0?first:actions.findIndex(action=>!action.disabled);if(focus>=0)this.#focus(focus,false);
    if(selection){layer.alpha=0;layer.y=-3;motion(layer).duration(0.1).ease("power2.out").to({alpha:1,y:0}).start();}
  }
  override destroy():void {
    this.#restoreInput=null;
    while(this.#panel)this.close(true);
    this.#focusRing.destroy();super.destroy({children:true});
  }
}
