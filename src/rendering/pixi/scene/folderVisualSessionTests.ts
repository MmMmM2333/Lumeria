import { FolderVisualSession, makeFolderPanelTargetKey } from "./folderVisualSession.js";
import type {
  FolderClosingGhostParticipant,
  FolderClosingPhaseReporter,
  FolderClosingVisualAdapter,
  FolderClosingVisualPlan,
  FolderOpeningPhaseReporter,
  FolderOpeningVisualAdapter,
  FolderOpeningVisualPlan,
  FolderVisualCancelOptions,
} from "./folderVisualSession.js";

type TestRecord = Readonly<Record<string, unknown>>;
type TestGhost = Readonly<{ item: Readonly<{ id: string }> }>;

type OpeningStartRecord = {
  cancelOptions: FolderVisualCancelOptions | null;
  plan: FolderOpeningVisualPlan;
  reporter: FolderOpeningPhaseReporter;
  retargets: FolderOpeningVisualPlan[];
  revealCount: number;
  takenGhostIds: string[];
};

type ClosingHandoffEvent = Readonly<{ controllerKeys: readonly string[] }>;

type ClosingStartRecord = {
  cancelOptions: FolderVisualCancelOptions | null;
  handoffEvents: ClosingHandoffEvent[];
  overlaySettledCount: number;
  plan: FolderClosingVisualPlan;
  reporter: FolderClosingPhaseReporter;
  retargets: FolderClosingVisualPlan[];
  transferredGhost: TestGhost | null;
};

function requireItem<T>(items: readonly T[], index: number, label: string): T {
  const item = items[index];
  if (item === undefined) throw new Error(`[FolderVisualSession test fixture failed] Missing ${label}`);
  return item;
}

function isRecord(value: unknown): value is TestRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: TestRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readTargetItemId(target: object): string | null {
  return isRecord(target) && isRecord(target.item) ? readString(target.item, "id") : null;
}

function readClosingParticipant(target: object): FolderClosingGhostParticipant | null {
  if (!isRecord(target)) return null;
  const itemId = readString(target, "itemId");
  if (!itemId) return null;
  const controllerKey = readString(target, "controllerKey");
  return {
    ...(controllerKey ? { controllerKey } : {}),
    itemId,
    visualCritical: target.visualCritical === true,
  };
}

function asTestGhost(value: unknown): TestGhost | null {
  if (!isRecord(value) || !isRecord(value.item)) return null;
  const id = readString(value.item, "id");
  return id ? { item: { id } } : null;
}

function makeOpeningPlan(ghostIds: readonly string[] = [], state: TestRecord = {}): FolderOpeningVisualPlan {
  return {
    state,
    targets: ghostIds.map((id) => ({ item: { id } })),
  };
}

function makeClosingPlan(
  ghosts: readonly FolderClosingGhostParticipant[] = [],
  takeOpeningGhostId: string | null = null,
): FolderClosingVisualPlan {
  return {
    state: takeOpeningGhostId ? { takeOpeningGhostId } : {},
    targets: ghosts,
  };
}

