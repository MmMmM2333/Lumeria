import { createResizeSettleScheduler } from "./resizeSettleScheduler.js";

export function runResizeSettleSchedulerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Resize settle scheduler test failed] ${message}`);
  };

  {
    const frames = [];
    const scheduler = createResizeSettleScheduler({
      defaultFrameCount: 3,
      onFrame: (reason, meta) => frames.push({ meta, reason }),
    });

    assert(scheduler.request("resize") === true, "first request should start an idle scheduler");
    assert(scheduler.hasPending(), "requested scheduler should have pending frames");
    assert(scheduler.getPendingFrameCount() === 3, "default frame count should be used");
    assert(scheduler.consumeFrame(), "pending frame should be consumed");
    assert(frames[0].reason === "resize", "frame should receive the active reason");
    assert(frames[0].meta.remainingFrames === 2, "frame metadata should expose remaining frames");
    scheduler.consumeFrame();
    scheduler.consumeFrame();
    assert(!scheduler.hasPending(), "scheduler should become idle after all frames are consumed");
    assert(!scheduler.consumeFrame(), "idle scheduler should not consume frames");
  }

  {
    const reasons = [];
    const scheduler = createResizeSettleScheduler({
      defaultFrameCount: 2,
      onFrame: (reason) => reasons.push(reason),
    });

    scheduler.request("resize", 2);
    scheduler.consumeFrame();
    assert(scheduler.request("window-state-resize", 4) === false, "active request should extend without restarting");
    assert(scheduler.getPendingFrameCount() === 4, "longer active request should extend remaining frames");
    scheduler.consumeFrame();
    assert(reasons.join(",") === "resize,window-state-resize", "latest reason should be used after an active request");
  }

  {
    let frameCount = 0;
    const scheduler = createResizeSettleScheduler({
      defaultFrameCount: 2,
      onFrame: () => {
        frameCount += 1;
      },
    });

    scheduler.request("resize", 4);
    scheduler.reset();
    assert(!scheduler.hasPending(), "reset should clear pending frames");
    assert(!scheduler.consumeFrame(), "reset scheduler should not consume stale frames");
    assert(frameCount === 0, "reset should prevent stale callbacks");
    scheduler.request("resize", 0);
    assert(scheduler.getPendingFrameCount() === 2, "invalid frame count should fall back to default");
  }
}
