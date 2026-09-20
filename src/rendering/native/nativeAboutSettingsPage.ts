import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { createNativeText,NATIVE_UI_FONT_FAMILY } from "./nativeTypography.js";
import { NativeFluentButton,nativeSettingsStyle,type NativeTheme } from "./NativeFluentButton.js";
import type { NativeSettingsContent } from "./NativeSettingsShell.js";
import { NativeSingleLineText } from "./ui/NativeSingleLineText.js";
import { createNativeParagraph } from "./nativeParagraph.js";
import { nativePathIcon } from "./nativeFluentIcons.js";
import { killMotionOf,motion } from "../pixi/animation/motionTween.js";
import { checkRelease,type ReleaseSource,type ReleaseCheckResult } from "../../application/releaseCheck.js";
import { githubMarkSvg } from "../../assets/branding/githubMark.js";
import { PRODUCT } from "../../platform/product.js";
import { t } from "../../native/nativeLocalization.js";

export type NativeAboutPorts={invalidate():void;reflow?():void;openExternalUrl(url:string):void|Promise<void>;releaseSource:ReleaseSource};

export function nativeAboutSettingsPage(width:number,theme:NativeTheme,texture:Texture,ports:NativeAboutPorts):NativeSettingsContent{
  const node=new Container(),style=nativeSettingsStyle(theme),background=new Graphics({eventMode:"none"});
  const font={fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:13,fill:style.text};
  const key=(name:string)=>t(`settings.about.${name}`);
  const measure=(label:string)=>{const text=createNativeText({text:label,style:font});const width=text.width;text.destroy();return width;};
  const checkWidth=Math.ceil(Math.max(...["checkUpdates","checking","viewRelease","retry"].map(name=>measure(key(name))+48)));
  const githubWidth=100,actionsWidth=checkWidth+8+githubWidth;
  const stacked=width<actionsWidth+340,actionsX=width-20-actionsWidth;
  const versionY=stacked?104:30,actionsY=stacked?124:54;
  node.addChild(background);
  const icon=new Sprite({texture,eventMode:"none"});icon.width=icon.height=60;icon.position.set(20,26);node.addChild(icon);
  const title=createNativeText({text:PRODUCT.name,eventMode:"none",style:{...font,fontSize:19,fontWeight:"600"}});title.position.set(96,29);node.addChild(title);
  const description=new NativeSingleLineText(key("description"),{...font,fontSize:12,fill:style.muted},Math.max(1,(stacked?width-20:actionsX-24)-96));
  description.position.set(96,58);node.addChild(description);
  const version=createNativeText({text:t("settings.about.version",{version:PRODUCT.version}),eventMode:"none",style:{...font,fontSize:12,fill:style.muted}});
  version.anchor.set(1,0);version.position.set(width-20,versionY);node.addChild(version);
  let checking=false,disposed=false,result:ReleaseCheckResult|null=null,failed=false;
  let controller:AbortController|null=null,statusText:ReturnType<typeof createNativeParagraph>|null=null;
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const check=new NativeFluentButton(key("checkUpdates"),checkWidth,()=>{void activateCheck();},ports.invalidate,theme,"primary",false,32);
  check.label="native-about:check-updates";check.position.set(actionsX,actionsY);
  const spinner=new Graphics({eventMode:"none",label:"native-about:progress"}).arc(0,0,6,-Math.PI/2,Math.PI).stroke({color:0xffffff,width:1.8,cap:"round"});
  spinner.position.set(17,16);spinner.visible=false;check.addChild(spinner);
  const github=new NativeFluentButton("GitHub",githubWidth,()=>{void openUrl(PRODUCT.repositoryUrl,github);},ports.invalidate,theme,"outline",false,32);
  github.label="native-about:repository";github.position.set(actionsX+checkWidth+8,actionsY);
  const mark=nativePathIcon(githubMarkSvg.match(/ d="([^"]+)"/)![1]!,16,16,style.text,16);
  const githubContentX=(githubWidth-16-8-github.caption.width)/2;
  mark.position.set(githubContentX,8);github.caption.x=githubContentX+24+github.caption.width/2;github.addChild(mark);
  node.addChild(check,github);
  const page:NativeSettingsContent={node,height:actionsY+52,controls:[check,github].map(button=>({node:button,
    disabled:()=>button.disabled||(button===check&&checking),focus:active=>{button.focused=active;},
    handleKey:key=>{if(key!=="Enter"&&key!==" ")return false;button.activate();return true;}})),
    update:()=>{},dispose:cleanup};
  function cleanup(){if(disposed)return;disposed=true;controller?.abort();clearTimeout(timeout);killMotionOf(spinner);}
  node.on("destroyed",cleanup);
  function status(message:string,error=false,refresh=true){
    statusText?.destroy();statusText=null;
    let height=actionsY+52;
    if(message){
      statusText=createNativeParagraph(message,{...font,fontSize:12,lineHeight:18,align:"right",fill:error?(theme==="dark"?"#ffb4a9":"#b10e1c"):style.muted},width-actionsX-20);
      statusText.anchor.x=1;statusText.label="native-about:status";statusText.position.set(width-20,actionsY+42);node.addChild(statusText);height=statusText.y+statusText.height+18;
    }
    page.height=height;background.clear().roundRect(.5,.5,width-1,height-1,8).fill(style.row).stroke({color:style.border,width:1});
    if(refresh)ports.reflow?.();ports.invalidate();
  }
  async function openUrl(url:string,button:NativeFluentButton){
    button.disabled=true;
    try{await ports.openExternalUrl(url);}catch{if(!disposed)status(key("openFailed"),true);}
    finally{if(!disposed){button.disabled=false;ports.invalidate();}}
  }
  async function activateCheck(){
    if(checking||disposed)return;
    if(result?.status==="available"){await openUrl(result.release.releaseUrl,check);return;}
    checking=true;failed=false;check.busy=true;check.cursor="default";check.caption.text=key("checking");check.caption.x=checkWidth/2+9;
    spinner.visible=true;spinner.rotation=0;
    motion(spinner).duration(0.9).ease("none").to({rotation:Math.PI*2,repeat:-1,onUpdate:ports.invalidate}).start();
    status(key("checkingDetail"));controller=new AbortController();const active=controller;
    timeout=setTimeout(()=>active.abort(),10000);
    try{
      result=await checkRelease(PRODUCT.version,ports.releaseSource,active.signal);
      if(disposed)return;
      status(result.status==="available"?t("settings.about.updateAvailable",{version:result.release.version}):key(result.status==="current"?"upToDate":"noRelease"));
    }catch{if(!disposed){failed=true;result=null;status(key("checkFailed"),true);}}
    finally{
      clearTimeout(timeout);killMotionOf(spinner);controller=null;
      if(!disposed){checking=false;check.busy=false;check.cursor="pointer";spinner.visible=false;check.caption.x=checkWidth/2;
        check.caption.text=key(failed?"retry":result?.status==="available"?"viewRelease":"checkUpdates");ports.invalidate();}
    }
  }
  status("",false,false);return page;
}
