import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import { nativeFluentTheme, type NativeTheme } from "./NativeFluentButton.js";
import type { NativeSettingsContent } from "./NativeSettingsShell.js";
import { NATIVE_UI_FONT_FAMILY as PIXI_UI_FONT_FAMILY } from "./nativeTypography.js";
import { t } from "../../native/nativeLocalization.js";
import packageInfo from "../../../package.json";

export function nativeAboutSettingsPage(width:number,theme:NativeTheme,texture:Texture):NativeSettingsContent{
  const node=new Container(),colors=nativeFluentTheme(theme);
  node.addChild(new Graphics({eventMode:"none"}).roundRect(0,0,width,96,4)
    .fill(colors.colorNeutralBackground1).stroke({color:colors.colorNeutralStroke2,width:1}));
  const icon=new Sprite(texture);icon.width=48;icon.height=48;icon.position.set(20,24);node.addChild(icon);
  const title=new Text({text:"Lumeria",style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:18,fontWeight:"600",fill:colors.colorNeutralForeground1}});
  title.position.set(84,24);node.addChild(title);
  const description=new Text({text:t("settings.about.description"),style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,fill:colors.colorNeutralForeground2}});
  description.position.set(84,52);node.addChild(description);
  const version=new Text({text:t("settings.about.version",{version:packageInfo.version}),style:{fontFamily:[...PIXI_UI_FONT_FAMILY],fontSize:13,fill:colors.colorNeutralForeground2}});
  version.anchor.set(1,0.5);version.position.set(width-20,48);node.addChild(version);
  return {node,height:96,controls:[],dispose:()=>{}};
}
