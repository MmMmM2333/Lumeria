import { AlphaFilter, Color, Container, Graphics, Rectangle, RenderTexture, type Renderer, type Sprite } from "pixi.js";
import { t } from "../../native/nativeLocalization.js";
import { createNativeText, NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { NativeFluentButton, nativeFluentTheme, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { nativePanelShadow } from "./ui/nativePanelShadow.js";
import { NativeSingleLineText } from "./ui/NativeSingleLineText.js";
import { NativeToolbarBackdrop } from "./ui/NativeToolbarBackdrop.js";
import { killMotionOf, motion } from "../pixi/animation/motionTween.js";
import { cubicBezier } from "../pixi/animation/motionRuntime.js";

type ToolbarState={width:number;chromeInset:number;theme:NativeTheme;active:boolean;count:number;hiddenCount:number;frozen:boolean;canCancel:boolean;cancelArmed:boolean};
type Options={invalidate():void;selectScope():void;clear():void;createFolder():void;removeMenu(x:number,y:number,restore:()=>void):void;done():void;};
type Action={button:NativeFluentButton;icon:Sprite|null;chevron:Sprite|null;key:string;};

/** Native counterpart of LaunchpadSelectionToolbar.vue, including its compact icon actions. */
export class NativeSelectionToolbar extends Container {
  #backdropEnabled=true;
  get backdropEnabled():boolean{return this.#backdropEnabled;}
  setBackdropEnabled(enabled:boolean):void{
    this.#backdropEnabled=enabled;this.#signature="";this.#surfaceSignature="";
    if(!enabled)this.#background.filters=[];
  }
  readonly #body=new Container();
  readonly #background=new Graphics({eventMode:"none"});
  #backdrop:NativeToolbarBackdrop|null=null;
  readonly #divider=new Graphics({eventMode:"none"});
  readonly #title=new NativeSingleLineText("",{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:14,fontWeight:"600"},1);
  readonly #detail=new NativeSingleLineText("",{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:11},1);
  readonly #cancel=new Container({eventMode:"none"});
  readonly #cancelMark=new Graphics({eventMode:"none"});
  readonly #cancelIcon=nativeFluentIcon("dismiss-16-regular",0xffffff,19);
  readonly #esc=createNativeText({text:"Esc",eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:11,fontWeight:"600"}});
  readonly #actions:Action[]=[];
  readonly #reveal={value:1};
  #shadow:Container|null=null;
  #state:ToolbarState|null=null;
  #signature="";
  #surfaceSignature="";
  #focus=-1;
  #width=0;
  #height=54;
  constructor(readonly options:Options){
    super({label:"native-selection-toolbar",eventMode:"static"});this.visible=false;
    this.addChild(this.#body);this.#body.addChild(this.#background,this.#divider,this.#title,this.#detail,this.#cancel);
    this.#cancel.addChild(this.#cancelMark,this.#cancelIcon,this.#esc);
    const action=(key:string,icon:Parameters<typeof nativeFluentIcon>[0]|null,run:()=>void,primary=false,danger=false)=>{
      const button=new NativeFluentButton(t(key),38,run,options.invalidate,"dark",primary?"toolbar-primary":"toolbar",danger,36);
      const mark=icon?nativeFluentIcon(icon,0xffffff,18):null;
      const chevron=danger?nativeFluentIcon("chevron-down-16-regular",0xffffff,12):null;
      if(mark)button.addChild(mark);if(chevron)button.addChild(chevron);
      button.on("pointerdown",()=>this.clearFocus());this.#body.addChild(button);
      this.#actions.push({button,icon:mark,chevron,key});return button;
    };
    action("launchpad.batch.selectScope","select-all-on-20-regular",options.selectScope);
    action("common.actions.clearSelection","subtract-square-20-regular",options.clear);
    action("launchpad.batch.createFolder","folder-add-20-regular",options.createFolder);
    const remove=action("launchpad.batch.remove","delete-20-regular",()=>{
      const point=remove.toGlobal({x:0,y:40});options.removeMenu(point.x,point.y,()=>this.focus(3));
    },false,true);
    action("launchpad.batch.done",null,options.done,true);
    this.on("pointerdown",event=>event.stopPropagation());
  }
  get summaryText():string{return [this.#title.fullText,this.#detail.visible?this.#detail.fullText:""].filter(Boolean).join("\n");}
  get hasFocus():boolean{return this.#focus>=0;}
  cancelZoneRect():{left:number;top:number;width:number;height:number}|null{
    return this.visible?{left:this.x,top:this.y,width:this.#width,height:this.#height}:null;
  }
  clearFocus():void{for(const action of this.#actions)action.button.focused=false;this.#focus=-1;}
  focus(index:number):void{
    this.clearFocus();const button=this.#actions[index]?.button;
    if(button?.visible&&!button.disabled){this.#focus=index;button.focused=true;}
  }
  handleKey(key:string,reverse=false):boolean{
    if(!this.visible||this.#state?.canCancel)return false;
    if(key==="Tab"||(this.hasFocus&&(key==="ArrowLeft"||key==="ArrowRight"))){
      const backwards=reverse||key==="ArrowLeft",step=backwards?-1:1;
      let next=this.#focus<0?(backwards?this.#actions.length: -1):this.#focus;
      for(let count=0;count<this.#actions.length;count++){
        next+=step;if(next<0||next>=this.#actions.length){this.clearFocus();return false;}
        if(!this.#actions[next]!.button.disabled){this.focus(next);return true;}
      }
      return false;
    }
    if(this.hasFocus&&(key==="Enter"||key===" ")){this.#actions[this.#focus]!.button.activate();return true;}
    if(this.hasFocus&&key==="Escape"){this.clearFocus();return true;}
    return false;
  }
  update(state:ToolbarState):void{
    const labels=this.#actions.map(action=>t(action.key));
    const signature=JSON.stringify([state,labels,t("launchpad.batch.selectedCount",{count:state.count}),t("launchpad.batch.cancelDragHint")]);
    if(signature===this.#signature)return;this.#signature=signature;
    const entered=state.active&&!this.#state?.active;this.#state=state;
    this.visible=state.active;
    const narrow=state.width<=760;
    this.#width=Math.max(1,Math.min(760,state.width-(narrow?20:40)));
    this.position.set((state.width-this.#width)/2,Math.max(narrow?10:14,state.chromeInset+(narrow?6:10)));
    this.hitArea=new Rectangle(0,0,this.#width,this.#height);
    if(!state.active){this.clearFocus();killMotionOf(this.#reveal);this.#reveal.value=1;this.#present();return;}
    const style=nativeSettingsStyle(state.theme),tokens=nativeFluentTheme(state.theme);
    const color=new Color(style.text).toNumber();
    const surfaceSignature=JSON.stringify([this.#width,state.theme,state.canCancel,state.cancelArmed]);
    if(surfaceSignature!==this.#surfaceSignature){
      if(!this.#backdrop)this.#backdrop=new NativeToolbarBackdrop();
      this.#background.filters=state.canCancel||!this.#backdropEnabled?[]:[this.#backdrop];
      this.#surfaceSignature=surfaceSignature;this.#shadow?.destroy({children:true});
      this.#shadow=nativePanelShadow(this.#width,54,state.cancelArmed?"0 18px 54px rgba(31,8,12,0.4)":tokens.shadow28,18);
      this.#body.addChildAt(this.#shadow,0);
      const panelColor=new Color(style.panel).toNumber(),cancelColor=0x8e3038;
      const mix=(shift:number)=>Math.round(((panelColor>>shift)&255)*0.72+((cancelColor>>shift)&255)*0.28);
      const fill=state.cancelArmed?(mix(16)<<16)|(mix(8)<<8)|mix(0):style.panel;
      this.#background.clear().roundRect(0,0,this.#width,54,18).fill({color:fill,alpha:state.canCancel?1:0.94})
        .stroke({color:state.cancelArmed?"rgba(255,177,168,0.82)":state.theme==="dark"?"rgba(255,255,255,0.18)":style.border,width:1});
    }
    this.#title.style.fill=style.text;this.#detail.style.fill=style.muted;
    this.#title.setValue(state.canCancel?t(state.cancelArmed?"launchpad.batch.releaseToCancel":"launchpad.batch.cancelDrag"):t("launchpad.batch.selectedCount",{count:state.count}),this.#width);
    this.#detail.setValue(state.canCancel?t("launchpad.batch.cancelDragHint"):t("launchpad.batch.hiddenCount",{count:state.hiddenCount}),this.#width);
    this.#detail.visible=state.canCancel||state.hiddenCount>0;
    this.#title.position.set(14,this.#detail.visible?10:18);this.#detail.position.set(14,30);
    const widths=this.#actions.map((action,index)=>{
      const b=action.button;b.caption.text=labels[index]!;b.theme=state.theme;b.visible=!state.canCancel;
      b.disabled=state.frozen||(index===2?state.count<2:(index===1||index===3)&&state.count===0);
      return Math.max(index===4?58:38,b.caption.width+(index===4?26:44)+(action.chevron?17:0));
    });
    const compact=narrow||widths.reduce((a,b)=>a+b,0)+157>this.#width;
    const actual=widths.map((w,index)=>compact&&index<4?38:w);
    let x=this.#width-8-actual.reduce((a,b)=>a+b,0)-31;
    const summaryWidth=Math.max(1,x-22);this.#title.style.wordWrap=false;
    this.#title.scale.set(1);this.#detail.scale.set(1);
    if(!state.canCancel){
      this.#title.setAvailableWidth(summaryWidth);this.#detail.setAvailableWidth(summaryWidth);
    }
    this.#divider.clear();
    for(const [index,action] of this.#actions.entries()){
      if(index===2){if(!state.canCancel)this.#divider.rect(x+3,17,1,20).fill(style.border);x+=11;}
      const b=action.button,w=actual[index]!;b.resizeWidth(w);b.position.set(x,9);b.caption.visible=!compact||index===4;
      b.caption.x=action.icon?10+18+6+b.caption.width/2:w/2;
      if(action.icon){action.icon.position.set(10,9);action.icon.tint=index===3?new Color(state.theme==="dark"?"#ffaaa5":tokens.colorPaletteRedForeground1).toNumber():color;}
      if(action.chevron){action.chevron.visible=!compact;action.chevron.position.set(w-22,12);action.chevron.tint=action.icon!.tint;}
      x+=w+(index===3?8:4);
    }
    this.#cancel.visible=state.canCancel;
    if(state.canCancel){
      this.#title.setAvailableWidth(Math.max(1,this.#width-116));this.#detail.setAvailableWidth(Math.max(1,this.#width-116));
      this.clearFocus();const copyWidth=Math.max(this.#title.width,this.#detail.width),total=30+12+copyWidth+12+38,left=(this.#width-total)/2;
      this.#title.x=this.#detail.x=left+42;this.#cancelIcon.position.set(left+5.5,17.5);this.#cancelIcon.tint=color;
      this.#esc.position.set(left+42+copyWidth+12+8,20);this.#esc.style.fill=style.muted;
      this.#cancelMark.clear().roundRect(left,12,30,30,10).fill(style.row)
        .roundRect(left+42+copyWidth+12,15,38,24,7).fill(style.row).stroke({color:style.border,width:1});
    }
    if(this.#focus>=0&&this.#actions[this.#focus]!.button.disabled)this.clearFocus();
    if(entered){this.#reveal.value=0;this.#present();motion(this.#reveal).duration(0.18).ease(cubicBezier(0.2,0.8,0.2,1)).to({value:1,onUpdate:()=>this.#present()}).start();}
    this.options.invalidate();
  }
  #present():void{const p=this.#reveal.value;this.#body.alpha=p;this.#body.scale.set(0.98+0.02*p);this.#body.position.set(this.#width*0.01*(1-p),-8*(1-p));this.options.invalidate();}
  /** Compile the actual toolbar/shadow pipelines before the first user action. */
  prepare(renderer:Renderer,width:number,chromeInset:number,theme:NativeTheme):void{
    if(this.#state?.active)return;
    const previous=this.#state??{width,chromeInset,theme,active:false,count:0,hiddenCount:0,frozen:false,canCancel:false,cancelArmed:false};
    const parent=this.parent,index=parent?.getChildIndex(this)??0;
    const root=new Container(),filter=new AlphaFilter({alpha:1,resolution:"inherit",antialias:"inherit"});
    const texture=RenderTexture.create({width:Math.min(840,width+80),height:180,resolution:renderer.resolution,antialias:true});
    try{
      this.update({...previous,width,chromeInset,theme,active:true});killMotionOf(this.#reveal);this.#reveal.value=1;this.#present();
      root.addChild(this);this.position.set(40,48);root.filters=[filter];
      renderer.render({container:root,target:texture,clear:true});
    }finally{
      root.removeChild(this);if(parent)parent.addChildAt(this,index);
      this.update(previous);root.filters=[];root.destroy();filter.destroy();texture.destroy(true);
    }
  }
  override destroy():void{killMotionOf(this.#reveal);this.#background.filters=[];this.#backdrop?.destroy();super.destroy({children:true});}
}
