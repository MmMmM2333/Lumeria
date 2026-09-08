import assert from "node:assert/strict";
import { Container, Graphics, Text } from "pixi.js";
import { NativeSettingsLayout } from "./nativeSettingsLayout.js";
import { NativeSettingsShell } from "./NativeSettingsShell.js";
import { NativeFluentButton } from "./NativeFluentButton.js";
import { createSettingsNavigation } from "../../application/settingsNavigation.js";
import { createNativeStateHost } from "../../application/stateHost.js";
import { motionRuntime } from "../pixi/animation/motionRuntime.js";
import { NativeDisclosureSurface } from "./ui/NativeDisclosureSurface.js";
import { NativeInputFrame } from "./ui/NativeInputFrame.js";
import { NativeScrollView } from "./NativeScrollView.js";
import { nativeUiTheme } from "./ui/nativeUiTheme.js";
import { NativeDisclosureCard } from "./ui/NativeDisclosureCard.js";
import { captureSettingsGeometry,createSettingsTransition } from "./ui/nativeSettingsTransition.js";
import { NativeSingleLineText } from "./ui/NativeSingleLineText.js";
import { nativeRowSummary } from "./ui/nativeRowSummary.js";
import { NativeVirtualList } from "./ui/NativeVirtualList.js";
import { NativeSegmentedControl } from "./NativeSegmentedControl.js";
import { NativeFluentToggle } from "./NativeFluentToggle.js";
import { NativeFluentSlider } from "./NativeFluentSlider.js";

