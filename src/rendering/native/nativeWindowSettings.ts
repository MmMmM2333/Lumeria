import { BlurFilter, ColorMatrixFilter, Container, FillGradient, Graphics, Text } from "pixi.js";
import type { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import { t } from "../../native/nativeLocalization.js";
import { NativeFluentButton, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { NativeFluentToggle } from "./NativeFluentToggle.js";
import { NativeSegmentedControl } from "./NativeSegmentedControl.js";
import { NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import type { NativeSettingsContent, NativeSettingsControl } from "./NativeSettingsShell.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { NativeSettingsLayout, nativeSettingsChevron } from "./nativeSettingsLayout.js";
import { nativeRowSummary } from "./ui/nativeRowSummary.js";
import { NativeSingleLineText } from "./ui/NativeSingleLineText.js";

export type NativeWindowPanelState = { mode: boolean; material: boolean; advanced: boolean };
export function nativeWindowSettings(options: {
  settings: ReturnType<typeof createLaunchpadSettings>; width: number; theme: NativeTheme; systemAppearance:NativeTheme;
  state: NativeWindowPanelState; invalidate(): void; redraw(): void;
}): NativeSettingsContent {
  const { settings, width, theme, state, invalidate, redraw } = options;
  const node = new Container(), controls: NativeSettingsControl[] = [];
  const layout=new NativeSettingsLayout(node,width,theme);
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
    const control = new NativeFluentButton(title, w, run, invalidate, theme, h===72?"settings-row":"subtle", false, h);
    control.label = `native-window:${id}`; control.position.set(x, top); node.addChild(control);
    if (active) control.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,w,h,8).fill(style.selected),1);
    controls.push({node:control,focus:value=>{control.focused=value;},disabled:()=>control.disabled,
      handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;control.activate();return true;}});
    return control;
  };
  const toggle = (title: string, description: string, id: string, value: boolean, change: (value:boolean)=>void, disabled=false) => {
    const start=node.children.length,top=y;
    text(title,26,y+12,13,true);
    const detail=text(description,26,y+32,12);detail.style.fill=style.muted;detail.style.wordWrap=true;detail.style.wordWrapWidth=width-122;
    const rowHeight=Math.max(62,detail.height+44);
    const background=new Graphics({eventMode:"none"}).roundRect(14,y,width-28,rowHeight,6).fill(style.row).stroke({color:style.border,width:1});node.addChildAt(background,start);
    const control=new NativeFluentToggle("switch",change,invalidate,theme);
    control.label=`native-window:${id}`;control.checked=value;control.disabled=disabled;control.position.set(width-66,y+(rowHeight-32)/2);node.addChild(control);
    const focus=new Graphics({eventMode:"none"});node.addChild(focus);
    controls.push({node:control,disabled:()=>control.disabled,handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;control.toggle();return true;},
      focus:active=>{focus.clear();if(active)focus.roundRect(width-68,top+14,48,32,4).stroke({color:style.accent,width:2});invalidate();}});
    const row=new Container({label:`native-window:${id}-row`,eventMode:"passive"});row.addChild(...node.removeChildren(start));row.alpha=disabled?0.68:1;node.addChild(row);
    y+=rowHeight;
  };
  text(key("title"),0,0,18,true);y=32;
  const modeTop=y;
  const modeButton=button(key("mode"),"mode-expand",0,y,width,()=>{state.mode=!state.mode;redraw();},false,72);
  modeButton.caption.anchor.x=0;modeButton.caption.position.set(70,25);modeButton.caption.style.fontWeight="600";
  const modeIcon=nativeFluentIcon("window-24-regular",style.accent,22);modeIcon.position.set(25,y+25);node.addChild(modeIcon);
  const description=new NativeSingleLineText(key("modeDescription"),{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,lineHeight:16.2,fill:style.muted},Math.max(80,width-305));description.position.set(70,y+40);node.addChild(description);
  const modes=new NativeSegmentedControl(["fullscreen","windowed"].map(value=>({value,label:key(value),id:`native-window:${value}`})),
    d.windowMode.value,value=>{a.setDraftWindowMode(value);redraw();},invalidate,theme);
  modes.position.set(width-modes.controlWidth-48,modeTop+19);node.addChild(modes);controls.push(...modes.controls);
  modes.on("pointerover",()=>{modeButton.hovered=true;});modes.on("pointerout",()=>{modeButton.hovered=false;});
  const modeChevron=nativeSettingsChevron(node,width-25,modeTop+36,style.muted);
  y+=72;
  const modeStart=node.children.length,modeBody=y,modeControls=controls.length;
  toggle(key("titlebar"),key("titlebarDescription"),"titlebar",d.showCustomTitlebar.value,a.setDraftShowCustomTitlebar,d.windowMode.value!=="windowed");
  layout.disclosure("window.mode",state.mode,modeStart,modeBody,y-modeBody,controls.slice(modeControls),modeChevron,true,modeButton);
  y+=6;
  const expand=button(key("material"),"material-expand",0,y,width,()=>{state.material=!state.material;redraw();},false,72);
  expand.caption.anchor.x=0;expand.caption.x=70;expand.caption.style.fontWeight="600";
  const materialIcon=nativeFluentIcon("color-background-24-regular",style.accent,22);materialIcon.position.set(25,y+25);node.addChild(materialIcon);
  const summary=`${d.windowEffectMaterial.value==="none"?key("materialNone"):d.windowEffectMaterial.value==="micaAlt"?"Mica Alt":d.windowEffectMaterial.value==="mica"?"Mica":"Acrylic"} · ${key(d.windowEffectAppearance.value)}`;
  nativeRowSummary(node,summary,width,y+28,theme,"native-window:material-summary");
  const materialChevron=nativeSettingsChevron(node,width-25,y+36,style.muted);
  y+=72;
  const materialStart=node.children.length,materialTop=y,materialControls=controls.length;
  {
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
  layout.disclosure("window.material",state.material,materialStart,materialTop,y-materialTop,controls.slice(materialControls),materialChevron,true,expand);
  y+=6;
  return {node,height:y,controls,layout:layout.finish(y),dispose:()=>{
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
  const layout=new NativeSettingsLayout(node,width,theme);
  const title=new Text({text:t("settings.interface.advanced.title"),style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:18,fontWeight:"600",fill:style.text}});node.addChild(title);
  const expand=new NativeFluentButton(t("settings.interface.advanced.options"),width,()=>{state.advanced=!state.advanced;redraw();},invalidate,theme,"settings-row",false,72);
  expand.label="native-window:advanced-expand";expand.y=32;node.addChild(expand);
  expand.caption.anchor.x=0;expand.caption.position.set(62,25);expand.caption.style.fontWeight="600";
  const advancedIcon=nativeFluentIcon("settings-24-regular",style.accent,22);advancedIcon.position.set(25,25);expand.addChild(advancedIcon);
  const advancedDescription=new Text({text:t("settings.interface.advanced.description"),eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,fill:style.muted}});
  advancedDescription.position.set(62,40);expand.addChild(advancedDescription);
  const chevron=nativeSettingsChevron(expand,width-25,36,style.muted);
  const controls:NativeSettingsControl[]=[{node:expand,focus:value=>{expand.focused=value;},disabled:()=>false,handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;expand.activate();return true;}}];
  const start=node.children.length;
  {
    const label=new Text({text:t("settings.interface.advanced.overscan"),style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:13,fill:style.text}});label.position.set(14,123);node.addChild(label);
    const toggle=new NativeFluentToggle("switch",settings.actions.setDraftFullscreenOverscanEnabled,invalidate,theme);
    toggle.label="native-window:overscan";toggle.checked=settings.draft.fullscreenOverscanEnabled.value;toggle.position.set(width-64,117);node.addChild(toggle);
    const detail=new Text({text:t("settings.interface.advanced.overscanDescription"),style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:12,fill:style.muted,wordWrap:true,wordWrapWidth:width-100}});detail.position.set(14,148);node.addChild(detail);
    const focus=new Graphics({eventMode:"none"});node.addChild(focus);
    controls.push({node:toggle,disabled:()=>toggle.disabled,focus:active=>{focus.clear();if(active)focus.roundRect(width-68,113,48,32,4).stroke({color:style.accent,width:2});invalidate();},handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;toggle.toggle();return true;}});
    const height=158+detail.height;
    layout.disclosure("window.advanced",state.advanced,start,110,height-110,controls.slice(1),chevron);
    return {node,height,controls,layout:layout.finish(height),dispose:()=>{}};
  }
}
