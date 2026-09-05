import { BlurFilter, ColorMatrixFilter, Container, FillGradient, Graphics, Text } from "pixi.js";
import type { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import { t } from "../../native/nativeLocalization.js";
import { NativeFluentButton, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { NativeFluentToggle } from "./NativeFluentToggle.js";
import { NativeSegmentedControl } from "./NativeSegmentedControl.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import type { NativeSettingsContent, NativeSettingsControl } from "./NativeSettingsShell.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";

export type NativeWindowPanelState = { mode: boolean; material: boolean; advanced: boolean };
export function nativeWindowSettings(options: {
  settings: ReturnType<typeof createLaunchpadSettings>; width: number; theme: NativeTheme; systemAppearance:NativeTheme;
  state: NativeWindowPanelState; invalidate(): void; redraw(): void;
}): NativeSettingsContent {
  const { settings, width, theme, state, invalidate, redraw } = options;
  const node = new Container(), controls: NativeSettingsControl[] = [];
  const gradients:FillGradient[]=[];
  const previewFilters:(BlurFilter|ColorMatrixFilter)[]=[];
  const style = nativeSettingsStyle(theme), d = settings.draft, a = settings.actions;
  let y = 0;
  const key = (name: string) => t(`settings.interface.window.${name}`);
  const text = (value: string, x: number, top: number, size=13, bold=false) => {
    const label = new Text({ text: value, eventMode: "none", style: { fontFamily: [...NATIVE_UI_FONT_FAMILY],
      fontSize: size, fontWeight: bold ? "600" : "400", fill: style.text } });
    label.position.set(x, top); node.addChild(label); return label;
  };
  const button = (title: string, id: string, x: number, top: number, w: number, run: () => void, active=false, h=34) => {
    const control = new NativeFluentButton(title, w, run, invalidate, theme, "subtle", false, h);
    control.label = `native-window:${id}`; control.position.set(x, top); node.addChild(control);
    if (active) control.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,w,h,8).fill(style.selected),1);
    controls.push({node:control,focus:value=>{control.focused=value;},disabled:()=>control.disabled,
      handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;control.activate();return true;}});
    return control;
  };
  const toggle = (title: string, description: string, id: string, value: boolean, change: (value:boolean)=>void, disabled=false) => {
    text(title,14,y+12,13,true);
    const detail=text(description,14,y+34,12);detail.style.fill=style.muted;detail.style.wordWrap=true;detail.style.wordWrapWidth=width-95;
    const control=new NativeFluentToggle("switch",change,invalidate,theme);
    control.label=`native-window:${id}`;control.checked=value;control.disabled=disabled;control.position.set(width-64,y+18);node.addChild(control);
    const focus=new Graphics({eventMode:"none"});node.addChild(focus);const top=y;
    controls.push({node:control,disabled:()=>control.disabled,handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;control.toggle();return true;},
      focus:active=>{focus.clear();if(active)focus.roundRect(width-68,top+14,48,32,4).stroke({color:style.accent,width:2});invalidate();}});
    y+=Math.max(72,detail.height+44);
  };
  text(key("title"),0,0,18,true);y=32;
  const modeTop=y;
  node.addChild(new Graphics({eventMode:"none"}).roundRect(0,y,width,72,8).fill(style.row).stroke({color:style.border,width:1}));
  const modeButton=button(key("mode"),"mode-expand",0,y,width-230,()=>{state.mode=!state.mode;redraw();},false,72);
  modeButton.caption.anchor.x=0;modeButton.caption.position.set(62,25);modeButton.caption.style.fontWeight="600";
  const modeIcon=nativeFluentIcon("window-24-regular",style.accent,22);modeIcon.position.set(25,y+25);node.addChild(modeIcon);
  const description=text(key("modeDescription"),62,y+40,12);description.style.fill=style.muted;
  description.style.wordWrap=true;description.style.wordWrapWidth=width-305;
  const modes=new NativeSegmentedControl(["fullscreen","windowed"].map(value=>({value,label:key(value),id:`native-window:${value}`})),
    d.windowMode.value,value=>{a.setDraftWindowMode(value);redraw();},invalidate,theme);
  modes.position.set(width-modes.controlWidth-48,modeTop+19);node.addChild(modes);controls.push(...modes.controls);
  const chevron=(top:number,expanded:boolean)=>node.addChild(new Graphics({eventMode:"none"})
    .moveTo(width-30,top+34).lineTo(width-25,top+(expanded?29:39)).lineTo(width-20,top+34).stroke({color:style.muted,width:1}));
  chevron(modeTop,state.mode);
  y+=78;
  if(state.mode)toggle(key("titlebar"),key("titlebarDescription"),"titlebar",d.showCustomTitlebar.value,a.setDraftShowCustomTitlebar,d.windowMode.value!=="windowed");
  const expand=button(key("material"),"material-expand",0,y,width,()=>{state.material=!state.material;redraw();},false,72);
  expand.caption.anchor.x=0;expand.caption.x=62;expand.caption.style.fontWeight="600";
  const materialIcon=nativeFluentIcon("color-background-24-regular",style.accent,22);materialIcon.position.set(25,y+25);node.addChild(materialIcon);
  expand.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,width,72,8).fill(style.row).stroke({color:style.border,width:1}),0);
  const summary=`${d.windowEffectMaterial.value==="none"?key("materialNone"):d.windowEffectMaterial.value==="micaAlt"?"Mica Alt":d.windowEffectMaterial.value==="mica"?"Mica":"Acrylic"} · ${key(d.windowEffectAppearance.value)}`;
  const summaryText=text(summary,0,y+28,12);summaryText.style.fill=style.muted;summaryText.x=width-summaryText.width-48;
  chevron(y,state.material);
  y+=78;
  if(state.material){
    const materials=new NativeSegmentedControl(["none","acrylic","mica","micaAlt"].map(value=>({value,
      label:value==="none"?key("materialNone"):value==="micaAlt"?"Mica Alt":value==="mica"?"Mica":"Acrylic",
      id:`native-window:${value}`,disabled:!a.canUseWindowEffectMaterial(value)})),
      d.windowEffectMaterial.value,value=>{a.setDraftWindowEffectMaterial(value);redraw();},invalidate,theme);
    const appearances=new NativeSegmentedControl(["system","light","dark"].map(value=>({value,
      label:key(value),id:`native-window:appearance-${value}`,disabled:d.windowEffectMaterial.value==="none"})),
      d.windowEffectAppearance.value,value=>{a.setDraftWindowEffectAppearance(value);redraw();},invalidate,theme);
    const together=materials.controlWidth+appearances.controlWidth+12<=width-28;
    materials.position.set(together?width-14-materials.controlWidth-appearances.controlWidth-12:width-14-materials.controlWidth,y+6);
    appearances.position.set(width-14-appearances.controlWidth,y+6+(together?0:46));
    node.addChild(materials,appearances);controls.push(...materials.controls,...appearances.controls);
    y+=together?54:100;
    const appearance=d.windowEffectAppearance.value==="system"?options.systemAppearance:d.windowEffectAppearance.value;
    const light=appearance==="light",cardWidth=(width-52)/4,sceneWidth=cardWidth-16,sceneHeight=sceneWidth/1.48;
    const cardsTop=y;
    const cardDescriptions=["none","acrylic","mica","micaAlt"].map(material=>new Text({text:key(`materials.${material}`),eventMode:"none",
      style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:11,lineHeight:15,fill:style.muted,wordWrap:true,wordWrapWidth:sceneWidth}}));
    const cardsHeight=sceneHeight+Math.max(...cardDescriptions.map(description=>description.height))+50;
    for(const [index,material] of (["none","acrylic","mica","micaAlt"] as const).entries()){
      const x=14+index*(cardWidth+8);
      const title=material==="none"?key("materialNone"):material==="micaAlt"?"Mica Alt":material==="mica"?"Mica":"Acrylic";
      const description=cardDescriptions[index]!;
      const active=d.windowEffectMaterial.value===material;
      const card=button(title,`preview-${material}`,x,cardsTop,cardWidth,()=>{a.setDraftWindowEffectMaterial(material);redraw();},active,cardsHeight);
      card.disabled=!a.canUseWindowEffectMaterial(material);card.caption.visible=false;
      card.addChildAt(new Graphics({eventMode:"none"}).roundRect(0.5,0.5,cardWidth-1,cardsHeight-1,8)
        .fill(active?style.selected:style.row).stroke({color:active?style.accent:style.border,alpha:active?0.42:1,width:1}),1);
      if(card.disabled)card.alpha=0.38;
      const preview=new Container({eventMode:"none"});preview.position.set(8,8);card.addChild(preview);
      const clip=new Graphics().roundRect(0,0,sceneWidth,sceneHeight,6).fill(0xffffff);preview.addChild(clip);preview.mask=clip;
      const g=new Graphics();preview.addChild(g);
      const gradient=new FillGradient({start:{x:0,y:0},end:{x:1,y:1},colorStops:[
        {offset:0,color:0x2d78de},{offset:0.38,color:0x1eb9a0},{offset:0.68,color:0xeeb23e},{offset:1,color:0xcb4b5c}]});
      gradients.push(gradient);g.rect(0,0,sceneWidth,sceneHeight).fill(gradient);
      g.ellipse(sceneWidth*0.86,sceneHeight*0.88,sceneWidth*0.32,sceneHeight*0.36).fill({color:0xffffff,alpha:0.16});
      g.ellipse(sceneWidth*0.14,sceneHeight*0.07,sceneWidth*0.26,sceneHeight*0.29).fill({color:0x141c2a,alpha:0.18});
      for(let row=0;row<3;row++)for(let col=0;col<2;col++)g.roundRect(10+col*14,10+row*13,5,5,2).fill({color:0xffffff,alpha:0.74-row*0.12-col*0.2});
      const paneWidth=sceneWidth*0.68,paneHeight=sceneHeight*0.58,px=sceneWidth-paneWidth-9,py=sceneHeight-paneHeight-9;
      if(material==="acrylic"){
        const paneBackdrop=new Container({eventMode:"none"});preview.addChild(paneBackdrop);
        const blurred=g.clone();paneBackdrop.addChild(blurred);
        const blur=new BlurFilter({strength:9,quality:4});blur.repeatEdgePixels=true;
        const saturation=new ColorMatrixFilter();saturation.saturate(0.55,false);
        blurred.filters=[blur,saturation];previewFilters.push(blur,saturation);
        const paneMask=new Graphics({eventMode:"none"}).roundRect(px,py,paneWidth,paneHeight,6).fill(0xffffff);
        paneBackdrop.addChild(paneMask);paneBackdrop.mask=paneMask;
      }
      const pane=new Graphics({eventMode:"none"});preview.addChild(pane);
      const paneColor=material==="none"?(light?0xeef1f6:0x20242d):material==="acrylic"?(light?0xf5f7fa:0x1e2026):material==="mica"?(light?0xecf0f7:0x252932):(light?0xe8ecf4:0x1c1f28);
      pane.roundRect(px,py,paneWidth,paneHeight,6).fill({color:paneColor,alpha:material==="acrylic"?(light?0.58:0.62):material==="none"?1:0.94}).stroke({color:0xffffff,alpha:0.18,width:1});
      const ink=light?0x1c202a:0xffffff;
      pane.roundRect(px+8,py+8,(paneWidth-16)*0.48,6,3).fill({color:ink,alpha:0.74});
      pane.roundRect(px+8,py+20,(paneWidth-16)*0.82,4,2).fill({color:ink,alpha:0.74});
      pane.roundRect(px+8,py+30,(paneWidth-16)*0.54,4,2).fill({color:ink,alpha:0.74});
      const label=new Text({text:title,eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:11,fontWeight:"600",fill:style.text}});
      label.position.set(8,sceneHeight+16);description.position.set(8,sceneHeight+34);card.addChild(label,description);
      if(material!=="none"){
        const appearanceLabel=new Text({text:key(appearance),eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:10,fill:style.muted}});
        appearanceLabel.position.set(cardWidth-8-appearanceLabel.width,sceneHeight+17);card.addChild(appearanceLabel);
      }
    }
    y+=cardsHeight+14;
  }
  return {node,height:y,controls,dispose:()=>{
    for(const filter of previewFilters){
      // Pixi 8.20's composite BlurFilter does not release its two owned passes.
      if(filter instanceof BlurFilter){filter.blurXFilter.destroy();filter.blurYFilter.destroy();}
      filter.destroy();
    }
    for(const gradient of gradients)gradient.destroy();
  }};
}

