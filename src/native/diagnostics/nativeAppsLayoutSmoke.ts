import assert from "node:assert/strict";
import { Container, Graphics } from "pixi.js";
import { NativeAppDialogs } from "../../rendering/native/NativeAppDialogs.js";
import { NativeModalPanel } from "../../rendering/native/NativeModalPanel.js";
import { NativeScrollView } from "../../rendering/native/NativeScrollView.js";
import { NativeFluentButton } from "../../rendering/native/NativeFluentButton.js";
import { NativeVirtualList } from "../../rendering/native/ui/NativeVirtualList.js";
import { nativeAdvancedWindowSettings } from "../../rendering/native/nativeWindowSettings.js";
import type { NativeSettingsSmokeContext } from "./nativeSettingsSmoke.test.js";
import { getNativeLocale,setNativeLocale } from "../nativeLocalization.js";

/** Render the real Native controls with a large, isolated scan-result fixture. */
export async function runNativeAppsLayoutSmoke(context:NativeSettingsSmokeContext):Promise<void>{
  const {app,appDialogs,settings,capture,present}=context;
  const original=appDialogs()!.options;
  const locale=getNativeLocale();setNativeLocale("zh-CN");
  const items=Array.from({length:300},(_,index)=>({id:`scan-layout-${index}`,type:"app" as const,name:`Uninstall ${index}`,emoji:"L"}));
  let activeTab="ignored",selected:string[]=[];
  let panel:NativeModalPanel|null=null;
  const current=():NativeModalPanel=>{assert.ok(panel);return panel;};
  const refresh=()=>panel?.refresh();
  const model={
    ...original.apps.scanResultModel,
    activeTab:{get value(){return activeTab;}},apps:{value:items},keywordExcludedApps:{value:items.map(app=>({app,matchedKeyword:"uninstall"}))},
    selectedIds:{get value(){return selected;}},selectedCount:{get value(){return selected.length;}},warnings:{value:[]},stats:{value:null},canAdd:{value:true},
    getLaunchTargetPath:()=>"C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Example\\Uninstall.lnk",
    actions:{selectTab:(tab:string)=>{activeTab=tab;refresh();},selectAll:()=>{selected=items.map(app=>app.id);refresh();},clearSelection:()=>{selected=[];refresh();},
      toggleSelection:(id:string,checked:boolean)=>{selected=checked?[...selected,id]:selected.filter(value=>value!==id);refresh();},
      manageKeywords:()=>{},close:()=>{},addSelected:()=>{}},
  };
  const dialogs=new NativeAppDialogs({...original,theme:()=>"dark",apps:{...original.apps,scanResultModel:model} as unknown as typeof original.apps,
    management:{dialog:spec=>{panel=new NativeModalPanel(spec,original.host,()=>app.contentSize,()=>"dark",original.invalidate,()=>{});app.stage.addChild(panel);}} as typeof original.management});
  try{
    for(const width of [520,720]){
      dialogs.scan();current().spec.width=width;current().redraw();await present("scan layout fixture");
      const header=current().getChildByLabel("native-scan:header",true)!;
      const tab=current().getChildByLabel("native-dialog:scan-tab-ignored",true)!;
      assert.ok(header.children.indexOf(tab)>header.children.findIndex(child=>child instanceof Graphics),"tab captions render above the enclosing surface");
      const scroll=current().getChildByLabel("native-scroll-view",true) as NativeScrollView;
      const list=current().getChildByLabel("native-virtual-list",true) as NativeVirtualList;
      const headerY=header.getGlobalPosition().y;
      assert.ok(scroll.getGlobalPosition().y>=headerY+header.height-1,"scrollbar starts below fixed controls");
      assert.ok(list.mountedCount<12,"scan list keeps virtualization");
      scroll.scrollTo(scroll.maxOffset);await present("scan list scrolled");assert.equal(header.getGlobalPosition().y,headerY);
      const last=list.controls.at(-1)!;last.focus(true);assert.ok(list.mountedCount<12);last.focus(false);
      scroll.scrollTo(0);await present("scan list top");
      const badge=current().getChildByLabel(`native-scan:keyword-${items[0]!.id}`,true)!;assert.ok(badge);
      assert.ok(badge.getGlobalPosition().x>header.getGlobalPosition().x+width/2,"keyword badge belongs to the right column");
      await capture(`scan-layout-${width}-ignored`);
      (current().getChildByLabel("native-dialog:scan-tab-available",true) as NativeFluentButton).activate();await present("available scan tab");
      assert.equal(activeTab,"available");assert.ok(current().getChildByLabel("native-scan:header",true));
      await capture(`scan-layout-${width}-available`);
      current().destroy();panel=null;activeTab="ignored";
    }
    const overlay=new Container({label:"advanced-layout-proof"});app.stage.addChild(overlay);
    try{
      const width=Math.min(900,app.contentSize.width-64);
      overlay.position.set((app.contentSize.width-width)/2,80);
      overlay.addChild(new Graphics().roundRect(-16,-16,width+32,320,8).fill(0x1f1f1f));
      const page=nativeAdvancedWindowSettings({settings,width,theme:"dark",systemAppearance:"dark",state:{mode:false,material:false,advanced:true},invalidate:()=>app.invalidate(),redraw:()=>{}});
      overlay.addChild(page.node);page.layout!.reflow(new Map());
      const expand=page.node.getChildByLabel("native-window:advanced-expand",true) as NativeFluentButton;
      const body=page.node.getChildByLabel("native-disclosure:window.advanced",true)!;
      assert.equal(body.y,expand.y+expand.controlHeight,"expanded card has no gap");
      assert.ok(page.node.getChildByLabel("native-disclosure-card",true));
      await present("advanced shared card");await capture("advanced-layout-shared-card");page.dispose();
    }finally{overlay.destroy({children:true});}
  }finally{if(panel)current().destroy();setNativeLocale(locale);}
  console.log("Native scan layout: fixed header, virtual scrolling, tabs, badges and advanced shared card passed");
}