function makeOpeningAdapter() {
  const starts: OpeningStartRecord[] = [];
  const adapter: FolderOpeningVisualAdapter = {
    prepare(plan: FolderOpeningVisualPlan) {
      return {
        ghostIds: plan.targets.map(readTargetItemId).filter((id): id is string => id !== null),
      };
    },
    start(plan: FolderOpeningVisualPlan, reporter: FolderOpeningPhaseReporter) {
      const record: OpeningStartRecord = {
        cancelOptions: null,
        plan,
        reporter,
        retargets: [],
        revealCount: 0,
        takenGhostIds: [],
      };
      starts.push(record);
      return {
        cancel(options: FolderVisualCancelOptions = {}) {
          record.cancelOptions = options;
        },
        retarget(nextPlan: FolderOpeningVisualPlan) {
          record.retargets.push(nextPlan);
        },
        reveal() {
          record.revealCount += 1;
        },
        snapshot() {
          return {
            active: record.cancelOptions == null,
            ghostIds: plan.targets.map(readTargetItemId).filter((id): id is string => id !== null),
            revealCount: record.revealCount,
          };
        },
        takeGhost(itemId: string, accept?: (ghost: unknown) => boolean) {
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
  const starts: ClosingStartRecord[] = [];
  const adapter: FolderClosingVisualAdapter = {
    prepare(plan: FolderClosingVisualPlan) {
      return {
        ghosts: plan.targets
          .map(readClosingParticipant)
          .filter((ghost): ghost is FolderClosingGhostParticipant => ghost !== null),
      };
    },
    start(plan: FolderClosingVisualPlan, reporter: FolderClosingPhaseReporter) {
      const takeOpeningGhostId = isRecord(plan.state)
        ? readString(plan.state, "takeOpeningGhostId")
        : null;
      const transferredGhost = takeOpeningGhostId
        ? asTestGhost(reporter.takeOpeningGhost(
          takeOpeningGhostId,
          (ghost) => asTestGhost(ghost)?.item.id === takeOpeningGhostId,
        ))
        : null;
      const record: ClosingStartRecord = {
        cancelOptions: null,
        handoffEvents: [],
        overlaySettledCount: 0,
        plan,
        reporter,
        retargets: [],
        transferredGhost,
      };
      starts.push(record);
      return {
        cancel(options: FolderVisualCancelOptions = {}) {
          record.cancelOptions = options;
        },
        onHandoffReady(event: ClosingHandoffEvent) {
          record.handoffEvents.push(event);
        },
        onOverlaySettled() {
          record.overlaySettledCount += 1;
        },
        retarget(nextPlan: FolderClosingVisualPlan) {
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
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
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
    assert(first.present(makeOpeningPlan(["app-a"])).status === "accepted", "an opening lease should present through its adapter");
    const openingStart = requireItem(opening.starts, 0, "opening start");
    const reporter = openingStart.reporter;

    assert(first.panelReady().status === "accepted", "the current lease should accept panel readiness");
    assert(openingStart.revealCount === 0, "panel readiness alone must not reveal opening visuals");
    assert(reporter.ghostsReady().status === "accepted", "the current reporter should accept ghost readiness");
  assert((openingStart.revealCount as number) === 1, "panel and ghost readiness should reveal exactly once");
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
    first.present(makeOpeningPlan(["app-a"]));
    const openingStart = requireItem(opening.starts, 0, "superseded opening start");
    const staleReporter = openingStart.reporter;
    const second = session.open({ folderId: "folder-b", targetKey: "target-b" });
    second.present(makeOpeningPlan(["app-b"]));

    assert(!first.isCurrent() && second.isCurrent(), "opening a different folder should supersede the previous lease");
    assert(openingStart.cancelOptions?.reveal === false, "superseding an opening should cancel its adapter without revealing stale visuals");
    assert(staleReporter.ghostsReady().status === "stale", "late reports from a superseded adapter should be rejected");
    assert(session.snapshot().opening?.folderId === "folder-b", "a stale reporter must not replace the current opening");
  }

  {
    const cancellationReports: string[] = [];
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
    first.present(makeOpeningPlan());
    first.panelReady();
    session.open({ folderId: "folder-b", targetKey: "target-b" });

    assert(cancellationReports.join(",") === "stale", "adapter cleanup reports should be stale as soon as cancellation begins");
    assert(revealCount === 0, "reentrant cleanup must not reveal a superseded opening");
  }

  {
    const opening = makeOpeningAdapter();
    const session = new FolderVisualSession({ openingAdapter: opening.adapter });
    const lease = session.open({ folderId: "folder-a", targetKey: "target-a" });
    lease.present(makeOpeningPlan(["app-a"]));
    lease.panelReady();
    const geometry = {
      folderId: "folder-a",
      layoutKey: "layout-a",
      projection: {
        clientStageRect: { height: 720, left: 0, top: 0, width: 1280 },
        stageHeight: 720,
        stageWidth: 1280,
      },
      source: {
        coordinateSpace: "client-visual" as const,
        folderRect: { height: 64, left: 16, top: 24, width: 64 },
        previewChildRects: new Map([["app-a:0", { height: 12, left: 48, top: 56, width: 12 }]]),
      },
      target: {
        coordinateSpace: "stage-layout" as const,
        panelCenter: { x: 640, y: 360 },
        panelRect: { height: 480, left: 24, top: 32, width: 640 },
      },
      targetKey: "target-a",
    };
    assert(lease.setGeometrySnapshot(geometry).status === "accepted", "the lease should own opening geometry writes");
    assert(
      lease.setGeometrySnapshot(geometry).status === "duplicate",
      "repeating the same layout geometry should be reported as a duplicate"
    );
    geometry.projection.stageWidth = 1;
    geometry.target.panelRect.left = 1;
    const sourcePreviewRect = geometry.source.previewChildRects.get("app-a:0");
    assert(sourcePreviewRect !== undefined, "source preview fixture should exist");
    sourcePreviewRect.left = 1;
    geometry.source.previewChildRects.set("app-b:1", { height: 12, left: 96, top: 56, width: 12 });
    assert(lease.geometrySnapshot()?.projection.stageWidth === 1280, "geometry snapshots should be copied at the contract boundary");
    assert(lease.geometrySnapshot()?.target.panelRect?.left === 24, "nested geometry records should be isolated from caller mutation");
    assert(lease.geometrySnapshot()?.source.previewChildRects.get("app-a:0")?.left === 48, "geometry maps should be isolated from caller mutation");
    assert(
      lease.geometrySnapshot()?.source.previewChildRects instanceof Map,
      "published geometry maps should preserve standard Map read semantics"
    );
    let mapMutationThrew = false;
    try {
      (lease.geometrySnapshot()?.source.previewChildRects as Map<string, { height: number; left: number; top: number; width: number }> | undefined)
        ?.set("app-c:2", { height: 12, left: 120, top: 56, width: 12 });
    } catch (error) {
      mapMutationThrew = error instanceof TypeError;
    }
    assert(mapMutationThrew, "published geometry maps should reject mutation instead of exposing Session-owned state");

    const reused = session.open({ folderId: "folder-a", targetKey: "target-b" });
    assert(reused === lease, "same-folder retargeting should retain the lease identity");
    assert(reused.geometrySnapshot() === null, "retargeting should invalidate geometry from the previous target");
    assert(!reused.snapshot().panelReady, "an unrevealed retarget should wait for the new panel geometry");
    reused.present(makeOpeningPlan(["app-a"], { revision: 2 }));
    const openingStart = requireItem(opening.starts, 0, "retargeted opening start");
    assert(openingStart.retargets.length === 1, "a reused lease should retarget the existing adapter scope");
  }

  {
    const opening = makeOpeningAdapter();
    const closing = makeClosingAdapter();
    const handoffChanges: Array<{ active: boolean; folderId: string | null }> = [];
    const readyFolders: Array<string | null> = [];
    const presentationFolders: string[] = [];
    const session = new FolderVisualSession({
      closingAdapter: closing.adapter,
      onCloseHandoffChange: (active, folderId) => handoffChanges.push({ active, folderId }),
      onClosingHandoffReady: (folderId) => readyFolders.push(folderId),
      onClosingPresentationReady: (folderId) => presentationFolders.push(folderId),
      openingAdapter: opening.adapter,
    });
    const openLease = session.open({ folderId: "folder-a", targetKey: "target-a" });
    openLease.present(makeOpeningPlan(["app-a"]));

    const closeLease = session.close({ folderId: "folder-a" });
    closeLease.present(makeClosingPlan([
        { controllerKey: "controller-a", itemId: "app-a", visualCritical: true },
        { controllerKey: "controller-b", itemId: "app-b", visualCritical: false },
      ], "app-a"));
    const close = requireItem(closing.starts, 0, "closing start");
    const reporter = close.reporter;
    assert(close.transferredGhost?.item?.id === "app-a", "a closing adapter should transfer an opening ghost during start without exposing session identity");
    assert(!openLease.isCurrent(), "the Session should retire the opening lease after the closing adapter captures its ghosts");

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
    assert(presentationFolders.length === 0, "frame arrival should wait for every visual-critical thumbnail before releasing presentation");
    assert(reporter.ghostArrived("app-a").status === "accepted", "perceptual ghost arrival should be accepted once");
    assert(reporter.ghostArrived("app-a").status === "duplicate", "duplicate perceptual ghost arrival should be explicit");
    assert(presentationFolders.join(",") === "folder-a", "frame and thumbnail arrival should release presentation before exact handoff");
    assert(closeLease.snapshot().presentationReady, "the close snapshot should expose perceptual presentation readiness");
    assert(close.handoffEvents.length === 0, "perceptual presentation readiness must not imply exact artwork handoff");
    reporter.ghostVisualReady("app-a");
    reporter.previewComplete("preview-a");
    assert((close.handoffEvents.length as number) === 1, "visual-critical settlement should emit one handoff-ready effect");
    const handoffEvent = requireItem(close.handoffEvents, 0, "closing handoff event");
    assert(handoffEvent.controllerKeys.join(",") === "controller-a,controller-b", "the handoff effect should carry controller completions as readonly values");
    assert(close.overlaySettledCount === 0, "handoff readiness must not imply full overlay settlement");

    assert(reporter.handoffStarted().status === "accepted", "the adapter should explicitly acknowledge handoff start");
    assert(readyFolders.join(",") === "folder-a", "handoff activation should notify the owning layer once");
    const handoffChange = requireItem(handoffChanges, 0, "closing handoff change");
    assert(handoffChanges.length === 1 && handoffChange.active, "handoff visibility should have one authoritative state transition");
    reporter.frameComplete();
    reporter.ghostComplete("app-a", "controller-a");
    reporter.ghostComplete("app-b", "controller-b");
  assert((close.overlaySettledCount as number) === 1, "all overlay participants should settle exactly once");
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
    lease.present(makeClosingPlan());

    assert(lease.snapshot().activeVisuals, "the close contract should expose the semantic active-visual state");
    assert(!("adapter" in lease.snapshot()), "the semantic close snapshot should hide the adapter implementation shape");
  }

  {
    const closing = makeClosingAdapter();
    const session = new FolderVisualSession({ closingAdapter: closing.adapter });
    const first = session.close({ folderId: "folder-a" });
    first.present(makeClosingPlan());
    const staleReporter = requireItem(closing.starts, 0, "superseded closing start").reporter;
    const second = session.close({ folderId: "folder-b" });
    second.present(makeClosingPlan());

    assert(!first.isCurrent() && second.isCurrent(), "a new closing folder should supersede the previous close lease");
    assert(staleReporter.frameComplete().status === "stale", "late close completion should not mutate the current close");
    assert(session.snapshot().closing?.folderId === "folder-b", "stale close reports should leave the current identity intact");
  }

  {
    const cancellationReports: string[] = [];
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
    first.present(makeClosingPlan());
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
    first.present(makeOpeningPlan());
    let thrown: unknown = null;
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
    const reporterRef: { current: FolderOpeningPhaseReporter | null } = { current: null };
    const session = new FolderVisualSession({
      openingAdapter: {
        prepare: () => ({ ghostIds: [] }),
        start(_plan, phaseReporter) {
          reporterRef.current = phaseReporter;
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
    lease.present(makeOpeningPlan());
    lease.panelReady();
    let thrown: unknown = null;
    try {
      const capturedReporter = reporterRef.current;
      assert(capturedReporter !== null, "opening adapter should publish its phase reporter");
      capturedReporter.ghostsReady();
    } catch (error) {
      thrown = error;
    }

    assert(thrown === expected, "opening reveal failures should propagate unchanged");
    assert(cancelCount === 1, "opening reveal failure should cancel adapter visuals exactly once");
    assert(!lease.isCurrent() && lease.snapshot().error === expected, "opening reveal failure should retire the lease and retain its cause");
  }

  {
    const expected = new Error("handoff effect failed");
    const reporterRef: { current: FolderClosingPhaseReporter | null } = { current: null };
    const session = new FolderVisualSession({
      closingAdapter: {
        prepare: () => ({ ghosts: [] }),
        start(_plan, phaseReporter) {
          reporterRef.current = phaseReporter;
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
    lease.present(makeClosingPlan());
    let thrown: unknown = null;
    try {
      const capturedReporter = reporterRef.current;
      assert(capturedReporter !== null, "closing adapter should publish its phase reporter");
      capturedReporter.frameComplete();
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
    openLease.present(makeOpeningPlan());
    const closeLease = session.close({ folderId: "folder-a" });
    closeLease.present(makeClosingPlan());
    session.dispose();

    assert(session.snapshot().disposed, "dispose should be reflected in the root snapshot");
    assert(!openLease.isCurrent() && !closeLease.isCurrent(), "dispose should invalidate all outstanding leases");
    const openingStart = requireItem(opening.starts, 0, "disposed opening start");
    const closingStart = requireItem(closing.starts, 0, "disposed closing start");
    assert(openingStart.cancelOptions?.reveal === false, "the same-folder close should have already retired the opening scope without a stale reveal");
    assert(closingStart.cancelOptions?.reveal === true, "dispose should restore visuals owned by the active close scope");
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
      lease.present(makeOpeningPlan());
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
      lease.present(makeClosingPlan());
    } catch (error) {
      thrown = error;
    }
    assert(thrown === expected, "adapter start errors should propagate unchanged");
    assert(!lease.isCurrent() && session.snapshot().closing === null, "adapter start failure should retire the broken close lease");
    assert(lease.snapshot().error === expected, "the failed close lease snapshot should retain the explicit cause");
  }
}
