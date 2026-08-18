import { Container } from "pixi.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import { killMotionOf } from "../animation/motionTween.js";
import { getFolderThumbMetrics } from "./folderThumbMetrics.js";
import { getBatchSelectionBadgeLayout } from "./batchSelectionGeometry.js";

function installPixiTextTestDom() {
  if (!("CanvasRenderingContext2D" in globalThis)) {
    globalThis.CanvasRenderingContext2D = class CanvasRenderingContext2D {};
  }
  if ("document" in globalThis) return;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      baseURI: "http://localhost/",
      fonts: null,
      createElement(tagName) {
        if (tagName !== "canvas") return {};
        const context = Object.create(globalThis.CanvasRenderingContext2D.prototype);
        Object.assign(context, {
          canvas: null,
          clearRect: () => {},
          fillRect: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(4) }),
          measureText: (text) => ({
            actualBoundingBoxAscent: 10,
            actualBoundingBoxDescent: 3,
            width: String(text || "").length * 8,
          }),
          restore: () => {},
          save: () => {},
          scale: () => {},
          setTransform: () => {},
          strokeText: () => {},
          fillText: () => {},
        });
        const canvas = {
          height: 0,
          width: 0,
          getContext: () => context,
        };
        context.canvas = canvas;
        return canvas;
      },
    },
  });
}

