import { createApp, h, nextTick, ref } from "vue";
import { animateDomNode, setDomNodeMotion, stopDomNodeMotion, useDomMotion } from "../../../src/composables/useDomMotion.js";
import type { DomMotion } from "../../../src/composables/useDomMotion.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const close = (a: number, b: number, epsilon = 0.001) => Math.abs(a - b) < epsilon;
function read(node: HTMLElement) {
  const style = getComputedStyle(node), matrix = new DOMMatrixReadOnly(style.transform);
  return { opacity: Number(style.opacity), x: matrix.e, y: matrix.f, scaleX: matrix.a, scaleY: matrix.d,
    radius: Number.parseFloat(style.borderRadius), blur: Number.parseFloat(style.filter.replace(/^blur\(/, "")) || 0 };
}
function at(node: HTMLElement, milliseconds: number): Animation {
  const animation = node.getAnimations()[0]; assert(animation, "Expected an active browser animation");
  animation.pause(); animation.currentTime = milliseconds; return animation;
}

export async function runDomMotionRegression() {
  const node = document.createElement("div");
  node.style.cssText = "width:100px;height:80px;background:#4ba3f6"; document.body.append(node);
  const curves = {
    "cubic-out": (t: number) => 1 - (1 - t) ** 3,
    "quart-out": (t: number) => 1 - (1 - t) ** 4,
    "cubic-in-out": (t: number) => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
  };
  let maxError = 0;
  try {
    for (const [ease, curve] of Object.entries(curves)) {
      setDomNodeMotion(node, { opacity: 0, x: 60, y: -40, scaleX: 0.1, scaleY: 0.2, borderRadius: "8px", filter: "blur(8px)" });
      animateDomNode(node, { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, borderRadius: "18px", filter: "blur(0px)", duration: 1, ease: ease as NonNullable<DomMotion["ease"]> });
      for (const time of [0, 57, 125, 337, 500, 731, 950, 1000]) {
        at(node, time);
        const value = read(node), progress = curve(time / 1000);
        maxError = Math.max(maxError, Math.abs(value.opacity - progress));
        assert(close(value.opacity, progress, 0.00005), `${ease} opacity differs at ${time}ms`);
        assert(close(value.x, 60 * (1 - progress), 0.005), `${ease} x differs`);
        assert(close(value.y, -40 * (1 - progress), 0.005), `${ease} y differs`);
        assert(close(value.scaleX, 0.1 + 0.9 * progress), `${ease} scaleX differs`);
        assert(close(value.scaleY, 0.2 + 0.8 * progress), `${ease} scaleY differs`);
        assert(close(value.radius, 8 + 10 * progress, 0.002), `${ease} corner radius differs`);
        assert(close(value.blur, 8 * (1 - progress), 0.002), `${ease} blur differs`);
      }
    }
    setDomNodeMotion(node, { opacity: 0, scale: 0.5 });
    animateDomNode(node, { opacity: 1, scale: 1, duration: 1 });
    const old = at(node, 250), staleFinish = old.onfinish, before = read(node);
    animateDomNode(node, { opacity: 0, scale: 0.5, duration: 1 });
    const reversed = at(node, 0), after = read(node);
    assert(close(before.opacity, after.opacity) && close(before.scaleX, after.scaleX), "Interrupted animation jumped to its old target/start");
    assert(old.playState === "idle", "Superseded animation was not cancelled");
    staleFinish?.call(old, new Event("finish") as AnimationPlaybackEvent);
    assert(node.getAnimations()[0] === reversed, "A stale finish event replaced the new animation");
    at(node, 300); const frozen = read(node); stopDomNodeMotion(node);
    assert(close(read(node).opacity, frozen.opacity), "Explicit cancellation must retain its presented value");
    assert(node.getAnimations().length === 0, "Cancellation leaked an animation");
    animateDomNode(node, { opacity: 1, scale: 1, duration: 0 });
    assert(read(node).opacity === 1 && node.getAnimations().length === 0, "Zero duration must apply synchronously");
    animateDomNode(node, { opacity: 0.25, duration: 1 });
    const completed = at(node, 1000); completed.finish();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    assert(close(read(node).opacity, 0.25) && node.getAnimations().length === 0, "Finished animation must persist its target and release its effect");
    const external = node.animate([{ color: "red" }, { color: "blue" }], { duration: 1000 });
    animateDomNode(node, { opacity: 1, duration: 1 }); stopDomNodeMotion(node);
    assert(external.playState !== "idle", "Cancelling DOM motion must not cancel unrelated CSS effects"); external.cancel();
  } finally { stopDomNodeMotion(node); node.remove(); }

  const host = document.createElement("div"); document.body.append(host);
  const key = ref(0), target = ref<HTMLElement | null>(null);
  const app = createApp({ setup() {
    useDomMotion(target, { initial: { opacity: 0 }, motion: { opacity: 1, duration: 10 } });
    return () => h("div", { key: key.value, ref: target, style: "width:80px;height:60px;background:#4ba3f6" });
  } });
  app.mount(host); await nextTick();
  const first = target.value!; assert(first.getAnimations().length === 1, "Mount must animate the current node");
  key.value++; await nextTick();
  assert(first.getAnimations().length === 0, "Replacing a Vue keyed node must cancel the old animation");
  const second = target.value!; assert(second !== first && second.getAnimations().length === 1, "Replacement must initialize once");
  app.unmount(); assert(second.getAnimations().length === 0, "Unmount must cancel owned effects"); host.remove();
  return { maxEasingError: maxError, lifecycle: "passed" };
}

export async function mountReducedMotionFixture() {
  const host = document.createElement("div"); document.body.append(host);
  const app = createApp({ setup() {
    const target = ref<HTMLElement | null>(null);
    useDomMotion(target, { initial: { opacity: 0, scale: 0.5 }, motion: { opacity: 1, scale: 1, duration: 60 } });
    return () => h("div", { id: "reduced-motion", ref: target, style: "width:80px;height:60px;background:#4ba3f6" });
  } });
  app.mount(host); await nextTick();
}
