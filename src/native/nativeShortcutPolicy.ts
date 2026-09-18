export function shouldHideForNativeShortcut(state: Readonly<{
  visible: boolean; minimized: boolean; foreground: boolean; displayChanged: boolean;
}>): boolean {
  return state.visible && !state.minimized && state.foreground && !state.displayChanged;
}
