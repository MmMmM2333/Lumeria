import { clearMotionPreferencesForTests, prefersReducedMotion } from "./motionPreferences.js";

export function runMotionPreferencesTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion preferences test failed] ${message}`);
  };

  {
    const originalMatchMedia = globalThis.matchMedia;
    const listeners = new Set();
    const query = {
      matches: false,
      addEventListener(type, listener) {
        if (type === "change") listeners.add(listener);
      },
      removeEventListener(type, listener) {
        if (type === "change") listeners.delete(listener);
      },
    };
    globalThis.matchMedia = () => query;
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
      if (originalMatchMedia === undefined) delete globalThis.matchMedia;
      else globalThis.matchMedia = originalMatchMedia;
    }
  }
}
