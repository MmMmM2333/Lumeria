import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import { NativeFluentButton, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { NativeFluentToggle } from "./NativeFluentToggle.js";
import type { NativeManagement } from "./NativeManagement.js";
import type { NativeSettingsContent, NativeSettingsControl } from "./NativeSettingsShell.js";
import { PIXI_UI_FONT_FAMILY } from "../typography.js";
import { t, nativeLocaleOptions } from "../../native/nativeLocalization.js";
import { formatMainWindowShortcut, DEFAULT_MAIN_WINDOW_SHORTCUT } from "../../domain/mainWindowShortcut.js";
import { LAUNCHPAD_ICON_VARIANTS, type LaunchpadIconVariant } from "../../domain/launchpadIconVariant.js";

type Options={
  settings:ReturnType<typeof createLaunchpadSettings>;width:number;theme:NativeTheme;
  management:NativeManagement;invalidate():void;redraw():void;
  recording:boolean;record():void;expanded:boolean;expand():void;
  icons:ReadonlyMap<LaunchpadIconVariant,Texture>;
};
export function nativeGeneralSettingsPage(options:Options):NativeSettingsContent{
  const {settings,width,theme}=options,style=nativeSettingsStyle(theme),node=new Container();
  const controls:NativeSettingsControl[]=[];
  let y=0;
  const text=(value:string,x:number,y:number,size=13,bold=false)=>{
    const result=new Text({text:value,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:size,fontWeight:bold?"600":"400",fill:style.text}});
    result.position.set(x,y);result.eventMode="none";return result;
  };
  const rowIcons=["power-24-regular","keyboard-24-regular","local-language-24-regular","rocket-24-regular","window-dev-tools-24-regular"] as const;
  let rowIndex=0;
  const row=(title:string,description="",height=72)=>{
    const result=new Container();result.y=y;y+=height+6;node.addChild(result);
    result.addChild(new Graphics({eventMode:"none"}).roundRect(0,0,width,height,8).fill(style.row).stroke({color:style.border,width:1}));
    const icon=nativeFluentIcon(rowIcons[rowIndex++]!,style.accent,22);icon.position.set(23,(height-22)/2);result.addChild(icon);
    result.addChild(text(title,70,description?17:(height-17)/2,13,true));
    if(description){const label=text(description,70,38,12);label.style.fill=style.muted;label.style.wordWrap=true;label.style.wordWrapWidth=Math.max(80,width-420);result.addChild(label);}
    return result;
  };
  const button=(parent:Container,label:string,x:number,y:number,w:number,action:()=>void)=>{
    const button=new NativeFluentButton(label,w,action,options.invalidate,theme);
    button.position.set(x,y);parent.addChild(button);
    controls.push({node:button,focus:active=>{button.focused=active;},disabled:()=>button.disabled,
      handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;button.activate();return true;}});
    return button;
  };
  const chevron=(parent:Container,x:number,y:number,up=false)=>{
    const mark=new Graphics({eventMode:"none"});
    mark.moveTo(-4,up?2:-2).lineTo(0,up?-2:2).lineTo(4,up?2:-2).stroke({color:style.text,width:1.25});
    mark.position.set(x,y);parent.addChild(mark);
  };
  const startup=row(t("settings.general.startup.title"),settings.presentation.launchAtLoginError.value);
  const toggle=new NativeFluentToggle("switch",value=>settings.actions.setDraftLaunchAtLogin(value),options.invalidate,theme);
  toggle.label="native-setting:autostart";toggle.checked=settings.draft.launchAtLogin.value;
  toggle.disabled=!settings.presentation.canConfigureLaunchAtLogin.value||settings.presentation.isRefreshingLaunchAtLogin.value;
  toggle.position.set(width-56,20);startup.addChild(toggle);
  const toggleFocus=new Graphics({eventMode:"none"});startup.addChild(toggleFocus);
  controls.push({node:toggle,focus:active=>{toggleFocus.clear();if(active)toggleFocus.roundRect(width-60,22,48,28,4).stroke({color:style.accent,width:2});options.invalidate();},
    disabled:()=>toggle.disabled,handleKey:key=>{if(key!==" "&&key!=="Enter")return false;toggle.toggle();return true;}});
  const shortcut=row(t("settings.general.shortcut.title"),settings.presentation.mainWindowShortcutError.value||t(options.recording?"settings.general.shortcut.recordingHint":"settings.general.shortcut.hint"),88);
  const shortcutValue=settings.draft.mainWindowShortcut.value;
  const value=shortcutValue===null?t("settings.general.shortcut.notSet"):formatMainWindowShortcut(shortcutValue);
  const keyField=button(shortcut,value,width-342,27,154,options.record);
  keyField.label="native-setting:shortcut";
  button(shortcut,t(options.recording?"settings.general.shortcut.recording":"settings.general.shortcut.record"),width-180,27,78,options.record);
  button(shortcut,t("common.actions.reset"),width-94,27,78,()=>{settings.actions.setDraftMainWindowShortcut(DEFAULT_MAIN_WINDOW_SHORTCUT);options.redraw();});
  if(settings.draft.mainWindowShortcut.value!==null){
    const clear=button(shortcut,"×",width-215,29,24,()=>{settings.actions.setDraftMainWindowShortcut(null);options.redraw();});clear.label="native-setting:clear-shortcut";
  }
  const language=row(t("settings.general.language.title"),settings.presentation.localePreferenceError.value);
  const languages=[{value:"system",label:t("settings.general.language.system")},...nativeLocaleOptions];
  const current=languages.find(item=>item.value===settings.draft.localePreference.value)!;
  const selector=button(language,current.label,width-232,19,216,()=>{
    const point=selector.toGlobal({x:0,y:36});
    options.management.menu(point.x,point.y,languages.map(item=>({label:item.label,selected:item.value===settings.draft.localePreference.value,run:()=>{
      settings.actions.setDraftLocalePreference(item.value);options.redraw();
    }})),216);
  });
  selector.label="native-setting:language";
  selector.caption.x-=10;chevron(selector,200,17);
  const iconRow=row(t("settings.general.launchpadIcon.title"),t("settings.general.launchpadIcon.description"),88);
  const iconLabel=t(`settings.general.launchpadIcon.options.${settings.draft.launchpadIconVariant.value}`);
  const expandButton=button(iconRow,iconLabel,width-196,27,180,options.expand);
  expandButton.label="native-setting:icon-expand";expandButton.caption.x-=10;chevron(expandButton,164,17,options.expanded);
  if(options.expanded){
    const gap=8,tileWidth=(width-28-gap*3)/4;
    for(const [index,variant] of LAUNCHPAD_ICON_VARIANTS.entries()){
      const tile=new Container({label:`native-setting:icon-${variant}`,eventMode:"static",cursor:"pointer"});
      tile.position.set(14+index*(tileWidth+gap),y);
      const selected=variant===settings.draft.launchpadIconVariant.value;
      tile.addChild(new Graphics({eventMode:"none"}).roundRect(0,0,tileWidth,152,8).fill(selected?style.selected:style.row).stroke({color:selected?style.accent:style.border,width:selected?2:1}));
      const icon=new Sprite(options.icons.get(variant));icon.width=icon.height=Math.min(128,tileWidth-16);icon.position.set((tileWidth-icon.width)/2,(152-icon.height)/2);tile.addChild(icon);
      const select=()=>{if(!settings.presentation.canCustomizeLaunchpadIcon.value)return;settings.actions.setDraftLaunchpadIconVariant(variant);options.redraw();};
      tile.on("pointertap",select);node.addChild(tile);
      const ring=new Graphics({eventMode:"none"});tile.addChild(ring);
      controls.push({node:tile,focus:active=>{ring.clear();if(active)ring.roundRect(2,2,tileWidth-4,148,6).stroke({color:style.accent,width:2});options.invalidate();},
        disabled:()=>!settings.presentation.canCustomizeLaunchpadIcon.value,handleKey:key=>{if(key!==" "&&key!=="Enter")return false;select();return true;}});
    }
    y+=160;
  }
  y+=20;const advanced=text(t("settings.general.advanced.title"),0,y,13,true);node.addChild(advanced);y+=30;
  const developer=row(t("settings.general.advanced.developerConsole"),t("settings.general.advanced.openUnavailable"));
  button(developer,t("settings.general.advanced.open"),width-132,19,116,()=>{}).disabled=true;
  return {node,height:y,controls,dispose:()=>{}};
}
