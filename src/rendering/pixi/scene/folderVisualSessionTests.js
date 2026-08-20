import { FolderVisualSession, makeFolderPanelTargetKey } from "./folderVisualSession.js";

function makeOpeningAdapter() {
  const starts = [];
  const adapter = {
    prepare(plan) {
      return {
        ghostIds: plan.ghostIds || (plan.targets || []).map((target) => target.item?.id).filter(Boolean),
      };
    },
    start(plan, reporter) {
      const record = {
        cancelOptions: null,
        plan,
        reporter,
        retargets: [],
        revealCount: 0,
        takenGhostIds: [],
      };
      starts.push(record);
      return {
        cancel(options = {}) {
          record.cancelOptions = options;
        },
        retarget(nextPlan) {
          record.retargets.push(nextPlan);
        },
        reveal() {
          record.revealCount += 1;
        },
        snapshot() {
          return {
            active: record.cancelOptions == null,
            ghostIds: plan.ghostIds || [],
            revealCount: record.revealCount,
          };
        },
        takeGhost(itemId, accept) {
          const ghost = { item: { id: itemId } };
          if (typeof accept === "function" && !accept(ghost)) return null;
          record.takenGhostIds.push(itemId);
          return ghost;
        },
      };
    },
  };
  return { adapter, starts };
}

function makeClosingAdapter() {
  const starts = [];
  const adapter = {
    prepare(plan) {
      return { ghosts: plan.ghosts || [] };
    },
    start(plan, reporter) {
      const record = {
        cancelOptions: null,
        handoffEvents: [],
        overlaySettledCount: 0,
        plan,
        reporter,
        retargets: [],
        retireOpeningResult: null,
        transferredGhost: plan.takeOpeningGhostId
          ? reporter.takeOpeningGhost(plan.takeOpeningGhostId, (ghost) => ghost.item?.id === plan.takeOpeningGhostId)
          : null,
      };
      if (record.transferredGhost) record.retireOpeningResult = reporter.retireOpening();
      starts.push(record);
      return {
        cancel(options = {}) {
          record.cancelOptions = options;
        },
        onHandoffReady(event) {
          record.handoffEvents.push(event);
        },
        onOverlaySettled() {
          record.overlaySettledCount += 1;
        },
        retarget(nextPlan) {
          record.retargets.push(nextPlan);
        },
        snapshot() {
          return {
            activeVisuals: record.cancelOptions == null,
            retargetCount: record.retargets.length,
          };
        },
      };
    },
  };
  return { adapter, starts };
}

