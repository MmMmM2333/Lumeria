import { gsap } from "gsap";
import { onBeforeUnmount, watch } from "vue";

export function useGsapDomMotion(targetRef, options = {}) {
  const resolveInitial = makeResolver(options.initial, {});
  const resolveMotion = makeResolver(options.motion, {});

  function animate(motion = resolveMotion()) {
    animateGsapDomNode(targetRef.value, motion);
  }

  function kill(node = targetRef.value) {
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

export function animateGsapDomNode(node, motion = {}) {
  if (!node) return;
  gsap.killTweensOf(node);
  const { ease = "power2.out", overwrite = "auto", ...target } = motion;
  gsap.to(node, {
    ...target,
    ease,
    overwrite,
  });
}

export function killGsapDomMotion(node) {
  if (node) gsap.killTweensOf(node);
}

function makeResolver(value, fallback) {
  if (typeof value === "function") return value;
  return () => value || fallback;
}
