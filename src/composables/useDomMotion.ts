import { onBeforeUnmount, watch, type Ref } from "vue";

export type DomMotion = Readonly<{
  opacity?: number;
  filter?: string;
  borderRadius?: string;
  x?: number;
  y?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  duration?: number;
  ease?: "cubic-out" | "quart-out" | "cubic-in-out";
}>;
type MotionValue = DomMotion | (() => DomMotion);
type StyleProperty = "opacity" | "filter" | "borderRadius" | "transform";
type MotionStyles = Partial<Record<StyleProperty, string>>;
type ActiveMotion = { animation: Animation; target: MotionStyles };
const active = new WeakMap<HTMLElement, ActiveMotion>();

// Browser linear() stops sample the original polynomial curves. With 200 segments,
// the maximum interpolation error is < 0.00004; no JS frame loop is required.
const sampleCurve = (curve: (progress: number) => number): string =>
  `linear(${Array.from({ length: 201 }, (_, index) => curve(index / 200).toFixed(8)).join(",")})`;
const easing = {
  "cubic-out": "cubic-bezier(0.333333333333, 1, 0.666666666667, 1)",
  "quart-out": sampleCurve(progress => 1 - (1 - progress) ** 4),
  "cubic-in-out": sampleCurve(progress => progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2),
} as const;

function writeStyles(node: HTMLElement, styles: MotionStyles): void {
  for (const key of Object.keys(styles) as StyleProperty[]) node.style[key] = styles[key]!;
}

/** Freeze only our animated properties before cancellation, including interrupted exits. */
export function stopDomNodeMotion(node: HTMLElement | null): void {
  if (!node) return;
  const running = active.get(node);
  if (!running) return;
  if (node.isConnected) {
    const computed = getComputedStyle(node);
    const presented: MotionStyles = {};
    for (const key of Object.keys(running.target) as StyleProperty[]) presented[key] = computed[key];
    writeStyles(node, presented);
  }
  running.animation.onfinish = null;
  running.animation.cancel();
  active.delete(node);
}

function targetStyles(node: HTMLElement, motion: DomMotion): MotionStyles {
  for (const value of [motion.opacity, motion.x, motion.y, motion.scale, motion.scaleX, motion.scaleY, motion.duration]) {
    if (value !== undefined && !Number.isFinite(value)) throw new TypeError("DOM motion values must be finite");
  }
  const styles: MotionStyles = {};
  if (motion.opacity !== undefined) styles.opacity = String(motion.opacity);
  if (motion.filter !== undefined) styles.filter = motion.filter;
  if (motion.borderRadius !== undefined) styles.borderRadius = motion.borderRadius;
  if ([motion.x, motion.y, motion.scale, motion.scaleX, motion.scaleY].some(value => value !== undefined)) {
    // These DOM wrappers own only translation/scale; unrelated CSS properties stay untouched.
    const current = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    const x = motion.x ?? current.e, y = motion.y ?? current.f;
    const scaleX = motion.scaleX ?? motion.scale ?? current.a;
    const scaleY = motion.scaleY ?? motion.scale ?? current.d;
    styles.transform = `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`;
  }
  return styles;
}

export function setDomNodeMotion(node: HTMLElement, motion: DomMotion): void {
  stopDomNodeMotion(node);
  writeStyles(node, targetStyles(node, motion));
}

function finishMotion(node: HTMLElement, running: ActiveMotion): void {
  if (active.get(node) !== running) return;
  writeStyles(node, running.target);
  running.animation.onfinish = null;
  running.animation.cancel();
  active.delete(node);
}

export function animateDomNode(node: HTMLElement | null, motion: DomMotion): void {
  if (!node) return;
  // Capture before cancelling: the underlying inline style already contains the old destination.
  stopDomNodeMotion(node);
  const target = targetStyles(node, motion), computed = getComputedStyle(node), from: MotionStyles = {};
  for (const key of Object.keys(target) as StyleProperty[]) from[key] = computed[key];
  const duration = Math.max(0, motion.duration ?? 0.5) * 1000;
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Inline end styles survive effect removal; zero/reduced motion needs no animation object.
  writeStyles(node, target);
  if (!duration || reduce || !node.isConnected || !Object.keys(target).length) return;
  const animation = node.animate([from, target], { duration, easing: easing[motion.ease ?? "cubic-out"], fill: "both" });
  const running = { animation, target };
  active.set(node, running);
  animation.onfinish = () => finishMotion(node, running);
}

export function useDomMotion(
  targetRef: Readonly<Ref<HTMLElement | null>>,
  options: Readonly<{ initial?: MotionValue; motion?: MotionValue }> = {},
) {
  const resolve = (value: MotionValue | undefined): DomMotion => typeof value === "function" ? value() : value ?? {};
  const animate = (motion: DomMotion = resolve(options.motion)) => animateDomNode(targetRef.value, motion);
  const kill = () => stopDomNodeMotion(targetRef.value);
  watch(targetRef, (node, previous) => {
    if (previous && previous !== node) stopDomNodeMotion(previous);
    if (!node) return;
    setDomNodeMotion(node, resolve(options.initial));
    animate();
  }, { flush: "post", immediate: true });
  const preference = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const reduce = () => {
    const node = targetRef.value, running = node && active.get(node);
    if (preference?.matches && node && running) finishMotion(node, running);
  };
  preference?.addEventListener("change", reduce);
  onBeforeUnmount(() => {
    kill();
    preference?.removeEventListener("change", reduce);
  });
  return { animate, kill };
}
