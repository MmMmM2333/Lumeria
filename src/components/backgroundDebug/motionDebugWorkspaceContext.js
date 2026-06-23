import { inject } from "vue";

export const MOTION_DEBUG_WORKSPACE_CONTEXT_KEY = Symbol("motion-debug-workspace");

export function useMotionDebugWorkspaceContext() {
  const context = inject(MOTION_DEBUG_WORKSPACE_CONTEXT_KEY, null);
  if (!context) throw new Error("Motion debug workspace context is not available.");
  return context;
}
