import { clearMotionPreferencesForTests, prefersReducedMotion } from "./motionPreferences.js";

export function runMotionPreferencesTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Motion preferences test failed] ${message}`);
  };

  {
    const originalMatchMedia = globalThis.matchMedia;
    const listeners = new Set<(event: Pick<MediaQueryListEvent, "matches">) => void>();
    const query = {
      matches: false,
      addEventListener(type: string, listener: (event: Pick<MediaQueryListEvent, "matches">) => void) {
        if (type === "change") listeners.add(listener);
      },
      removeEventListener(type: string, listener: (event: Pick<MediaQueryListEvent, "matches">) => void) {
        if (type === "change") listeners.delete(listener);
      },
    };
    globalThis.matchMedia = () => query as unknown as MediaQueryList;
    try {
      clearMotionPreferencesForTests();
      assert(!prefersReducedMotion(), "reduced-motion should initially read the media query");
      query.matches = true;
      for (const listener of Array.from(listeners)) listener({ matches: true });
      assert(prefersReducedMotion(), "reduced-motion should update after a media query change");
      clearMotionPreferencesForTests();
      assert(listeners.size === 0, "clearing motion preferences should remove the media query listener");
    } finally {
      clearMotionPreferencesForTests();
      if (originalMatchMedia === undefined) {
        delete (globalThis as { matchMedia?: unknown }).matchMedia;
      }
      else globalThis.matchMedia = originalMatchMedia;
    }
  }
}
