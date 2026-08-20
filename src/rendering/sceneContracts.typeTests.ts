import type {
  DesktopSceneFrame,
  DesktopSceneFrameInput,
} from "./sceneFrame.js";
import type {
  AppLaunchCloseFrameCommittedSceneEvent,
  InternalActivitySceneEvent,
  SceneEvent,
  SceneEventControl,
} from "./sceneEvents.js";

const frameInput = {
  activePageIndex: 0,
  appLaunchCloseSessionId: 1,
  desktopVisualAlpha: 1,
  isEditMode: false,
  folderClosingHandoffId: null,
  showMissingLaunchTargetBadge: true,
} satisfies DesktopSceneFrameInput;
void frameInput;

declare const frame: DesktopSceneFrame;
void frame.viewport.activePageIndex;
void frame.visual.desktopVisualAlpha;
void frame.visual.appLaunchCloseSessionId;

// @ts-expect-error SceneFrame fields must be accessed through their owning group.
void frame.activePageIndex;

// @ts-expect-error Unknown flat input fields are not part of the renderer contract.
const unknownFrameField: DesktopSceneFrameInput = { legacyPageIndex: 0 };
void unknownFrameField;

const invalidFrameValue: DesktopSceneFrameInput = {
  // @ts-expect-error SceneFrame fields have explicit value contracts.
  activePageIndex: "0",
};
void invalidFrameValue;

const pageTrackScrubFrame = {
  pageTrackScrub: {
    edge: false,
    fromIndex: 0,
    progress: 0.5,
    scope: "desktop",
    toIndex: 1,
  },
} satisfies DesktopSceneFrameInput;
void pageTrackScrubFrame;

const invalidPageTrackScrubFrame: DesktopSceneFrameInput = {
  pageTrackScrub: {
    // @ts-expect-error Gesture edge state is a boolean marker, not a string label.
    edge: "false",
    fromIndex: 0,
    progress: 0.5,
    scope: "desktop",
    toIndex: 1,
  },
};
void invalidPageTrackScrubFrame;

const activityEvent = {
  type: "internal-activity",
  active: true,
  folderId: "folder-a",
} satisfies InternalActivitySceneEvent;

const event: SceneEvent = activityEvent;
void event;

const appLaunchCommitEvent = {
  type: "app-launch-close-frame-committed",
  sessionId: 1,
} satisfies AppLaunchCloseFrameCommittedSceneEvent;
void appLaunchCommitEvent;

declare const control: SceneEventControl;
control.preventDefault();
control.setPointerCapture(7);

// @ts-expect-error SceneEvent is a closed discriminated union.
const unknownEvent: SceneEvent = { type: "raw-pointer-event" };
void unknownEvent;

const invalidActivity: InternalActivitySceneEvent = {
  type: "internal-activity",
  // @ts-expect-error Internal activity events require a boolean active flag.
  active: "yes",
  folderId: null,
};
void invalidActivity;
