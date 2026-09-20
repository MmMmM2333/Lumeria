import { stableVersion,type ReleaseInfo,type ReleaseSource } from "../application/releaseCheck.js";
import { PRODUCT } from "./product.js";

/** Public stable releases only. Never embeds a GitHub token in the application. */
export function createGitHubReleaseSource(request:typeof fetch=fetch):ReleaseSource{
  return async signal=>{
    const repository=new URL(PRODUCT.repositoryUrl);
    const response=await request(`https://api.github.com/repos${repository.pathname}/releases/latest`,{
      signal,headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},
    });
    if(response.status===404)return null;
    if(!response.ok)throw new Error(`Release request failed (${response.status})`);
    const value:unknown=await response.json();
    if(!value||typeof value!=="object")throw new Error("Invalid release response");
    const release=value as Record<string,unknown>;
    if(release.draft!==false||release.prerelease!==false||typeof release.tag_name!=="string"||typeof release.html_url!=="string")throw new Error("Invalid stable release response");
    stableVersion(release.tag_name);
    const url=new URL(release.html_url);
    if(url.origin!==repository.origin||url.username||url.password||!url.pathname.startsWith(`${repository.pathname}/releases/tag/`)||url.pathname===`${repository.pathname}/releases/tag/`)throw new Error("Unexpected release URL");
    return {version:release.tag_name.replace(/^v/,""),releaseUrl:url.href} satisfies ReleaseInfo;
  };
}
