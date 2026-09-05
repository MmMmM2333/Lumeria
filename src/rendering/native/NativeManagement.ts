import { t } from "../../native/nativeLocalization.js";
import { Container, Graphics, Rectangle, Text } from "pixi.js";
import type { TextInputHost, TextInput } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import { PIXI_UI_FONT_FAMILY } from "../typography.js";
import { killMotionOf, motion } from "../pixi/animation/motionTween.js";

export type NativeFormField = { label: string; value: string; readOnly?: boolean; browse?:()=>Promise<string|null> };
export class NativeManagement extends Container {
  #panel: Container | null = null;
  #fields: TextInput[] = [];
  #cancel: (() => void) | null = null;
  constructor(readonly host: TextInputHost, readonly size: () => { width: number; height: number }) {
    super({ label: "native-management", eventMode: "passive" });
  }
  get modal(): boolean { return this.#panel !== null; }
  focusNext(reverse=false):void {
    const fields=this.#fields.filter(field=>!field.readOnly);
    if(!fields.length)return;
    const index=fields.findIndex(field=>field.focused);
    fields[(index+(reverse?-1:1)+fields.length)%fields.length]!.focus();
  }
  button(label: string, width: number, action: () => void): Container {
    const button = new Container({ label: `native-action:${label}`, eventMode: "static", cursor: "pointer" });
    const bg = new Graphics().roundRect(0, 0, width, 34, 4).fill({ color: 0xffffff, alpha: 0.08 }).stroke({ color: 0xffffff, alpha: 0.15, width: 1 });
    const text = new Text({ text: label, style: { fontFamily: [...PIXI_UI_FONT_FAMILY], fontSize: 13, fill: 0xffffff } });
    text.anchor.set(0.5); text.position.set(width/2,17); text.eventMode="none";
    button.hitArea = new Rectangle(0,0,width,34);
    button.addChild(bg,text);
    button.on("pointerdown", event=>event.stopPropagation());
    button.on("pointertap", event=>{event.stopPropagation();action();});
    return button;
  }
  close(): void {
    this.host.blur();
    this.#cancel?.(); this.#cancel=null;
    for(const input of this.#fields) input.destroy();
    this.#fields=[];
    if(this.#panel) {killMotionOf(this.#panel);this.#panel.destroy({children:true});this.#panel=null;}
  }
  form(title: string, fields: NativeFormField[], confirm: string, submit: (values: string[]) => void | Promise<void>): void {
    this.close();
    const {width,height}=this.size();
    const overlay=new Container({eventMode:"static",label:"native-form-overlay"});
    const shade=new Graphics().rect(0,0,width,height).fill({color:0,alpha:0.5});
    overlay.addChild(shade); overlay.hitArea=new Rectangle(0,0,width,height);
    overlay.on("pointerdown",event=>event.stopPropagation());
    const panel=new Container({eventMode:"static",label:"native-form-panel"});
    const w=Math.min(540,width-48), h=130+fields.length*70;
    panel.position.set((width-w)/2,Math.max(24,(height-h)/2));
    panel.addChild(new Graphics().roundRect(0,0,w,h,8).fill(0x292929).stroke({color:0xffffff,alpha:0.15,width:1}));
    const heading=new Text({text:title,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:20,fontWeight:"600",fill:0xffffff}});
    heading.position.set(20,20);panel.addChild(heading);
    fields.forEach((field,index)=>{
      const label=new Text({text:field.label,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12,fill:0xcccccc}});
      label.position.set(20,58+index*70);panel.addChild(label);
      const input=this.host.create({width:w-40-(field.browse?86:0),height:34,value:field.value,readOnly:field.readOnly,
        style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,lineHeight:18,padding:8,backgroundColor:0x202020,borderColor:0x555555,focusColor:0x60aaff}});
      input.position.set(20,78+index*70);panel.addChild(input);this.#fields.push(input);
      if(field.browse){const browse=this.button(t("common.actions.browse"),76,()=>{
        void field.browse!().then(value=>{if(value!==null)input.value=value;},reason=>{error.text=String(reason);});
      });browse.position.set(w-96,78+index*70);panel.addChild(browse);}
    });
    const error=new Text({text:"",style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12,fill:0xff8d8d}});
    error.position.set(20,h-42);panel.addChild(error);
    let busy=false;
    const save=this.button(confirm,76,()=>{
      if(busy)return;busy=true;
      Promise.resolve().then(()=>submit(this.#fields.map(input=>input.value))).then(()=>this.close(),reason=>{
        busy=false;error.text=reason instanceof Error?reason.message:String(reason);
      });
    });
    save.position.set(w-96,h-48);
    const cancel=this.button(t("common.actions.cancel"),76,()=>{if(!busy)this.close();});cancel.position.set(w-182,h-48);
    panel.addChild(cancel,save);overlay.addChild(panel);this.addChild(overlay);this.#panel=overlay;
    this.#fields[0]?.focus();
    overlay.alpha=0;motion(overlay).preset("fade").to({alpha:1}).start();
  }
  menu(x:number,y:number,actions:readonly {label:string;run:()=>void}[]):void {
    this.close();
    const {width,height}=this.size();
    const layer=new Container({eventMode:"static",label:"native-context-menu"});
    layer.hitArea=new Rectangle(0,0,width,height);layer.on("pointerdown",event=>{event.stopPropagation();if(event.target===layer)this.close();});
    const panel=new Container();panel.position.set(Math.min(x,width-220),Math.min(y,height-actions.length*36-12));
    panel.addChild(new Graphics().roundRect(0,0,210,actions.length*36+8,8).fill(0x292929).stroke({color:0xffffff,alpha:0.15,width:1}));
    actions.forEach((action,index)=>{const button=this.button(action.label,202,()=>{this.close();action.run();});button.position.set(4,4+index*36);panel.addChild(button);});
    layer.addChild(panel);this.addChild(layer);this.#panel=layer;
  }
  override destroy():void {this.close();super.destroy({children:true});}
}
