import { gsap } from "gsap";
import { onBeforeUnmount, watch, type Ref } from "vue";

type GsapMotionResolver = () => gsap.TweenVars;
type GsapMotionValue = gsap.TweenVars | GsapMotionResolver;

export type GsapDomMotionOptions = Readonly<{
  initial?: GsapMotionValue;
  motion?: GsapMotionValue;
}>;

export function useGsapDomMotion(
  targetRef: Readonly<Ref<gsap.TweenTarget>>,
  options: GsapDomMotionOptions = {},
) {
  const resolveInitial = makeResolver(options.initial, {});
  const resolveMotion = makeResolver(options.motion, {});

  function animate(motion: gsap.TweenVars = resolveMotion()): void {
    animateGsapDomNode(targetRef.value, motion);
  }

  function kill(node: gsap.TweenTarget = targetRef.value): void {
    killGsapDomMotion(node);
  }

  watch(
    targetRef,
    (node, previousNode) => {
      if (previousNode && previousNode !== node) kill(previousNode);
      if (!node) return;
      gsap.set(node, resolveInitial());
      animateGsapDomNode(node, resolveMotion());
    },
    { flush: "post" }
  );

  onBeforeUnmount(() => kill());

  return { animate, kill };
}

export function animateGsapDomNode(node: gsap.TweenTarget, motion: gsap.TweenVars = {}): void {
  if (!node) return;
  gsap.killTweensOf(node);
  const { ease = "power2.out", overwrite = "auto", ...target } = motion;
  gsap.to(node, {
    ...target,
    ease,
    overwrite,
  });
}

export function killGsapDomMotion(node: gsap.TweenTarget): void {
  if (node) gsap.killTweensOf(node);
}

function makeResolver(value: GsapMotionValue | undefined, fallback: gsap.TweenVars): GsapMotionResolver {
  if (typeof value === "function") return value;
  return () => value || fallback;
}
