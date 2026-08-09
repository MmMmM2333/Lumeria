import { createLaunchpadGestureEngine } from "./launchpadGestureEngine.js";

function assert(condition, message) {
  if (!condition) throw new Error(`[Launchpad gesture engine test failed] ${message}`);
}

function dispatch(engine, type, overrides = {}) {
  return engine.dispatch({
    type,
    time: overrides.time ?? 0,
    pointerId: overrides.pointerId ?? 1,
    pointerType: overrides.pointerType ?? "touch",
    button: overrides.button ?? 0,
    buttons: overrides.buttons,
    dragOnHold: overrides.dragOnHold === true,
    isPrimary: overrides.isPrimary ?? true,
    x: overrides.x ?? 300,
    y: overrides.y ?? 120,
    target: overrides.target ?? { kind: "surface" },
    viewport: overrides.viewport ?? {
      scope: "desktop",
      pageIndex: 0,
      pageCount: 3,
      pageWidth: 500,
    },
  });
}

export function runLaunchpadGestureEngineTests() {
  const engine = createLaunchpadGestureEngine();

  dispatch(engine, "pointerDown", {
    target: { id: "app-a", kind: "icon" },
    x: 300,
  });
  const peek = dispatch(engine, "pointerMove", {
    buttons: 1,
    target: { id: "app-a", kind: "icon" },
    time: 32,
    x: 200,
  });

  assert(peek.handled === true, "touch swipe from an icon should be captured as page navigation");
  assert(peek.presentation?.phase === "scrub", "captured page navigation should expose a scrub presentation");
  assert(peek.targetPresentation === null, "starting page navigation from an icon should clear its pressing presentation");
  assert(peek.presentation?.fromIndex === 0 && peek.presentation?.toIndex === 1, "leftward drag should reveal the next page");
  assert(peek.presentation?.progress === 0.2, "peek progress should follow the pointer continuously");

  const release = dispatch(engine, "pointerUp", {
    time: 64,
    x: 180,
  });
  assert(release.presentation?.phase === "settle", "release should hand the peek route to the settling animation");
  assert(release.presentation?.targetProgress === 1, "a drag beyond the commit distance should settle to the adjacent page");
  assert(
    release.commands.length === 1 &&
      release.commands[0].type === "commitPage" &&
      release.commands[0].pageIndex === 1,
    "the committed page should change exactly once on release"
  );

  const tapEngine = createLaunchpadGestureEngine();
  const tapPress = dispatch(tapEngine, "pointerDown", {
    target: { id: "app-b", kind: "icon" },
  });
  assert(tapPress.ownsPointer === true, "an accepted pointer down should tell the platform adapter to capture that pointer");
  assert(tapPress.deadline?.kind === "hold" && tapPress.deadline?.at === 420, "an icon press should expose the long-press deadline without owning a platform timer");
  assert(
    tapPress.targetPresentation?.phase === "pressing" &&
      tapPress.targetPresentation?.scope === "desktop" &&
      tapPress.targetPresentation?.target.id === "app-b",
    "an accepted icon pointer should publish its immediate pressing presentation"
  );
  const tap = dispatch(tapEngine, "pointerUp", {
    target: { id: "app-b", kind: "icon" },
    time: 80,
  });
  assert(
    tap.commands.length === 1 &&
      tap.commands[0].type === "activateTarget" &&
      tap.commands[0].target.id === "app-b" &&
      tap.targetPresentation === null &&
      tap.deadline === null,
    "an unmoved icon tap should activate its original target and clear press ownership immediately"
  );

  const verticalEngine = createLaunchpadGestureEngine();
  dispatch(verticalEngine, "pointerDown", {
    target: { id: "app-c", kind: "icon" },
  });
  const verticalMove = dispatch(verticalEngine, "pointerMove", {
    buttons: 1,
    target: { id: "app-c", kind: "icon" },
    time: 32,
    x: 304,
    y: 170,
  });
  const verticalRelease = dispatch(verticalEngine, "pointerUp", {
    target: { id: "app-c", kind: "icon" },
    time: 64,
    x: 304,
    y: 170,
  });
  assert(
    verticalMove.targetPresentation === null &&
      verticalMove.deadline === null &&
      verticalRelease.commands.length === 0,
    "movement beyond the pre-hold threshold should clear the press, cancel its deadline, and not activate or page"
  );

  const holdMenuEngine = createLaunchpadGestureEngine();
  dispatch(holdMenuEngine, "pointerDown", {
    target: { id: "app-d", kind: "icon" },
  });
  const held = holdMenuEngine.dispatch({ type: "deadline", kind: "hold", time: 420 });
  assert(
    held.targetPresentation?.phase === "armed" && held.targetPresentation?.target.id === "app-d",
    "the hold deadline should publish that the original icon is armed"
  );
  const heldRelease = dispatch(holdMenuEngine, "pointerUp", {
    target: { id: "app-d", kind: "icon" },
    time: 460,
  });
  assert(
    heldRelease.commands.length === 1 &&
      heldRelease.commands[0].type === "openContextMenu" &&
      heldRelease.targetPresentation === null,
    "releasing a stationary held icon should open its context menu and clear its armed presentation"
  );

  const batchHoldEngine = createLaunchpadGestureEngine();
  dispatch(batchHoldEngine, "pointerDown", {
    dragOnHold: true,
    pointerType: "mouse",
    target: { id: "app-batch-hold", kind: "icon" },
    x: 330,
    y: 160,
  });
  const batchHeld = batchHoldEngine.dispatch({ type: "deadline", kind: "hold", time: 420 });
  assert(
    batchHeld.commands.length === 1 &&
      batchHeld.commands[0].type === "startDrag" &&
      batchHeld.commands[0].pointer.x === 330 &&
      batchHeld.commands[0].pointer.y === 160 &&
      batchHeld.targetPresentation === null,
    "batch long-press should begin gathering at the hold deadline before pointer movement"
  );
  const batchHeldRelease = dispatch(batchHoldEngine, "pointerUp", {
    pointerType: "mouse",
    target: { id: "app-batch-hold", kind: "icon" },
    time: 460,
    x: 330,
    y: 160,
  });
  assert(
    batchHeldRelease.commands[0]?.type === "finishDrag",
    "releasing a stationary batch gather should finish through the atomic drag path"
  );

  const mouseHoldEngine = createLaunchpadGestureEngine();
  dispatch(mouseHoldEngine, "pointerDown", {
    pointerType: "mouse",
    target: { id: "app-mouse-hold", kind: "icon" },
  });
  mouseHoldEngine.dispatch({ type: "deadline", kind: "hold", time: 420 });
  const mouseHoldRelease = dispatch(mouseHoldEngine, "pointerUp", {
    pointerType: "mouse",
    target: { id: "app-mouse-hold", kind: "icon" },
    time: 460,
  });
  assert(
    mouseHoldRelease.commands.length === 0 &&
      mouseHoldRelease.targetPresentation === null &&
      mouseHoldRelease.deadline === null &&
      mouseHoldRelease.releasesPointer === true,
    "releasing a stationary mouse hold should only put the icon back without activating it or opening a menu"
  );

  const anchoredHoldEngine = createLaunchpadGestureEngine();
  dispatch(anchoredHoldEngine, "pointerDown", {
    pointerType: "mouse",
    target: { id: "app-hold-anchor", kind: "icon" },
    x: 300,
  });
  dispatch(anchoredHoldEngine, "pointerMove", {
    buttons: 1,
    pointerType: "mouse",
    target: { id: "app-hold-anchor", kind: "icon" },
    time: 200,
    x: 308,
  });
  anchoredHoldEngine.dispatch({ type: "deadline", kind: "hold", time: 420 });
  const withinArmedSlop = dispatch(anchoredHoldEngine, "pointerMove", {
    buttons: 1,
    pointerType: "mouse",
    target: { id: "app-hold-anchor", kind: "icon" },
    time: 430,
    x: 313,
  });
  const crossedArmedSlop = dispatch(anchoredHoldEngine, "pointerMove", {
    buttons: 1,
    pointerType: "mouse",
    target: { id: "app-hold-anchor", kind: "icon" },
    time: 440,
    x: 314,
  });
  assert(
    withinArmedSlop.commands.length === 0 &&
      crossedArmedSlop.commands[0]?.type === "startDrag" &&
      crossedArmedSlop.commands[0]?.dragAnchor?.x === 300 &&
      crossedArmedSlop.commands[0]?.dragAnchor?.y === 120,
    "armed drag distance should start from the pointer position captured at the hold boundary"
  );

  const lostButtonEngine = createLaunchpadGestureEngine();
  dispatch(lostButtonEngine, "pointerDown", {
    pointerType: "mouse",
    target: { id: "app-lost-button", kind: "icon" },
  });
  lostButtonEngine.dispatch({ type: "deadline", kind: "hold", time: 420 });
  const lostButtonMove = dispatch(lostButtonEngine, "pointerMove", {
    buttons: 0,
    pointerType: "mouse",
    target: { id: "app-lost-button", kind: "icon" },
    time: 440,
    x: 307,
  });
  const pointerAfterLostButton = dispatch(lostButtonEngine, "pointerDown", {
    pointerId: 2,
    pointerType: "mouse",
    target: { id: "app-after-lost-button", kind: "icon" },
    time: 500,
  });
  assert(
    lostButtonMove.commands.length === 0 &&
      lostButtonMove.targetPresentation === null &&
      lostButtonMove.releasesPointer === true &&
      pointerAfterLostButton.ownsPointer === true,
    "losing the primary button during an owned move should cancel the hold instead of entering drag"
  );

  const dragEngine = createLaunchpadGestureEngine();
  dispatch(dragEngine, "pointerDown", {
    target: { id: "app-e", kind: "icon" },
  });
  dragEngine.dispatch({ type: "deadline", kind: "hold", time: 420 });
  const dragStart = dispatch(dragEngine, "pointerMove", {
    buttons: 1,
    target: { id: "app-e", kind: "icon" },
    time: 440,
    x: 307,
  });
  assert(
    dragStart.commands.length === 1 &&
      dragStart.commands[0].type === "startDrag" &&
      dragStart.targetPresentation === null,
    "moving a held icon beyond the drag threshold should start icon dragging and clear the armed presentation"
  );
  const dragFinish = dispatch(dragEngine, "pointerUp", {
    target: { id: "app-e", kind: "icon" },
    time: 480,
    x: 320,
  });
  assert(dragFinish.commands.length === 1 && dragFinish.commands[0].type === "finishDrag", "releasing the owned drag pointer should finish icon dragging");

  const cancelEngine = createLaunchpadGestureEngine();
  dispatch(cancelEngine, "pointerDown", { x: 300 });
  const secondaryMove = dispatch(cancelEngine, "pointerMove", {
    buttons: 1,
    isPrimary: false,
    pointerId: 2,
    time: 20,
    x: 100,
  });
  assert(secondaryMove.handled === false && secondaryMove.presentation === null, "a second pointer must not replace or move the owned gesture");
  dispatch(cancelEngine, "pointerMove", {
    buttons: 1,
    time: 40,
    x: 180,
  });
  const canceled = dispatch(cancelEngine, "pointerCancel", {
    time: 60,
    x: 160,
  });
  assert(canceled.presentation?.phase === "settle" && canceled.presentation?.targetProgress === 0, "pointer cancellation should visibly roll the page back");
  assert(canceled.commands.length === 0, "pointer cancellation must never commit a page");

  const wheelEngine = createLaunchpadGestureEngine();
  const firstWheel = wheelEngine.dispatch({
    type: "wheel",
    time: 0,
    deltaMode: 0,
    deltaX: 30,
    deltaY: 2,
    viewport: { scope: "desktop", pageIndex: 0, pageCount: 3, pageWidth: 500 },
  });
  assert(firstWheel.presentation?.phase === "scrub" && firstWheel.presentation?.progress === 0.06, "the first touchpad delta should immediately expose a proportional peek");
  assert(firstWheel.deadline?.kind === "wheelEnd" && firstWheel.deadline?.at === 140, "a wheel session should publish its inferred end deadline");
  const secondWheel = wheelEngine.dispatch({
    type: "wheel",
    time: 50,
    deltaMode: 0,
    deltaX: 60,
    deltaY: 2,
    viewport: { scope: "desktop", pageIndex: 0, pageCount: 3, pageWidth: 500 },
  });
  assert(secondWheel.presentation?.progress === 0.18, "small touchpad deltas should accumulate in one continuous session");
  const wheelEnd = wheelEngine.dispatch({ type: "deadline", kind: "wheelEnd", time: 190 });
  assert(wheelEnd.presentation?.phase === "settle" && wheelEnd.presentation?.targetProgress === 1, "an accumulated wheel peek should settle after inactivity");
  assert(wheelEnd.commands.length === 1 && wheelEnd.commands[0].pageIndex === 1, "one wheel session should commit exactly one adjacent page");

  const discreteWheelEngine = createLaunchpadGestureEngine();
  const singleNotch = discreteWheelEngine.dispatch({
    type: "wheel",
    time: 0,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 100,
    momentum: false,
    viewport: { scope: "desktop", pageIndex: 0, pageCount: 3, pageWidth: 1344 },
  });
  const sameBurstFollowup = discreteWheelEngine.dispatch({
    type: "wheel",
    time: 40,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 100,
    momentum: false,
    viewport: { scope: "desktop", pageIndex: 1, pageCount: 3, pageWidth: 1344 },
  });
  assert(
    singleNotch.presentation?.phase === "settle" &&
      singleNotch.presentation?.targetProgress === 1 &&
      singleNotch.commands.length === 1 &&
      singleNotch.commands[0].pageIndex === 1 &&
      sameBurstFollowup.commands.length === 0,
    "one coarse mouse-wheel burst should immediately commit exactly one adjacent page regardless of viewport width"
  );

  const repeatingDiscreteWheelEngine = createLaunchpadGestureEngine();
  const repeatResults = [
    [0, 0],
    [100, 1],
    [299, 1],
    [300, 1],
    [400, 2],
    [520, 2],
  ].map(([time, pageIndex]) => repeatingDiscreteWheelEngine.dispatch({
    type: "wheel",
    time,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 100,
    momentum: false,
    viewport: { scope: "desktop", pageIndex, pageCount: 5, pageWidth: 1344 },
  }));
  assert(
    repeatResults[0].commands[0]?.pageIndex === 1 &&
      repeatResults[1].commands.length === 0 &&
      repeatResults[2].commands.length === 0 &&
      repeatResults[3].commands[0]?.pageIndex === 2 &&
      repeatResults[4].commands.length === 0 &&
      repeatResults[5].commands[0]?.pageIndex === 3,
    "sustained same-direction discrete input should advance page-by-page at a controlled repeat cadence without queued commits"
  );

  const discreteMomentumTailEngine = createLaunchpadGestureEngine();
  discreteMomentumTailEngine.dispatch({
    type: "wheel",
    time: 0,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 100,
    momentum: false,
    viewport: { scope: "desktop", pageIndex: 0, pageCount: 4, pageWidth: 1344 },
  });
  const discreteMomentumTail = discreteMomentumTailEngine.dispatch({
    type: "wheel",
    time: 300,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 100,
    momentum: true,
    viewport: { scope: "desktop", pageIndex: 1, pageCount: 4, pageWidth: 1344 },
  });
  assert(
    discreteMomentumTail.commands.length === 0,
    "momentum metadata must never turn a discrete wheel tail into a repeated page commit"
  );

  const reversingDiscreteWheelEngine = createLaunchpadGestureEngine();
  const discreteForward = reversingDiscreteWheelEngine.dispatch({
    type: "wheel",
    time: 0,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 100,
    momentum: false,
    viewport: { scope: "desktop", pageIndex: 0, pageCount: 3, pageWidth: 1344 },
  });
  const discreteReverse = reversingDiscreteWheelEngine.dispatch({
    type: "wheel",
    time: 120,
    deltaMode: 0,
    deltaX: 0,
    deltaY: -100,
    momentum: false,
    viewport: { scope: "desktop", pageIndex: 1, pageCount: 3, pageWidth: 1344 },
  });
  const reverseBurstFollowup = reversingDiscreteWheelEngine.dispatch({
    type: "wheel",
    time: 160,
    deltaMode: 0,
    deltaX: 0,
    deltaY: -100,
    momentum: false,
    viewport: { scope: "desktop", pageIndex: 0, pageCount: 3, pageWidth: 1344 },
  });
  assert(
    discreteForward.commands[0]?.pageIndex === 1 &&
      discreteReverse.commands[0]?.pageIndex === 0 &&
      reverseBurstFollowup.commands.length === 0,
    "an opposite coarse wheel step should start a new burst immediately while same-direction followups remain coalesced"
  );

  const continuousFlickEngine = createLaunchpadGestureEngine();
  continuousFlickEngine.dispatch({
    type: "wheel",
    time: 0,
    deltaMode: 0,
    deltaX: 12,
    deltaY: 0,
    momentum: false,
    viewport: { scope: "desktop", pageIndex: 0, pageCount: 3, pageWidth: 500 },
  });
  const fastFollowup = continuousFlickEngine.dispatch({
    type: "wheel",
    time: 20,
    deltaMode: 0,
    deltaX: 14,
    deltaY: 0,
    momentum: false,
    viewport: { scope: "desktop", pageIndex: 0, pageCount: 3, pageWidth: 500 },
  });
  const continuousFlickEnd = continuousFlickEngine.dispatch({ type: "deadline", kind: "wheelEnd", time: 160 });
  assert(
    fastFollowup.presentation?.progress < 0.16 &&
      continuousFlickEnd.presentation?.targetProgress === 1 &&
      continuousFlickEnd.commands[0]?.pageIndex === 1,
    "a fast short continuous-wheel flick should commit by release velocity before the distance threshold"
  );

  const momentumTailEngine = createLaunchpadGestureEngine();
  const momentumViewport = { scope: "desktop", pageIndex: 0, pageCount: 3, pageWidth: 500 };
  momentumTailEngine.dispatch({
    type: "wheel",
    time: 0,
    deltaMode: 0,
    deltaX: 18,
    deltaY: 0,
    momentum: false,
    viewport: momentumViewport,
  });
  momentumTailEngine.dispatch({
    type: "wheel",
    time: 16,
    deltaMode: 0,
    deltaX: 22,
    deltaY: 0,
    momentum: false,
    viewport: momentumViewport,
  });
  const momentumRelease = momentumTailEngine.dispatch({
    type: "wheel",
    time: 32,
    deltaMode: 0,
    deltaX: 36,
    deltaY: 0,
    momentum: true,
    viewport: momentumViewport,
  });
  const momentumDrain = momentumTailEngine.dispatch({
    type: "wheel",
    time: 48,
    deltaMode: 0,
    deltaX: 28,
    deltaY: 0,
    momentum: true,
    viewport: momentumViewport,
  });
  const momentumTailEnd = momentumTailEngine.dispatch({ type: "deadline", kind: "wheelEnd", time: 188 });
  const orphanedTail = momentumTailEngine.dispatch({
    type: "wheel",
    time: 200,
    deltaMode: 0,
    deltaX: 100,
    deltaY: 0,
    momentum: true,
    viewport: { ...momentumViewport, pageIndex: 1 },
  });
  assert(
    momentumRelease.presentation?.phase === "settle" &&
      momentumRelease.commands[0]?.pageIndex === 1 &&
      momentumDrain.presentation === null &&
      momentumDrain.commands.length === 0 &&
      momentumTailEnd.commands.length === 0 &&
      orphanedTail.handled === false &&
      orphanedTail.commands.length === 0,
    "the first momentum event should release immediately while its tail only drains the accepted route"
  );

  const reversalEngine = createLaunchpadGestureEngine();
  const reversalViewport = { scope: "desktop", pageIndex: 1, pageCount: 3, pageWidth: 500 };
  for (const [time, deltaX] of [[0, 30], [16, 20], [32, -25], [48, -25]]) {
    reversalEngine.dispatch({
      type: "wheel",
      time,
      deltaMode: 0,
      deltaX,
      deltaY: 0,
      momentum: false,
      viewport: reversalViewport,
    });
  }
  const reversalEnd = reversalEngine.dispatch({ type: "deadline", kind: "wheelEnd", time: 188 });
  assert(
    reversalEnd.presentation?.targetProgress === 0 && reversalEnd.commands.length === 0,
    "equal continuous-wheel travel in opposite directions should settle back without committing"
  );

  const unlockedDiscreteWheelEngine = createLaunchpadGestureEngine();
  const firstDiscretePage = unlockedDiscreteWheelEngine.dispatch({
    type: "wheel",
    time: 0,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 100,
    momentum: false,
    viewport: { scope: "desktop", pageIndex: 0, pageCount: 3, pageWidth: 1344 },
  });
  const coalescedDiscreteFollowup = unlockedDiscreteWheelEngine.dispatch({
    type: "wheel",
    time: 100,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 100,
    momentum: false,
    viewport: { scope: "desktop", pageIndex: 1, pageCount: 3, pageWidth: 1344 },
  });
  const stoppedDiscreteBurst = unlockedDiscreteWheelEngine.dispatch({
    type: "deadline",
    kind: "wheelEnd",
    time: 460,
  });
  const secondDiscretePage = unlockedDiscreteWheelEngine.dispatch({
    type: "wheel",
    time: 461,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 100,
    momentum: false,
    viewport: { scope: "desktop", pageIndex: 1, pageCount: 3, pageWidth: 1344 },
  });
  assert(
    firstDiscretePage.commands[0]?.pageIndex === 1 &&
      coalescedDiscreteFollowup.commands.length === 0 &&
      stoppedDiscreteBurst.commands.length === 0 &&
      secondDiscretePage.commands[0]?.pageIndex === 2,
    "stopping a discrete burst should not queue another commit, and the next burst should start immediately"
  );

  const interruptedWheelEngine = createLaunchpadGestureEngine();
  interruptedWheelEngine.dispatch({
    type: "wheel",
    time: 0,
    deltaMode: 0,
    deltaX: 30,
    deltaY: 0,
    viewport: { scope: "desktop", pageIndex: 0, pageCount: 3, pageWidth: 500 },
  });
  dispatch(interruptedWheelEngine, "pointerDown", {
    target: { id: "app-wheel-interrupt", kind: "icon" },
    time: 10,
  });
  const interruptedWheelEnd = interruptedWheelEngine.dispatch({ type: "deadline", kind: "wheelEnd", time: 140 });
  assert(interruptedWheelEnd.handled === false, "an accepted pointer should end ownership of the previous wheel session");
  assert(interruptedWheelEnd.commands.length === 0, "an interrupted wheel session must not commit behind the active pointer");

  const normalizedWheelEngine = createLaunchpadGestureEngine();
  const modifiedWheel = normalizedWheelEngine.dispatch({
    type: "wheel",
    time: 0,
    ctrlKey: true,
    deltaMode: 0,
    deltaX: 100,
    deltaY: 0,
    viewport: { scope: "desktop", pageIndex: 1, pageCount: 3, pageWidth: 400 },
  });
  assert(modifiedWheel.handled === false, "modified wheel input should remain available for pinch or browser commands");
  const lineWheel = normalizedWheelEngine.dispatch({
    type: "wheel",
    time: 20,
    deltaMode: 1,
    deltaX: 2,
    deltaY: 0,
    viewport: { scope: "desktop", pageIndex: 1, pageCount: 3, pageWidth: 400 },
  });
  assert(lineWheel.presentation?.progress === 0.08, "line-mode wheel deltas should be normalized to pixels before peeking");

  const edgeEngine = createLaunchpadGestureEngine();
  const edgePeek = edgeEngine.dispatch({
    type: "wheel",
    time: 0,
    deltaMode: 0,
    deltaX: -100,
    deltaY: 0,
    viewport: { scope: "desktop", pageIndex: 0, pageCount: 3, pageWidth: 400 },
  });
  assert(edgePeek.presentation?.edge === true, "outward movement on the first page should be marked as an edge route");
  assert(edgePeek.presentation?.progress > 0 && edgePeek.presentation?.progress < 0.12, "edge peek should apply bounded rubber-band resistance");
  assert(edgePeek.commands.length === 0, "an outward discrete wheel step at the edge must not commit a page");

  const flickEngine = createLaunchpadGestureEngine();
  dispatch(flickEngine, "pointerDown", { time: 0, x: 300 });
  dispatch(flickEngine, "pointerMove", {
    buttons: 1,
    time: 40,
    x: 265,
  });
  const flickRelease = dispatch(flickEngine, "pointerUp", {
    time: 50,
    x: 260,
  });
  assert(flickRelease.presentation?.progress < 0.1, "the flick scenario should remain below the distance threshold");
  assert(flickRelease.presentation?.targetProgress === 1, "a fast short flick should commit by velocity projection");

  const canceledWheelEngine = createLaunchpadGestureEngine();
  canceledWheelEngine.dispatch({
    type: "wheel",
    time: 0,
    deltaMode: 0,
    deltaX: 30,
    deltaY: 0,
    viewport: { scope: "folder:folder-1", pageIndex: 0, pageCount: 3, pageWidth: 400 },
  });
  const canceledWheel = canceledWheelEngine.dispatch({ type: "cancel", time: 30 });
  assert(canceledWheel.presentation?.targetProgress === 0, "canceling an active wheel session should return its peek to the source page");
  assert(canceledWheel.commands.length === 0, "canceling an active wheel session must not commit its eligible destination");
}