export async function runIconNodeTests() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node.js" },
    });
  }
  installPixiTextTestDom();
  const { IconNode } = await import("./IconNode.js");
  const { syncPixiTextResolution } = await import("../pixiText.js");
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[IconNode test failed] ${message}`);
  };
  const nearlyEqual = (a, b) => Math.abs(a - b) < 0.0001;

  const node = new IconNode();
  try {
    assert(node.labelText.resolution === 2, "icon labels should use the 2x text raster baseline");
    assert(node.labelTransitionText.resolution === 2, "label transition copies should use the same text raster baseline");
    assert(node.folderSlotReleaseEmoji.resolution === 2, "folder release text should use the shared text raster baseline");
    const updatedTextCount = syncPixiTextResolution(node, 2.5);
    assert(updatedTextCount > 0 && node.labelText.resolution === 2.5, "existing text nodes should follow a higher DPR when it changes");
    syncPixiTextResolution(node, 2);
    const interactionNodeState = {
      cellHeight: 80,
      cellWidth: 80,
      compact: false,
      dragging: false,
      draggable: true,
      editing: false,
      folderPreviewPageSize: 9,
      ghosted: false,
      hasCustomIcon: false,
      iconSize: 64,
      interactive: true,
      item: { id: "app-interaction", name: "Interaction App", type: "app" },
      opening: false,
      removable: true,
      focused: false,
      source: { index: 0, pageIndex: 0, type: "page" },
      stageHeight: 600,
      stageWidth: 800,
      textless: false,
    };
    motionRuntime.reset();
    node.setState({ ...interactionNodeState, interactionPhase: "pressing" });

    node.setState({
      ...interactionNodeState,
      batchSelected: true,
      interactionPhase: null,
    });
    const selectedAppFrame = node.getBatchSelectionFrameRect();
    const selectedAppBadgeLayout = getBatchSelectionBadgeLayout({
      frameRect: selectedAppFrame,
      iconSize: node.iconSize,
      isCheck: true,
      label: "✓",
    });
    assert(node.batchSelectionBadge.visible, "selected apps should show a batch selection badge");
    assert(node.batchSelectionBadgeCheck.visible, "selected apps should render a vector check graphic");
    assert(!node.batchSelectionBadgeText.visible, "selected apps should not render the check as text");
    assert(
      nearlyEqual(node.batchSelectionBadge.position.x, selectedAppBadgeLayout.x) &&
        nearlyEqual(node.batchSelectionBadge.position.y + node.visualWrap.position.y, selectedAppBadgeLayout.y),
      "selected app badges should derive their position from the selected frame",
    );

    const folderChildState = {
      ...interactionNodeState,
      batchSelected: true,
      cellWidth: 100,
      iconSize: 76,
      item: { id: "folder-child-selected", name: "Folder Child", type: "app" },
      source: { index: 0, pageIndex: 0, type: "folder" },
    };
    node.setState(folderChildState);
    assert(
      node.getBatchSelectionFrameRect().width <= folderChildState.cellWidth - 16 + 0.0001,
      "folder batch selection frames should keep a visible horizontal gap",
    );

    node.setState({
      ...interactionNodeState,
      batchSelected: false,
      item: { id: "folder-count", name: "Folder Count", type: "folder" },
      selectedChildCount: 3,
    });
    assert(node.batchSelectionBadge.visible, "folders with selected children should show the count badge");
    assert(!node.batchSelectionBadgeCheck.visible, "folder count badges should not show the check graphic");
    assert(node.batchSelectionBadgeText.visible && node.batchSelectionBadgeText.text === "3", "folder count badges should show the selected child count");

    motionRuntime.reset();
    node.setState({ ...interactionNodeState, interactionPhase: "pressing" });
    let snapshot = motionRuntime.debugSnapshot();
    const pressScaleImpulses = snapshot.animations.filter((animation) => animation.lane === "additive");
    assert(pressScaleImpulses.length === 2, "press should create one additive impulse per scale axis");
    assert(pressScaleImpulses.some((animation) => animation.prop === "x"), "press should create an additive scale x impulse");
    assert(pressScaleImpulses.some((animation) => animation.prop === "y"), "press should create an additive scale y impulse");
    assert(node.visualWrap.scale.x < 1 && node.visualWrap.scale.y < 1, "press additive impulse should shrink visual scale immediately");
    assert(snapshot.animations.some((animation) => animation.prop === "alpha" && animation.laneKey === "base"), "press should keep the existing alpha feedback animation");
    const pressingAlphaTarget = snapshot.animations.find((animation) => animation.prop === "alpha" && animation.laneKey === "base")?.to;
    assert(pressingAlphaTarget > 0.6 && pressingAlphaTarget < 1, "pressing feedback should remain visible while clearly acknowledging the press");
    const pressingScale = node.visualWrap.scale.x;

    node.setState({ ...interactionNodeState, interactionPhase: "pressing" });
    snapshot = motionRuntime.debugSnapshot();
    const afterRepeatedPressCount = snapshot.animations.filter((animation) => animation.lane === "additive").length;
    assert(afterRepeatedPressCount === 2, "repeated press without state change should not add another scale impulse");
    assert(node.visualWrap.scale.x < 1, "an unrelated render with the same pressing state should not reset its live scale feedback");

    node.setState({ ...interactionNodeState, interactionPhase: "armed" });
    snapshot = motionRuntime.debugSnapshot();
    const armedAlphaTarget = snapshot.animations.find((animation) => animation.prop === "alpha" && animation.laneKey === "base")?.to;
    assert(node.cursor === "pointer", "armed feedback should keep the ordinary pointer cursor until dragging starts");
    assert(armedAlphaTarget > pressingAlphaTarget, "armed feedback should lift the icon out of the darker pressing state");
    assert(node.visualWrap.scale.x > pressingScale, "armed feedback should add a small upward scale impulse");

    const armedImpulseCount = snapshot.animations.filter((animation) => animation.lane === "additive").length;
    node.setState({ ...interactionNodeState, interactionPhase: null });
    snapshot = motionRuntime.debugSnapshot();
    assert(node.cursor === "pointer", "clearing the interaction should restore the ordinary pointer cursor");
    assert(
      snapshot.animations.filter((animation) => animation.lane === "additive").length === armedImpulseCount + 2,
      "release should stack one restorative impulse per scale axis"
    );

    motionRuntime.reset();
    node.labelText.alpha = 1;
    node.setState({
      ...interactionNodeState,
      dragging: true,
      revealLabelAfterVisualHandoff: true,
    });
    assert(node.visible === false, "a returning real icon should stay hidden while the release ghost owns it");
    node.setState({ ...interactionNodeState, dragging: false });
    assert(
      node.visible === true && nearlyEqual(node.labelText.alpha, 0),
      "the real icon should take ownership with its label hidden in the same state transition"
    );
    motionRuntime.step(0.05);
    motionRuntime.step(0.04);
    assert(
      node.labelText.alpha > 0 && node.labelText.alpha < 1,
      "the returned icon label should be visibly fading midway through the handoff reveal"
    );
    motionRuntime.step(0.05);
    motionRuntime.step(0.05);
    assert(nearlyEqual(node.labelText.alpha, 1), "the returned icon label should finish fully visible");

    motionRuntime.reset();
    node.labelText.alpha = 1;
    node.setState({
      ...interactionNodeState,
      ghosted: true,
      revealLabelAfterVisualHandoff: true,
    });
    assert(node.visible === false, "an ownership-ghosted icon should remain hidden behind its transfer actor");
    node.setState({ ...interactionNodeState, ghosted: false });
    assert(
      node.visible === true && nearlyEqual(node.labelText.alpha, 0),
      "an ownership-ghosted icon should reveal its label from zero at the actor-to-live handoff"
    );
    motionRuntime.step(0.05);
    motionRuntime.step(0.05);
    motionRuntime.step(0.05);
    motionRuntime.step(0.05);
    assert(nearlyEqual(node.labelText.alpha, 1), "the ownership handoff label should finish fully visible");

    motionRuntime.reset();
    node.labelText.alpha = 1;
    node.setState({ ...interactionNodeState, dragging: true, revealLabelAfterVisualHandoff: false });
    node.setState({ ...interactionNodeState, dragging: false });
    assert(
      nearlyEqual(node.labelText.alpha, 1),
      "ordinary drag ownership release should keep the existing immediate label behavior"
    );

    motionRuntime.reset();
    const folderOwnershipNodeState = {
      ...interactionNodeState,
      item: { id: "folder-ownership", name: "Folder Ownership", type: "folder" },
    };
    node.labelText.alpha = 1;
    node.setState({
      ...folderOwnershipNodeState,
      ghosted: true,
      suppressLabelRevealAfterGhost: true,
    });
    node.setState({
      ...folderOwnershipNodeState,
      ghosted: false,
    });
    assert(
      node.visible === true && nearlyEqual(node.labelText.alpha, 1),
      "a desktop folder ownership handoff should restore its label immediately instead of fading it from zero"
    );

    motionRuntime.reset();
    node.setState({ ...interactionNodeState, visualSpecTransition: null });
    const resizedLabelState = {
      ...interactionNodeState,
      cellHeight: 70,
      cellWidth: 62,
      iconSize: 48,
      visualSpecTransition: { active: true, progress: 0.3 },
    };
    node.setState(resizedLabelState);
    assert(
      node.labelTransitionBlendActive === true &&
        node.labelTransitionText.visible === true &&
        nearlyEqual(node.labelText.alpha, 0),
      "a visual-size handoff should crossfade the old label while applying the new label geometry"
    );
    motionRuntime.step(0.14);
    node.setState({ ...resizedLabelState, visualSpecTransition: { active: false, progress: 1 } });
    assert(
      node.labelTransitionBlendActive === false &&
        node.labelTransitionText.visible === false &&
        nearlyEqual(node.labelText.alpha, 1),
      "the visual-size handoff should leave only the settled label presentation"
    );

    motionRuntime.reset();
    node.updateJiggle({ editing: true, dragging: false, ghosted: false, jiggleSeed: 0 });
    snapshot = motionRuntime.debugSnapshot();
    const jiggleAnimations = snapshot.animations.filter((animation) => animation.lane === "additive" && ["rotation", "y"].includes(animation.prop));
    assert(jiggleAnimations.length === 4, "jiggle start should compose a loop and a start impulse on rotation/y");
    assert(snapshot.summary.byLaneKey.jiggle === 2, "jiggle loop should use the named jiggle additive lane");
    assert(snapshot.summary.byProp.rotation === 2, "jiggle rotation should have loop and impulse additive tracks");
    assert(snapshot.summary.byProp.y === 2, "jiggle y should have loop and impulse additive tracks");
    assert(node.jiggleWrap.rotation < -0.032 && node.jiggleWrap.y < -1, "jiggle start impulse should stack over the loop value");

    node.updateJiggle({ editing: true, dragging: false, ghosted: false, jiggleSeed: 0 });
    snapshot = motionRuntime.debugSnapshot();
    assert(snapshot.animations.filter((animation) => animation.lane === "additive" && ["rotation", "y"].includes(animation.prop)).length === 4, "unchanged jiggle state should not add another impulse");

    node.stopJiggle();
    snapshot = motionRuntime.debugSnapshot();
    assert(snapshot.animations.filter((animation) => animation.lane === "additive" && ["rotation", "y"].includes(animation.prop)).length === 0, "stopping jiggle should clear loop and impulse additive tracks");
    assert(node.jiggleWrap.rotation === 0 && node.jiggleWrap.y === 0, "stopping jiggle should restore neutral transform");

    motionRuntime.reset();
    node.item = { id: "folder-1", type: "folder" };
    node.isFolder = true;
    node.iconSize = 64;
    node.folderHoverActive = false;
    node.folderHoverKey = null;
    node.folderHoverPhase = null;
    node.folderHoverClearing = false;
    node.folderHoverFrame.padding = 0;
    node.folderPreviewPlanKey = null;
    node.folderThumb.scale.set(1);
    node.folderChildrenWrap.y = 0;
    const folderHoverPlan = {
      endY: -24,
      items: [{ id: "app-a" }, { id: "app-b" }],
      startY: 0,
    };
    node.updateFolderHoverAnimation({
      folderHoverState: { key: "folder-hover", phase: "hover", targetId: "folder-1", targetType: "folder" },
    }, folderHoverPlan);
    motionRuntime.step(0.04);
    assert(node.folderThumb.scale.x > 0 && node.folderThumb.scale.x < 1, "folder hover should animate the thumb scale in");
    assert(node.folderChildrenWrap.y < 0 && node.folderChildrenWrap.y > folderHoverPlan.endY, "folder hover should animate preview scroll");

    const thumbScaleBeforeClear = node.folderThumb.scale.x;
    const previewYBeforeClear = node.folderChildrenWrap.y;
    node.updateFolderHoverAnimation({ folderHoverState: null }, folderHoverPlan);
    snapshot = motionRuntime.debugSnapshot();
    assert(nearlyEqual(node.folderThumb.scale.x, thumbScaleBeforeClear), "folder hover clear blend should keep thumb scale on takeover");
    assert(nearlyEqual(node.folderChildrenWrap.y, previewYBeforeClear), "folder hover clear blend should keep preview y on takeover");
    assert((snapshot.counters.canceledByReason.blend || 0) >= 3, "folder hover clear should be observable as blend cancellations");
    assert(snapshot.animations.some((animation) => animation.laneKey === "overlay" && animation.blendDuration === 0.08), "folder hover should use a short blend window");

    motionRuntime.step(0.04);
    assert(node.folderThumb.scale.x < thumbScaleBeforeClear, "folder hover clear should blend thumb scale down without jumping");
    assert(node.folderChildrenWrap.y > previewYBeforeClear && node.folderChildrenWrap.y < 0, "folder hover clear should blend preview y back without jumping");
    for (let index = 0; index < 20; index += 1) motionRuntime.step(0.05);
    assert(nearlyEqual(node.folderChildrenWrap.y, 0), "folder hover clear should restore preview y");
    assert(node.folderHoverFrame.padding === 0 && node.folderHoverClearing === false, "folder hover clear should reset frame state");

    motionRuntime.reset();
    node.folderHoverActive = false;
    node.folderHoverKey = null;
    node.folderHoverPhase = null;
    node.folderHoverClearing = false;
    node.folderHoverFrame.padding = 0;
    node.folderPreviewPlanKey = null;
    node.folderThumb.scale.set(1);
    node.folderChildrenWrap.y = 0;
    node.updateFolderHoverAnimation({
      folderHoverState: { key: "folder-hover-stale", phase: "hover", targetId: "folder-1", targetType: "folder" },
    }, folderHoverPlan);
    motionRuntime.step(0.04);
    const staleHoverScale = node.folderThumb.scale.x;
    assert(staleHoverScale < 1, "folder hover stale repro should start with an in-flight frame scale");
    killMotionOf(node.folderThumb, "scale");
    node.updateFolderHoverAnimation({
      folderHoverState: { key: "folder-hover-reenter", phase: "hover", targetId: "folder-1", targetType: "folder" },
    }, folderHoverPlan);
    snapshot = motionRuntime.debugSnapshot();
    assert(
      snapshot.animations.some((animation) => animation.laneKey === "overlay" && animation.prop === "x" && nearlyEqual(animation.to, 1)),
      "re-entering a stale folder hover should restart the frame scale animation"
    );
    for (let index = 0; index < 20; index += 1) motionRuntime.step(0.05);
    assert(nearlyEqual(node.folderThumb.scale.x, 1), "re-entering a stale folder hover should restore full highlight coverage");

    motionRuntime.reset();
    node.folderHoverActive = false;
    node.folderHoverKey = null;
    node.folderHoverPhase = null;
    node.folderHoverClearing = false;
    node.folderHoverFrame.padding = 0;
    node.folderPreviewPlanKey = null;
    node.folderThumb.scale.set(0.58);
    node.folderChildrenWrap.y = 0;
    node.updateFolderHoverAnimation({
      folderHoverState: { key: "folder-hover-after-handoff", phase: "hover", targetId: "folder-1", targetType: "folder" },
    }, folderHoverPlan);
    assert(node.folderThumb.scale.x > 0.7 && node.folderThumb.scale.x < 1, "folder hover re-entry after handoff should not compound a stale thumb scale");
    for (let index = 0; index < 20; index += 1) motionRuntime.step(0.05);
    assert(nearlyEqual(node.folderThumb.scale.x, 1), "folder hover re-entry after handoff should restore full highlight coverage");

    motionRuntime.reset();
    node.item = { id: "app-1", type: "app" };
    node.isFolder = false;
    node.iconSize = 64;
    node.updateAppFolderCreateHoverAnimation({
      folderHoverState: { key: "create-hover", phase: "hover", targetId: "app-1", targetType: "app" },
    });
    motionRuntime.step(0.04);
    assert(node.folderCreateBackdrop.alpha > 0 && node.folderCreateBackdrop.alpha < 1, "app-folder-create hover should animate the backdrop in");
    assert(node.iconSprite.alpha < 1 && node.iconSprite.alpha > 0.48, "app-folder-create hover should animate icon dimming");

    const backdropAlphaBeforeClear = node.folderCreateBackdrop.alpha;
    const iconAlphaBeforeClear = node.iconSprite.alpha;
    node.updateAppFolderCreateHoverAnimation({ folderHoverState: null });
    snapshot = motionRuntime.debugSnapshot();
    assert(nearlyEqual(node.folderCreateBackdrop.alpha, backdropAlphaBeforeClear), "app-folder-create clear blend should keep backdrop alpha on takeover");
    assert(nearlyEqual(node.iconSprite.alpha, iconAlphaBeforeClear), "app-folder-create clear blend should keep icon alpha on takeover");
    assert((snapshot.counters.canceledByReason.blend || 0) >= 3, "app-folder-create hover interruption should be observable as blend cancellations");
    assert(snapshot.animations.some((animation) => animation.laneKey === "overlay" && animation.blendDuration === 0.08), "app-folder-create hover should use a short blend window");
    motionRuntime.step(0.04);
    assert(node.folderCreateBackdrop.alpha < backdropAlphaBeforeClear && node.folderCreateBackdrop.alpha > 0, "app-folder-create clear should blend backdrop alpha down without jumping");
    assert(node.iconSprite.alpha > iconAlphaBeforeClear && node.iconSprite.alpha < 1, "app-folder-create clear should blend icon alpha back without jumping");
    for (let index = 0; index < 20; index += 1) motionRuntime.step(0.05);
    assert(nearlyEqual(node.iconSprite.alpha, 1) && nearlyEqual(node.emojiText.alpha, 1), "app-folder-create clear should restore icon alpha");

    motionRuntime.reset();
    node.item = { id: "folder-1", type: "folder" };
    node.isFolder = true;
    node.visualWrap.alpha = 0.42;
    node.visualWrap.scale.set(0.86);
    node.labelText.visible = true;
    node.labelText.renderable = true;
    node.labelText.alpha = 0.82;
    node.setFolderHandoffVisualHidden(true);
    assert(node.visualWrap.visible === false, "folder handoff should hide artwork while the overlay owns the thumbnail");
    assert(node.labelText.renderable === false && node.labelText.alpha === 0, "folder handoff should hide the label with the source visual");
    node.setFolderHandoffVisualHidden(false);
    assert(node.visualWrap.visible === true, "folder handoff release should show real artwork");
    assert(node.labelText.renderable === true, "folder handoff release should make the label renderable again");
    assert(node.visualWrap.alpha === 1, "folder handoff release should restore real artwork alpha to match the closing ghost");
    assert(node.visualWrap.scale.x === 1 && node.visualWrap.scale.y === 1, "folder handoff release should restore real artwork scale");
    node.setFolderHandoffSourceHidden(true);
    node.releaseFolderHandoffSource({ fadeLabel: false });
    assert(node.labelText.renderable === true && nearlyEqual(node.labelText.alpha, 1), "explicit handoff source release should be able to restore the label immediately");
    node.setFolderHandoffSourceHidden(true);
    node.releaseFolderHandoffSource();
    assert(node.labelText.renderable === true && nearlyEqual(node.labelText.alpha, 0), "default handoff source release should start the label fade from zero");

    motionRuntime.reset();
    node.labelText.visible = true;
    node.labelText.alpha = 0.42;
    node.revealLabelAfterGhost();
    assert(nearlyEqual(node.labelText.alpha, 0.42), "label reveal should not restart an in-progress fade from zero");

    motionRuntime.reset();
    const folderChildA = { id: "folder-child-a", name: "Folder Child A", type: "app" };
    const folderChildB = { id: "folder-child-b", name: "Folder Child B", type: "app" };
    const folderWithChildren = {
      id: "folder-suppress",
      name: "Folder Suppress",
      type: "folder",
      childPages: [[folderChildA, folderChildB]],
      children: [folderChildA, folderChildB],
    };
    const folderNodeState = {
      cellHeight: 80,
      cellWidth: 80,
      compact: false,
      editing: false,
      folderPreviewPageSize: 9,
      ghosted: false,
      iconSize: 64,
      interactive: true,
      item: folderWithChildren,
      opening: false,
      source: { index: 0, pageIndex: 0, type: "page" },
      stageHeight: 600,
      stageWidth: 800,
      textless: false,
    };
    node.setState({ ...folderNodeState, suppressedFolderPreviewChildIds: ["folder-child-b"] });
    assert(node.folderChildNodes[0].visible === true, "unsuppressed folder preview child should remain visible");
    assert(node.folderChildNodes[1].visible === true, "suppressed folder preview child should stay transform-visible");
    assert(node.folderChildNodes[1].renderable === false, "suppressed folder preview child should not be drawable while the release ghost owns it");

    const releaseLayer = new Container();
    releaseLayer.addChild(node);
    node.position.set(300, 220);
    node.scale.set(1.5);
    node.rotation = Math.PI / 2;
    node.jiggleWrap.position.set(0, 0);
    node.jiggleWrap.rotation = 0;
    const releasePose = node.getFolderPreviewChildReleasePose(releaseLayer, 1, {
      expectedChildId: "folder-child-b",
      previewIconSize: 64,
    });
    const expectedAxisScale = getFolderThumbMetrics(64).childSize / 64 * 1.5;
    assert(releasePose?.targetChildId === "folder-child-b", "release pose should preserve the real target child identity");
    assert(
      nearlyEqual(releasePose.matrix.a, 0) &&
        nearlyEqual(releasePose.matrix.b, expectedAxisScale) &&
        nearlyEqual(releasePose.matrix.c, -expectedAxisScale) &&
        nearlyEqual(releasePose.matrix.d, 0),
      "release pose should expose the target child's full world transform basis instead of an axis-aligned bounds box"
    );
    const centerReleasePose = node.getFolderCenterReleasePose(releaseLayer);
    assert(
      nearlyEqual(centerReleasePose?.center.x, 321) && nearlyEqual(centerReleasePose?.center.y, 220),
      "center release pose should follow the folder thumb origin through the visual offset and live node transform"
    );
    assert(
      node.getFolderPreviewChildReleasePose(releaseLayer, 1, {
        expectedChildId: "another-child",
        previewIconSize: 64,
      }) == null,
      "release pose should reject a recycled slot whose child identity no longer matches"
    );
    node.removeFromParent();
    releaseLayer.destroy({ children: true });
    node.position.set(0, 0);
    node.scale.set(1);
    node.rotation = 0;

    node.setState(folderNodeState);
    assert(node.folderChildNodes[1].visible === true, "folder preview child should reappear after suppression is cleared");
    assert(node.folderChildNodes[1].renderable === true, "clearing suppression should return draw ownership to the real preview child");
    assert(node.folderChildrenWrap.mask === node.folderPreviewMask, "folder rendering should attach its preview mask");
    assert(node.folderPreviewMask.visible === true, "folder rendering should make its preview mask active");

    const appNodeState = {
      ...folderNodeState,
      item: { id: "app-mask-lifecycle", name: "App Mask Lifecycle", type: "app" },
    };
    node.setState(appNodeState);
    assert(node.folderChildrenWrap.mask == null, "app rendering should detach the inactive folder preview mask");
    assert(node.folderPreviewMask.visible === false, "app rendering should hide the inactive folder preview mask");
    assert(node.folderChildrenWrap.visible === false, "app rendering should hide folder preview children");
    assert(node.folderChildNodes.every((child) => !child.visible && !child.renderable), "app rendering should release every folder preview child");

    node.setState(folderNodeState);
    assert(node.folderChildrenWrap.mask === node.folderPreviewMask, "folder rendering should reattach the preview mask after node reuse");
    assert(node.folderPreviewMask.visible === true, "folder rendering should reactivate its preview mask after node reuse");
    assert(node.folderChildNodes[0].visible && node.folderChildNodes[0].renderable, "folder rendering should restore preview children after node reuse");

    node.setState(appNodeState);
    assert(node.folderChildrenWrap.mask == null, "reused app rendering should detach the preview mask on every transition");
    assert(node.folderPreviewMask.visible === false, "reused app rendering should leave the preview mask inactive");

    node.setState(folderNodeState);
    assert(node.folderThumbFrameSig.endsWith(":0"), "normal folder rendering should draw the built-in folder thumb frame");
    node.setState({ ...folderNodeState, suppressFolderThumbFrame: true });
    assert(node.folderThumbFrameSig.endsWith(":1"), "folder drop hover should be able to suppress the built-in folder thumb frame while keeping preview children");
    assert(node.folderChildNodes[0].visible === true, "folder preview children should remain visible when only the thumb frame is suppressed");
    node.setState(folderNodeState);
    assert(node.folderThumbFrameSig.endsWith(":0"), "folder thumb frame should redraw after drop hover suppression clears");

    motionRuntime.reset();
    motionRuntime.configureDebug({ enabled: true });
    node.item = { id: "app-meta", name: "App Meta", type: "app" };
    node.source = { index: 2, pageIndex: 1, type: "page" };
    node.describeMotionTargets({ item: node.item, source: node.source });
    node.setState({
      ...interactionNodeState,
      interactionPhase: "pressing",
      item: node.item,
      source: node.source,
    });
    snapshot = motionRuntime.debugReport({ includeTargets: true });
    assert(
      snapshot.targets.some((entry) => entry.sourceLabel === "desktop.icon.visualWrap" && entry.itemId === "app-meta"),
      "IconNode should describe its animated visual wrapper target",
    );
    assert(
      snapshot.targets.some((entry) => entry.sourceLabel === "desktop.icon.visualScale" && entry.targetPart === "visualWrap.scale"),
      "IconNode should describe its animated visual scale target",
    );
    assert(snapshot.animations.every((animation) => animation.sourceLabel), "IconNode active animations should expose source labels");
    assert(snapshot.warnings.length === 0, "described IconNode targets should not emit missing metadata warnings");

  } finally {
    node.destroy({ children: true });
    motionRuntime.reset();
  }
}
