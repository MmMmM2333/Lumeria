import {compareImportNames} from "../domain/importNameOrder.js";
import {planAppImport,type ImportSourcePolicy} from "../domain/appImportPlan.js";
import {copyAppImportState,type AppImportState} from "../domain/appImportState.js";
import type {ScannedCatalogApp} from "../domain/applicationCatalog.js";
import {chunkIntoPages,type LaunchpadApp,type LaunchpadPages,type ReadonlyLaunchpadPages} from "../domain/launchpadLayout.js";

export type ImportPlacement={key:string;name:string;ids:string[];suggested:string;target:string;groupKey:string|null};
type Ports={
  state():AppImportState;write(state:AppImportState):void;pages():ReadonlyLaunchpadPages;commit(pages:LaunchpadPages):void;
  clone(pages:ReadonlyLaunchpadPages):LaunchpadPages;pageSize():number;folderSize():number;makeId():string;
  hidden():readonly string[];hide(ids:string[]):void;allow(ids:readonly string[]):void;
  sources():readonly {id:string;type:string;enabled:boolean}[];normalize(app:ScannedCatalogApp):LaunchpadApp;
  changed():void;t(key:string,params?:Record<string,string|number>):string;
};
export function createAppImportSession(p:Ports){
  let catalog:ScannedCatalogApp[]=[],rows:ImportPlacement[]=[],selected:string[]=[],offered:string[]=[],mode:"manual"|"recent"|"initial"="manual",stamp="",staged=false;
  let undo:{pages:LaunchpadPages;state:AppImportState;hidden:string[];stamp:string}|null=null;
  const positions=(pages=p.pages())=>new Map(pages.flatMap((page,pi)=>page.flatMap((item,i)=>item.type==="folder"?item.childPages.flatMap((children,cp)=>children.flatMap((app,ci)=>app?[[app.id,`${item.id}:${cp}:${ci}`] as const]:[])):[[item.id,`desktop:${pi}:${i}`] as const])));
  const policies=():ImportSourcePolicy[]=>p.sources().map(root=>{
    const saved=p.state().policies.find(x=>x.id===root.id);
    return {id:root.id,enabled:root.enabled,grouped:saved?.grouped??["startMenuUser","startMenuSystem"].includes(root.type),keepSingle:saved?.keepSingle??false};
  });
  const signature=()=>JSON.stringify([p.pages(),p.state(),p.hidden(),policies(),catalog.map(a=>a.id)]);
  const build=()=>{
    const old=rows,ids=mode==="recent"?p.state().recentIds:selected,existing=positions();
    const plan=planAppImport({apps:catalog.filter(a=>ids.includes(a.id)),sources:policies(),existingIds:mode==="initial"?[]:[...existing.keys()].filter(id=>!p.state().recentIds.includes(id)),hiddenIds:[],excludedIds:[],dismissedGroups:p.state().dismissedGroups});
    const groups=new Map<string,ImportPlacement>();
    for(const decision of plan.decisions.filter(d=>d.reason==="new")){
      const bindings=p.state().bindings.filter(b=>b.groupKey===decision.groupKey);
      const folders=p.pages().flat().filter(item=>item.type==="folder"&&bindings.some(b=>b.folderId===item.id));
      const folder=mode!=="initial"&&folders.length===1?folders[0]:undefined;
      const group=folders.length>1?undefined:plan.groups.find(g=>g.appIds.includes(decision.id));
      const key=folder?.id??group?.key??decision.id;
      const previous=groups.get(key);if(previous){previous.ids.push(decision.id);continue;}
      const suggested=folder?.id??(group?"new":"desktop");
      groups.set(key,{key,name:folder?.name??group?.name??decision.name,ids:[decision.id],suggested,target:suggested,groupKey:decision.groupKey});
    }
    rows=[...groups.values()].map(row=>{const prior=old.find(r=>r.key===row.key&&r.suggested===row.suggested&&r.ids.join()===row.ids.join());return prior?{...row,target:prior.target}:row;});
    stamp=signature();p.changed();
  };
  const api={
    get rows(){return rows;},get mode(){return mode;},get staged(){return staged;},get count(){return p.state().recentIds.length;},
    folderCount(id:string){const folder=p.pages().flat().find(i=>i.type==="folder"&&i.id===id);return folder?.type==="folder"?folder.childPages.flat().filter(Boolean).length:0;},
    get policies(){return policies();},get catalog(){return catalog;},get canUndo(){return Boolean(undo&&undo.stamp===signature());},
    setCatalog(apps:readonly ScannedCatalogApp[]){catalog=[...apps];},
    appendAutomatic(){
      const state=copyAppImportState(p.state());
      const plan=planAppImport({apps:catalog,sources:policies(),existingIds:[...positions().keys()],hiddenIds:[...p.hidden(),...state.deferredIds],excludedIds:[],dismissedGroups:state.dismissedGroups});
      const ids=plan.decisions.filter(row=>row.reason==="new").map(row=>row.id);
      if(!ids.length)return;
      const pages=p.clone(p.pages());if(!pages.length)pages.push([]);
      for(const id of ids){if(pages.at(-1)!.length>=p.pageSize())pages.push([]);pages.at(-1)!.push(p.normalize(catalog.find(a=>a.id===id)!));}
      state.recentIds=[...new Set([...state.recentIds,...ids])];staged=true;
      try{p.write(state);p.commit(pages);}finally{staged=false;}
      p.changed();
    },
    policy(id:string,grouped:boolean,keepSingle:boolean){const next=copyAppImportState(p.state());next.policies=policies().map(v=>v.id===id?{...v,grouped,keepSingle}:v);p.write(next);},
    open(nextMode:typeof mode,ids:readonly string[],available:readonly string[]=[]){mode=nextMode;selected=[...ids];offered=[...available];rows=[];staged=false;build();},
    rebuild(ids?:readonly string[]){if(ids)selected=[...ids];build();},
    choose(key:string,target:string){const row=rows.find(r=>r.key===key);if(row&&(target==="desktop"||target===row.suggested)){row.target=target;p.changed();}},
    finish(){staged=false;rows=[];p.changed();},
    observe(before:ReadonlyLaunchpadPages,after:ReadonlyLaunchpadPages){
      if(staged)return;
      const old=positions(before),next=positions(after),state=copyAppImportState(p.state());
      state.recentIds=state.recentIds.filter(id=>old.get(id)===next.get(id)&&next.has(id));
      const folders=new Set(after.flat().filter(i=>i.type==="folder").map(i=>i.id));
      const gone=state.bindings.filter(b=>!folders.has(b.folderId));
      state.dismissedGroups=[...new Set([...state.dismissedGroups,...gone.map(b=>b.groupKey)])];state.bindings=state.bindings.filter(b=>folders.has(b.folderId));
      if(JSON.stringify(state)!==JSON.stringify(p.state()))p.write(state);
    },
    registerStartup(previous:ReadonlyLaunchpadPages){
      const old=positions(previous),state=copyAppImportState(p.state());
      state.recentIds=[...new Set([...state.recentIds,...positions().keys()].filter(id=>!old.has(id)||state.recentIds.includes(id)))].filter(id=>positions().has(id));p.write(state);
    },
    apply(){
      if(staged)return; // Persistence retry must not execute the placement twice.
      if(signature()!==stamp){build();throw new Error(p.t("imports.changed"));}
      if(!rows.length)throw new Error(p.t("imports.empty"));
      const before=p.clone(p.pages()),previousState=copyAppImportState(p.state()),previousHidden=[...p.hidden()];
      const nextState=copyAppImportState(previousState),ids=rows.flatMap(r=>r.ids),existing=positions();
      let pages=mode==="initial"?[[]] as LaunchpadPages:p.clone(p.pages());
      const appMap=new Map(catalog.map(a=>[a.id,p.normalize(a)]));
      for(const item of before.flat())for(const app of item.type==="folder"?item.childPages.flat():[item])if(app)appMap.set(app.id,app);
      for(const row of rows)if(row.target!=="desktop"&&row.target!=="new"&&!pages.flat().some(i=>i.type==="folder"&&i.id===row.target))throw new Error(p.t("imports.changed"));
      const append=(item:LaunchpadPages[number][number])=>{if(!pages.length)pages=[[]];if(pages.at(-1)!.length>=p.pageSize())pages.push([]);pages.at(-1)!.push(item);};
      const detach=(id:string)=>{pages=pages.map(page=>page.filter(i=>!(i.type==="app"&&i.id===id)));for(const item of pages.flat())if(item.type==="folder")item.childPages=item.childPages.map(page=>page.filter(a=>a?.id!==id));};
      for(const row of rows){
        const apps=row.ids.map(id=>appMap.get(id)!);if(apps.some(a=>!a))throw new Error(p.t("imports.changed"));
        if(row.target==="desktop"){for(const app of apps)if(mode==="initial"||!existing.has(app.id))append(app);continue;}
        for(const id of row.ids)detach(id);
        if(row.target==="new"){
          const id=p.makeId();append({id,type:"folder",name:row.name,childPages:chunkIntoPages(apps,p.folderSize())});
          if(row.groupKey)nextState.bindings.push({folderId:id,groupKey:row.groupKey});
        }else{
          const folder=pages.flat().find(i=>i.type==="folder"&&i.id===row.target)!;
          if(folder.type==="folder")folder.childPages=chunkIntoPages([...folder.childPages.flat().filter((a):a is LaunchpadApp=>Boolean(a)),...apps],p.folderSize());
        }
      }
      if(mode==="initial"){
        const compare=(a:{name:string},b:{name:string})=>compareImportNames(a.name,b.name);
        const items=pages.flat();
        for(const item of items)if(item.type==="folder")item.childPages=chunkIntoPages(item.childPages.flat().filter((a):a is LaunchpadApp=>Boolean(a)).sort(compare),p.folderSize());
        pages=chunkIntoPages([...items.filter(i=>i.type==="app").sort(compare),...items.filter(i=>i.type==="folder").sort(compare)],p.pageSize());
      }
      nextState.deferredIds=[...new Set([...nextState.deferredIds,...offered.filter(id=>!ids.includes(id)&&!existing.has(id)&&!previousHidden.includes(id))])].filter(id=>!ids.includes(id));
      nextState.recentIds=nextState.recentIds.filter(id=>!ids.includes(id));if(mode==="initial")nextState.completed=true;
      staged=true;p.hide(previousHidden.filter(id=>!ids.includes(id)));p.allow(ids);p.write(nextState);p.commit(pages);
      undo={pages:before,state:previousState,hidden:previousHidden,stamp:signature()};p.changed();
    },
    completeEmpty(){const state=copyAppImportState(p.state());state.completed=true;staged=true;p.write(state);p.commit([[]]);p.changed();},
    undo(){if(!undo||undo.stamp!==signature())throw new Error(p.t("imports.changed"));const saved=undo;staged=true;p.hide(saved.hidden);p.write(saved.state);p.commit(saved.pages);staged=false;undo=null;p.changed();},
  };
  return api;
}
