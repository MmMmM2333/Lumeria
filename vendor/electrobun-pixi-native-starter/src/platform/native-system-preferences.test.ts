import { expect, test } from "bun:test";
import { readNativeSystemPreferences, subscribeNativeSystemPreferences } from "./native-system-preferences";

test("system preferences expose actual read-only Windows values and a disposable subscription", () => {
  const result=readNativeSystemPreferences();
  expect(result.ok).toBe(process.platform==="win32");
  if(result.ok){
    expect(["light","dark"]).toContain(result.value.appearance);
    expect(typeof result.value.reducedMotion).toBe("boolean");
    expect(typeof result.value.highContrast).toBe("boolean");
    expect(result.value.windowColor).toBeGreaterThanOrEqual(0);
    expect(result.value.textColor).toBeLessThanOrEqual(0xffffff);
  }
  let called=0;
  const stop=subscribeNativeSystemPreferences(()=>called++);
  expect(called).toBe(1);
  stop();
});
