import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogScanFilters, CatalogScanRoot } from "../domain/applicationCatalog.js";

export function nativeCatalogCacheKey(roots: readonly CatalogScanRoot[], filters: CatalogScanFilters): string {
  const sources=roots.map(root=>({id:root.id,type:root.type,label:root.label,path:root.path,enabled:root.enabled,maxDepth:root.maxDepth,maxEntries:root.maxEntries}));
  return createHash("sha256").update(JSON.stringify({sources,keywordBlacklist:filters.keywordBlacklist,
    keywordAllowlist:filters.keywordAllowlist,appBlacklist:(filters.appBlacklist??[]).map(item=>({catalogId:item.catalogId}))})).digest("hex");
}

/** A single last-success snapshot. Invalid/mismatched caches fall back to a full scan. */
export function createNativeCatalogCache<T extends {warnings: readonly unknown[];stats:{limitReached:boolean}}>(
  directory:string, validate:(value:unknown)=>T, report:(error:unknown)=>void,
) {
  const path=join(directory,"catalog-cache.json");
  return {
    async load(key:string):Promise<T|null>{
      try{
        const document=JSON.parse(await readFile(path,"utf8"));
        if(document.schemaVersion!==1||document.key!==key)return null;
        const result=validate(document.result);
        return result.warnings.length||result.stats.limitReached?null:result;
      }catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")report(error);return null;}
    },
    async save(key:string,result:T):Promise<void>{
      if(result.warnings.length||result.stats.limitReached)return;
      const temporary=path+`.${process.pid}.${randomUUID()}.tmp`;
      try{await mkdir(directory,{recursive:true});await writeFile(temporary,JSON.stringify({schemaVersion:1,key,result}));await rename(temporary,path);}
      catch(error){report(error);}
      finally{await rm(temporary,{force:true}).catch(report);}
    },
  };
}
