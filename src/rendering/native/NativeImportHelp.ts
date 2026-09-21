import {Container,Graphics} from "pixi.js";
import type {NativeManagement} from "./NativeManagement.js";
import type {NativeSettingsControl} from "./NativeSettingsShell.js";
import {NativeSegmentedControl} from "./NativeSegmentedControl.js";
import {NativeFluentToggle} from "./NativeFluentToggle.js";
import {nativeSettingsStyle,type NativeTheme} from "./NativeFluentButton.js";
import {nativeFluentIcon} from "./nativeFluentIcons.js";
import {createNativeText,NATIVE_UI_FONT_FAMILY} from "./nativeTypography.js";
import {t} from "../../native/nativeLocalization.js";

/** A self-contained illustration: controls never write app settings or layout. */
export function openNativeImportHelp(management:NativeManagement,theme:NativeTheme,invalidate:()=>void,policy={grouped:true,keepSingle:false}):void{
  let stage="initial",grouped=policy.grouped,single=policy.keepSingle,change="rename",after=false;
  const refresh=()=>management.refresh();
  management.dialog({id:"import-help",title:t("imports.groupHelpTitle"),subtitle:t("imports.helpIntro"),width:760,maxHeight:820,confirmText:t("notices.acknowledge"),confirm:()=>{},build:width=>{
    const node=new Container(),controls:NativeSettingsControl[]=[],style=nativeSettingsStyle(theme);let y=0;
    const text=(value:string,x:number,top:number,size=13,w=width)=>{const label=createNativeText({text:value,eventMode:"none",style:{fontFamily:[...NATIVE_UI_FONT_FAMILY],fontSize:size,fill:style.text,wordWrap:true,breakWords:true,wordWrapWidth:w,lineHeight:size*1.5}});label.position.set(x,top);node.addChild(label);return label;};
    const segmented=(entries:{value:string;label:string}[],value:string,choose:(v:string)=>void)=>{const control=new NativeSegmentedControl(entries.map(e=>({...e,id:`native-import-help:${e.value}`})),value,v=>{choose(v);refresh();},invalidate,theme,width);control.y=y;node.addChild(control);controls.push(...control.controls);y+=46;};
    segmented(["initial","new","changes"].map(value=>({value,label:t(`imports.helpTab_${value}`)})),stage,value=>{stage=value;});
    if(stage!=="changes"){
      segmented([{value:"flat",label:t("imports.arrangeFlat")},{value:"group",label:t("imports.arrangeGrouped")}],grouped?"group":"flat",v=>{grouped=v==="group";});
      if(grouped){const toggle=new NativeFluentToggle("checkbox",v=>{single=v;refresh();},invalidate,theme);toggle.checked=single;toggle.disabled=!grouped;toggle.y=y;node.addChild(toggle);
      text(t("imports.single"),38,y+5,12);controls.push({node:toggle,disabled:()=>toggle.disabled,focus:active=>{toggle.alpha=active?.7:1;invalidate();},handleKey:key=>{if(key!==" "&&key!=="Enter")return false;toggle.toggle();return true;}});y+=44;}
    }else{
      const settingsChange=["flatRule","singleRule"].includes(change);
      segmented([{value:"folders",label:t("imports.helpFolderChanges")},{value:"settings",label:t("imports.helpSettingChanges")}],settingsChange?"settings":"folders",value=>{change=value==="settings"?"flatRule":"rename";});
      segmented((settingsChange?["flatRule","singleRule"]:["rename","move","dissolve"]).map(value=>({value,label:t(`imports.helpChange_${value}`)})),change,value=>{change=value;});
    }
    if(stage==="new")segmented([{value:"before",label:t("imports.beforeArrange")},{value:"after",label:t("imports.afterArrange")}],after?"after":"before",value=>{after=value==="after";});
    const context=text(t(stage==="initial"?"imports.helpInitialContext":stage==="new"?"imports.helpNewContext":`imports.helpContext_${change}`),0,y,12);context.style.fill=style.muted;y+=context.height+14;
    const top=y,height=306,half=(width-60)/2;
    node.addChild(new Graphics({eventMode:"none"}).roundRect(0,top,width,height,8).fill(style.row).stroke({color:style.border,width:1}));
    text(t("imports.treeSource"),16,top+12,12).style.fontWeight="600";text(t("imports.treeResult"),width/2+28,top+12,12).style.fontWeight="600";
    const source=[{label:t("imports.helpRoot"),depth:0,folder:true},{label:"A",depth:1,folder:false},{label:"B",depth:1,folder:false},{label:t("imports.treeGroup"),depth:1,folder:true},{label:"C",depth:2,folder:false},{label:"D",depth:2,folder:false},...(stage!=="initial"?[{label:"G",depth:2,folder:false}]:[]),{label:t("imports.treeSingle"),depth:1,folder:true},{label:"E",depth:2,folder:false},...(stage!=="initial"?[{label:"F",depth:1,folder:false}]:[])];
    const lines=new Graphics({eventMode:"none",label:"native-import-help:tree-lines"});node.addChild(lines);
    source.forEach((parent,index)=>{
      if(!parent.folder)return;
      const children:number[]=[];
      for(let i=index+1;i<source.length;i++){if(source[i]!.depth<=parent.depth)break;if(source[i]!.depth===parent.depth+1)children.push(i);}
      if(!children.length)return;
      const x=16+parent.depth*20+8;
      lines.moveTo(x,top+39+index*25+20).lineTo(x,top+39+children.at(-1)!*25+8);
      for(const i of children)lines.moveTo(x,top+39+i*25+8).lineTo(16+source[i]!.depth*20-4,top+39+i*25+8);
    });lines.stroke({color:style.muted,alpha:.4,width:1});
    const appColors=["#4289c1","#8871b5","#48a08b"];
    const appIndex=(letter:string)=>(letter.charCodeAt(0)-65)%3;
    const appIcon=(letter:string)=>appIndex(letter)===1?"apps-24-regular" as const:"window-24-regular" as const;
    source.forEach((row,i)=>{const x=16+row.depth*20,yy=top+39+i*25;const icon=nativeFluentIcon(row.folder?"folder-open-20-regular":appIcon(row.label),row.folder?"#c49538":appColors[appIndex(row.label)]!,17);icon.position.set(x,yy);node.addChild(icon);const label=row.folder?row.label:t("imports.treeApp",{letter:row.label});text(label+(["F","G"].includes(row.label)?`  ${t("imports.newFound")}`:""),x+23,yy,12,half-45);});
    text("→",width/2-10,top+130,20,25);
    let result:{name:string;folder:boolean;members:string}[];
    if(stage!=="changes")result=grouped?[{name:"A",folder:false,members:""},{name:"B",folder:false,members:""},...(!single?[{name:"E",folder:false,members:""}]:[]),{name:t("imports.treeGroup"),folder:true,members:"C  D"},...(single?[{name:t("imports.treeSingle"),folder:true,members:"E"}]:[])]:["A","B","C","D","E"].map(name=>({name,folder:false,members:""}));
    else result=[{name:"A",folder:false,members:""},{name:"B",folder:false,members:""},{name:"E",folder:false,members:""},{name:change==="rename"&&stage==="changes"?t("imports.helpRenamed"):t("imports.treeGroup"),folder:true,members:"C  D"},{name:"F",folder:false,members:""},{name:"G",folder:false,members:""}];
    if(stage==="new")result.push(...["F","G"].map(name=>({name,folder:false,members:""})));
    if(stage==="changes"&&change==="dissolve")result=["A","B","C","D","E","F","G"].map(name=>({name,folder:false,members:""}));
    if(stage==="changes"&&change==="move"){result.find(r=>r.folder)!.members="D";result.splice(2,0,{name:"C",folder:false,members:""});}
    if(stage==="new"&&after&&grouped){result=result.filter(r=>r.name!=="G");result.find(r=>r.folder)!.members="C  D  G";}
    const x0=width/2+28,cell=(width-x0-12)/3;
    result.forEach((row,i)=>{const x=x0+cell*(i%3+.5),yy=top+46+Math.floor(i/3)*82;
      node.addChild(new Graphics({eventMode:"none"}).roundRect(x-20,yy,40,40,9).fill({color:style.accent,alpha:row.folder?.12:.07}));
      if(row.folder){row.members.split("  ").slice(0,4).forEach((letter,n)=>{const icon=nativeFluentIcon(appIcon(letter),appColors[appIndex(letter)]!,13);icon.position.set(x-15+(n%2)*17,yy+6+Math.floor(n/2)*17);node.addChild(icon);});}
      else{const icon=nativeFluentIcon(appIcon(row.name),appColors[appIndex(row.name)]!,24);icon.position.set(x-12,yy+8);node.addChild(icon);}
      const name=text(row.folder?row.name:t("imports.treeApp",{letter:row.name}),0,yy+44,11,cell-6);name.style.align="center";name.x=x-name.width/2;
      if(row.folder){const members=text(row.members,0,yy+62,10,cell);members.style.fill=style.muted;members.x=x-members.width/2;}
    });y+=height+16;
    const message=stage==="initial"?t(grouped?(single?"imports.helpInitialSingle":"imports.helpInitial"):"imports.helpInitialFlat"):stage==="new"?t(grouped?"imports.helpNew":"imports.helpNewFlat"):t(`imports.helpExplain_${change}`);
    const explanation=text(message,0,y,13);y+=explanation.height+16;
    const note=text(t("imports.helpDemoOnly"),0,y,12);note.style.fill=style.muted;y+=note.height;
    return {node,controls,height:y,maxVisibleHeight:580};
  }});
}
