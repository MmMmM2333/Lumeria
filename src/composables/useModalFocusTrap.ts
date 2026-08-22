import type { Ref } from "vue";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type ModalElementHolder = Readonly<{ $el: HTMLElement | null | undefined }>;
export type ModalFocusTarget =
  | HTMLElement
  | ModalElementHolder
  | Readonly<Ref<HTMLElement | ModalElementHolder | null | undefined>>
  | null
  | undefined;

function resolveElement(target: ModalFocusTarget): HTMLElement | null {
  const value = target && typeof target === "object" && "value" in target
    ? target.value
    : target;
  if (!value) return null;
  return "$el" in value ? value.$el ?? null : value;
}

function isFocusableElement(element: HTMLElement): boolean {
  if (("disabled" in element && element.disabled === true) || element.getAttribute("aria-hidden") === "true") return false;
  if (element.tabIndex < 0) return false;
  const view = element.ownerDocument?.defaultView;
  const styles = view?.getComputedStyle?.(element);
  return styles?.visibility !== "hidden" && styles?.display !== "none";
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusableElement);
}

export function focusModalElement(target: ModalFocusTarget): void {
  const container = resolveElement(target);
  if (!container?.focus) return;
  const activeElement = container.ownerDocument?.activeElement;
  if (activeElement && container.contains?.(activeElement)) return;
  container.focus({ preventScroll: true });
}

export function handleModalKeydown(
  event: KeyboardEvent,
  target: ModalFocusTarget,
  onEscape?: () => void,
): void {
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
    lastElement?.focus({ preventScroll: true });
    return;
  }

  if (!event.shiftKey && activeElement === lastElement) {
    event.preventDefault();
    firstElement?.focus({ preventScroll: true });
  }
}
