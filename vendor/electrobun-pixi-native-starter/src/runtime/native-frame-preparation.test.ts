import { expect, test } from "bun:test";
import { NativeFramePreparation } from "./native-frame-preparation";
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
test("ready resources render synchronously; removed callbacks do not run", () => {
  const gate = new NativeFramePreparation(() => {}, () => {});
  let calls = 0;
  const off = gate.add(() => { calls++; });
  expect(gate.prepare()).toBe(true); off();
  expect(gate.prepare()).toBe(true); expect(calls).toBe(1);
});
test("pending resources defer presentation without restarting work", async () => {
  let finish!: () => void, ready = 0, calls = 0, loaded = false;
  const gate = new NativeFramePreparation(() => ready++, () => {});
  gate.add(() => { calls++; if (!loaded) return new Promise<void>(resolve => { finish = () => { loaded = true; resolve(); }; }); });
  expect(gate.prepare()).toBe(false); expect(gate.pending).toBe(true);
  expect(gate.prepare()).toBe(false); expect(calls).toBe(1);
  finish(); await flush(); expect(ready).toBe(1); expect(gate.prepare()).toBe(true);
});
test("sync throws and rejected preparations reach failure handler", async () => {
  for (const asyncFailure of [false, true]) {
    const error = Error("decode failed"); let seen: unknown;
    const gate = new NativeFramePreparation(() => { throw Error("must not present"); }, value => { seen = value; });
    gate.add(() => Promise.resolve());
    gate.add(() => { if (asyncFailure) return Promise.reject(error); throw error; });
    expect(gate.prepare()).toBe(false); await flush(); expect(seen).toBe(error);
  }
});
test("closing during preparation prevents late presentation and errors", async () => {
  for (const reject of [false, true]) {
    let finish!: () => void, callbacks = 0;
    const gate = new NativeFramePreparation(() => callbacks++, () => callbacks++);
    gate.add(() => new Promise<void>((resolve, fail) => { finish = () => reject ? fail(Error("closed")) : resolve(); }));
    gate.prepare(); gate.close(); finish(); await flush();
    expect(callbacks).toBe(0); expect(gate.prepare()).toBe(false);
  }
});
