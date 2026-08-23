export const MOTION_LAB_QUERY_PARAM = "motionLab";

function normalizeSearch(search: unknown = ""): string {
  const text = String(search || "");
  if (!text) return "";
  return text.startsWith("?") ? text : `?${text}`;
}

export function shouldMountMotionLab(search: unknown = "", dev = false): boolean {
  if (!dev) return false;
  try {
    const params = new URLSearchParams(normalizeSearch(search));
    if (!params.has(MOTION_LAB_QUERY_PARAM)) return false;
    const value = String(params.get(MOTION_LAB_QUERY_PARAM) || "1").trim().toLowerCase();
    return value !== "0" && value !== "false" && value !== "off";
  } catch {
    return false;
  }
}
