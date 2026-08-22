export const LAUNCH_ORIGIN_MANUAL = "manual";
export const LAUNCH_ORIGIN_LOGIN_STARTUP = "loginStartup";

export type LaunchOrigin = typeof LAUNCH_ORIGIN_MANUAL | typeof LAUNCH_ORIGIN_LOGIN_STARTUP;
export type LaunchContext = Readonly<{ origin: LaunchOrigin }>;

export function normalizeLaunchContext(context?: { origin?: unknown } | null): LaunchContext {
  const origin = String(context?.origin || LAUNCH_ORIGIN_MANUAL);
  if (origin !== LAUNCH_ORIGIN_MANUAL && origin !== LAUNCH_ORIGIN_LOGIN_STARTUP) {
    throw new TypeError(`Unsupported launch origin: ${origin}`);
  }
  return Object.freeze({ origin: origin as LaunchOrigin });
}

export function isLoginStartupContext(context?: { origin?: unknown } | null): boolean {
  return normalizeLaunchContext(context).origin === LAUNCH_ORIGIN_LOGIN_STARTUP;
}
