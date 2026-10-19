import { createNativeText } from "./nativeTypography.js";
import { Container, Graphics, Rectangle, Text } from "pixi.js";
import type { TextInputHost } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { t } from "../../native/nativeLocalization.js";
import { NativeFluentButton, nativeFluentTheme, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { NativeScrollView } from "./NativeScrollView.js";
import type { NativeSettingsControl } from "./NativeSettingsShell.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { killMotionOf, motion } from "../pixi/animation/motionTween.js";
import { nativePanelShadow } from "./ui/nativePanelShadow.js";

export type NativeModalBody={node:Container;height:number;controls:NativeSettingsControl[];
  fixedHeader?:{node:Container;height:number;controls:NativeSettingsControl[]};maxVisibleHeight?:number;
  dispose?():void;update?():boolean;viewport?(top:number,height:number):void};
export type NativeModalSpec={id:string;title:string;subtitle?:string;width:number;maxHeight?:number;fixedHeight?:number;scrollGutter?:number;dismissible?:boolean;footerStatus?:string;closeLabel?:string;showClose?:boolean;headerIcon?:{name:Parameters<typeof nativeFluentIcon>[0];color:string};
  cancelText?:string;confirmText?:string;busyText?:string;danger?:boolean;outlineConfirm?:boolean;canConfirm?():boolean;confirm?():void|boolean|Promise<void|boolean>;cancel?():void;
  onClose?():void;enterSubmit?:boolean;warningAnimation?:boolean;footerGap?:number;build(width:number):NativeModalBody;};

/** Shared modal chrome and input boundary; application models own the drafts. */
export class NativeModalPanel extends Container{
  readonly panel=new Container({eventMode:"static",label:"native-form-panel"});
  readonly #shade=new Graphics({eventMode:"none"});
  #body:NativeModalBody|null=null;
  #scroll:NativeScrollView|null=null;
  #controls:NativeSettingsControl[]=[];
  #focus=-1;
  #busy=false;
  #closing=false;
  #error="";
  #footer:NativeFluentButton[]=[];
  #confirm:NativeFluentButton|null=null;
  #spinner:Graphics|null=null;
  #confirmCaption="";
  constructor(readonly spec:NativeModalSpec,readonly host:TextInputHost,readonly size:()=>{width:number;height:number},readonly theme:()=>NativeTheme,
    readonly invalidate:()=>void,readonly dismiss:()=>void){
    super({label:"native-form-overlay",eventMode:"static"});this.addChild(this.#shade,this.panel);
    this.on("pointerdown",event=>{event.stopPropagation();if(event.button===0&&event.target===this)this.requestClose();});
    this.on("wheel",event=>{event.stopPropagation();event.preventDefault();});
    this.on("rightclick",event=>event.stopPropagation());
    this.redraw();
    if(spec.warningAnimation){this.alpha=0;this.panel.scale.set(0.96);motion(this).duration(0.14).to({alpha:1}).start();motion(this.panel.scale).duration(0.16).to({x:1,y:1}).start();}
  }
  get busy():boolean{return this.#busy;}
  get closing():boolean{return this.#closing;}
  resumeFocus():void{if(this.#focus>=0)this.#setFocus(this.#focus);}
  requestClose(force=false):void{
    if(this.#closing||(!force&&(this.#busy||this.spec.dismissible===false)))return;
    if(!force&&this.spec.warningAnimation){
      this.#closing=true;this.interactiveChildren=false;
      motion(this.panel.scale).duration(0.16).to({x:0.96,y:0.96}).start();
      motion(this).duration(0.18).to({alpha:0,onComplete:this.dismiss}).start();
    }else this.dismiss();
  }
  refresh():void{
    if(this.destroyed||this.#closing)return;
    if(!this.#body?.update||this.#body.update())this.redraw();
    if(this.#confirm)this.#confirm.disabled=this.#busy||!(this.spec.canConfirm?.()??true);
    this.invalidate();
  }
  redraw():void{
    const focused=this.host.focused,focusLabel=focused?.label,selection=focused?.selection;
    const previousControl=this.#controls[this.#focus],previousFocus=previousControl?.virtualKey??previousControl?.node.label,offset=this.#scroll?.offset??0;
    if(this.#spinner){killMotionOf(this.#spinner);this.#spinner=null;}
    this.#body?.dispose?.();this.#body=null;this.#scroll=null;this.#controls=[];this.#footer=[];this.#confirm=null;this.#focus=-1;
    for(const child of this.panel.removeChildren())child.destroy({children:true});
    const size=this.size(),width=Math.max(120,Math.min(this.spec.width,size.width*0.92)),style=nativeSettingsStyle(this.theme());
    const text=(value:string,fontSize:number,muted=false)=>createNativeText({text:value,eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize,fill:muted?style.muted:style.text,wordWrap:true,wordWrapWidth:width-80,breakWords:true}});
    this.hitArea=new Rectangle(0,0,size.width,size.height);this.#shade.clear().rect(0,0,size.width,size.height).fill({color:0,alpha:0.5});
    const title=text(this.spec.title,this.spec.headerIcon?16:20);title.style.fontWeight="600";title.position.set(this.spec.headerIcon?72:20,20);
    if(this.spec.headerIcon)title.style.wordWrapWidth=width-92;
    const subtitle=this.spec.subtitle?text(this.spec.subtitle,12,true):null;
    if(subtitle)subtitle.position.set(20,20+title.height+5);
    const top=this.spec.title?Math.ceil(20+Math.max(title.height+(subtitle?subtitle.height+5:0),this.spec.showClose===false?0:32)+(this.spec.headerIcon?7:18)):20;
    this.#body=this.spec.build(width-40-(this.spec.scrollGutter??0));
    let contentHeight=Math.ceil(this.#body.height);
    const hasFooter=Boolean(this.spec.cancelText||this.spec.confirmText),footerHeight=hasFooter?52+(this.spec.footerGap??14):20;
    const error=this.#error?text(this.#error,12):null;if(error){error.style.fill="#ffb4a9";error.style.wordWrapWidth=width-40;}
    // Error details belong to the scrollable body so long IO errors cannot displace the footer.
    if(error){error.position.set(0,contentHeight+12);this.#body.node.addChild(error);contentHeight+=Math.ceil(error.height)+24;}
    const header=this.#body.fixedHeader,headerHeight=header?.height??0;
    const height=Math.min(this.spec.fixedHeight??(top+headerHeight+Math.min(contentHeight,this.#body.maxVisibleHeight??Infinity)+footerHeight),this.spec.maxHeight??720,Math.max(100,size.height-48));
    this.panel.pivot.set(width/2,height/2);this.panel.position.set(size.width/2,size.height/2);
    this.panel.addChild(nativePanelShadow(width,height,nativeFluentTheme(this.theme()).shadow64));
    this.panel.addChild(new Graphics({eventMode:"none"}).roundRect(0.5,0.5,width-1,height-1,8).fill(style.panel).stroke({color:this.theme()==="dark"?"rgba(255,255,255,0.12)":style.border,width:1}),title);
    if(this.spec.headerIcon){const {name,color}=this.spec.headerIcon;const mark=new Graphics({eventMode:"none"}).roundRect(20,20,38,38,8).fill({color,alpha:0.14});const icon=nativeFluentIcon(name,color,22);icon.position.set(28,28);this.panel.addChild(mark,icon);}
    if(subtitle)this.panel.addChild(subtitle);
    const register=(button:NativeFluentButton)=>{const control:NativeSettingsControl={node:button,disabled:()=>button.disabled,focus:value=>{button.focused=value;},handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;button.activate();return true;}};this.#controls.push(control);return button;};
    if(this.spec.showClose!==false){const close=register(new NativeFluentButton(this.spec.closeLabel??t("settings.shell.close"),32,()=>this.requestClose(),this.invalidate,this.theme(),"subtle",false,32));
      close.label=`native-modal:${this.spec.id}:close`;close.position.set(width-52,16);close.caption.visible=false;
      const icon=nativeFluentIcon("dismiss-16-regular",style.muted,16);icon.position.set(8,8);close.addChild(icon);this.panel.addChild(close);this.#footer.push(close);}
    if(header){header.node.position.set(20,top);this.panel.addChild(header.node);this.#controls.push(...header.controls);}
    const scroll=new NativeScrollView(this.invalidate,offset=>{this.#body?.viewport?.(offset,bodyHeight);},this.theme());this.#scroll=scroll;scroll.position.set(20,top+headerHeight);
    const bodyHeight=Math.max(1,height-top-headerHeight-footerHeight);
    scroll.content.addChild(this.#body.node);scroll.resize(width-40,bodyHeight,contentHeight);scroll.scrollTo(offset);this.#body.viewport?.(scroll.offset,bodyHeight);this.panel.addChild(scroll);
    this.#controls.push(...this.#body.controls);
    if(this.spec.footerStatus){const status=text(this.spec.footerStatus,12,true);status.position.set(20,height-43);this.panel.addChild(status);}
    let right=width-20;
    const footer=(label:string,action:()=>void,primary:boolean)=>{
      const measure=text(label,13),busyMeasure=primary&&this.spec.busyText?text(this.spec.busyText,13):null,buttonWidth=Math.max(96,measure.width+24,busyMeasure?busyMeasure.width+54:0);measure.destroy();busyMeasure?.destroy();
      const button=register(new NativeFluentButton(label,buttonWidth,action,this.invalidate,this.theme(),primary&&!this.spec.outlineConfirm?"primary":"outline",primary&&Boolean(this.spec.danger),32));
      right-=buttonWidth;button.position.set(right,height-52);right-=8;this.panel.addChild(button);this.#footer.push(button);return button;
    };
    if(this.spec.confirmText){this.#confirm=footer(this.spec.confirmText,()=>{void this.submit();},true);this.#confirm.label=`native-modal:${this.spec.id}:confirm`;this.#confirm.disabled=!(this.spec.canConfirm?.()??true);}
    if(this.spec.cancelText){const cancel=footer(this.spec.cancelText,()=>{if(this.spec.cancel)this.spec.cancel();else this.requestClose();},false);cancel.label=`native-modal:${this.spec.id}:cancel`;
      // Keyboard order follows the visual left-to-right footer order.
      if(this.#confirm){const last=this.#controls.pop()!;this.#controls.splice(this.#controls.length-1,0,last);}}
    this.#controls.forEach((control,index)=>{
      if(control.virtualKey&&"onControlFocus" in control.node){(control.node as import("./ui/NativeVirtualList.js").NativeVirtualList).onControlFocus(key=>{this.#focus=this.#controls.findIndex(entry=>entry.virtualKey===key);});return;}
      control.node.on("pointerdown",()=>{this.#focus=index;});control.node.on("focus",()=>{this.#focus=index;});});
    const restore=this.#controls.findIndex(control=>(control.virtualKey??control.node.label)===(focusLabel??previousFocus)&&!control.disabled());
    if(restore>=0){this.#setFocus(restore);if(selection)this.#controls[restore]?.restoreSelection?.(selection);}
    this.setBusy(this.#busy);this.invalidate();
  }
  setBusy(value:boolean):void{
    this.#busy=value;for(const b of this.#footer){b.busy=value;b.disabled=value||(b===this.#confirm&&!(this.spec.canConfirm?.()??true));}
    if(this.#confirm&&this.spec.busyText){
      if(value&&!this.#spinner){
        const b=this.#confirm;this.#confirmCaption=b.caption.text;b.caption.text=this.spec.busyText;b.caption.x=b.controlWidth/2+10;
        const spinner=new Graphics({eventMode:"none",label:"native-modal:busy-spinner"}).arc(0,0,6,0,Math.PI*1.5).stroke({color:b.caption.style.fill as string,width:1.8});
        spinner.position.set(18,b.controlHeight/2);b.addChild(spinner);this.#spinner=spinner;
        motion(spinner).duration(.8).ease("none").to({rotation:Math.PI*2,repeat:-1,onUpdate:this.invalidate}).start();
      }else if(!value&&this.#spinner){killMotionOf(this.#spinner);this.#spinner.destroy();this.#spinner=null;this.#confirm.caption.text=this.#confirmCaption;this.#confirm.caption.x=this.#confirm.controlWidth/2;}
    }
    if(this.#body){this.#body.node.interactiveChildren=!value;if(this.#body.fixedHeader)this.#body.fixedHeader.node.interactiveChildren=!value;}this.invalidate();
  }
  async submit():Promise<void>{
    if(this.#busy||this.#closing||!this.spec.confirm||!(this.spec.canConfirm?.()??true))return;
    this.setBusy(true);this.#error="";
    try{const close=await this.spec.confirm();if(!this.destroyed){this.setBusy(false);if(close===false)this.redraw();else this.requestClose(true);}}
    catch(error){if(!this.destroyed){this.#error=error instanceof Error?error.message:String(error);this.setBusy(false);this.redraw();}}
  }
  #setFocus(index:number):void{
    if(this.#focus>=0)this.#controls[this.#focus]?.focus(false);this.#focus=index;
    const control=this.#controls[index];if(!control)return;
    this.host.blur();control.focus(true);
    if(this.#body?.controls.includes(control)&&this.#scroll){const rect=control.revealRect?.();const point=this.#scroll.content.toLocal(control.node.toGlobal({x:0,y:0}));this.#scroll.reveal(rect?.top??point.y,rect?.height??control.node.height);}
    this.invalidate();
  }
  handleKey(event:{type?:string;key?:string;shiftKey?:boolean;isComposing?:boolean}):boolean{
    if(this.#busy||this.#closing)return true;
    if(event.isComposing||this.host.focused?.composing)return false;
    if(event.type!=="down")return false;
    if(event.key==="Escape"){if(!this.#controls[this.#focus]?.handleKey("Escape"))this.requestClose();return true;}
    if(event.key==="Tab"){
      let index=this.#focus<0?(event.shiftKey?0:-1):this.#focus;
      for(let n=0;n<this.#controls.length;n++){index=(index+(event.shiftKey?-1:1)+this.#controls.length)%this.#controls.length;if(!this.#controls[index]!.disabled()){this.#setFocus(index);break;}}return true;
    }
    if(event.key&&this.#controls[this.#focus]?.handleKey(event.key))return true;
    if(event.key==="Enter"&&this.spec.enterSubmit){void this.submit();return true;}
    return !this.host.focused;
  }
  override destroy():void{if(this.#spinner)killMotionOf(this.#spinner);killMotionOf(this);killMotionOf(this.panel.scale);this.#body?.dispose?.();this.#body=null;super.destroy({children:true});}
}
