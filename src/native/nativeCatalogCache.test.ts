import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNativeCatalogCache, nativeCatalogCacheKey } from "./nativeCatalogCache.js";

const directory=await mkdtemp(join(tmpdir(),"lumeria-catalog-cache-"));
const errors:unknown[]=[];
const valid={apps:[{id:"one"}],warnings:[],stats:{limitReached:false}};
const validate=(value:unknown)=>{assert.deepEqual(value,valid);return valid;};
const cache=createNativeCatalogCache(directory,validate,error=>errors.push(error));
try{
  const key=nativeCatalogCacheKey([],{keywordBlacklist:[],keywordAllowlist:[]});
  assert.equal(await cache.load(key),null);
  await cache.save(key,valid);assert.deepEqual(await cache.load(key),valid);
  assert.equal(await cache.load(nativeCatalogCacheKey([],{keywordBlacklist:["new"],keywordAllowlist:[]})),null);
  const previous=await readFile(join(directory,"catalog-cache.json"),"utf8");
  await cache.save(key,{...valid,stats:{limitReached:true}});
  assert.equal(await readFile(join(directory,"catalog-cache.json"),"utf8"),previous,"partial scan must preserve last success");
  await writeFile(join(directory,"catalog-cache.json"),"invalid");
  assert.equal(await cache.load(key),null);assert.equal(errors.length,1);
  await Promise.all([cache.save(key,valid),cache.save(key,valid)]);
  assert.deepEqual(await cache.load(key),valid,"concurrent writes use independent atomic temporaries");
}finally{await rm(directory,{recursive:true,force:true});}
console.log("Catalog cache key invalidation, corruption fallback, partial-scan preservation and atomic writes passed");
