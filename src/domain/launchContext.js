export const LAUNCH_ORIGIN_MANUAL = "manual";
export const LAUNCH_ORIGIN_LOGIN_STARTUP = "loginStartup";

export function normalizeLaunchContext(context) {
  const origin = String(context?.origin || LAUNCH_ORIGIN_MANUAL);
  if (origin !== LAUNCH_ORIGIN_MANUAL && origin !== LAUNCH_ORIGIN_LOGIN_STARTUP) {
    throw new TypeError(`Unsupported launch origin: ${origin}`);
  }
  return Object.freeze({ origin });
}

export function isLoginStartupContext(context) {
  return normalizeLaunchContext(context).origin === LAUNCH_ORIGIN_LOGIN_STARTUP;
}
