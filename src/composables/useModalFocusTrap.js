const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function resolveElement(target) {
  if (target && typeof target === "object" && "value" in target) return resolveElement(target.value);
  return target?.$el || target || null;
}

function isFocusableElement(element) {
  if (!element || element.disabled || element.getAttribute("aria-hidden") === "true") return false;
  if (element.tabIndex < 0) return false;
  const view = element.ownerDocument?.defaultView;
  const styles = view?.getComputedStyle?.(element);
  return styles?.visibility !== "hidden" && styles?.display !== "none";
}

function getFocusableElements(container) {
  if (!container?.querySelectorAll) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isFocusableElement);
}

export function focusModalElement(target) {
  const container = resolveElement(target);
  if (!container?.focus) return;
  const activeElement = container.ownerDocument?.activeElement;
  if (activeElement && container.contains?.(activeElement)) return;
  container.focus({ preventScroll: true });
}

export function handleModalKeydown(event, target, onEscape) {
  const container = resolveElement(target);
  event.stopPropagation();

  if (event.key === "Escape") {
    event.preventDefault();
    onEscape?.();
    return;
  }

  if (event.key !== "Tab") return;

  const focusableElements = getFocusableElements(container);
  if (!focusableElements.length) {
    event.preventDefault();
    container?.focus?.({ preventScroll: true });
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = container?.ownerDocument?.activeElement;
  const isFocusOutsideTrap = !activeElement || activeElement === container || !container.contains(activeElement);

  if (event.shiftKey && (isFocusOutsideTrap || activeElement === firstElement)) {
    event.preventDefault();
    lastElement.focus({ preventScroll: true });
    return;
  }

  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus({ preventScroll: true });
  }
}
