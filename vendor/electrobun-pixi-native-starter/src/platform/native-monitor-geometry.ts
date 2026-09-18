/** Physical screen coordinates, including displays left/above the primary one. */
export function centerWindowOnWorkArea(rect: Int32Array, work: Int32Array): Int32Array {
  const width = Math.min(Math.max(1, rect[2]! - rect[0]!), work[2]! - work[0]!);
  const height = Math.min(Math.max(1, rect[3]! - rect[1]!), work[3]! - work[1]!);
  const x = work[0]! + Math.trunc((work[2]! - work[0]! - width) / 2);
  const y = work[1]! + Math.trunc((work[3]! - work[1]! - height) / 2);
  return new Int32Array([x, y, x + width, y + height]);
}
