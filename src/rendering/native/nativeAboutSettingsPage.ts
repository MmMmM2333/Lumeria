import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import { nativeFluentTheme,nativeSettingsStyle, type NativeTheme } from "./NativeFluentButton.js";
import type { NativeSettingsContent } from "./NativeSettingsShell.js";
import { NATIVE_UI_FONT_FAMILY as PIXI_UI_FONT_FAMILY } from "./nativeTypography.js";
import { t } from "../../native/nativeLocalization.js";
import packageInfo from "../../../package.json";
import { NativeSingleLineText } from "./ui/NativeSingleLineText.js";

export function nativeAboutSettingsPage(width:number,theme:NativeTheme,texture:Texture):NativeSettingsContent{
  const node=new Container(),colors=nativeFluentTheme(theme),style=nativeSettingsStyle(theme);
  node.addChild(new Graphics({eventMode:"none"}).roundRect(0.5,0.5,width-1,85,8)
    .fill(style.row).stroke({color:style.border,width:1}));
  const icon=new Sprite(texture);icon.width=60;icon.height=60;icon.position.set(15,13);node.addChild(icon);
  const title=new Text({text:"Lumeria",style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:18,fontWeight:"600",fill:colors.colorNeutralForeground1}});
  title.position.set(87,21);node.addChild(title);
  const description=new NativeSingleLineText(t("settings.about.description"),{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,fill:style.muted},Math.max(60,width-200));
  description.position.set(87,47);node.addChild(description);
  const version=new Text({text:t("settings.about.version",{version:packageInfo.version}),style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,fill:colors.colorNeutralForeground2}});
  version.anchor.set(1,0.5);version.position.set(width-15,43);node.addChild(version);
  return {node,height:86,controls:[],dispose:()=>{}};
}
