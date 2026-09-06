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

export function runNativeSettingsLayoutTests():void{
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