export function runNativeSettingsLayoutTests():void{
  const resizedButton=new NativeFluentButton("Change icon",136,()=>{},()=>{});
  resizedButton.resizeWidth(104);assert.equal(resizedButton.caption.x,52,"button caption follows its measured width");resizedButton.destroy({children:true});
  const segmented=new NativeSegmentedControl([{value:"a",label:"A",id:"a"},{value:"b",label:"B",id:"b"},{value:"c",label:"C",id:"c"}],"c",()=>{},()=>{},"dark");
  const middle=segmented.controls[1]!.node as NativeFluentButton,selected=segmented.controls[2]!.node as NativeFluentButton;
  middle.hovered=true;assert.ok(middle.background.containsPoint({x:0.5,y:0.5}),"middle segment hover must have square corners");
  selected.hovered=true;assert.equal(selected.background.context.instructions.length,2,"selected underline must remain above hovered fill");
  segmented.destroy({children:true});
  const orderRoot=new Container(),orderLayout=new NativeSettingsLayout(orderRoot,300);
  const orderBackground=new Graphics().rect(0,0,300,40).fill(0xffffff),orderLabel=new Text({text:"Foreground"});orderRoot.addChild(orderBackground,orderLabel);
  orderLayout.disclosure("order",true,0,0,40,[],undefined,false);
  const ordered=orderRoot.getChildByLabel("native-disclosure-content",true)!;
  assert.equal(ordered.children[0],orderBackground);assert.equal(ordered.children[1],orderLabel);orderRoot.destroy({children:true});
  let focused=-1;
  const virtual=new NativeVirtualList(1000,78,1,index=>({node:new Container(),controls:[{node:new Container(),disabled:()=>false,focus:active=>{if(active)focused=index;},handleKey:()=>true}]}));
  virtual.viewport(0,450);assert.ok(virtual.mountedCount<=8);
  virtual.controls[999]!.focus(true);assert.equal(focused,999);
  virtual.viewport(999*78,450);assert.ok(virtual.mountedCount<=5);assert.equal(virtual.controls[999]!.revealRect!().top,999*78);
  virtual.controls[999]!.focus(false);virtual.viewport(0,450);assert.ok(virtual.mountedCount<=8);virtual.destroy();
  const candidates=new NativeVirtualList(2,80,3,()=>({node:new Container(),controls:[]}),index=>String(index),(index,part)=>index*3+part>=4);
  assert.deepEqual(candidates.controls.map(control=>control.disabled()),[false,false,false,false,true,true],"incomplete candidate rows must exclude empty cells from keyboard navigation");
  assert.equal(candidates.mountedCount,0,"checking disabled states must not instantiate offscreen rows");candidates.destroy();
  const summaryRoot=new Container();
  for(const value of ["Pastel dark","经典亮色","Acrylic · 跟随系统 · 100%"]){
    const summary=nativeRowSummary(summaryRoot,value,738,28,"dark","summary");
    assert.equal(summary.x,691);assert.equal(summary.anchor.x,1);assert.ok(summary.width<=180);
  }
  const ellipsis=new NativeSingleLineText("Very long settings description 👨‍👩‍👧‍👦",{fontSize:12},100);
  assert.ok(ellipsis.text.endsWith("…"));assert.ok(ellipsis.width<=100);ellipsis.setAvailableWidth(1000);assert.equal(ellipsis.text,ellipsis.fullText);ellipsis.destroy();summaryRoot.destroy({children:true});
  const oldPage=new Container(),newPage=new Container();
  const oldRow=new Graphics({label:"row"}).roundRect(0,0,600,72,8).fill(0xffffff),newRow=new Graphics({label:"row"}).roundRect(0,0,448,72,8).fill(0xffffff);
  const oldLabel=new Text({text:"Label",style:{fontSize:13,wordWrap:true,wordWrapWidth:300}}),newLabel=new Text({text:"Label",style:{fontSize:13,wordWrap:true,wordWrapWidth:148}});
  oldLabel.x=500;newLabel.x=348;oldPage.addChild(oldRow,oldLabel);newPage.addChild(newRow,newLabel);
  const transition=createSettingsTransition(newPage,captureSettingsGeometry(oldPage));transition.update(0);
  assert.equal(newRow.width,oldRow.width);assert.equal(newLabel.x,oldLabel.x);assert.equal(newLabel.scale.x,1);
  transition.update(0.5);assert.equal(newRow.width,524);assert.equal(newLabel.x,424);assert.equal(newLabel.style.wordWrapWidth,224);
  const interrupted=captureSettingsGeometry(newPage),reverse=createSettingsTransition(oldPage,interrupted);reverse.update(0);
  assert.equal(oldRow.width,524);assert.equal(oldLabel.x,424);reverse.update(1);assert.equal(oldRow.width,600);assert.equal(oldLabel.scale.x,1);
  oldPage.destroy({children:true});newPage.destroy({children:true});
  const card=new NativeDisclosureCard(300,72,"dark");card.update(91);
  assert.equal(Math.round(card.getLocalBounds().height),163);card.update(0);assert.equal(Math.round(card.getLocalBounds().height),72);card.destroy();
  const surface=new NativeDisclosureSurface(300,152,"dark");
  assert.equal(surface.update(1,1,true),181);assert.equal(surface.content.y,15);
  surface.update(0,0,false);assert.equal(surface.visible,false);assert.equal(surface.eventMode,"none");surface.destroy({children:true});
  const frame=new NativeInputFrame(86,32,"dark");frame.content.addChild(new Graphics().rect(0,0,86,32).fill(0xff0000));
  assert.equal(frame.children.at(-1)?.label,"native-input-frame:border");assert.ok(frame.content.mask);frame.destroy({children:true});
  const scroll=new NativeScrollView(()=>{},()=>{},"dark",{left:20,right:20,top:18,bottom:20});
  scroll.resize(400,200,500);assert.equal(scroll.content.x,20);assert.equal(scroll.getChildByLabel("native-scroll-thumb")?.x,392);
  scroll.reveal(450,30);assert.equal(scroll.offset,298);scroll.destroy();
  assert.equal(nativeUiTheme("dark").switchThumb,"#242424");
  const root=new Container(),layout=new NativeSettingsLayout(root,300);
  root.addChild(new Graphics().rect(0,0,300,72).fill(0xffffff));
  const content=new Graphics().rect(0,78,300,120).fill(0xffffff);root.addChild(content);
  const following=new Graphics().rect(0,210,300,72).fill(0xffffff);root.addChild(following);
  // Capture only the body; the next row is attached after the disclosure.
  root.removeChild(following);
  layout.disclosure("test",false,1,78,120,[],undefined,false);root.addChild(following);layout.finish(288);
  const progress=new Map([["test",{height:0,opacity:0}]]);
  assert.equal(layout.reflow(progress),168);assert.equal(following.y,-120);
  progress.set("test",{height:0.5,opacity:0.8});assert.equal(layout.reflow(progress),228);assert.equal(following.y,-60);
  progress.set("test",{height:1,opacity:1});assert.equal(layout.reflow(progress),288);assert.equal(following.y,0);
  layout.reflow(progress);assert.equal(following.y,0,"reflow cannot accumulate offsets");root.destroy({children:true});

  motionRuntime.reset();motionRuntime.suspendAutoTicker();
  {
    const slider=new NativeFluentSlider(200,0,100,1,0,()=>{},()=>{},"dark");
    slider.handleKey("End");assert.equal(slider.value,100);assert.equal(slider.presentationValue,0);
    motionRuntime.step(0.05);assert.ok(slider.presentationValue>0&&slider.presentationValue<100);
    const middle=slider.presentationValue;slider.handleKey("Home");assert.equal(slider.presentationValue,middle,"keyboard reversal preserves the presented thumb position");
    for(let frame=0;frame<20;frame++)motionRuntime.step(1/60);
    assert.equal(slider.presentationValue,0);slider.handleKey("End");slider.disabled=true;assert.equal(slider.presentationValue,100);slider.destroy();
  }
  {
    const toggle=new NativeFluentToggle("switch",()=>{},()=>{},"dark");
    toggle.toggle();assert.equal(toggle.transitionProgress,0);
    motionRuntime.step(0.04);assert.ok(toggle.transitionProgress>0&&toggle.transitionProgress<1);
    const middle=toggle.transitionProgress;toggle.toggle();assert.equal(toggle.transitionProgress,middle,"rapid reversal starts from the presented position");
    const snapshot=toggle.captureTransition();toggle.destroy();
    const replacement=new NativeFluentToggle("switch",()=>{},()=>{},"dark");replacement.restoreTransition(snapshot);
    assert.equal(replacement.transitionProgress,middle,"rebuild resumes the presented position");
    for(let frame=0;frame<20;frame++)motionRuntime.step(1/60);
    assert.equal(replacement.transitionProgress,0);replacement.destroy();
  }
  {
    const nav=createSettingsNavigation(createNativeStateHost(()=>{}),key=>key);
    nav.selectTab("apps");
    const bottomShell=new NativeSettingsShell({navigation:nav,theme:()=>"dark",size:()=>({width:900,height:600}),t:key=>key,
      tabs:["apps"],invalidate:()=>{},close:()=>{},apply:async()=>{},content:()=>{
        const node=new Container(),layout=new NativeSettingsLayout(node,700);
        node.addChild(new Graphics().rect(0,0,700,100).fill(0xffffff));
        layout.disclosure("expanded",true,0,0,100,[],undefined,true);
        node.addChild(new Graphics().rect(0,100,700,600).fill(0xffffff));
        return {node,height:700,layout:layout.finish(700),controls:[],dispose:()=>{}};
      }});
    try{
      const scroller=()=>bottomShell.getChildByLabel("native-scroll-view",true) as NativeScrollView;
      scroller().scrollTo(scroller().maxOffset);const bottom=scroller().offset;
      bottomShell.redraw();assert.equal(scroller().offset,bottom,"redraw must preserve the bottom offset including expanded padding");
    }finally{bottomShell.destroy();}
  }
  {
    const navigation=createSettingsNavigation(createNativeStateHost(()=>{}),key=>key),pages:Container[]=[];
    const shell=new NativeSettingsShell({navigation,theme:()=>"dark",size:()=>({width:900,height:600}),t:key=>key,
      tabs:["general","interface","apps","about"],invalidate:()=>{},close:()=>{},apply:async()=>{},content:()=>{
        const node=new Container();pages.push(node);return {node,height:200,controls:[],dispose:()=>{}};
      }});
    const step=(seconds:number)=>{for(let elapsed=0;elapsed<seconds-0.00001;elapsed+=0.01)motionRuntime.step(0.01);};
    try{
      step(0.5);const previous=pages.at(-1)!;
      navigation.selectTab("apps");shell.redraw();const next=pages.at(-1)!;
      assert.equal(next.y,4);step(0.07);
      assert.ok(Math.abs(next.y-2)<0.03&&Math.abs(previous.y+1.5)<0.03,"same-level pages enter and leave vertically with the original symmetric curve");
      step(0.1);assert.equal(next.y,0);assert.equal(previous.destroyed,true);
      navigation.openSubPage({id:"apps.appManager",parentTabId:"apps",labelKey:"settings.apps.manager.title"});shell.redraw();const child=pages.at(-1)!;
      assert.equal(child.x,14);step(0.04);assert.ok(child.x>0&&child.x<14);assert.ok(next.x<0);
      navigation.closeSubPage();shell.redraw();const parent=pages.at(-1)!;assert.equal(parent.x,-14);
      step(0.02);navigation.selectTab("about");shell.redraw();const last=pages.at(-1)!;step(0.2);
      assert.equal(last.alpha,1);assert.equal(last.x,0);assert.equal(last.y,0);assert.equal(parent.destroyed,true);
    }finally{shell.destroy();motionRuntime.reset();motionRuntime.suspendAutoTicker();}
  }
  let expanded=false,closed=0;
  const navigation=createSettingsNavigation(createNativeStateHost(()=>{}),key=>key);
  const shell=new NativeSettingsShell({navigation,theme:()=>"dark",size:()=>({width:900,height:600}),t:key=>key,
    tabs:["general"],invalidate:()=>{},close:()=>closed++,apply:async()=>{},content:()=>{
      const node=new Container(),layout=new NativeSettingsLayout(node,600);
      const button=new NativeFluentButton("expand",100,()=>{expanded=!expanded;shell.redraw();},()=>{});button.label="expander";node.addChild(button);
      node.addChild(new Graphics().rect(0,40,600,100).fill(0xffffff));layout.disclosure("test",expanded,1,40,100,[]);
      return {node,height:140,layout:layout.finish(140),controls:[{node:button,disabled:()=>false,focus:active=>{button.focused=active;},handleKey:()=>false}],dispose:()=>{}};
    }});
  const step=(count:number)=>{for(let n=0;n<count;n++)motionRuntime.step(1/60);};
  try{
    step(30);assert.equal(shell.transitionProgress,1);
    shell.toggleNavigation();step(4);assert.ok(shell.navigationWidth>68&&shell.navigationWidth<220);
    shell.toggleNavigation();step(3);shell.toggleNavigation();step(20);
    assert.equal(shell.navigationWidth,220,"sidebar reversal must reach expanded width");
    shell.toggleNavigation();step(20);assert.equal(shell.navigationWidth,68);
    (shell.getChildByLabel("expander",true) as NativeFluentButton).activate();step(3);
    const disclosure=shell.getChildByLabel("native-disclosure:test",true)!;
    assert.ok(disclosure.visible);const midway=disclosure.getChildByLabel("native-disclosure-content")!.alpha;assert.ok(midway>0&&midway<1);
    (shell.getChildByLabel("expander",true) as NativeFluentButton).activate();step(2);
    (shell.getChildByLabel("expander",true) as NativeFluentButton).activate();step(20);
    assert.equal(shell.getChildByLabel("native-disclosure:test",true)!.getChildByLabel("native-disclosure-content")!.alpha,1,"reverse interruption must reach latest requested state");
    shell.requestClose();assert.equal(closed,0);step(3);assert.ok(shell.closing&&shell.transitionProgress>0&&shell.transitionProgress<1);
    step(30);assert.equal(closed,1,"close destroys only after returning to the trigger");
  }finally{shell.destroy();motionRuntime.reset();motionRuntime.resumeAutoTicker();}
}
