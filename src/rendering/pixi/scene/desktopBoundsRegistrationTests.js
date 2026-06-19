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
      folderClosingHandoffId: "folder-1",
      height: 600,
      isTextlessMode: false,
      stableStageRect: stageRect,
      stageRect,
      width: 800,
    }, entries, desktopFrame);

    assert(registration.entries === entries, "registration should preserve bounds entries by reference");
    assert(registration.desktopFrame === desktopFrame, "registration should preserve desktop frame by reference");
    assert(registration.coordinateSpace.bounds === "client-visual", "registration bounds should be explicit client visual rects");
    assert(registration.coordinateSpace.layoutTargets === "stage-layout", "registration layout targets should be explicit stage layout coordinates");
    assert(registration.stableStageRect === stageRect, "root-stage registration should keep a single stable stage rect");
    assert(!("stageVisualOffsetX" in registration) && !("stageVisualOffsetY" in registration), "root-stage registration should not expose legacy visual compensation");
    assert(registration.folderClosingHandoffId === "folder-1", "registration should carry the handoff id");
  }

  {
    const stageRect = { height: 552, left: 96, top: 216, width: 736 };
    const registration = makeDesktopBoundsRegistration({
      height: 600,
      stableStageRect: { height: 600, left: 100, top: 200, width: 800 },
      stageRect,
      width: 800,
    });

    assert(registration.stableStageRect === stageRect, "legacy stable rect input should not create a separate offset space");
  }

  {
    const stageRect = { height: 600, left: 8, top: 12, width: 800 };
    const registration = makeDesktopBoundsRegistration({ stageRect });

    assert(registration.stableStageRect === stageRect, "missing stable stage rect should fall back to stage rect");
    assert(!("stageVisualOffsetX" in registration) && !("stageVisualOffsetY" in registration), "fallback stable rect should not expose legacy visual compensation");
  }
}
