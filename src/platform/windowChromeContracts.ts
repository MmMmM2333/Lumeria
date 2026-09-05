export const WINDOW_RESIZE_DIRECTIONS = Object.freeze([
  "North", "South", "West", "East", "NorthWest", "NorthEast", "SouthWest", "SouthEast",
] as const);

export type WindowResizeDirection = (typeof WINDOW_RESIZE_DIRECTIONS)[number];
