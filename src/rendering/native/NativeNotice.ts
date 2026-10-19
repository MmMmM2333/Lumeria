import { createNativeParagraph } from "./nativeParagraph.js";
import { Container, Graphics, Rectangle } from "pixi.js";
import type { LaunchpadTransientNotice } from "../../application/launchpadNotices.js";
import { NativeFluentButton } from "./NativeFluentButton.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { t } from "../../native/nativeLocalization.js";
import { nativePanelShadow } from "./ui/nativePanelShadow.js";

/** The original single, replaceable notification card, independent of modal focus. */
export class NativeNotice extends Container{
  #notice:LaunchpadTransientNotice|null=null;
  #close:(()=>void)|null=null;
  #buttons:NativeFluentButton[]=[];
  #focus=-1;
  constructor(readonly size:()=>{width:number;height:number},readonly invalidate:()=>void){
    super({eventMode:"static",label:"native-notice"});this.visible=false;
    for(const type of ["pointerdown","pointertap","rightclick","wheel"] as const)this.on(type,event=>event.stopPropagation());
  }
  show(notice:LaunchpadTransientNotice|null,close:()=>void):void{this.#notice=notice;this.#close=close;this.redraw();}
  get hasFocus():boolean{return this.visible&&this.#focus>=0;}
  focusEdge(reverse=false):boolean{if(!this.visible||!this.#buttons.length)return false;this.#setFocus(reverse?this.#buttons.length-1:0);return true;}
  #setFocus(index:number):void{this.#focus=index;this.#buttons.forEach((button,i)=>{button.focused=i===index;});}
  handleKey(key:string,reverse=false):boolean{
    if(!this.hasFocus)return false;
    if(key==="Tab"){const next=this.#focus+(reverse?-1:1);this.#setFocus(next>=0&&next<this.#buttons.length?next:-1);return this.hasFocus;}
    if(key==="Enter"||key===" "){this.#buttons[this.#focus]?.activate();return true;}
    if(key==="Escape"){this.#close?.();return true;}
    return false;
  }
  redraw():void{
    const focusLabel=this.#buttons[this.#focus]?.label;this.#buttons=[];this.#focus=-1;
    for(const child of this.removeChildren())child.destroy({children:true});
    const notice=this.#notice;this.visible=Boolean(notice);if(!notice){this.invalidate();return;}
    const size=this.size(),width=Math.max(160,Math.min(430,size.width-40)),copyWidth=width-106;
    const colors={error:["rgba(96,35,31,0.96)","rgba(255,180,169,0.32)","rgba(255,218,212,0.92)","error-circle-20-regular"],warning:["rgba(93,64,24,0.96)","rgba(242,178,74,0.32)","rgba(255,221,169,0.92)","warning-20-regular"],success:["rgba(33,85,52,0.96)","rgba(117,194,138,0.32)","rgba(194,235,205,0.92)","checkmark-circle-20-regular"],info:["rgba(24,48,74,0.96)","rgba(75,163,246,0.3)","rgba(179,220,255,0.92)","info-20-regular"]} as const;
    const [fill,border,iconColor,iconName]=colors[notice.intent];let y=14;
    const copy=(value:string,size:number,color:string,bold=false)=>{const label=createNativeParagraph(value,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:size,fontWeight:bold?"700":"400",fill:color,wordWrap:true,wordWrapWidth:copyWidth,breakWords:true,lineHeight:size*(bold?1.25:1.45)},copyWidth);label.position.set(50,y);this.addChild(label);y+=label.height+5;};
    copy(notice.title,14,"rgba(255,255,255,0.94)",true);copy(notice.message,12,"rgba(255,255,255,0.72)");if(notice.detail)copy(notice.detail,11,"rgba(255,255,255,0.48)");
    if(notice.actionText){const action=new NativeFluentButton(notice.actionText,Math.max(80,Math.min(width-64,notice.actionText.length*9+24)),()=>notice.onAction?.(),this.invalidate,"dark","outline",false,28);action.label="native-notice:action";action.position.set(width-14-action.controlWidth,y+7);this.addChild(action);this.#buttons.push(action);y+=47;}
    const height=Math.max(60,y+9);this.hitArea=new Rectangle(0,0,width,height);this.position.set(Math.max(8,size.width-width-20),Math.max(8,size.height-height-20));
    this.addChildAt(nativePanelShadow(width,height,"0 12px 32px rgba(0, 0, 0, 0.28)"),0);
    this.addChildAt(new Graphics({eventMode:"none"}).roundRect(0.5,0.5,width-1,height-1,8).fill(fill).stroke({color:border,width:1}),1);
    const icon=nativeFluentIcon(iconName,iconColor,18);icon.position.set(19,15);this.addChild(icon);
    const close=new NativeFluentButton(t("dialogs.notices.dismiss"),32,()=>this.#close?.(),this.invalidate,"dark","subtle",false,32);close.label="native-notice:close";close.caption.visible=false;close.position.set(width-46,14);
    const dismiss=nativeFluentIcon("dismiss-16-regular","rgba(255,255,255,0.74)",16);dismiss.position.set(8,8);close.addChild(dismiss);this.addChild(close);this.#buttons.push(close);
    this.#setFocus(this.#buttons.findIndex(button=>button.label===focusLabel));this.invalidate();
  }
}
