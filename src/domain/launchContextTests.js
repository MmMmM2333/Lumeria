import {
  LAUNCH_ORIGIN_LOGIN_STARTUP,
  LAUNCH_ORIGIN_MANUAL,
  isLoginStartupContext,
  normalizeLaunchContext,
} from "./launchContext.js";

export function runLaunchContextTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launch context test failed] ${message}`);
  };

  assert(normalizeLaunchContext().origin === LAUNCH_ORIGIN_MANUAL, "missing launch context should be manual");
  assert(
    normalizeLaunchContext({ origin: LAUNCH_ORIGIN_LOGIN_STARTUP }).origin === LAUNCH_ORIGIN_LOGIN_STARTUP,
    "login startup should survive normalization"
  );
  assert(isLoginStartupContext({ origin: LAUNCH_ORIGIN_LOGIN_STARTUP }), "login startup predicate should be exact");
  let rejected = false;
  try {
    normalizeLaunchContext({ origin: "login-startup" });
  } catch {
    rejected = true;
  }
  assert(rejected, "unknown launch origins should fail explicitly");
}
