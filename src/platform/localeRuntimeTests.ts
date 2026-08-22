import { createLocaleRuntimePort } from "./localeRuntime.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[Locale runtime test failed] ${message}`);
}

export async function runLocaleRuntimeTests() {
  const browser = createLocaleRuntimePort({
    isNative: () => false,
    getSystemLanguages: () => ["fr-FR", "en-GB"],
  });
  const browserBootstrap = await browser.bootstrap();
  assert(browserBootstrap.ok, "browser bootstrap should resolve without a native bridge");
  assert(browserBootstrap.state.resolvedLocale === "en-US", "browser bootstrap should use navigator-style language priority");
  const browserApply = await browser.applyPreference("zh-CN");
  assert(browserApply.ok && browserApply.state.resolvedLocale === "zh-CN", "browser apply should resolve explicit preferences");

  const nativeCalls: string[] = [];
  const nativeState = {
    preference: "system",
    resolvedLocale: "en-US",
    match: "language",
    issue: null,
  };
  const native = createLocaleRuntimePort({
    isNative: () => true,
    getNativeState: async () => nativeState,
    applyNativePreference: async (preference) => {
      nativeCalls.push(preference);
      return { ...nativeState, preference, resolvedLocale: preference };
    },
  });
  const nativeBootstrap = await native.bootstrap();
  assert(nativeBootstrap.ok && nativeBootstrap.state === nativeState, "native bootstrap should preserve the authoritative native state");
  const nativeApply = await native.applyPreference("zh-CN");
  assert(nativeApply.ok && nativeCalls.join(",") === "zh-CN", "native apply should cross the dedicated native boundary once");

  for (const code of ["preferenceLoadFailed", "systemLocaleUnavailable"] as const) {
    const degradedNative = createLocaleRuntimePort({
      isNative: () => true,
      getNativeState: async () => ({
        ...nativeState,
        issue: { code, value: code === "preferenceLoadFailed" ? "layout" : "windows" },
      }),
    });
    const degradedBootstrap = await degradedNative.bootstrap();
    assert(
      degradedBootstrap.ok && degradedBootstrap.state.issue?.code === code,
      `native ${code} issues should remain successful degraded locale outcomes`,
    );
  }

  const nativeFailure = new Error("native locale unavailable");
  const failingNative = createLocaleRuntimePort({
    isNative: () => true,
    getNativeState: async () => { throw nativeFailure; },
  });
  const failure = await failingNative.bootstrap();
  assert(!failure.ok && failure.error === nativeFailure, "native bootstrap failures should stay explicit instead of falling back to browser languages");
}