export function nativeAdvancedWindowSettings(options: Parameters<typeof nativeWindowSettings>[0]): NativeSettingsContent {
  const {settings,width,theme,invalidate,redraw,state}=options,style=nativeSettingsStyle(theme);
  const node=new Container();
  const title=new Text({text:t("settings.interface.advanced.title"),style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:18,fontWeight:"600",fill:style.text}});node.addChild(title);
  const expand=new NativeFluentButton(t("settings.interface.advanced.options"),width,()=>{state.advanced=!state.advanced;redraw();},invalidate,theme,"outline",false,72);
  expand.label="native-window:advanced-expand";expand.y=32;node.addChild(expand);
  expand.caption.anchor.x=0;expand.caption.position.set(62,25);expand.caption.style.fontWeight="600";
  const advancedIcon=nativeFluentIcon("settings-24-regular",style.accent,22);advancedIcon.position.set(25,25);expand.addChild(advancedIcon);
  const advancedDescription=new Text({text:t("settings.interface.advanced.description"),eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,fill:style.muted}});
  advancedDescription.position.set(62,40);expand.addChild(advancedDescription);
  expand.addChild(new Graphics({eventMode:"none"}).moveTo(width-30,34).lineTo(width-25,state.advanced?29:39).lineTo(width-20,34).stroke({color:style.muted,width:1}));
  const controls:NativeSettingsControl[]=[{node:expand,focus:value=>{expand.focused=value;},disabled:()=>false,handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;expand.activate();return true;}}];
  if(state.advanced){
    const label=new Text({text:t("settings.interface.advanced.overscan"),style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:13,fill:style.text}});label.position.set(14,123);node.addChild(label);
    const toggle=new NativeFluentToggle("switch",settings.actions.setDraftFullscreenOverscanEnabled,invalidate,theme);
    toggle.label="native-window:overscan";toggle.checked=settings.draft.fullscreenOverscanEnabled.value;toggle.position.set(width-64,117);node.addChild(toggle);
    const detail=new Text({text:t("settings.interface.advanced.overscanDescription"),style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,fill:style.muted,wordWrap:true,wordWrapWidth:width-100}});detail.position.set(14,148);node.addChild(detail);
    const focus=new Graphics({eventMode:"none"});node.addChild(focus);
    controls.push({node:toggle,disabled:()=>toggle.disabled,focus:active=>{focus.clear();if(active)focus.roundRect(width-68,113,48,32,4).stroke({color:style.accent,width:2});invalidate();},handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;toggle.toggle();return true;}});
    return {node,height:158+detail.height,controls,dispose:()=>{}};
  }
  return {node,height:110,controls,dispose:()=>{}};
}
