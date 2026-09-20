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
const source=(value:unknown,status=200)=>createGitHubReleaseSource((async()=>new Response(JSON.stringify(value),{status})) as typeof fetch);
const release={tag_name:"v1.1.0",html_url:info("1.1.0").releaseUrl,draft:false,prerelease:false};
assert.deepEqual(await source(release)(signal),info("1.1.0"));
assert.equal(await source({},404)(signal),null);
await assert.rejects(source({},403)(signal));
for(const invalid of [{...release,html_url:"https://example.com/releases/tag/v1.1.0"},{...release,prerelease:true},{...release,tag_name:"toolchain-r3"}])await assert.rejects(source(invalid)(signal));
const controller=new AbortController();controller.abort();await assert.rejects(checkRelease("1.0.0",async()=>info("2.0.0"),controller.signal));
console.log("Release comparison, GitHub response validation and cancellation passed");
