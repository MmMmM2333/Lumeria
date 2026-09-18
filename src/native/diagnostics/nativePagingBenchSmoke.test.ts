import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import type { NativePixiApplication } from "../../../vendor/electrobun-pixi-native-starter/src/native-host.js";
import type { ReadonlyLaunchpadPages } from "../../domain/launchpadLayout.js";
import type { NativeDesktopScene } from "../../rendering/native/NativeDesktopScene.js";
import type { createNativeIconTextureRepository } from "../../rendering/native/nativeIconTextureLoader.js";
import type { SceneItem } from "../../rendering/sceneFrame.js";
import { collectTextureItems } from "../product/nativeTextureItems.js";

type IconTextureRepository = ReturnType<typeof createNativeIconTextureRepository>;

// Paging benchmark capture. Runs only when the diagnostics bench flag is set and
// terminates the run itself, so it owns the quit request.
export type NativePagingBenchContext = Readonly<{
  app: NativePixiApplication;
  commitDesktopPage: (pageIndex: number) => boolean;
  currentFrame: () => Readonly<{ viewport: Readonly<{ activePageIndex: number; activePages: readonly (readonly (SceneItem | null)[])[] }> }>;
  getLayoutPages: () => ReadonlyLaunchpadPages;
  iconTextures: IconTextureRepository;
  present: (description: string) => Promise<void>;
  requestQuit: () => void;
  scene: NativeDesktopScene;
  waitFor: (description: string, predicate: () => boolean) => Promise<void>;
}>;

export async function runNativePagingBench(context: NativePagingBenchContext): Promise<void> {
  const {
    app, commitDesktopPage, currentFrame, getLayoutPages, iconTextures, present, requestQuit, scene, waitFor,
  } = context;
  assert.ok(process.env.LUMERIA_NATIVE_DATA_DIR,"paging benchmark requires isolated data");
  assert.equal(currentFrame().viewport.activePages.flat().length,800,"paging fixture must contain exactly 800 apps");
  await iconTextures.prepareItems(collectTextureItems(currentFrame(), getLayoutPages()));
  await waitFor("paging benchmark warm",()=>!scene.getMotionSnapshot().active);
  const results=[];
  for(const baseline of [true,false]){
    for(const target of [9,0,9,0]){
      const intervals:number[]=[];let previousTime=performance.now();
      const off=app.on("presented",()=>{const now=performance.now();intervals.push(now-previousTime);previousTime=now;});
      const stats=scene.getUpdateStatistics(),start=performance.now();
      if(baseline)scene.invalidateStructure();
      commitDesktopPage(target);
      const commitMs=performance.now()-start;
      await waitFor("paging benchmark turn",()=>Math.abs(scene.getMotionSnapshot().desktopPageTrackX+target*app.contentSize.width)<0.05);
      await present("paging benchmark settled");off();
      const sorted=[...intervals].sort((a,b)=>a-b);
      results.push({baseline,target,commitMs,rebuilds:scene.getUpdateStatistics().structure-stats.structure,
        frames:intervals.length,p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),over16:intervals.filter(v=>v>16.67).length,
        memory:process.memoryUsage(),icons:iconTextures.residency()});
    }
  }
  writeFileSync(process.env.LAUNCHPAD_PAGING_BENCH!,JSON.stringify(results,null,2));
  console.log("Paging benchmark",JSON.stringify(results));
  requestQuit();
}
