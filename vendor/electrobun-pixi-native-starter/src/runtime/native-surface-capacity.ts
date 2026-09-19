export interface SurfaceExtent { width: number; height: number }

// Approximate color, shared staging, 4x MSAA color/depth storage. This limits
// speculative headroom, not the memory needed by the visible viewport itself.
const ESTIMATED_BYTES_PER_PIXEL = 44;
const HEADROOM_BUDGET_BYTES = 256 * 1024 * 1024;

export function chooseSurfaceCapacity(width: number, height: number, limit: number): SurfaceExtent {
  if (![width, height, limit].every(Number.isSafeInteger) || width <= 0 || height <= 0 || limit <= 0 ||
    width > limit || height > limit) throw new RangeError("Surface extent exceeds the native device limit");
  const rounded = (value: number, extra: number) => Math.min(limit, Math.ceil((value + extra) / 128) * 128);
  let capacity = { width: rounded(width, 256), height: rounded(height, 256) };
  if (capacity.width * capacity.height * ESTIMATED_BYTES_PER_PIXEL > HEADROOM_BUDGET_BYTES) {
    capacity = { width: rounded(width, 0), height: rounded(height, 0) };
    if (capacity.width * capacity.height * ESTIMATED_BYTES_PER_PIXEL > HEADROOM_BUDGET_BYTES) {
      capacity = { width, height };
    }
  }
  return capacity;
}

export function shouldReclaimSurfaceCapacity(current: SurfaceExtent, desired: SurfaceExtent): boolean {
  return current.width * current.height > desired.width * desired.height * 1.5;
}
