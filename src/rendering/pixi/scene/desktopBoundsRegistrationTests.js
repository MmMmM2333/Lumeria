import { makeDesktopBoundsRegistration } from "./desktopBoundsRegistration.js";

export function runDesktopBoundsRegistrationTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Desktop bounds registration test failed] ${message}`);
  };

  {
    const stageRect = { height: 600, left: 0, top: 0, width: 800 };
    const entries = [{ id: "entry-1" }];
    const desktopFrame = { height: 560, left: 0, top: 40, width: 800 };
    const registration = makeDesktopBoundsRegistration({
      deviceResolution: 2,
      folderClosingHandoffIds: new Set(["folder-1", "folder-2"]),
      height: 600,
      isTextlessMode: false,
      stageRect,
      width: 800,
    }, entries, desktopFrame);

    assert(registration.entries === entries, "registration should preserve bounds entries by reference");
    assert(registration.desktopFrame === desktopFrame, "registration should preserve desktop frame by reference");
    assert(registration.coordinateSpace.bounds === "client-visual", "registration bounds should be explicit client visual rects");
    assert(registration.coordinateSpace.layoutTargets === "stage-layout", "registration layout targets should be explicit stage layout coordinates");
    assert(!("stableStageRect" in registration), "root-stage registration should not expose a stable stage rect alias");
    assert(!("stableStageRect" in registration.coordinateSpace), "registration coordinate spaces should not expose a client-layout stable rect");
    assert(!("stageVisualOffsetX" in registration) && !("stageVisualOffsetY" in registration), "root-stage registration should not expose legacy visual compensation");
    assert(!("folderClosingHandoffId" in registration), "registration should not expose the retired singular handoff field");
    assert(registration.folderClosingHandoffIds.has("folder-2"), "registration should carry multiple handoff ids when provided");
  }

  {
    const stageRect = { height: 552, left: 96, top: 216, width: 736 };
    const registration = makeDesktopBoundsRegistration({
      height: 600,
      stableStageRect: { height: 600, left: 100, top: 200, width: 800 },
      stageRect,
      width: 800,
    });

    assert(registration.stageRect === stageRect, "legacy stable rect input should leave stage rect as the only stage bounds");
    assert(!("stableStageRect" in registration), "legacy stable rect input should not reintroduce a stable stage rect alias");
  }

  {
    const stageRect = { height: 600, left: 8, top: 12, width: 800 };
    const registration = makeDesktopBoundsRegistration({ stageRect });

    assert(registration.stageRect === stageRect, "registration should keep stage rect as the only stage bounds");
    assert(!("stableStageRect" in registration), "registration should not create a fallback stable stage rect alias");
    assert(!("stageVisualOffsetX" in registration) && !("stageVisualOffsetY" in registration), "registration should not expose legacy visual compensation");
  }
}
