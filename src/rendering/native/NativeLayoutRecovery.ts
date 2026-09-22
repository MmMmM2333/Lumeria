import {Container,Graphics,Rectangle} from "pixi.js";
import {NativeFluentButton} from "./NativeFluentButton.js";
import {createNativeParagraph} from "./nativeParagraph.js";
import {NATIVE_UI_FONT_FAMILY} from "./nativeTypography.js";
import type {TextInputHost,TextInput} from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import {nativeFluentIcon} from "./nativeFluentIcons.js";
import {t} from "../../native/nativeLocalization.js";

/** Startup-only surface; no editable application state exists behind it. */
export class NativeLayoutRecovery extends Container {
  #buttons:NativeFluentButton[]=[];
  #focus=0;

  #confirm=false;
  #busy=false;
  #operationError="";
  #detailInput:TextInput|null=null;
  constructor(readonly size:()=>{width:number;height:number},readonly invalidate:()=>void,readonly error:string,
    readonly actions:{retry():void;close():void;reveal?:()=>Promise<void>;reset?:()=>Promise<void>;copy?:()=>Promise<void>},readonly inputHost:TextInputHost){
    super({label:"native-layout-recovery",eventMode:"static"});this.redraw();
  }
  redraw():void{
    for(const child of this.removeChildren())child.destroy({children:true});this.#buttons=[];this.#detailInput=null;
    const {width,height}=this.size();this.hitArea=new Rectangle(0,0,width,height);
    this.addChild(new Graphics({eventMode:"none",label:"native-layout-recovery-background"}).rect(0,0,width,height).fill(0x15171c));
    this.inputHost.blur();
    const panel=new Container(),w=Math.max(520,Math.min(660,width-48)),inner=w-48;let y=24;
    const paragraph=(text:string,size=14,color=0xd4d8df)=>{
      const node=createNativeParagraph(text,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:size,fill:color,wordWrap:true,wordWrapWidth:inner,breakWords:true},inner);
      node.position.set(24,y);panel.addChild(node);y+=node.height+16;
    };
    const warning=nativeFluentIcon("warning-20-regular",0xf2b24a,24);warning.position.set(24,y+2);panel.addChild(warning);
    const title=createNativeParagraph(t(this.#confirm?"recovery.resetTitle":"recovery.title"),{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:22,fontWeight:"600",fill:0xffffff},inner-36);
    title.position.set(60,y);panel.addChild(title);y+=title.height+16;
    paragraph(t(this.#confirm?"recovery.resetMessage":"recovery.message"));
    if(this.#operationError)paragraph(this.#operationError,12,0xffb4a9);
    const button=(id:string,label:string,x:number,top:number,bw:number,run:()=>void,appearance:"primary"|"outline"|"subtle"="outline")=>{
      const b=new NativeFluentButton(label,bw,run,this.invalidate,"dark",appearance,id==="reset-confirm",34);
      b.label=`native-recovery:${id}`;b.position.set(x,top);b.disabled=this.#busy;panel.addChild(b);this.#buttons.push(b);return b;
    };
    if(this.#confirm){
      y+=8;
      button("back",t("common.actions.cancel"),w-300,y,112,()=>{this.#confirm=false;this.#focus=0;this.redraw();});
      button("reset-confirm",t("recovery.reset"),w-176,y,152,()=>{void this.perform(this.actions.reset!);});
    }else{
      const match=this.error.match(/^(?:Error: )?(?:Invalid layout|Failed to parse layout) (.+?layout\.json): ([\s\S]*)$/);
      const detail=match?`${match[2]}\n\n${t("recovery.configFile")}\n${match[1]}`:this.error.replace(/^Error: /,"");
      const measure=createNativeParagraph(detail,{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:13,lineHeight:20,fill:0xd4d8df,wordWrap:true,wordWrapWidth:inner-24,breakWords:true},inner-24);
      const detailHeight=Math.max(100,Math.min(measure.height+28,190,Math.max(100,height-330)));measure.destroy();
      panel.addChild(new Graphics({eventMode:"none"}).roundRect(24,y,inner,detailHeight,6).fill(0x191c22).stroke({color:0x3e424b,width:1}));
      const input=this.inputHost.create({value:detail,width:inner,height:detailHeight,readOnly:true,multiline:true,chrome:false,
        style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:13,lineHeight:20,padding:12,textColor:0xd4d8df,selectionColor:0x3268ad,caretColor:0xd4d8df}});
      this.#detailInput=input;input.label="native-recovery:details";input.position.set(24,y);panel.addChild(input);y+=detailHeight+8;
      const auxiliary=(id:string,label:string,x:number,bw:number,run:()=>void,icon:"folder-open-20-regular"|"copy-20-regular")=>{
        const b=button(id,label,x,y,bw,run,"subtle");b.caption.anchor.x=0;b.caption.x=30;
        const mark=nativeFluentIcon(icon,0xd4d8df,16);mark.position.set(8,9);b.addChild(mark);
      };
      if(this.actions.reveal)auxiliary("location",t("recovery.location"),24,230,()=>{void this.perform(this.actions.reveal!);},"folder-open-20-regular");
      if(this.actions.copy)auxiliary("copy",t("recovery.copy"),w-194,170,()=>{void this.perform(this.actions.copy!);},"copy-20-regular");
      y+=50;
      panel.addChild(new Graphics({eventMode:"none"}).moveTo(24,y-12).lineTo(w-24,y-12).stroke({color:0x3e424b,width:1}));
      if(this.actions.reset)button("reset",t("recovery.resetLink"),24,y,168,()=>{this.#confirm=true;this.#focus=0;this.redraw();},"outline");
      button("close",t("recovery.exit"),w-244,y,96,this.actions.close);
      const retry=button("retry",t("recovery.retry"),w-136,y,112,this.actions.retry,"primary");
      // Keep retry the default, without putting destructive recovery first in keyboard order.
      this.#buttons=[retry,...this.#buttons.filter(b=>b!==retry)];
    }
    y+=58;panel.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,w,y,12).fill(0x23262d).stroke({color:0x414650,width:1}),0);
    const scale=Math.min(1,(height-24)/y,(width-24)/w);panel.scale.set(scale);panel.position.set((width-w*scale)/2,(height-y*scale)/2);this.addChild(panel);
    this.#focus=Math.min(this.#focus,this.#buttons.length-1);this.#buttons[this.#focus]!.focused=true;this.invalidate();
  }
  async perform(run:()=>Promise<void>):Promise<void>{
    if(this.#busy)return;this.#busy=true;this.#operationError="";this.redraw();
    try{await run();}catch(error){this.#operationError=String(error);}finally{this.#busy=false;if(!this.destroyed)this.redraw();}
  }
  handleKey(key:string,shift=false):void{
    if(this.#busy)return;
    if(this.inputHost.focused&&key!=="Tab"&&key!=="Escape")return;
    if(key==="Tab"&&this.#detailInput&&!this.inputHost.focused&&((!shift&&this.#focus===0)||(shift&&this.#focus===1))){this.#buttons[this.#focus]!.focused=false;this.#detailInput.focus();return;}
    if(key==="Tab"&&this.inputHost.focused){this.inputHost.blur();this.#focus=shift?0:1;this.#buttons[this.#focus]!.focused=true;return;}
    if(key==="Tab"){this.#buttons[this.#focus]!.focused=false;this.#focus=(this.#focus+(shift?-1:1)+this.#buttons.length)%this.#buttons.length;this.#buttons[this.#focus]!.focused=true;}
    else if(key==="Enter"||key===" ")this.#buttons[this.#focus]?.activate();
    else if(key==="Escape"){if(this.#confirm){this.#confirm=false;this.#focus=0;this.redraw();}else this.actions.close();}
    this.invalidate();
  }
}
