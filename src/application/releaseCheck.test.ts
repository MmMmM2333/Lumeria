import assert from "node:assert/strict";
import { checkRelease,stableVersion } from "./releaseCheck.js";
import { createGitHubReleaseSource } from "../platform/githubReleaseSource.js";
import { PRODUCT } from "../platform/product.js";

const signal=new AbortController().signal;
const info=(version:string)=>({version,releaseUrl:`${PRODUCT.repositoryUrl}/releases/tag/v${version}`});
for(const [local,remote,status] of [["1.9.0","1.10.0","available"],["1.0.0","1.0.0","current"],["2.0.0","1.9.0","current"]]){
  assert.equal((await checkRelease(local!,async()=>info(remote!),signal)).status,status);
}
assert.equal((await checkRelease("1.0.0",async()=>null,signal)).status,"unpublished");
assert.throws(()=>stableVersion("1.0.0-beta"));assert.throws(()=>stableVersion("1.01.0"));
const source=(location:string|null,status=302)=>createGitHubReleaseSource((async(url,options)=>{
  assert.equal(url,`${PRODUCT.repositoryUrl}/releases/latest`);
  assert.equal(options?.method,"HEAD");assert.equal(options?.redirect,"manual");assert.equal(options?.signal,signal);
  return new Response(null,{status,headers:location?{Location:location}:{}});
}) as typeof fetch);
assert.deepEqual(await source(info("1.1.0").releaseUrl)(signal),info("1.1.0"));
assert.deepEqual(await source(new URL(info("1.1.0").releaseUrl).pathname)(signal),info("1.1.0"));
assert.equal(await source(null,404)(signal),null);
assert.equal(await source(`${PRODUCT.repositoryUrl}/releases`)(signal),null);
for(const status of [200,403,429,500])await assert.rejects(source(null,status)(signal));
for(const invalid of [null,"https://example.com/releases/tag/v1.1.0",`${PRODUCT.repositoryUrl}-other/releases/tag/v1.1.0`,`${PRODUCT.repositoryUrl}/releases/tag/v1.1.0-beta`,`${PRODUCT.repositoryUrl}/releases/tag/toolchain-r3`,`${PRODUCT.repositoryUrl}/releases/tag/v1.1.0/more`,`${info("1.1.0").releaseUrl}?x=1`,`${info("1.1.0").releaseUrl}#x`,info("1.1.0").releaseUrl.replace("https://","https://user@")])await assert.rejects(source(invalid)(signal));
await assert.rejects(createGitHubReleaseSource((async()=>{throw new Error("offline");}) as typeof fetch)(signal),/offline/);
const controller=new AbortController();
const canceled=createGitHubReleaseSource((async(_url,options)=>{
  assert.equal(options?.signal,controller.signal);controller.abort();return new Response(null,{status:302,headers:{Location:info("2.0.0").releaseUrl}});
}) as typeof fetch);
await assert.rejects(canceled(controller.signal));
await assert.rejects(checkRelease("1.0.0",async()=>info("2.0.0"),controller.signal));
console.log("Release comparison, public GitHub redirect validation and cancellation passed");
