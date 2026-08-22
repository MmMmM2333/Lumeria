export type LaunchpadGesturePolicy = Readonly<{
  dragStartDistance: number;
  edgeMaxProgress: number;
  holdDurationMs: number;
  pointerCommitProgress: number;
  pointerCommitVelocity: number;
  pointerPanDominance: number;
  pointerPanThreshold: number;
  pointerVelocityMaxDeltaMs: number;
  pointerVelocitySmoothing: number;
  continuousWheelCommitProgress: number;
  continuousWheelCommitVelocity: number;
  continuousWheelIdleMs: number;
  wheelDiscreteIdleMs: number;
  wheelDiscreteInitialRepeatDelayMs: number;
  wheelDiscreteMinDelta: number;
  wheelDiscreteRepeatIntervalMs: number;
  wheelLineHeight: number;
  wheelPanDominance: number;
  wheelVelocityMaxDeltaMs: number;
  wheelVelocitySmoothing: number;
}>;

export const launchpadGesturePolicy: LaunchpadGesturePolicy = Object.freeze({
  dragStartDistance: 6,
  edgeMaxProgress: 0.12,
  holdDurationMs: 420,
  pointerCommitProgress: 0.22,
  pointerCommitVelocity: 0.55,
  pointerPanDominance: 1.15,
  pointerPanThreshold: 10,
  pointerVelocityMaxDeltaMs: 80,
  pointerVelocitySmoothing: 0.6,
  continuousWheelCommitProgress: 0.16,
  continuousWheelCommitVelocity: 0.55,
  continuousWheelIdleMs: 140,
  wheelDiscreteIdleMs: 360,
  wheelDiscreteInitialRepeatDelayMs: 300,
  wheelDiscreteMinDelta: 80,
  wheelDiscreteRepeatIntervalMs: 220,
  wheelLineHeight: 16,
  wheelPanDominance: 1.15,
  wheelVelocityMaxDeltaMs: 80,
  wheelVelocitySmoothing: 0.6,
});
