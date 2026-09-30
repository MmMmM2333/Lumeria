import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runNativeProcess } from "./runNativeProcess.js";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { parseNativeStressOptions } from "../src/native/diagnostics/nativeStressConfig.js";
import { installNativeStressFixture } from "./nativeStressFixture.js";
import { summarizeNativeStress } from "./summarizeNativeStress.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modeArgument = process.argv[2] ?? "--smoke";
if (modeArgument !== "--dev" && modeArgument !== "--smoke") {
  throw new Error(`Expected --dev or --smoke, received: ${modeArgument}`);
}
const nativeMode: "dev" | "smoke" = modeArgument === "--dev" ? "dev" : "smoke";
const toggleSmoke=process.argv.includes("--toggle-smoke");
const dataIconsSmoke=process.argv.includes("--data-icons");
const autoScanSmoke=process.argv.includes("--auto-scan");
if(autoScanSmoke&&(nativeMode!=="dev"||!process.argv.includes("--isolated")||process.argv.includes("--settings-only")))throw new Error("Auto-scan verification requires --dev --isolated desktop mode");
if(dataIconsSmoke&&(nativeMode!=="dev"||!process.argv.includes("--isolated")))throw new Error("Data/icon verification requires --dev --isolated");
if(dataIconsSmoke&&process.argv.includes("--settings-only"))throw new Error("Data/icon verification requires the desktop scene");
if(toggleSmoke&&(nativeMode!=="dev"||!process.argv.includes("--settings-only")||!process.argv.includes("--isolated")))throw new Error("Toggle smoke requires --dev --isolated --settings-only");
const stress = process.argv.includes("--stress") ? parseNativeStressOptions(process.argv) : null;
if (stress && nativeMode !== "dev") throw new Error("Stress testing requires dev mode");
if (!stress && process.argv.some(arg => arg.startsWith("--stress-"))) throw new Error("Stress options require --stress");
if (stress && (process.argv.some(arg => ["--settings-only", "--folder-rename", "--restart-smoke", "--search", "--launch-visual"].includes(arg))
  || Object.keys(process.env).some(key => /^(LAUNCHPAD_.*_BENCH|LAUNCHPAD_LIVE_DESKTOP_PROOF)$/.test(key) && process.env[key]))) {
  throw new Error("Run stress separately from smoke/benchmark scenarios");
}
const stressDir = stress ? join(projectRoot, "artifacts", "native-stress", `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`) : null;
if (stressDir) mkdirSync(stressDir, { recursive: true });
const folderRenameSmoke = process.argv.includes("--folder-rename");
const launchVisualSmoke = process.argv.includes("--launch-visual");
const searchSmoke = process.argv.includes("--search");
const dragNavigationSmoke = process.argv.includes("--drag-navigation");
if (searchSmoke && nativeMode !== "smoke") throw new Error("Search verification requires smoke mode");
if (launchVisualSmoke && nativeMode !== "smoke") throw new Error("Launch visual verification requires smoke mode");
const realImport=process.argv.includes("--import-real");
const importPreview=process.argv.includes("--import-preview")||process.argv.includes("--import-check");
const isolated = realImport || importPreview || Boolean(stress) || nativeMode === "smoke" || folderRenameSmoke || process.argv.includes("--isolated");
const runtimeArgument=process.argv.find(argument=>argument.startsWith("--runtime="))?.slice("--runtime=".length);
const isolatedRuntime=runtimeArgument?resolve(runtimeArgument):null;
if(isolatedRuntime&&!isolated)throw new Error("A separate runtime requires isolated data");
const productRuntime=isolatedRuntime!==null&&existsSync(join(isolatedRuntime,"lumeria.json"));
const isolatedLauncher=isolatedRuntime?join(isolatedRuntime,productRuntime?"Lumeria.exe":"bin/launcher.exe"):null;
const runner = join(
  projectRoot,
  "vendor",
  "electrobun-pixi-native-starter",
  "consumer",
  "run-electrobun.mjs",
);
const artifactDir = join(projectRoot, "artifacts", "native-smoke");
const dataIconsProofDir=dataIconsSmoke?mkdtempSync(join(projectRoot,"artifacts","data-icons-native-")):null;
const autoScanProofDir=autoScanSmoke?mkdtempSync(join(projectRoot,"artifacts","auto-scan-native-")):null;
const toggleProofDir=toggleSmoke?mkdtempSync(join(tmpdir(),"lumeria-toggle-proof-")):null;
if (nativeMode === "smoke" || folderRenameSmoke) mkdirSync(artifactDir, { recursive: true });
const markerPath = join(tmpdir(), `launchpad-native-smoke-${process.pid}.json`);
const dataDir = realImport ? join(projectRoot,"artifacts","native-import-real-data") : stressDir ? join(stressDir, "data") : mkdtempSync(join(tmpdir(), "launchpad-native-data-"));
if (stressDir||realImport) mkdirSync(dataDir,{recursive:true});
const restartPath=join(dataDir,"restart-request.json");
let restartAttempt=0;
const iconPath = join(dataDir, "smoke-icon.png");
const childLaunchHelperPath = join(dataDir, "child-launch.mjs");
const childLaunchMarkerPath = join(dataDir, "child-launched.txt");
const scanRoot = join(dataDir, "catalog");
mkdirSync(scanRoot,{recursive:true});
writeFileSync(
  join(scanRoot, "Catalog Sample.url"),
  "[InternetShortcut]\r\nURL=https://example.invalid/native-catalog\r\n",
  "utf8",
);
const iconCanvas = createCanvas(64, 64);
const iconContext = iconCanvas.getContext("2d");
iconContext.fillStyle = "#ef3b6d";
iconContext.fillRect(0, 0, 64, 64);
iconContext.fillStyle = "#3b82f6";
iconContext.fillRect(16, 16, 32, 32);
writeFileSync(iconPath, iconCanvas.toBuffer("image/png"));
writeFileSync(
  childLaunchHelperPath,
  'import { writeFileSync } from "node:fs";\nwriteFileSync(process.argv[2], "launched", "utf8");\n',
  "utf8",
);
const fixture = JSON.parse(readFileSync(
  join(projectRoot, "src", "domain", "fixtures", "layout-v2-roundtrip.json"),
  "utf8",
)) as { pages: unknown[][]; settings: Record<string, unknown> };
fixture.pages = [[
  {
    id: "native-layout-icon",
    type: "manualApp",
    name: "已加载布局",
    emoji: "L",
    customIconPath: iconPath,
    launchTarget: { kind: "executable", path: process.execPath },
    ...(launchVisualSmoke ? {launchArgs: `"${childLaunchHelperPath}" "${childLaunchMarkerPath}"`} : {}),
  },
  {
    id: "native-webgpu",
    type: "manualApp",
    name: "Native WebGPU",
    emoji: "🧭",
    launchTarget: { kind: "url", path: "https://example.invalid/webgpu" },
  },
  {
    id: "native-settings",
    type: "manualApp",
    name: "Settings",
    emoji: "⚙️",
    launchTarget: { kind: "url", path: "https://example.invalid/settings" },
  },
  {
    id: "native-folder",
    type: "folder",
    name: "原生文件夹",
    childPages: [[
      {
        id: "native-folder-child-1",
        type: "manualApp",
        name: "文件夹子项一",
        emoji: "1️⃣",
        launchTarget: { kind: "url", path: "https://example.invalid/folder-1" },
      },
      {
        id: "native-folder-child-2",
        type: "manualApp",
        name: "文件夹子项二",
        emoji: "2️⃣",
        launchTarget: { kind: "url", path: "https://example.invalid/folder-2" },
      },
      {
        id: "native-folder-child-3",
        type: "manualApp",
        name: "文件夹子项三",
        emoji: "3️⃣",
        launchTarget: { kind: "url", path: "https://example.invalid/folder-3" },
      },
      {
        id: "native-folder-child-4",
        type: "manualApp",
        name: "文件夹子项四",
        emoji: "4️⃣",
        launchTarget: { kind: "url", path: "https://example.invalid/folder-4" },
      },
    ], [
      {
        id: "native-folder-child-launch",
        type: "manualApp",
        name: "启动验证",
        emoji: "🚀",
        customIconPath: iconPath,
        launchTarget: { kind: "executable", path: process.execPath },
        launchArgs: `"${childLaunchHelperPath}" "${childLaunchMarkerPath}"`,
      },
    ]],
  },
], [
  {
    id: "native-second-page",
    type: "manualApp",
    name: "Second Page",
    emoji: "2️⃣",
    launchTarget: { kind: "url", path: "https://example.invalid/second-page" },
  },
], [
  {
    id: "native-third-page",
    type: "manualApp",
    name: "Third Page",
    emoji: "3️⃣",
    launchTarget: { kind: "url", path: "https://example.invalid/third-page" },
  },
]];
fixture.settings.backgroundSource = isolated && process.argv.includes("--fullscreen") ? "customImage" : "systemMaterial";
fixture.settings.windowMode = isolated && process.argv.includes("--fullscreen") ? "fullscreen" : "windowed";
fixture.settings.backgroundImagePath = isolated && process.argv.includes("--fullscreen") ? iconPath : null;
const invalidWallpaper=process.argv.find(argument=>argument.startsWith("--invalid-wallpaper="))?.slice("--invalid-wallpaper=".length);
if(invalidWallpaper){
  if(!isolated||!["missing","corrupt"].includes(invalidWallpaper))throw new Error("Invalid wallpaper smoke requires isolated data and missing or corrupt mode");
  fixture.settings.backgroundSource="customImage";
  const invalidWallpaperPath=join(dataDir,"invalid-wallpaper.png");
  fixture.settings.backgroundImagePath=invalidWallpaperPath;
  if(invalidWallpaper==="corrupt")writeFileSync(invalidWallpaperPath,"not a PNG","utf8");
}
fixture.settings.backgroundBaseColor = "#090b14";
fixture.settings.backgroundBaseOpacity = 100;
if(isolated&&process.argv.includes("--acrylic")){
  fixture.settings.backgroundSource="systemMaterial";
  fixture.settings.backgroundBaseOpacity=0;
  fixture.settings.windowEffectMaterial="acrylic";
  fixture.settings.windowEffectAppearance=process.argv.includes("--light")?"light":"dark";
}
fixture.settings.gridRows = 4;
if(process.argv.includes("--light"))fixture.settings.settingsThemePreference="light";
if(process.argv.includes("--dark"))fixture.settings.settingsThemePreference="dark";
fixture.pages[0]!.push({
  id: "native-folder-other", type: "folder", name: "另一个文件夹",
  childPages: [[{ id: "native-other-child", type: "manualApp", name: "另一个子项", emoji: "🌟",
    launchTarget: { kind: "url", path: "https://example.invalid/other" } }]],
});
if(process.argv.includes("--retained-folders")){
  if(!isolated)throw new Error("Retained folder verification requires isolated data");
  fixture.pages.push([{id:"native-fourth-page",type:"manualApp",name:"Fourth Page",emoji:"4",
    launchTarget:{kind:"url",path:"https://example.invalid/fourth-page"}}]);
}
fixture.settings.gridCols = 7;
fixture.settings.iconSize = 64;
fixture.settings.folderRows = 2;
fixture.settings.folderCols = 2;
if(dragNavigationSmoke){fixture.settings.folderRows=3;fixture.settings.folderCols=4;}
fixture.settings.folderIconSizeMode = "global";
fixture.settings.textless = false;
fixture.settings.scanRoots = [{
  id: "native-smoke-catalog",
  type: "customDirectory",
  label: "Native smoke catalog",
  path: scanRoot,
  enabled: true,
  removable: true,
  maxDepth: 2,
  maxEntries: 20,
}];
fixture.settings.scanKeywordBlacklist = [];
fixture.settings.scanKeywordAllowlist = [];
fixture.settings.scanAppBlacklist = [];
if(searchSmoke){
  const canvas=createCanvas(256,256),context=canvas.getContext("2d");
  const items=Array.from({length:180},(_,index)=>{
    context.fillStyle=`hsl(${index*37%360},75%,55%)`;context.fillRect(0,0,256,256);
    context.fillStyle="#ffffff";context.font="80px sans-serif";context.fillText(String(index),20,150);
    const path=join(dataDir,`search-icon-${index}.png`);writeFileSync(path,canvas.toBuffer("image/png"));
    return {id:`search-${index}`,type:"manualApp",name:`${index%3===0?"Word":"应用工具"} ${index}`,customIconPath:path,
      launchTarget:{kind:"executable",path:process.execPath},launchArgs:`"${childLaunchHelperPath}" "${childLaunchMarkerPath}"`};
  });
  fixture.pages=[];for(let index=0;index<items.length;index+=28)fixture.pages.push(items.slice(index,index+28));
  fixture.settings.mainWindowShortcut=null;
}
if(process.argv.includes("--settings-only"))fixture.settings.mainWindowShortcut=null;
if(process.env.LAUNCHPAD_PAGING_BENCH){
  if(!isolated)throw new Error("Paging benchmark requires isolated data");
  const canvas=createCanvas(128,128),context=canvas.getContext("2d");
  const items=Array.from({length:800},(_,index)=>{
    context.fillStyle=`hsl(${index*137.5%360},75%,55%)`;context.fillRect(0,0,128,128);
    context.fillStyle="#ffffff";context.font="32px sans-serif";context.fillText(String(index),12,72);
    const path=join(dataDir,`paging-${index}.png`);writeFileSync(path,canvas.toBuffer("image/png"));
    return {id:`paging-${index}`,type:"manualApp",name:`应用 ${index}`,customIconPath:path,launchTarget:{kind:"url",path:"https://example.invalid/"}};
  });
  fixture.pages=Array.from({length:10},(_,page)=>items.slice(page*80,(page+1)*80));
  fixture.settings.gridRows=8;fixture.settings.gridCols=10;fixture.settings.mainWindowShortcut=null;
  fixture.settings.scanRoots=[];
  fixture.settings.windowMode="fullscreen";
}
if(process.env.LAUNCHPAD_INTERACTION_BENCH){
  if(!isolated)throw new Error("Interaction benchmark requires isolated data");
  // A previous successful run must not satisfy this run's evidence check.
  rmSync(join(process.env.LAUNCHPAD_INTERACTION_BENCH,"proof.json"),{force:true});
  const count=Number(process.env.LAUNCHPAD_INTERACTION_BENCH_APPS??28);
  if(!Number.isInteger(count)||count<28||count>800)throw new Error("Interaction benchmark app count must be between 28 and 800");
  const items=Array.from({length:count},(_,index)=>({id:`bench-${index}`,type:"manualApp",name:`Benchmark ${index}`,
    customIconPath:iconPath,launchTarget:{kind:"url",path:"https://example.invalid/"}}));
  fixture.pages=Array.from({length:Math.ceil(count/48)},(_,index)=>items.slice(index*48,(index+1)*48));
  fixture.settings.gridCols=8;fixture.settings.gridRows=6;
  fixture.settings.mainWindowShortcut=null;
}
if(process.env.LAUNCHPAD_LIVE_DESKTOP_PROOF){
  if(!isolated||process.env.LUMERIA_EXPERIMENTAL_LIVE_DESKTOP!=="1")throw new Error("Live Desktop verification requires isolated data and explicit experiment opt-in");
  fixture.settings.backgroundSource="windowsLiveDesktop";fixture.settings.backgroundEffect="none";
  fixture.settings.backgroundBaseOpacity=0;fixture.settings.backgroundLiveDesktopOpacity=100;
  fixture.settings.windowEffectMaterial="none";fixture.settings.mainWindowShortcut=null;
}
if (stress) installNativeStressFixture(fixture, dataDir, stress);
if (stressDir) {
  writeFileSync(join(stressDir, "config.json"), JSON.stringify(stress, null, 2));
  console.log(`Stress artifacts: ${stressDir}\nCreate stop.request there to stop actions and preserve the process.`);
}
if(importPreview){
  const sample=(folder:string,name:string)=>{const dir=join(scanRoot,folder);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,name+".url"),`[InternetShortcut]\r\nURL=https://example.invalid/import/${encodeURIComponent(folder)}/${encodeURIComponent(name)}\r\n`);};
  for(const name of ["应用 A","应用 B","应用 C","应用 D"])sample("示例应用组",name);
  for(const name of ["工具 A","工具 B","工具 C"])sample("工具合集",name);
  sample("示例播放器","示例播放器");sample("示例播放器","Uninstall 示例播放器");
  const userSample=join(dataDir,"user-menu"),windowsSample=join(dataDir,"windows-apps");mkdirSync(userSample);mkdirSync(windowsSample);
  fixture.settings.scanRoots=[
    {id:"native-smoke-catalog",type:"startMenuSystem",label:"系统开始菜单",path:scanRoot,enabled:true,removable:true,maxDepth:8,maxEntries:100},
    {id:"preview-user",type:"startMenuUser",label:"用户开始菜单",path:userSample,enabled:true,removable:true,maxDepth:8,maxEntries:100},
    {id:"preview-windows",type:"customDirectory",label:"Windows 应用（隔离示例）",path:windowsSample,enabled:true,removable:true,maxDepth:8,maxEntries:100},
  ];
  fixture.pages=[[]];fixture.settings.localePreference="zh-CN";fixture.settings.settingsThemePreference="dark";fixture.settings.mainWindowShortcut=null;
  fixture.settings.scanKeywordBlacklist=["uninstall"];
  fixture.settings.importState={completed:false,policies:[{id:"native-smoke-catalog",enabled:true,grouped:true,keepSingle:false}],bindings:[],dismissedGroups:[],deferredIds:[],recentIds:[]};
  fixture.settings.windowMode="windowed";
}
if(!realImport)writeFileSync(join(dataDir, "layout.json"), JSON.stringify(fixture), "utf8");
if (stressDir) copyFileSync(join(dataDir, "layout.json"), join(stressDir, "initial-layout.json"));
if (nativeMode === "smoke") rmSync(markerPath, { force: true });
if (nativeMode === "smoke") rmSync(childLaunchMarkerPath, { force: true });
try {
  // A normal native dev session ends with its window. The Starter --watch command
  // intentionally outlives windows and previously retained the Windows build lock.
  let status:number;
  do {
  rmSync(restartPath,{force:true});
  status = await runNativeProcess(isolatedLauncher??process.execPath, isolatedRuntime?[]:[runner, "start"], {
    cwd: isolatedRuntime??projectRoot,
    env: {
      ...process.env,
      LUMERIA_NATIVE_DIAGNOSTICS_BUILD: "1",
      ...(stressDir ? { LAUNCHPAD_NATIVE_STRESS_DIR: stressDir,
        LAUNCHPAD_NATIVE_STRESS_MEMORY_SCRIPT: join(projectRoot, "scripts", "Capture-LumeriaMemory.ps1") } : {}),
      ...(!productRuntime||process.env.LAUNCHPAD_NATIVE_DATA_HOST?{LAUNCHPAD_NATIVE_DATA_HOST: process.env.LAUNCHPAD_NATIVE_DATA_HOST??join(
        resolve(projectRoot,process.env.CARGO_TARGET_DIR??"target"),
        "release",
        "lumeria_native_data.exe",
      )}:{}),
      LAUNCHPAD_NATIVE_MODE: nativeMode,
      ...(realImport?{LAUNCHPAD_NATIVE_IMPORT_PREVIEW:"1"}:{}),
      ...(importPreview?{LAUNCHPAD_NATIVE_IMPORT_PREVIEW:"1",LAUNCHPAD_NATIVE_IMPORT_PROOF:join(dataDir,"import-proof.json"),LAUNCHPAD_NATIVE_IMPORT_CHECK:process.argv.includes("--import-check")?"1":"0",LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR:artifactDir}:{}),
      LAUNCHPAD_NATIVE_FOLDER_RENAME_SMOKE: folderRenameSmoke ? "1" : "0",
      LAUNCHPAD_NATIVE_LAUNCH_VISUAL_SMOKE: launchVisualSmoke ? "1" : "0",
      LAUNCHPAD_NATIVE_SEARCH_SMOKE: searchSmoke ? "1" : "0",
      LAUNCHPAD_NATIVE_DRAG_NAVIGATION_SMOKE: dragNavigationSmoke ? "1" : "0",
      LAUNCHPAD_NATIVE_WALLPAPER_FAILURE_SMOKE:invalidWallpaper??"",
      ...(process.argv.includes("--touchpad-capture")?{LAUNCHPAD_TOUCHPAD_CAPTURE_DIR:join(projectRoot,"artifacts","touchpad-captures")}:{}),
      LAUNCHPAD_NATIVE_SETTINGS_ONLY:process.argv.includes("--settings-only")?"1":"0",
      ...(toggleProofDir?{LAUNCHPAD_NATIVE_TOGGLE_PROOF:toggleProofDir}:{}),
      ...(dataIconsProofDir?{LAUNCHPAD_DATA_ICONS_PROOF:dataIconsProofDir}:{}),
      ...(autoScanProofDir?{LAUNCHPAD_AUTO_SCAN_PROOF:autoScanProofDir}:{}),
      LAUNCHPAD_NATIVE_RESTART_FILE:restartPath,
      LAUNCHPAD_NATIVE_RESTART_ATTEMPT:String(restartAttempt++),
      LAUNCHPAD_NATIVE_RESTART_SMOKE:process.argv.includes("--restart-smoke")?"1":"0",
      LAUNCHPAD_NATIVE_WINDOW_INPUT_SMOKE: process.argv.includes("--window-input") ? "1" : "0",
      ...(isolated ? { LUMERIA_NATIVE_DATA_DIR: dataDir } : {}),
      ...(nativeMode === "smoke" || folderRenameSmoke ? {
        LAUNCHPAD_NATIVE_SMOKE_MARKER: markerPath,
        LAUNCHPAD_NATIVE_SMOKE_ARTIFACT_DIR: artifactDir,
        LAUNCHPAD_NATIVE_CHILD_LAUNCH_MARKER: childLaunchMarkerPath,
      } : {}),
    },
    stdio: "inherit",
  });
  } while(status===0&&existsSync(restartPath));
  if(process.argv.includes("--restart-smoke")&&restartAttempt!==3)throw new Error(`Restart smoke expected exactly three app processes, got ${restartAttempt}`);
  if(process.argv.includes("--import-check")&&status!==130&&!existsSync(join(dataDir,"import-proof.json")))throw new Error("Native import targeted check did not finish");
  if (status === 130) process.exitCode = 130;
  else if (status !== 0) throw new Error(`Electrobun exited with status ${status}`);
  if(toggleProofDir&&status!==130){
    const proof=join(toggleProofDir,"proof.json");
    if(!existsSync(proof))throw new Error(`Native toggle pixel checks did not finish; evidence: ${toggleProofDir}`);
    console.log(`Native toggle GPU proof: ${toggleProofDir}`);
  }
  if(dataIconsProofDir&&status!==130){
    const proofPath=join(dataIconsProofDir,"result.json");
    if(!existsSync(proofPath)||JSON.parse(readFileSync(proofPath,"utf8")).passed!==true)throw new Error(`Native data/icon checks did not finish; evidence: ${dataIconsProofDir}`);
    const journal=readFileSync(join(dataDir,"logs/native-runtime.log"),"utf8");
    if(/"event":"(?:uncaught-exception|unhandled-rejection|fatal|frame-error)"/.test(journal))throw new Error("Native data/icon journal contains runtime failures");
    console.log(`Native data/icon GPU proof: ${dataIconsProofDir}`);
  }
  if(autoScanProofDir&&status!==130){
    const proofPath=join(autoScanProofDir,"result.json");
    if(!existsSync(proofPath)||JSON.parse(readFileSync(proofPath,"utf8")).passed!==true)throw new Error(`Native auto-scan checks did not finish; evidence: ${autoScanProofDir}`);
    const journal=readFileSync(join(dataDir,"logs/native-runtime.log"),"utf8");
    if(/"event":"(?:uncaught-exception|unhandled-rejection|fatal|frame-error)"/.test(journal))throw new Error("Native auto-scan journal contains runtime failures");
    console.log(`Native auto-scan proof: ${autoScanProofDir}`);
  }
  if (stressDir && status !== 130) {
    const proofPath = join(stressDir, "result.json");
    if (!existsSync(proofPath)) throw new Error("Stress process exited without a result; inspect retained logs");
    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    if (proof.status !== "passed") throw new Error(`Stress ${proof.status}: ${proof.error ?? "stopped before completion"}`);
    console.log(`Stress passed: ${stressDir}`);
  }
  if(process.env.LAUNCHPAD_INTERACTION_BENCH&&status!==130){
    const proofPath=join(process.env.LAUNCHPAD_INTERACTION_BENCH,"proof.json");
    if(!existsSync(proofPath))throw new Error("Native interaction benchmark did not produce evidence");
    const proof=JSON.parse(readFileSync(proofPath,"utf8"));
    if(!(proof.icons>=20)||!(proof.drag?.frames>0)||!Number.isFinite(proof.timings?.createFolderFirstPresentMs))throw new Error("Native interaction benchmark evidence is incomplete");
    const journal=readFileSync(join(dataDir,"logs/native-runtime.log"),"utf8");
    if(/"event":"(?:uncaught-exception|unhandled-rejection|fatal)"/.test(journal))throw new Error("Native interaction benchmark journal contains failures");
  }
  if(process.env.LAUNCHPAD_LIVE_DESKTOP_PROOF&&status!==130){
    const proof=JSON.parse(readFileSync(join(process.env.LAUNCHPAD_LIVE_DESKTOP_PROOF,"proof.json"),"utf8"));
    if(!proof.running?.active||!proof.restarted?.active||proof.stopped?.active!==false)throw new Error("Live Desktop smoke did not complete");
    const journal=readFileSync(join(dataDir,"logs/native-runtime.log"),"utf8");
    if(/"event":"(?:uncaught-exception|unhandled-rejection|fatal)"/.test(journal))throw new Error("Live Desktop smoke journal contains runtime failures");
  }
  if (dragNavigationSmoke && status !== 130) {
    if (!existsSync(markerPath) || JSON.parse(readFileSync(markerPath,"utf8")).dragNavigation !== "verified") throw new Error("Native drag navigation verification did not complete");
    console.log("Native drag navigation verification passed");
  } else if (searchSmoke && status !== 130) {
    if (!existsSync(markerPath) || JSON.parse(readFileSync(markerPath,"utf8")).search !== "verified") throw new Error("Native search verification did not complete");
    console.log("Native search verification passed");
  } else if (launchVisualSmoke && status !== 130) {
    if (!existsSync(markerPath) || JSON.parse(readFileSync(markerPath,"utf8")).launchVisual !== "verified") throw new Error("Native launch visual verification did not complete");
    console.log("Native launch visual and cancellation verification passed");
  } else if (invalidWallpaper && status !== 130) {
    if(!existsSync(markerPath)||JSON.parse(readFileSync(markerPath,"utf8")).wallpaper!==invalidWallpaper)throw new Error("Native wallpaper failure smoke did not complete");
    console.log(`Native ${invalidWallpaper} wallpaper smoke passed`);
  } else if (folderRenameSmoke && status !== 130) {
    if (!existsSync(markerPath) || JSON.parse(readFileSync(markerPath, "utf8")).folderRename !== "verified") {
      throw new Error("Native folder rename smoke did not complete");
    }
    console.log("Native folder rename smoke passed");
  }
  if (nativeMode === "smoke" && !folderRenameSmoke && !launchVisualSmoke && !searchSmoke && !dragNavigationSmoke && !invalidWallpaper && status !== 130) {
    if (!existsSync(markerPath)) throw new Error("Electrobun worker exited without completing the native smoke test");
    const proof = JSON.parse(readFileSync(markerPath, "utf8")) as {
      backingHeight?: unknown;
      backingWidth?: unknown;
      cjkLabelPixels?: unknown;
      coloredIconPixels?: unknown;
      catalogApps?: unknown;
      desktopPageMotionObserved?: unknown;
      dpiResolution?: unknown;
      dpiTransition?: unknown;
      folderChildLaunchObserved?: unknown;
      folderCloseMotionObserved?: unknown;
      folderOpenMotionObserved?: unknown;
      folderPageMotionObserved?: unknown;
      folderPageNavigation?: unknown;
      height?: unknown;
      iconForegroundPixels?: unknown;
      reconciledNodes?: unknown;
      resizeLiveBackingObserved?: unknown;
      resizeMode?: unknown;
      resizeObserved?: unknown;
      resizePresentCount?: unknown;
      resizeSettledBackingObserved?: unknown;
      resolution?: unknown;
      restoreObserved?: unknown;
      restorePresentCount?: unknown;
      presented?: unknown;
      loadedLayout?: unknown;
      pageCount?: unknown;
      pageNavigation?: unknown;
      inputNavigation?: unknown;
      folderInterruptions?: unknown;
      folderTitleSamples?: unknown;
      structuredLaunchFailureObserved?: unknown;
      visibleNodes?: unknown;
      width?: unknown;
    };
    writeFileSync(join(artifactDir, "proof.json"), JSON.stringify(proof, null, 2), "utf8");
    if (proof.presented !== true) throw new Error("Native smoke proof did not observe a public presentation");
    if (proof.loadedLayout !== true || proof.catalogApps !== 1) {
      throw new Error("Native smoke proof did not load the isolated layout and scanned catalog");
    }
    if (
      !Number.isInteger(proof.coloredIconPixels)
      || Number(proof.coloredIconPixels) <= 0
      || !Array.isArray(proof.iconForegroundPixels)
      || proof.iconForegroundPixels.length < 1
      || proof.iconForegroundPixels.some((pixels) => (
        !Number.isInteger(pixels) || Number(pixels) <= 0
      ))
    ) {
      throw new Error("Native smoke proof did not present the local PNG icon through the GPU texture path");
    }
    if (
      !Array.isArray(proof.cjkLabelPixels)
      || proof.cjkLabelPixels.length < 1
      || proof.cjkLabelPixels.some((pixels) => !Number.isInteger(pixels) || Number(pixels) <= 0)
    ) {
      throw new Error("Native smoke proof did not render the CJK label through the configured font fallback");
    }
    if (
      !Number.isInteger(proof.visibleNodes)
      || !Number.isInteger(proof.reconciledNodes)
      || Number(proof.visibleNodes) <= 0
      || Number(proof.visibleNodes) > Number(proof.reconciledNodes)
    ) {
      throw new Error("Native smoke proof did not present every reconciled scene node visibly");
    }
    if (
      proof.resizeObserved !== true
      || proof.resizeMode !== "live"
      || proof.resizeLiveBackingObserved !== true
      || !Number.isInteger(proof.resizePresentCount)
      || Number(proof.resizePresentCount) <= 0
      || proof.resizeSettledBackingObserved !== true
      || proof.restoreObserved !== true
      || !Number.isInteger(proof.restorePresentCount)
      || Number(proof.restorePresentCount) <= 0
    ) {
      throw new Error("Native smoke proof did not complete resize and minimize/restore lifecycle checks");
    }
    if (
      (proof.dpiTransition !== "verified-display-fallback"
        && proof.dpiTransition !== "skipped-no-mixed-dpi-display")
      || typeof proof.dpiResolution !== "number"
      || !Number.isFinite(proof.dpiResolution)
      || proof.dpiResolution <= 0
    ) {
      throw new Error("Native smoke proof did not report a valid DPI transition result");
    }
    if (
      !Number.isInteger(proof.pageCount)
      || Number(proof.pageCount) < 1
      || proof.pageNavigation !== (Number(proof.pageCount) > 1 ? "verified" : "skipped-single-page")
      || (Number(proof.pageCount) > 1 && proof.desktopPageMotionObserved !== true)
      || proof.structuredLaunchFailureObserved !== true
      || proof.inputNavigation !== "verified"
      || proof.folderInterruptions !== "verified"
      || proof.folderTitleSamples !== 20
    ) {
      throw new Error("Native smoke proof did not complete paging and structured launch failure checks");
    }
    if (
      proof.folderOpenMotionObserved !== true
      || proof.folderPageNavigation !== "verified"
      || proof.folderPageMotionObserved !== true
      || proof.folderChildLaunchObserved !== true
      || proof.folderCloseMotionObserved !== true
    ) {
      throw new Error("Native smoke proof did not complete the folder animation and child launch flow");
    }
    if (
      typeof proof.width !== "number"
      || typeof proof.height !== "number"
      || typeof proof.resolution !== "number"
      || proof.backingWidth !== Math.round(proof.width * proof.resolution)
      || proof.backingHeight !== Math.round(proof.height * proof.resolution)
    ) {
      throw new Error("Native smoke proof has a mismatched logical viewport and GPU backing size");
    }
  }
} finally {
  if (stressDir) {
    try { await summarizeNativeStress(stressDir); }
    catch (error) { console.error("Stress summary could not be generated; raw evidence is retained:", error); }
  }
  if(nativeMode==="smoke"&&existsSync(join(dataDir,"logs","native-runtime.log"))){
    copyFileSync(join(dataDir,"logs","native-runtime.log"),join(artifactDir,"native-runtime.log"));
  }
  if (!stressDir&&!realImport) rmSync(dataDir, { force: true, recursive: true });
  if (nativeMode === "smoke" || folderRenameSmoke) rmSync(markerPath, { force: true });
}
