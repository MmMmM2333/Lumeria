import type {
  LaunchpadApp,
  ReadonlyLaunchpadApp,
} from "./launchpadLayout.js";

export function cloneLaunchpadApp(item: ReadonlyLaunchpadApp): LaunchpadApp {
  const {
    catalogPresentation,
    launchTarget,
    presentationOverrides,
    sources,
    ...rest
  } = item;
  return {
    ...rest,
    ...(catalogPresentation
      ? { catalogPresentation: { ...catalogPresentation } }
      : {}),
    ...(launchTarget ? { launchTarget: { ...launchTarget } } : {}),
    ...(presentationOverrides
      ? { presentationOverrides: { ...presentationOverrides } }
      : {}),
    ...(sources ? { sources: sources.map((source) => ({ ...source })) } : {}),
  };
}
