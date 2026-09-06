import { Container, Graphics, Rectangle, Text } from "pixi.js";
import type { createSettingsNavigation, SettingsTabId } from "../../application/settingsNavigation.js";
import { NativeFluentButton, nativeFluentTheme, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { NativeScrollView } from "./NativeScrollView.js";
import { NATIVE_UI_FONT_FAMILY as PIXI_UI_FONT_FAMILY } from "./nativeTypography.js";
import { killMotionOf, motion } from "../pixi/animation/motionTween.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import type { NativeSettingsLayout } from "./nativeSettingsLayout.js";
import { captureSettingsGeometry,createSettingsTransition } from "./ui/nativeSettingsTransition.js";
import { NativeVirtualList } from "./ui/NativeVirtualList.js";
import { NativeFluentToggle } from "./NativeFluentToggle.js";

type Navigation=ReturnType<typeof createSettingsNavigation>;
export type NativeSettingsContent = {
  node:Container;
  height:number;
  controls:readonly NativeSettingsControl[];
  dispose():void;
  layout?:NativeSettingsLayout;
  viewport?(top:number,height:number):void;
};
export type NativeSettingsControl = {
  node:Container;
  focus(active:boolean):void;
  handleKey(key:string):boolean;
  disabled():boolean;
  restoreFocus?:boolean;
  selection?():{anchor:number;focus:number};
  restoreSelection?(selection:{anchor:number;focus:number}):void;
  virtualKey?:string;
  revealRect?():{top:number;height:number};
};
export type NativeSettingsShellOptions = {
  navigation:Navigation;
  theme():NativeTheme;
  size():{width:number;height:number};
  topInset?():number;
  anchor?():{x:number;y:number;width:number;height:number};
  t(key:string):string;
  invalidate():void;
  close():void;
  apply():Promise<void>;
  tabs:readonly SettingsTabId[];
  beforeKey?(event:{key?:string;code?:string;type?:string;shiftKey?:boolean;ctrlKey?:boolean;altKey?:boolean;metaKey?:boolean}):boolean;
  content(tab:SettingsTabId,subPage:string|null,width:number):NativeSettingsContent;
};

/** Native settings layout; navigation and settings transactions live in the shared core. */
export class NativeSettingsShell extends Container {
  readonly #shade=new Graphics({eventMode:"static"});
  readonly #panel=new Container();
  #page:NativeSettingsContent|null=null;
  #scroll:NativeScrollView|null=null;
  #routeKey="";
  #applying=false;
  #pendingApply:Promise<{error:unknown}|null>|null=null;
  #error="";
  #buttons:NativeFluentButton[]=[];
  #footerButtons:NativeFluentButton[]=[];
  readonly #focusBound=new WeakSet<Container>();
  #controls:readonly NativeSettingsControl[]=[];
  #focus=-1;
  #redrawCount=0;
  #keyboardFocus=false;
  readonly #disclosures=new Map<string,{height:number;opacity:number;expanded:boolean}>();
  #bodySize={width:0,height:0};
  readonly #reveal={value:0};
  #closing=false;
  #panelFrame={x:0,y:0,width:0,height:0};
  #leaving:{scroll:NativeScrollView;page:NativeSettingsContent}|null=null;
  readonly #navigation={width:68,copy:0};
  #navigationTarget=68;
  #navigationPaint:()=>void=()=>{};
  #contentTransition:ReturnType<typeof createSettingsTransition>|null=null;
  #contentHeights:{from:number;to:number}|null=null;
  #contentHeight=0;
  readonly #contentProgress={value:1};
  constructor(readonly options:NativeSettingsShellOptions){
    super({label:"native-settings",eventMode:"passive"});
    this.addChild(this.#shade,this.#panel);
    this.#shade.on("pointerdown",event=>event.stopPropagation());
    this.#shade.on("pointertap",event=>{event.stopPropagation();if(event.button===0&&event.target===this.#shade)this.requestClose();});
    this.#panel.on("pointerdown",event=>event.stopPropagation());
    this.#navigation.width=this.#navigationTarget=options.navigation.isNavigationCompact.value?68:220;
    this.#navigation.copy=options.navigation.isNavigationCompact.value?0:1;
    this.redraw();
    motion(this.#reveal).duration(0.34).ease("power3.out").to({value:1,onUpdate:()=>this.#presentReveal()}).start();
  }
  get closing():boolean{return this.#closing;}
  get transitionProgress():number{return this.#reveal.value;}
  get navigationWidth():number{return this.#navigation.width;}
  toggleNavigation():void{
    if(this.#closing||this.#applying)return;
    const previous=this.#page?captureSettingsGeometry(this.#page.node):null;
    const previousScroll=this.#scroll?.offset??0;
    const previousHeight=this.#contentHeight;
    this.options.navigation.isNavigationCompact.value=!this.options.navigation.isNavigationCompact.value;
    this.#navigationTarget=this.options.navigation.isNavigationCompact.value?68:220;
    this.redraw();
    if(previous&&this.#page){
      this.#contentTransition=createSettingsTransition(this.#page.node,previous);
      this.#contentHeights={from:previousHeight,to:this.#contentHeight};
      this.#contentProgress.value=0;this.#paintContentTransition();
      this.#scroll?.scrollTo(previousScroll);
      this.#page.node.eventMode="none";
      motion(this.#contentProgress).duration(0.16).ease("power1.inOut").to({value:1,onUpdate:()=>this.#paintContentTransition(),onComplete:()=>{
        this.#contentTransition?.update(1);this.#contentTransition=null;
        this.#contentHeights=null;
        if(this.#page&&!this.#closing&&!this.#applying)this.#page.node.eventMode="passive";
      }}).start();
    }
    motion(this.#navigation).duration(0.16).ease("power1.inOut").to({width:this.#navigationTarget,onUpdate:()=>this.#navigationPaint()}).start();
    motion(this.#navigation).duration(this.#navigationTarget===68?0.06:0.2).ease("power1.inOut").to({copy:this.#navigationTarget===68?0:1,onUpdate:()=>this.#navigationPaint()}).start();
  }
  requestClose():void{
    if(this.#applying||this.#closing)return;
    this.#closing=true;this.#panel.interactiveChildren=false;
    motion(this.#reveal).duration(0.26).ease("power2.inOut").to({value:0,onUpdate:()=>this.#presentReveal(),onComplete:()=>this.options.close()}).start();
  }
  #presentReveal():void{
    const {x,y,width,height}=this.#panelFrame,p=this.#reveal.value;
    const anchor=this.options.anchor?.()??{x:x+width/2-18,y:y+height/2-18,width:36,height:36};
    this.#panel.pivot.set(width/2,height/2);
    this.#panel.position.set(x+width/2+(anchor.x+anchor.width/2-x-width/2)*(1-p),y+height/2+(anchor.y+anchor.height/2-y-height/2)*(1-p));
    this.#panel.scale.set(Math.max(0.04,Math.min(0.24,anchor.width/width))*(1-p)+p,Math.max(0.04,Math.min(0.2,anchor.height/height))*(1-p)+p);
    this.#panel.alpha=this.#closing?p:0.88+0.12*p;
    this.#shade.alpha=p;this.options.invalidate();
  }
  get applying():boolean{return this.#applying;}
  get redrawCount():number{return this.#redrawCount;}
  /** A close request observes the same transaction, including its failure. */
  async waitForApply():Promise<void>{
    const result=await this.#pendingApply;
    if(result)throw result.error;
  }
  redraw():void{
    this.#redrawCount++;
    killMotionOf(this.#contentProgress);this.#contentTransition=null;this.#contentHeights=null;
    const {options}=this, {width,height}=options.size(), theme=options.theme(), colors=nativeFluentTheme(theme);
    const style=nativeSettingsStyle(theme);
    const route=options.navigation.activeRoute.value;
    const focusLabel=this.#routeKey===route.key?(this.#controls[this.#focus]?.virtualKey??this.#controls[this.#focus]?.node.label):null;
    const selection=focusLabel?this.#controls[this.#focus]?.selection?.():undefined;
    const previousScroll=this.#routeKey===route.key?this.#scroll?.offset??0:0;
    const routeChanged=this.#routeKey!==route.key;this.#routeKey=route.key;
    const switches=new Map<string,ReturnType<NativeFluentToggle["captureTransition"]>>();
    if(!routeChanged)for(const control of this.#page?.controls??[]){
      if(control.node instanceof NativeFluentToggle&&control.node.kind==="switch"&&control.node.label)switches.set(control.node.label,control.node.captureTransition());
    }
    this.#clearLeaving();
    if(routeChanged&&this.#page&&this.#scroll){
      this.#leaving={scroll:this.#scroll,page:this.#page};this.#scroll.removeFromParent();this.#scroll.eventMode="none";
      this.#controls.forEach(control=>control.focus(false));
    }else{
      if(this.#page)killMotionOf(this.#page.node);
      this.#page?.dispose();
    }
    this.#page=null;this.#scroll=null;this.#buttons=[];this.#focus=-1;
    for(const button of this.#footerButtons)button.removeFromParent();
    this.#panel.mask=null;
    for(const child of this.#panel.removeChildren())child.destroy({children:true});
    const topInset=options.topInset?.()??0;
    const w=Math.min(1040,width*0.94),h=Math.min(780,Math.max(120,height-topInset-48));
    const compact=options.navigation.isNavigationCompact.value;
    const navWidth=compact?68:220;
    this.#panelFrame={x:(width-w)/2,y:topInset+(height-topInset-h)/2,width:w,height:h};
    this.#presentReveal();
    const panelClip=new Graphics({eventMode:"none"}).roundRect(0,0,w,h,18).fill(0xffffff);
    this.#panel.addChild(panelClip);this.#panel.mask=panelClip;
    this.#panel.eventMode="static";this.#panel.hitArea=new Rectangle(0,0,w,h);
    this.#shade.clear().rect(0,0,width,height).fill({color:0,alpha:0.26});
    this.#panel.addChild(new Graphics({eventMode:"none"}).roundRect(0,0,w,h,18).fill(style.panel));
    const navBackground=new Graphics({eventMode:"none"});this.#panel.addChild(navBackground);
    const label=(text:string,x:number,y:number,size=14)=>{
      const node=new Text({text,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:size,fill:colors.colorNeutralForeground1}});
      node.position.set(x,y);node.eventMode="none";this.#panel.addChild(node);return node;
    };
    const button=(text:string,x:number,y:number,bw:number,action:()=>void,primary=false,controlHeight=34)=>{
      const node=new NativeFluentButton(text,bw,action,options.invalidate,theme,primary?"primary":text===options.t("common.actions.cancel")?"outline":"subtle",false,controlHeight);
      node.position.set(x,y);node.disabled=this.#applying;this.#panel.addChild(node);this.#buttons.push(node);
      return node;
    };
    const iconButton=(name:Parameters<typeof nativeFluentIcon>[0],label:string,x:number,y:number,bw:number,action:()=>void)=>{
      const node=button(label,x,y,bw,action);node.caption.visible=false;
      const icon=nativeFluentIcon(name,colors.colorNeutralForeground1,20);icon.position.set((bw-20)/2,7);node.addChild(icon);return node;
    };
    iconButton("navigation-24-regular",options.t(compact?"settings.shell.expandNavigation":"settings.shell.collapseNavigation"),16,16,36,()=>this.toggleNavigation());
    const back=route.depth?iconButton("arrow-left-20-regular",route.parentLabel,navWidth+12,16,34,()=>{options.navigation.closeSubPage();this.redraw();}):null;
    const parent=route.depth?button(route.parentLabel,navWidth+54,16,74,()=>{options.navigation.closeSubPage();this.redraw();}):null;
    if(parent){parent.caption.style.fontSize=20;parent.caption.style.fill=style.muted;parent.resizeWidth(parent.caption.width);parent.caption.anchor.x=0;parent.caption.x=0;}
    const separator=parent?label("›",parent.x+parent.controlWidth+12,21,20):null;if(separator)separator.style.fill=style.muted;
    const headingOffset=parent?54+parent.controlWidth+32:20;
    const heading=label(route.label,navWidth+headingOffset,22,20);heading.style.fontWeight="600";
    iconButton("dismiss-16-regular",options.t("settings.shell.close"),w-52,16,36,()=>this.requestClose());
    const navEntries:{button:NativeFluentButton;indicator:Graphics|null;clip:Graphics}[]=[];
    options.navigation.settingsTabs.value.filter(tab=>options.tabs.includes(tab.id)).forEach((tab,index)=>{
      const node=button(tab.label,8,72+index*52,navWidth-16,()=>{
        options.navigation.selectTab(tab.id);this.redraw();
      },false,48);
      node.label=`native-settings-tab:${tab.id}`;
      const iconName={general:"settings-24-regular",interface:"paint-brush-24-regular",apps:"apps-24-regular",about:"info-24-regular"} as const;
      const icon=nativeFluentIcon(iconName[tab.id],colors.colorNeutralForeground1,20);
      icon.position.set(16,14);node.addChild(icon);
      node.caption.visible=true;
      node.caption.anchor.x=0;node.caption.x=46;
      const clip=new Graphics({eventMode:"none"});node.addChild(clip);node.caption.mask=clip;
      let indicator:Graphics|null=null;
      if(route.tabId===tab.id){
        indicator=new Graphics({eventMode:"none"}).roundRect(0,0,navWidth-16,48,4).fill(style.selected)
          .roundRect(3,14,3,20,1.5).fill(style.accent);
        node.addChildAt(indicator,1);
      }
      navEntries.push({button:node,indicator,clip});
    });
    const footer=route.depth===0&&(route.tabId==="general"||route.tabId==="interface");
    const bodyWidth=Math.max(80,w-navWidth-40),bodyHeight=Math.max(1,h-58-(footer?56:0));
    this.#scroll=new NativeScrollView(options.invalidate,()=>this.#updateViewport(),theme,{left:20,right:20,top:18,bottom:20});
    this.#scroll.position.set(navWidth,58);this.#panel.addChild(this.#scroll);
    this.#page=options.content(route.tabId,route.subPageId,bodyWidth);
    for(const control of this.#page.controls){
      if(control.node instanceof NativeFluentToggle){const previous=switches.get(control.node.label);if(previous)control.node.restoreTransition(previous);}
    }
    this.#bodySize={width:w-navWidth,height:bodyHeight};
    this.#scroll.content.addChild(this.#page.node);
    for(const entry of this.#page.layout?.disclosures??[]){
      let state=this.#disclosures.get(entry.id);
      if(!state){state={height:entry.expanded?1:0,opacity:entry.expanded?1:0,expanded:entry.expanded};this.#disclosures.set(entry.id,state);}
      if(state.expanded!==entry.expanded){
        state.expanded=entry.expanded;const target=entry.expanded?1:0;
        motion(state).duration(0.2).ease(value=>Math.cbrt(value)*3-Math.pow(Math.cbrt(value),2)*3+value)
          .to({height:target,onUpdate:()=>this.#reflow()}).start();
        motion(state).duration(0.1).ease("power1.inOut").to({opacity:target,onUpdate:()=>this.#reflow()}).start();
      }
    }
    this.#reflow();
    // Expanded surfaces add padding during reflow. Restoring against the raw
    // page height first would permanently clamp a valid bottom scroll offset.
    this.#scroll.scrollTo(previousScroll);
    this.#navigationPaint=()=>{
      if(this.destroyed)return;
      const current=this.#navigation.width;
      navBackground.clear().rect(0,0,current,h).fill(style.nav);
      heading.x=current+headingOffset;if(back)back.x=current+12;if(parent)parent.x=current+54;if(separator)separator.x=current+54+parent!.controlWidth+12;
      this.#scroll!.x=current;
      this.#bodySize.width=Math.max(80,w-current);
      const pageHeight=this.#page?.layout?.reflow(this.#disclosures)??this.#page?.height??0;
      this.#contentHeight=pageHeight;
      this.#scroll!.resize(this.#bodySize.width,bodyHeight,pageHeight);
      for(const entry of navEntries){
        entry.button.resizeWidth(current-16);entry.button.caption.alpha=this.#navigation.copy;
        entry.button.caption.x=46-4*(1-this.#navigation.copy);
        entry.clip.clear().rect(44,0,Math.max(0,current-62),48).fill(0xffffff);
        entry.indicator?.clear().roundRect(0,0,current-16,48,4).fill(style.selected).roundRect(3,14,3,20,1.5).fill(style.accent);
      }
      options.invalidate();
      this.#paintContentTransition();
    };
    this.#navigationPaint();
    if(routeChanged){
      this.#page.node.alpha=0;
      const direction=options.navigation.routeTransitionName.value;
      this.#page.node.x=direction.endsWith("forward")?14:direction.endsWith("back")?-14:0;
      this.#page.node.y=direction.endsWith("switch")?4:0;
      motion(this.#page.node).duration(direction.endsWith("switch")?0.14:0.16).ease("power2.out").to({alpha:1,x:0,y:0}).start();
      if(this.#leaving){
        this.#panel.addChild(this.#leaving.scroll);
        const previous=this.#leaving.page.node;
        killMotionOf(previous);
        motion(previous).duration(direction.endsWith("switch")?0.14:0.09).ease("power2.in").to({alpha:0,x:direction.endsWith("forward")?-8:direction.endsWith("back")?8:0,onComplete:()=>this.#clearLeaving()}).start();
      }
    }
    if(footer){
      if(!this.#footerButtons.length)this.#footerButtons=[
        new NativeFluentButton(options.t("common.actions.cancel"),88,()=>this.requestClose(),options.invalidate,theme,"outline"),
        new NativeFluentButton(options.t("common.actions.apply"),88,()=>{void this.#apply();},options.invalidate,theme,"primary"),
      ];
      this.#footerButtons.forEach((control,index)=>{
        const text=options.t(index?"common.actions.apply":"common.actions.cancel");
        control.caption.text=text;control.label=`native-action:${text}`;control.theme=theme;control.busy=this.#applying;
        control.position.set(w-(index?108:208),h-50);this.#panel.addChild(control);this.#buttons.push(control);
      });
    }
    if(this.#error){
      const error=label(this.#error,navWidth+20,h-66,12);
      error.style.fill=colors.colorPaletteRedForeground1;
      error.style.wordWrap=true;error.style.wordWrapWidth=bodyWidth-220;
    }
    const chromeControls=this.#buttons.map(node=>({
      node,focus:(active:boolean)=>{node.focused=active;},
      handleKey:(key:string)=>{if(key!=="Enter"&&key!==" ")return false;node.activate();return true;},
      disabled:()=>node.disabled,
    }));
    const footerCount=footer?2:0;
    this.#controls=[...chromeControls.slice(0,chromeControls.length-footerCount),...this.#page.controls,...chromeControls.slice(chromeControls.length-footerCount)];
    this.#controls.forEach((control,index)=>{
      if(control.virtualKey){
        if(control.node instanceof NativeVirtualList)control.node.onControlFocus(key=>{
          this.#keyboardFocus=false;const current=this.#controls.findIndex(item=>item.node===control.node&&item.virtualKey===key);if(current>=0)this.#setFocus(current);
        });
        return;
      }
      if(!this.#focusBound.has(control.node)){
        this.#focusBound.add(control.node);
        control.node.on("pointerdown",()=>{this.#keyboardFocus=false;const current=this.#controls.findIndex(item=>item.node===control.node);if(current>=0)this.#setFocus(current);});
      }
      if(control.restoreFocus)control.node.on("focus",()=>{
        if(this.#focus!==index&&this.#focus>=0)this.#controls[this.#focus]?.focus(false);
        this.#focus=index;
      });
    });
    if(focusLabel){const index=this.#controls.findIndex(control=>(control.virtualKey??control.node.label)===focusLabel&&!control.disabled());if(index>=0){this.#setFocus(index);if(this.#controls[index]?.restoreFocus)this.#controls[index]!.focus(true);if(selection)this.#controls[index]?.restoreSelection?.(selection);}}
    if(this.#applying)this.#page.node.eventMode="none";
    options.invalidate();
  }
  #reflow():void{
    if(this.destroyed||!this.#page||!this.#scroll)return;
    const height=this.#page.layout?.reflow(this.#disclosures)??this.#page.height;
    this.#contentHeight=height;
    this.#scroll.resize(this.#bodySize.width,this.#bodySize.height,height);
    this.#updateViewport();
    this.#paintContentTransition();
    this.options.invalidate();
  }
  #updateViewport():void{if(this.#page&&this.#scroll)this.#page.viewport?.(this.#scroll.offset-this.#scroll.padding.top,this.#bodySize.height);}
  #paintContentTransition():void{
    this.#contentTransition?.update(this.#contentProgress.value);
    if(this.#contentHeights&&this.#scroll){
      this.#contentHeight=this.#contentHeights.from+(this.#contentHeights.to-this.#contentHeights.from)*this.#contentProgress.value;
      this.#scroll.resize(this.#bodySize.width,this.#bodySize.height,this.#contentHeight);
    }
    this.options.invalidate();
  }
  #clearLeaving():void{
    if(!this.#leaving)return;
    const {scroll,page}=this.#leaving;this.#leaving=null;
    killMotionOf(page.node);page.dispose();scroll.destroy();
  }
  #apply():void{
    if(this.#applying)return;this.#applying=true;this.#error="";
    // Keep input sessions, previews and hover geometry alive during the transaction.
    this.#panel.interactiveChildren=false;
    for(const button of this.#buttons){if(this.#footerButtons.includes(button))button.busy=true;else button.disabled=true;}
    this.options.invalidate();
    this.#pendingApply=(async()=>{
      try{await this.options.apply();return null;}
      catch(error){this.#error=error instanceof Error?error.message:String(error);return {error};}
    })().finally(()=>{
      this.#applying=false;this.#pendingApply=null;if(!this.destroyed){this.#panel.interactiveChildren=!this.#closing;this.redraw();}
    });
  }
  #setFocus(index:number):void{
    if(this.#focus!==index&&this.#focus>=0)this.#controls[this.#focus]?.focus(false);
    if(this.#keyboardFocus)this.#controls[index]?.focus(true);
    else if(!this.#controls[index]?.restoreFocus)this.#controls[index]?.focus(false);
    this.#focus=index;
    const control=this.#controls[index];
    if(this.#keyboardFocus&&control&&this.#page?.controls.includes(control)&&this.#scroll){
      const rect=control.revealRect?.();
      const point=rect?null:this.#scroll.content.toLocal(control.node.toGlobal({x:0,y:0}));
      this.#scroll.reveal(rect?.top??point!.y,rect?.height??control.node.height);
    }
  }
  handleKey(event:{key?:string;code?:string;type?:string;shiftKey?:boolean;ctrlKey?:boolean;altKey?:boolean;metaKey?:boolean}):boolean{
    if(this.#applying||this.#closing)return true;
    if(this.options.beforeKey?.(event))return true;
    if(event.type!=="down")return false;
    if(event.key==="Escape"){this.requestClose();return true;}
    if(event.key==="Tab"){
      this.#keyboardFocus=true;
      const count=this.#controls.length;
      let index=this.#focus<0?(event.shiftKey?0:-1):this.#focus;
      for(let attempt=0;attempt<count;attempt++){
        index=(index+(event.shiftKey?-1:1)+count)%count;
        if(!this.#controls[index]!.disabled()){this.#setFocus(index);break;}
      }
      return true;
    }
    return event.key?this.#controls[this.#focus]?.handleKey(event.key)??false:false;
  }
  override destroy():void{
    for(const button of this.#footerButtons)if(!button.parent)button.destroy({children:true});
    killMotionOf(this.#contentProgress);this.#contentTransition=null;
    killMotionOf(this.#navigation);this.#navigationPaint=()=>{};
    this.#clearLeaving();
    for(const state of this.#disclosures.values())killMotionOf(state);
    killMotionOf(this.#reveal);
    killMotionOf(this);if(this.#page)killMotionOf(this.#page.node);
    this.#page?.dispose();this.#page=null;super.destroy({children:true});
  }
}