export async function runFolderVisualSessionTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[FolderVisualSession test failed] ${message}`);
  };

  {
    const key = makeFolderPanelTargetKey("folder-1", 10.123, 20.456, { height: 300.333, width: 400.777 });
    assert(key === "folder-1:10.12:20.46:400.78:300.33", "target key should normalize folder panel geometry");
    assert(
      Object.getOwnPropertyNames(FolderVisualSession.prototype).sort().join(",") === "close,constructor,dispose,open,snapshot",
      "the Session root should expose only lifecycle entry points and readonly observation",
    );
  }

  {
    const opening = makeOpeningAdapter();
    const session = new FolderVisualSession({ openingAdapter: opening.adapter });
    const first = session.open({ folderId: "folder-a", targetKey: "target-a" });
    assert(first.present({ ghostIds: ["app-a"] }).status === "accepted", "an opening lease should present through its adapter");
    const reporter = opening.starts[0].reporter;

    assert(first.panelReady().status === "accepted", "the current lease should accept panel readiness");
    assert(opening.starts[0].revealCount === 0, "panel readiness alone must not reveal opening visuals");
    assert(reporter.ghostsReady().status === "accepted", "the current reporter should accept ghost readiness");
    assert(opening.starts[0].revealCount === 1, "panel and ghost readiness should reveal exactly once");
    assert(reporter.ghostsReady().status === "duplicate", "duplicate readiness should be explicit");
    assert(first.panelReady().status === "duplicate", "duplicate panel readiness should be explicit");

    const snapshot = first.snapshot();
    assert(snapshot.revealed && !snapshot.revealPending, "the lease snapshot should expose the completed reveal state");
    assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.ghostIds), "opening snapshots and collections should be readonly values");
    assert(Array.isArray(snapshot.ghostIds), "opening snapshots must not leak mutable Set instances");
  }

  {
    const opening = makeOpeningAdapter();
    const session = new FolderVisualSession({ openingAdapter: opening.adapter });
    const first = session.open({ folderId: "folder-a", targetKey: "target-a" });
    first.present({ ghostIds: ["app-a"] });
    const staleReporter = opening.starts[0].reporter;
    const second = session.open({ folderId: "folder-b", targetKey: "target-b" });
    second.present({ ghostIds: ["app-b"] });

    assert(!first.isCurrent() && second.isCurrent(), "opening a different folder should supersede the previous lease");
    assert(opening.starts[0].cancelOptions?.reveal === false, "superseding an opening should cancel its adapter without revealing stale visuals");
    assert(staleReporter.ghostsReady().status === "stale", "late reports from a superseded adapter should be rejected");
    assert(session.snapshot().opening?.folderId === "folder-b", "a stale reporter must not replace the current opening");
  }

  {
    const cancellationReports = [];
    let revealCount = 0;
    const session = new FolderVisualSession({
      openingAdapter: {
        prepare: () => ({ ghostIds: [] }),
        start(_plan, reporter) {
          return {
            cancel() {
              cancellationReports.push(reporter.ghostsReady().status);
            },
            retarget() {},
            reveal() {
              revealCount += 1;
            },
          };
        },
      },
    });
    const first = session.open({ folderId: "folder-a", targetKey: "target-a" });
    first.present({});
    first.panelReady();
    session.open({ folderId: "folder-b", targetKey: "target-b" });

    assert(cancellationReports.join(",") === "stale", "adapter cleanup reports should be stale as soon as cancellation begins");
    assert(revealCount === 0, "reentrant cleanup must not reveal a superseded opening");
  }

  {
    const opening = makeOpeningAdapter();
    const session = new FolderVisualSession({ openingAdapter: opening.adapter });
    const lease = session.open({ folderId: "folder-a", targetKey: "target-a" });
    lease.present({ ghostIds: ["app-a"] });
    lease.panelReady();
    const geometry = {
      folderId: "folder-a",
      layoutKey: "layout-a",
      panelRect: { left: 24, width: 640 },
      previewChildRects: new Map([["app-a:0", { left: 48 }]]),
      width: 640,
    };
    assert(lease.setGeometrySnapshot(geometry).status === "accepted", "the lease should own opening geometry writes");
    assert(
      lease.setGeometrySnapshot(geometry).status === "duplicate",
      "repeating the same layout geometry should be reported as a duplicate"
    );
    geometry.width = 1;
    geometry.panelRect.left = 1;
    geometry.previewChildRects.get("app-a:0").left = 1;
    geometry.previewChildRects.set("app-b:1", { left: 96 });
    assert(lease.geometrySnapshot()?.width === 640, "geometry snapshots should be copied at the contract boundary");
    assert(lease.geometrySnapshot()?.panelRect.left === 24, "nested geometry records should be isolated from caller mutation");
    assert(lease.geometrySnapshot()?.previewChildRects.get("app-a:0").left === 48, "geometry maps should be isolated from caller mutation");
    assert(
      lease.geometrySnapshot()?.previewChildRects instanceof Map,
      "published geometry maps should preserve standard Map read semantics"
    );
    let mapMutationThrew = false;
    try {
      lease.geometrySnapshot()?.previewChildRects.set("app-c:2", { left: 120 });
    } catch (error) {
      mapMutationThrew = error instanceof TypeError;
    }
    assert(mapMutationThrew, "published geometry maps should reject mutation instead of exposing Session-owned state");

    const reused = session.open({ folderId: "folder-a", targetKey: "target-b" });
    assert(reused === lease, "same-folder retargeting should retain the lease identity");
    assert(reused.geometrySnapshot() === null, "retargeting should invalidate geometry from the previous target");
    assert(!reused.snapshot().panelReady, "an unrevealed retarget should wait for the new panel geometry");
    reused.present({ ghostIds: ["app-a"], revision: 2 });
    assert(opening.starts[0].retargets.length === 1, "a reused lease should retarget the existing adapter scope");
  }

  {
    const opening = makeOpeningAdapter();
    const closing = makeClosingAdapter();
    const handoffChanges = [];
    const readyFolders = [];
    const session = new FolderVisualSession({
      closingAdapter: closing.adapter,
      onCloseHandoffChange: (active, folderId) => handoffChanges.push({ active, folderId }),
      onClosingHandoffReady: (folderId) => readyFolders.push(folderId),
      openingAdapter: opening.adapter,
    });
    const openLease = session.open({ folderId: "folder-a", targetKey: "target-a" });
    openLease.present({ ghostIds: ["app-a"] });

    const closeLease = session.close({ folderId: "folder-a" });
    closeLease.present({
      ghosts: [
        { controllerKey: "controller-a", itemId: "app-a", visualCritical: true },
        { controllerKey: "controller-b", itemId: "app-b", visualCritical: false },
      ],
      takeOpeningGhostId: "app-a",
    });
    const close = closing.starts[0];
    const reporter = close.reporter;
    assert(close.transferredGhost?.item?.id === "app-a", "a closing adapter should transfer an opening ghost during start without exposing session identity");
    assert(close.retireOpeningResult?.status === "accepted", "a closing adapter should retire the opening scope after capturing its ghosts");
    assert(!openLease.isCurrent(), "presenting a close for the same folder should retire the opening lease after transfer");

    assert(reporter.setGeometry({
      detachedTarget: { left: 1 },
      rect: { left: 2 },
      target: { folderId: "folder-a" },
    }).status === "accepted", "the closing reporter should own handoff geometry");
    const detachedGhost = {};
    reporter.setDetachedGhostMotion(detachedGhost, { progress: 0.5 });
    assert(closeLease.detachedGhostMotion(detachedGhost)?.progress === 0.5, "detached motion should be readable only through the current lease");

    assert(reporter.previewStarted("preview-a").status === "accepted", "preview participation should be registered by the phase reporter");
    reporter.frameVisualReady();
    reporter.ghostVisualReady("app-a");
    reporter.previewComplete("preview-a");
    assert(close.handoffEvents.length === 1, "visual-critical settlement should emit one handoff-ready effect");
    assert(close.handoffEvents[0].controllerKeys.join(",") === "controller-a,controller-b", "the handoff effect should carry controller completions as readonly values");
    assert(close.overlaySettledCount === 0, "handoff readiness must not imply full overlay settlement");

    assert(reporter.handoffStarted().status === "accepted", "the adapter should explicitly acknowledge handoff start");
    assert(readyFolders.join(",") === "folder-a", "handoff activation should notify the owning layer once");
    assert(handoffChanges.length === 1 && handoffChanges[0].active, "handoff visibility should have one authoritative state transition");
    reporter.frameComplete();
    reporter.ghostComplete("app-a", "controller-a");
    reporter.ghostComplete("app-b", "controller-b");
    assert(close.overlaySettledCount === 1, "all overlay participants should settle exactly once");
    assert(reporter.ghostComplete("app-b", "controller-b").status === "duplicate", "duplicate ghost completion should be explicit");

    const snapshot = closeLease.snapshot();
    assert(snapshot.phase === "settled" && snapshot.overlaySettled, "the close snapshot should expose terminal overlay settlement");
    assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.ghostIds), "closing snapshots should not leak mutable collections");
    assert(snapshot.handoffTarget?.folderId === "folder-a", "closing geometry should be available as copied metadata");
    assert(!("adapter" in snapshot), "closing snapshots must not leak adapter-specific diagnostics");
  }

  {
    const closing = makeClosingAdapter();
    const session = new FolderVisualSession({ closingAdapter: closing.adapter });
    const lease = session.close({ folderId: "folder-a" });
    lease.present({ ghosts: [] });

    assert(lease.snapshot().activeVisuals, "the close contract should expose the semantic active-visual state");
    assert(!("adapter" in lease.snapshot()), "the semantic close snapshot should hide the adapter implementation shape");
  }

  {
    const closing = makeClosingAdapter();
    const session = new FolderVisualSession({ closingAdapter: closing.adapter });
    const first = session.close({ folderId: "folder-a" });
    first.present({ ghosts: [] });
    const staleReporter = closing.starts[0].reporter;
    const second = session.close({ folderId: "folder-b" });
    second.present({ ghosts: [] });

    assert(!first.isCurrent() && second.isCurrent(), "a new closing folder should supersede the previous close lease");
    assert(staleReporter.frameComplete().status === "stale", "late close completion should not mutate the current close");
    assert(session.snapshot().closing?.folderId === "folder-b", "stale close reports should leave the current identity intact");
  }

  {
    const cancellationReports = [];
    let handoffCount = 0;
    const session = new FolderVisualSession({
      closingAdapter: {
        prepare: () => ({ ghosts: [] }),
        start(_plan, reporter) {
          return {
            cancel() {
              cancellationReports.push(reporter.frameComplete().status);
            },
            onHandoffReady() {
              handoffCount += 1;
            },
            retarget() {},
          };
        },
      },
    });
    const first = session.close({ folderId: "folder-a" });
    first.present({});
    session.close({ folderId: "folder-b" });

    assert(cancellationReports.join(",") === "stale", "closing cleanup reports should be stale as soon as cancellation begins");
    assert(handoffCount === 0, "reentrant cleanup must not emit settlement effects for a superseded close");
  }

  {
    const expected = new Error("opening cancel failed");
    const session = new FolderVisualSession({
      openingAdapter: {
        prepare: () => ({ ghostIds: [] }),
        start() {
          return {
            cancel() {
              throw expected;
            },
            retarget() {},
            reveal() {},
          };
        },
      },
    });
    const first = session.open({ folderId: "folder-a", targetKey: "target-a" });
    first.present({});
    let thrown = null;
    try {
      session.open({ folderId: "folder-b", targetKey: "target-b" });
    } catch (error) {
      thrown = error;
    }

    assert(thrown === expected, "adapter cleanup failures should propagate unchanged");
    assert(!first.isCurrent() && session.snapshot().opening === null, "cleanup failure must not leave the broken opening identity current");
  }

  {
    const expected = new Error("opening reveal failed");
    let cancelCount = 0;
    let reporter = null;
    const session = new FolderVisualSession({
      openingAdapter: {
        prepare: () => ({ ghostIds: [] }),
        start(_plan, phaseReporter) {
          reporter = phaseReporter;
          return {
            cancel() {
              cancelCount += 1;
            },
            retarget() {},
            reveal() {
              throw expected;
            },
          };
        },
      },
    });
    const lease = session.open({ folderId: "folder-a", targetKey: "target-a" });
    lease.present({});
    lease.panelReady();
    let thrown = null;
    try {
      reporter.ghostsReady();
    } catch (error) {
      thrown = error;
    }

    assert(thrown === expected, "opening reveal failures should propagate unchanged");
    assert(cancelCount === 1, "opening reveal failure should cancel adapter visuals exactly once");
    assert(!lease.isCurrent() && lease.snapshot().error === expected, "opening reveal failure should retire the lease and retain its cause");
  }

  {
    const expected = new Error("handoff effect failed");
    let reporter = null;
    const session = new FolderVisualSession({
      closingAdapter: {
        prepare: () => ({ ghosts: [] }),
        start(_plan, phaseReporter) {
          reporter = phaseReporter;
          return {
            cancel() {},
            onHandoffReady() {
              throw expected;
            },
            retarget() {},
          };
        },
      },
    });
    const lease = session.close({ folderId: "folder-a" });
    lease.present({});
    let thrown = null;
    try {
      reporter.frameComplete();
    } catch (error) {
      thrown = error;
    }

    assert(thrown === expected, "closing effect failures should propagate unchanged");
    assert(!lease.isCurrent() && lease.snapshot().error === expected, "closing effect failure should retire the lease and retain its cause");
  }

  {
    const opening = makeOpeningAdapter();
    const closing = makeClosingAdapter();
    const session = new FolderVisualSession({
      closingAdapter: closing.adapter,
      openingAdapter: opening.adapter,
    });
    const openLease = session.open({ folderId: "folder-a", targetKey: "target-a" });
    openLease.present({ ghostIds: [] });
    const closeLease = session.close({ folderId: "folder-a" });
    closeLease.present({ ghosts: [] });
    session.dispose();

    assert(session.snapshot().disposed, "dispose should be reflected in the root snapshot");
    assert(!openLease.isCurrent() && !closeLease.isCurrent(), "dispose should invalidate all outstanding leases");
    assert(opening.starts[0].cancelOptions?.reveal === false, "the same-folder close should have already retired the opening scope without a stale reveal");
    assert(closing.starts[0].cancelOptions?.reveal === true, "dispose should restore visuals owned by the active close scope");
    let didThrow = false;
    try {
      session.open({ folderId: "folder-b", targetKey: "target-b" });
    } catch (error) {
      didThrow = /disposed/.test(String(error));
    }
    assert(didThrow, "using a disposed session should fail explicitly");
  }

  {
    const expected = new Error("opening prepare failed");
    const session = new FolderVisualSession({
      openingAdapter: {
        prepare() {
          throw expected;
        },
        start() {
          throw new Error("start should not run after prepare failure");
        },
      },
    });
    const lease = session.open({ folderId: "folder-a", targetKey: "target-a" });
    let thrown = null;
    try {
      lease.present({});
    } catch (error) {
      thrown = error;
    }
    assert(thrown === expected, "adapter preparation errors should propagate unchanged");
    assert(!lease.isCurrent() && session.snapshot().opening === null, "adapter preparation failure should retire the broken open lease");
    assert(lease.snapshot().error === expected, "the failed lease snapshot should retain the explicit cause");
  }

  {
    const expected = new Error("closing start failed");
    const session = new FolderVisualSession({
      closingAdapter: {
        prepare: () => ({ ghosts: [] }),
        start() {
          throw expected;
        },
      },
    });
    const lease = session.close({ folderId: "folder-a" });
    let thrown = null;
    try {
      lease.present({});
    } catch (error) {
      thrown = error;
    }
    assert(thrown === expected, "adapter start errors should propagate unchanged");
    assert(!lease.isCurrent() && session.snapshot().closing === null, "adapter start failure should retire the broken close lease");
    assert(lease.snapshot().error === expected, "the failed close lease snapshot should retain the explicit cause");
  }
}
