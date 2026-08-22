import { STAGE_COORDINATE_SPACES } from "../geometry/stageCoordinates.js";
import type { StageRect } from "../geometry/stageCoordinates.js";

export interface DesktopBoundsRegistrationState {
  [key: string]: unknown;
  deviceResolution?: number;
  folderClosingHandoffIds?: ReadonlySet<string>;
  height?: number;
  isTextlessMode?: boolean;
  stageRect?: StageRect;
  width?: number;
}

export interface DesktopBoundsRegistration<Entry, DesktopFrame extends object> {
  coordinateSpace: Readonly<{
    bounds: typeof STAGE_COORDINATE_SPACES.CLIENT_VISUAL;
    desktopFrame: typeof STAGE_COORDINATE_SPACES.STAGE_LAYOUT;
    layoutTargets: typeof STAGE_COORDINATE_SPACES.STAGE_LAYOUT;
    stageRect: typeof STAGE_COORDINATE_SPACES.CLIENT_VISUAL;
  }>;
  desktopFrame: DesktopFrame;
  deviceResolution: number | undefined;
  entries: readonly Entry[];
  folderClosingHandoffIds: ReadonlySet<string> | undefined;
  height: number | undefined;
  isTextlessMode: boolean | undefined;
  stageRect: StageRect | undefined;
  width: number | undefined;
}

export function makeDesktopBoundsRegistration<Entry = unknown>(
  state?: DesktopBoundsRegistrationState,
  entries?: readonly Entry[],
  desktopFrame?: undefined,
): DesktopBoundsRegistration<Entry, Record<string, never>>;
export function makeDesktopBoundsRegistration<Entry, DesktopFrame extends object>(
  state: DesktopBoundsRegistrationState | undefined,
  entries: readonly Entry[] | undefined,
  desktopFrame: DesktopFrame,
): DesktopBoundsRegistration<Entry, DesktopFrame>;
export function makeDesktopBoundsRegistration(
  state: DesktopBoundsRegistrationState = {},
  entries: readonly unknown[] = [],
  desktopFrame: object = {},
): DesktopBoundsRegistration<unknown, object> {
  return {
    coordinateSpace: {
      bounds: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
      desktopFrame: STAGE_COORDINATE_SPACES.STAGE_LAYOUT,
      layoutTargets: STAGE_COORDINATE_SPACES.STAGE_LAYOUT,
      stageRect: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
    },
    deviceResolution: state.deviceResolution,
    entries,
    folderClosingHandoffIds: state.folderClosingHandoffIds,
    height: state.height,
    isTextlessMode: state.isTextlessMode,
    desktopFrame,
    stageRect: state.stageRect,
    width: state.width,
  };
}
