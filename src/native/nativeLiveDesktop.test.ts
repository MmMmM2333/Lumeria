import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNativeLiveDesktop,nativeLiveDesktopConfig} from './nativeLiveDesktop.js';
import {assertLayoutDocument} from '../domain/layoutDocument.js';
import type {LiveDesktopRuntimeStatus,LiveDesktopBackgroundSupport} from '../api/liveDesktopContract.js';
const EMPTY_DIAGNOSTICS = Object.freeze({
  framesCopied: 0,
  frameTimeouts: 0,
  copyErrors: 0,
  commitErrors: 0,
  frameArrivedEvents: 0,
  frameArrivedDroppedSignals: 0,
  frameCopySamples: 0,
  frameCopyMicrosTotal: 0,
  lastFrameCopyMicros: 0,
  maxFrameCopyMicros: 0,
  frameCommitSamples: 0,
  frameCommitMicrosTotal: 0,
  lastFrameCommitMicros: 0,
  maxFrameCommitMicros: 0,
  configUpdates: 0,
  configErrors: 0,
  lastFrameWidth: 0,
  lastFrameHeight: 0,
  lastFrameFormat: 0,
  testPatternFrames: 0,
  pixelProbeSamples: 0,
  pixelProbeErrors: 0,
  blankFrameSkips: 0,
  shaderCopyFallbacks: 0,
  abandonedRendererWorkers: 0,
  reapedAbandonedRendererWorkers: 0,
  lastPixelProbeWidth: 0,
  lastPixelProbeHeight: 0,
  lastPixelProbeMinRgb: 0,
  lastPixelProbeMaxRgb: 0,
  lastPixelProbeAvgRgb: 0,
  lastPixelProbeMinAlpha: 0,
  lastPixelProbeMaxAlpha: 0,
  lastPixelProbeAvgAlpha: 0,
  lastShaderCopyError: "",
  lastAbandonedRendererReason: "",
  lastError: "",
  recentErrors: [],
});

const EMPTY_WINDOW_DIAGNOSTICS = Object.freeze({
  platform: "windows",
  available: true,
  reason: "available",
  detail: "",
  windowCount: 0,
  candidateCount: 0,
  windows: [],
  candidates: [],
});

function makeStatus(
  phase: LiveDesktopRuntimeStatus["phase"],
  active: boolean,
  generation: number,
): LiveDesktopRuntimeStatus {
  return {
    phase,
    active,
    generation,
    reason: phase,
    detail: "",
    diagnostics: EMPTY_DIAGNOSTICS,
    windowDiagnostics: EMPTY_WINDOW_DIAGNOSTICS,
  };
}

const SUPPORT: LiveDesktopBackgroundSupport = {
  platform: "windows",
  supportsLiveDesktopBackground: true,
  supportsLiveDesktopBackgroundEffects: true,
  reason: "available",
  detail: "",
  prerequisiteProbe: {
    supportsD3d11: true,
    adapterCount: 1,
    outputCount: 1,
    reason: "available",
    detail: "",
  },
  rendererProbe: {
    supportsDirectComposition: true,
    supportsWindowTarget: true,
    supportsRootVisual: true,
    supportsNativeRenderer: true,
    supportsNativeEffects: true,
    reason: "available",
    detail: "",
  },
};


const fixture=assertLayoutDocument(JSON.parse(readFileSync(new URL('../domain/fixtures/layout-v2-roundtrip.json',import.meta.url),'utf8')));
const settings={...fixture.settings,backgroundSource:'windowsLiveDesktop' as const};
let loads=0;const disabled=createNativeLiveDesktop({enabled:false,windowHandle:()=>1,visible:()=>true,load:async()=>{loads++;throw new Error('must not load');}});
await disabled.initialize();disabled.sync(settings,'dark');disabled.setVisible(true);disabled.dispose();assert.equal(loads,0);assert.equal(disabled.loaded,false);
const operations:string[]=[];let active=false,fail=false;
const live=createNativeLiveDesktop({enabled:true,windowHandle:()=>42,visible:()=>true,load:async()=>input=>{
 const request=input as {operation:string};operations.push(request.operation);
 if(request.operation==='support')return SUPPORT;
 if(request.operation==='start'){if(fail)return {...makeStatus('failed',false,1),detail:'capture unavailable'};active=true;}
 if(request.operation==='stop')active=false;
 return makeStatus(active?'running':'stopped',active,1);
}});
await live.initialize();assert.deepEqual(operations,['support']);live.sync(settings,'dark');assert.deepEqual(operations,['support','configure','start','visible']);
live.setVisible(false);live.sync({...settings,backgroundSource:'systemMaterial'},'dark');assert.equal(live.status?.active,false);
fail=true;assert.throws(()=>live.sync(settings,'dark'),/capture unavailable/);fail=false;live.stop();live.sync(settings,'dark');assert.equal(live.status?.active,true);
live.dispose();assert.equal(live.status?.active,false);const length=operations.length;live.dispose();live.sync(settings,'dark');assert.equal(operations.length,length);
const config=nativeLiveDesktopConfig({...settings,backgroundEffect:'acrylic'},'light');assert.equal(config.blurStrength,settings.backgroundAcrylicBlurStrength);assert.equal(config.disableMouseRelay,true);assert.equal(config.debugFrameSourceOverride,null);
console.log('Live Desktop default-off, lazy load, failure/retry, switching and release passed');
