import assert from "node:assert/strict";
import { createNativeCloseCoordinator } from "./nativeCloseCoordinator.js";

const calls: string[] = [];
let animated = true;
let failure: Error | null = null;
let releaseSettings: (() => void) | undefined;
let settings: Promise<void> | undefined;
const coordinator = createNativeCloseCoordinator({
  requestWindowClose: () => { calls.push("request"); },
  canAnimate: () => animated,
  hideWindow: () => { calls.push("hide"); },
  dismissLaunchpad: () => { calls.push("dismiss"); },
  setInteractive: enabled => { calls.push(`interactive:${enabled}`); },
  waitForSettingsApply: () => settings,
  flushSaves: async () => { calls.push("save"); if (failure) throw failure; },
  finishCloseAnimation: async () => { calls.push("animate"); },
  prepareRestart: async () => { calls.push("restart"); },
  hasSaveFailure: () => failure !== null,
  reportError: () => { calls.push("error"); },
  log: event => { calls.push(event); },
});

assert.equal(await coordinator.beforeClose(), false);
assert.deepEqual(calls.splice(0), ["window-close-hide", "dismiss"]);
animated = false;
assert.equal(await coordinator.beforeClose(), false);
assert.deepEqual(calls.splice(0), ["window-close-hide", "save", "hide"]);

failure = new Error("save failed");
const shutdown = coordinator.requestExternalShutdown();
const rejected = assert.rejects(shutdown, error => error === failure);
await assert.rejects(coordinator.requestExternalShutdown(), /already closing/);
settings = new Promise(resolve => { releaseSettings = resolve; });
const close = coordinator.beforeClose();
assert.equal(coordinator.closing, true);
assert.ok(!calls.includes("save"), "closing waits for in-flight settings before saving");
releaseSettings!();
await assert.rejects(close, error => error === failure);
await rejected;
assert.equal(coordinator.closing, false);
assert.ok(calls.includes("interactive:true"));
assert.ok(!calls.includes("error"), "existing save failure UI remains the sole notification");
assert.ok(!calls.includes("animate"));

calls.length = 0;
settings = undefined;
failure = null;
coordinator.requestQuit(true);
await coordinator.beforeClose();
assert.deepEqual(calls, ["restart-request", "request", "interactive:false", "save", "animate", "restart", "restart-ready"]);
const count = calls.length;
coordinator.requestQuit();
assert.equal(calls.length, count, "closing prevents duplicate quit requests");

const restartFailure = new Error("restart helper unavailable");
const failingCalls: string[] = [];
const failing = createNativeCloseCoordinator({
  requestWindowClose: () => {}, canAnimate: () => true, hideWindow: () => {}, dismissLaunchpad: () => {},
  setInteractive: enabled => { failingCalls.push(`interactive:${enabled}`); },
  waitForSettingsApply: () => undefined, flushSaves: async () => { failingCalls.push("saved"); },
  finishCloseAnimation: async () => {}, prepareRestart: async () => { throw restartFailure; },
  hasSaveFailure: () => false, reportError: error => { assert.equal(error, restartFailure); failingCalls.push("reported"); },
  log: () => {},
});
failing.requestQuit(true);
await assert.rejects(failing.beforeClose(), error => error === restartFailure);
assert.equal(failing.closing, false);
assert.deepEqual(failingCalls, ["interactive:false", "saved", "interactive:true", "reported"]);
const externalRetry = failing.requestExternalShutdown();
await failing.beforeClose();
await externalRetry;
assert.equal(failing.closing, true, "failed restart clears restart intent so a later normal shutdown can succeed");
console.log("Native close coordinator hide, save/apply ordering, failure retry and restart tests passed");
