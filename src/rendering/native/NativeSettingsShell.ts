import { Container, Graphics, Rectangle, Text } from "pixi.js";
import type { createSettingsNavigation, SettingsTabId } from "../../application/settingsNavigation.js";
import { NativeFluentButton, nativeFluentTheme, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { NativeScrollView } from "./NativeScrollView.js";
import { PIXI_UI_FONT_FAMILY } from "../typography.js";
import { killMotionOf, motion } from "../pixi/animation/motionTween.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";

type Navigation=ReturnType<typeof createSettingsNavigation>;
export type NativeSettingsContent = {
  node:Container;
  height:number;
  controls:readonly NativeSettingsControl[];
  dispose():void;
};
export type NativeSettingsControl = {
  node:Container;
  focus(active:boolean):void;
  handleKey(key:string):boolean;
  disabled():boolean;
};
export type NativeSettingsShellOptions = {
  navigation:Navigation;
  theme():NativeTheme;
  size():{width:number;height:number};
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
  #error="";
  #buttons:NativeFluentButton[]=[];
  #controls:readonly NativeSettingsControl[]=[];
  #focus=-1;
  constructor(readonly options:NativeSettingsShellOptions){
    super({label:"native-settings",eventMode:"passive"});
    this.addChild(this.#shade,this.#panel);
    this.#shade.on("pointerdown",event=>{event.stopPropagation();if(event.button===0&&!this.#applying)options.close();});
    this.#panel.on("pointerdown",event=>event.stopPropagation());
    this.redraw();
    this.alpha=0;motion(this).duration(0.16).to({alpha:1}).start();
  }
  get applying():boolean{return this.#applying;}
  redraw():void{
    const {options}=this, {width,height}=options.size(), theme=options.theme(), colors=nativeFluentTheme(theme);
    const style=nativeSettingsStyle(theme);
    const route=options.navigation.activeRoute.value;
    const focusLabel=this.#routeKey===route.key?this.#controls[this.#focus]?.node.label:null;
    const previousScroll=this.#routeKey===route.key?this.#scroll?.offset??0:0;
    const routeChanged=this.#routeKey!==route.key;this.#routeKey=route.key;
    if(this.#page)killMotionOf(this.#page.node);
    this.#page?.dispose();this.#page=null;this.#scroll=null;this.#buttons=[];this.#focus=-1;
    for(const child of this.#panel.removeChildren())child.destroy({children:true});
    const w=Math.min(1040,width*0.94),h=Math.min(780,Math.max(120,height-48));
    const compact=options.navigation.isNavigationCompact.value;
    const navWidth=compact?68:220;
    this.#panel.position.set((width-w)/2,(height-h)/2);
    this.#panel.eventMode="static";this.#panel.hitArea=new Rectangle(0,0,w,h);
    this.#shade.clear().rect(0,0,width,height).fill({color:0,alpha:0.26});
    this.#panel.addChild(new Graphics({eventMode:"none"}).roundRect(0,0,w,h,8).fill(style.panel)
      .rect(0,0,navWidth,h).fill(style.nav));
    const label=(text:string,x:number,y:number,size=14)=>{
      const node=new Text({text,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:size,fill:colors.colorNeutralForeground1}});
      node.position.set(x,y);node.eventMode="none";this.#panel.addChild(node);return node;
    };
    const button=(text:string,x:number,y:number,bw:number,action:()=>void,primary=false,controlHeight=34)=>{
      const node=new NativeFluentButton(text,bw,action,options.invalidate,theme,primary?"primary":"subtle",false,controlHeight);
      node.position.set(x,y);node.disabled=this.#applying;this.#panel.addChild(node);this.#buttons.push(node);
      return node;
    };
    const iconButton=(name:Parameters<typeof nativeFluentIcon>[0],label:string,x:number,y:number,bw:number,action:()=>void)=>{
      const node=button(label,x,y,bw,action);node.caption.visible=false;
      const icon=nativeFluentIcon(name,colors.colorNeutralForeground1,20);icon.position.set((bw-20)/2,7);node.addChild(icon);return node;
    };
    iconButton("navigation-24-regular",options.t(compact?"settings.shell.expandNavigation":"settings.shell.collapseNavigation"),16,16,36,()=>{options.navigation.isNavigationCompact.value=!compact;this.redraw();});
    if(route.depth)iconButton("arrow-left-20-regular",route.parentLabel,navWidth+12,16,34,()=>{options.navigation.closeSubPage();this.redraw();});
    label(route.depth?`${route.parentLabel} › ${route.label}`:route.label,navWidth+(route.depth?54:20),22,20);
    iconButton("dismiss-16-regular",options.t("settings.shell.close"),w-52,16,36,()=>options.close());
    options.navigation.settingsTabs.value.filter(tab=>options.tabs.includes(tab.id)).forEach((tab,index)=>{
      const node=button(tab.label,8,72+index*52,navWidth-16,()=>{
        options.navigation.selectTab(tab.id);this.redraw();
      },false,48);
      const iconName={general:"settings-24-regular",interface:"paint-brush-24-regular",apps:"apps-24-regular",about:"info-24-regular"} as const;
      const icon=nativeFluentIcon(iconName[tab.id],colors.colorNeutralForeground1,20);
      icon.position.set(16,14);node.addChild(icon);
      node.caption.visible=!compact;
      node.caption.anchor.x=0;node.caption.x=46;
      if(route.tabId===tab.id){
        const indicator=new Graphics({eventMode:"none"}).roundRect(0,0,navWidth-16,48,4).fill(style.selected)
          .roundRect(3,14,3,20,1.5).fill(style.accent);
        node.addChildAt(indicator,1);
      }
    });
    const footer=route.depth===0&&(route.tabId==="general"||route.tabId==="interface");
    const bodyWidth=Math.max(80,w-navWidth-40),bodyHeight=Math.max(1,h-76-(footer?68:20));
    this.#scroll=new NativeScrollView(options.invalidate,()=>{},theme);
    this.#scroll.position.set(navWidth+20,76);this.#panel.addChild(this.#scroll);
    this.#page=options.content(route.tabId,route.subPageId,bodyWidth);
    this.#scroll.content.addChild(this.#page.node);
    this.#scroll.resize(bodyWidth,bodyHeight,this.#page.height);
    this.#scroll.scrollTo(previousScroll);
    if(routeChanged){
      this.#page.node.alpha=0;
      motion(this.#page.node).duration(0.16).to({alpha:1}).start();
    }
    if(footer){
      button(options.t("common.actions.cancel"),w-208,h-50,88,()=>options.close());
      button(options.t("common.actions.apply"),w-108,h-50,88,()=>{void this.#apply();},true);
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
    this.#controls.forEach((control,index)=>control.node.on("pointerdown",()=>this.#setFocus(index)));
    if(focusLabel){const index=this.#controls.findIndex(control=>control.node.label===focusLabel&&!control.disabled());if(index>=0)this.#setFocus(index);}
    if(this.#applying)this.#page.node.eventMode="none";
    options.invalidate();
  }
  async #apply():Promise<void>{
    if(this.#applying)return;this.#applying=true;this.#error="";this.redraw();
    try{await this.options.apply();}
    catch(error){this.#error=error instanceof Error?error.message:String(error);}
    finally{this.#applying=false;if(!this.destroyed)this.redraw();}
  }
  #setFocus(index:number):void{
    this.#controls.forEach((control,i)=>{if(i!==index)control.focus(false);});
    this.#controls[index]?.focus(true);this.#focus=index;
    const control=this.#controls[index];
    if(control&&this.#page?.controls.includes(control)&&this.#scroll){
      const point=this.#scroll.content.toLocal(control.node.toGlobal({x:0,y:0}));
      this.#scroll.reveal(point.y,control.node.height);
    }
  }
  handleKey(event:{key?:string;code?:string;type?:string;shiftKey?:boolean;ctrlKey?:boolean;altKey?:boolean;metaKey?:boolean}):boolean{
    if(this.#applying)return true;
    if(this.options.beforeKey?.(event))return true;
    if(event.type!=="down")return false;
    if(event.key==="Escape"){if(!this.#applying)this.options.close();return true;}
    if(event.key==="Tab"){
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
    killMotionOf(this);if(this.#page)killMotionOf(this.#page.node);
    this.#page?.dispose();this.#page=null;super.destroy({children:true});
  }
}
