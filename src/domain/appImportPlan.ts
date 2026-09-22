import type { ScannedCatalogApp } from "./applicationCatalog.js";

export type ImportSourcePolicy = Readonly<{id:string; enabled:boolean; grouped:boolean; keepSingle:boolean}>;
export type ImportGroup = Readonly<{key:string; name:string; appIds:readonly string[]}>;
export type ImportDecision = Readonly<{id:string; name:string; reason:"existing"|"hidden"|"excluded"|"source-disabled"|"new"; groupKey:string|null}>;
export type AppImportPlan = Readonly<{groups:readonly ImportGroup[]; singles:readonly string[]; decisions:readonly ImportDecision[]}>;

/** Consumes the catalog AFTER native overlay, identity merging and keyword filtering.
 * Placement is deliberately independent of the catalog's chosen launch source.
 * This plans new entries only; existing layout is never reorganized by a scan. */
export function planAppImport(options:Readonly<{
  apps:readonly ScannedCatalogApp[];
  sources:readonly ImportSourcePolicy[];
  existingIds:readonly string[];
  hiddenIds:readonly string[];
  excludedIds:readonly string[];
  dismissedGroups?:readonly string[];
}>):AppImportPlan{
  const existing=new Set(options.existingIds),hidden=new Set(options.hiddenIds),excluded=new Set(options.excludedIds);
  const policies=new Map(options.sources.map(source=>[source.id,source]));
  const dismissed=new Set(options.dismissedGroups??[]),seen=new Set<string>();
  const candidates=new Map<string,{key:string;name:string;appIds:string[];keepSingle:boolean}>();
  const singles:string[]=[],decisions:ImportDecision[]=[];
  const priority={startMenuUser:0,startMenuSystem:1,customDirectory:2,windowsAppCatalog:3};
  for(const app of options.apps){
    if(seen.has(app.id))continue;
    seen.add(app.id);
    const source=app.sources.filter(source=>source.state!=="shadowed"&&policies.get(source.rootId)?.enabled)
      .sort((a,b)=>priority[a.type]-priority[b.type]||a.rootId.localeCompare(b.rootId)||a.relativePath.localeCompare(b.relativePath))[0];
    const reason=excluded.has(app.id)?"excluded":existing.has(app.id)?"existing":hidden.has(app.id)?"hidden":!source?"source-disabled":"new";
    let groupKey:string|null=null;
    if(reason==="new"&&source){
      const policy=policies.get(source.rootId)!;
      const parts=source.relativePath.replaceAll("\\","/").split("/").filter(Boolean);
      const name=parts[0]??"";
      if(policy.grouped&&source.type!=="windowsAppCatalog"&&parts.length>1){
        // The two standard Start Menu roots share a namespace. Custom roots do not.
        const scope=source.type==="customDirectory"?`root:${source.rootId}`:"start-menu";
        const key=JSON.stringify([scope,name.toLocaleLowerCase("en-US")]);
        if(!dismissed.has(key)){
          groupKey=key;
          const group=candidates.get(key)??{key,name:source.groupDisplayName||name,appIds:[],keepSingle:false};
          group.appIds.push(app.id);group.keepSingle ||= policy.keepSingle;candidates.set(key,group);
        }
      }
      if(groupKey===null)singles.push(app.id);
    }
    decisions.push({id:app.id,name:app.name,reason,groupKey});
  }
  const groups:ImportGroup[]=[];
  for(const group of candidates.values()){
    if(group.appIds.length>1||group.keepSingle)groups.push({key:group.key,name:group.name,appIds:group.appIds});
    else singles.push(...group.appIds);
  }
  return {groups,singles,decisions};
}
