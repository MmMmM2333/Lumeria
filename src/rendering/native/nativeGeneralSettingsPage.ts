import { nativeHotCornerSettings } from "./nativeHotCornerSettings.js";
import { createNativeText } from "./nativeTypography.js";
import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { createLaunchpadSettings } from "../../application/launchpadSettings.js";
import { NativeFluentButton, nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import { nativeFluentIcon } from "./nativeFluentIcons.js";
import { NativeFluentToggle } from "./NativeFluentToggle.js";
import type { NativeManagement } from "./NativeManagement.js";
import type { NativeSettingsContent, NativeSettingsControl } from "./NativeSettingsShell.js";
import { NATIVE_UI_FONT_FAMILY as PIXI_UI_FONT_FAMILY } from "./nativeTypography.js";
import { t, nativeLocaleOptions } from "../../native/nativeLocalization.js";
import { formatMainWindowShortcut, DEFAULT_MAIN_WINDOW_SHORTCUT } from "../../domain/mainWindowShortcut.js";
import { LAUNCHPAD_ICON_VARIANTS, type LaunchpadIconVariant } from "../../domain/launchpadIconVariant.js";
import { NativeSettingsLayout, nativeSettingsChevron } from "./nativeSettingsLayout.js";
import { nativeUiMetrics } from "./ui/nativeUiTheme.js";
import { nativeRowSummary } from "./ui/nativeRowSummary.js";
import { NativeSingleLineText } from "./ui/NativeSingleLineText.js";

type Options={
  settings:ReturnType<typeof createLaunchpadSettings>;width:number;theme:NativeTheme;
  management:NativeManagement;invalidate():void;redraw():void;
  recording:boolean;record():void;expanded:boolean;expand():void;hotCornersExpanded:boolean;expandHotCorners():void;
  icons:ReadonlyMap<LaunchpadIconVariant,Texture>;
  openLogs():void;
};
export function nativeGeneralSettingsPage(options:Options):NativeSettingsContent{
  const {settings,width,theme}=options,style=nativeSettingsStyle(theme),node=new Container();
  const controls:NativeSettingsControl[]=[];
  const layout=new NativeSettingsLayout(node,width,theme);
  let y=0;
  const text=(value:string,x:number,y:number,size=13,bold=false)=>{
    const result=createNativeText({text:value,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:size,fontWeight:bold?"600":"400",fill:style.text}});
    result.position.set(x,y);result.eventMode="none";return result;
  };
  const rowIcons=["power-24-regular","keyboard-24-regular","local-language-24-regular","rocket-24-regular","window-dev-tools-24-regular"] as const;
  let rowIndex=0;
  const row=(title:string,description="",height=72)=>{
    const result=new Container();result.y=y;y+=height+6;node.addChild(result);
    result.addChild(new Graphics({eventMode:"none"}).roundRect(0,0,width,height,8).fill(style.row).stroke({color:style.border,width:1}));
    const icon=nativeFluentIcon(rowIcons[rowIndex++]!,style.accent,22);icon.position.set(23,(height-22)/2);result.addChild(icon);
    result.addChild(text(title,70,description?17:(height-17)/2,13,true));
    if(description){const label=new NativeSingleLineText(description,{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12,lineHeight:16.2,fill:style.muted},Math.max(80,width-420));label.position.set(70,38);result.addChild(label);}
    return result;
  };
  const button=(parent:Container,label:string,x:number,y:number,w:number,action:()=>void,height=34)=>{
    const button=new NativeFluentButton(label,w,action,options.invalidate,theme,height===72?"settings-row":"outline",false,height);
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
  const startup=row(t("settings.general.startup.title"));
  const startupTitle=startup.children.find(child=>child instanceof Text) as Text;
  const startupError=new NativeSingleLineText("",{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12,lineHeight:16.2,fill:style.muted},Math.max(80,width-150));
  startupError.position.set(70,38);startup.addChild(startupError);
  const toggle=new NativeFluentToggle("switch",value=>settings.actions.setDraftLaunchAtLogin(value),options.invalidate,theme);
  toggle.label="native-setting:autostart";toggle.checked=settings.draft.launchAtLogin.value;
  toggle.disabled=!settings.presentation.canConfigureLaunchAtLogin.value||settings.presentation.isRefreshingLaunchAtLogin.value;
  toggle.position.set(width-56,20);startup.addChild(toggle);
  const toggleFocus=new Graphics({eventMode:"none"});startup.addChild(toggleFocus);
  controls.push({node:toggle,focus:active=>{toggleFocus.clear();if(active)toggleFocus.roundRect(width-60,22,48,28,4).stroke({color:style.accent,width:2});options.invalidate();},
    disabled:()=>toggle.disabled,handleKey:key=>{if(key!==" "&&key!=="Enter")return false;toggle.toggle();return true;}});
  const shortcut=row(t("settings.general.shortcut.title"),settings.presentation.mainWindowShortcutError.value||t(options.recording?"settings.general.shortcut.recordingHint":"settings.general.shortcut.hint"),72);
  const shortcutValue=settings.draft.mainWindowShortcut.value;
  const value=shortcutValue===null?t("settings.general.shortcut.notSet"):formatMainWindowShortcut(shortcutValue);
  const keyMeasure=createNativeText({text:value,style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:12}});
  const keyWidth=Math.max(112,keyMeasure.width+44);keyMeasure.destroy();
  const keyField=button(shortcut,value,width-222-keyWidth,19,keyWidth,options.record);
  keyField.label="native-setting:shortcut";keyField.caption.x-=10;keyField.caption.style.fontSize=12;
  keyField.background.visible=false;
  keyField.addChildAt(new Graphics({eventMode:"none"}).roundRect(0,0,keyWidth,32,6)
    .fill(theme==="dark"?"rgba(0,0,0,0.18)":"rgba(0,0,0,0.035)").stroke({color:theme==="dark"?"rgba(255,255,255,0.16)":style.border,width:1}),0);
  keyField.caption.alpha=0.64;keyField.caption.y=16;
  button(shortcut,t(options.recording?"settings.general.shortcut.recording":"settings.general.shortcut.record"),width-214,19,94,options.record);
  button(shortcut,t("common.actions.reset"),width-112,19,94,()=>{settings.actions.setDraftMainWindowShortcut(DEFAULT_MAIN_WINDOW_SHORTCUT);options.redraw();}).disabled=shortcutValue===DEFAULT_MAIN_WINDOW_SHORTCUT;
  if(settings.draft.mainWindowShortcut.value!==null){
    const clear=new NativeFluentButton("",22,()=>{settings.actions.setDraftMainWindowShortcut(null);options.redraw();},options.invalidate,theme,"subtle",false,22);
    clear.label="native-setting:clear-shortcut";clear.position.set(keyWidth-27,5);keyField.addChild(clear);
    const icon=nativeFluentIcon("dismiss-16-regular",style.muted,12);icon.position.set(5,5);clear.addChild(icon);
    controls.push({node:clear,focus:active=>{clear.focused=active;},disabled:()=>clear.disabled,handleKey:key=>{if(key!==" "&&key!=="Enter")return false;clear.activate();return true;}});
  }
  const hotCorners=nativeHotCornerSettings(settings,width,theme,options.management,options.invalidate,options.redraw,options.hotCornersExpanded,options.expandHotCorners);
  hotCorners.node.y=y;node.addChild(hotCorners.node);controls.push(...hotCorners.controls);layout.child(hotCorners);y+=hotCorners.height+6;
  const language=row(t("settings.general.language.title"),settings.presentation.localePreferenceError.value);
  const languages=[{value:"system",label:t("settings.general.language.system")},...nativeLocaleOptions];
  const current=languages.find(item=>item.value===settings.draft.localePreference.value)!;
  const selector=button(language,current.label,width-188,19,172,()=>{
    activeLine.clear().moveTo(2,33).lineTo(170,33).stroke({color:style.accent,width:2});
    const point=selector.toGlobal({x:0,y:36});
    options.management.menu(point.x,point.y,languages.map(item=>({label:item.label,selected:item.value===settings.draft.localePreference.value,run:()=>{
      settings.actions.setDraftLocalePreference(item.value);options.redraw();
    }})),176,{restore:()=>{if(!selector.destroyed){activeLine.clear();selector.focused=true;options.invalidate();}}});
  });
  const activeLine=new Graphics({eventMode:"none"});selector.addChild(activeLine);
  selector.label="native-setting:language";
  selector.caption.anchor.x=0;selector.caption.x=10;chevron(selector,156,17);
  const iconRow=row(t("settings.general.launchpadIcon.title"),t("settings.general.launchpadIcon.description"),72);
  const iconLabel=t(`settings.general.launchpadIcon.options.${settings.draft.launchpadIconVariant.value}`);
  const expandButton=button(iconRow,"",0,0,width,options.expand,72);
  iconRow.removeChildAt(0).destroy();iconRow.setChildIndex(expandButton,0);
  expandButton.label="native-setting:icon-expand";
  const summary=nativeRowSummary(iconRow,iconLabel,width,28,theme,"native-setting:icon-summary");
  const description=iconRow.children.find(child=>child instanceof NativeSingleLineText&&child!==summary) as NativeSingleLineText|undefined;
  description?.setAvailableWidth(Math.max(80,width-70-summary.width-59));
  const iconChevron=nativeSettingsChevron(iconRow,width-26,36,style.muted);
  y-=6;
  const sectionStart=node.children.length,sectionTop=y,sectionControls=controls.length;
  {
    const gap=8,tileWidth=(width-28-gap*3)/4;
    for(const [index,variant] of LAUNCHPAD_ICON_VARIANTS.entries()){
      const tile=new NativeFluentButton("",tileWidth,()=>select(),options.invalidate,theme,"option",false,152);
      tile.label=`native-setting:icon-${variant}`;
      tile.position.set(14+index*(tileWidth+gap),y);
      const selected=variant===settings.draft.launchpadIconVariant.value;
      tile.selected=selected;
      const icon=new Sprite(options.icons.get(variant));icon.width=icon.height=Math.min(128,tileWidth-16);icon.position.set((tileWidth-icon.width)/2,(152-icon.height)/2);tile.addChild(icon);
      const select=()=>{if(!settings.presentation.canCustomizeLaunchpadIcon.value)return;settings.actions.setDraftLaunchpadIconVariant(variant);options.redraw();};
      tile.disabled=!settings.presentation.canCustomizeLaunchpadIcon.value;tile.alpha=tile.disabled?0.52:1;node.addChild(tile);
      const ring=new Graphics({eventMode:"none"});tile.addChild(ring);
      controls.push({node:tile,focus:active=>{ring.clear();if(active)ring.roundRect(2,2,tileWidth-4,148,6).stroke({color:style.accent,width:2});options.invalidate();},
        disabled:()=>!settings.presentation.canCustomizeLaunchpadIcon.value,handleKey:key=>{if(key!==" "&&key!=="Enter")return false;select();return true;}});
    }
    y+=152;
  }
  layout.disclosure("general.icons",options.expanded,sectionStart,sectionTop,y-sectionTop,controls.slice(sectionControls),iconChevron,true,expandButton);
  y+=nativeUiMetrics.sectionGap;const advanced=text(t("settings.general.advanced.title"),0,y,18,true);node.addChild(advanced);y+=advanced.height+nativeUiMetrics.headingGap;
  const developer=row(t("native.tray.logs"));
  button(developer,t("native.tray.logs"),width-170,19,154,options.openLogs).label="native-setting:open-logs";
  const update=()=>{
    const error=settings.presentation.launchAtLoginError.value;
    startupTitle.y=17;
    startupError.setValue(error||t("settings.general.startup.description"));startupError.visible=true;
    if(toggle.checked!==settings.draft.launchAtLogin.value)toggle.checked=settings.draft.launchAtLogin.value;
    toggle.disabled=!settings.presentation.canConfigureLaunchAtLogin.value||settings.presentation.isRefreshingLaunchAtLogin.value;
  };
  update();
  return {node,height:y,controls,layout:layout.finish(y),update,dispose:()=>{}};
}
