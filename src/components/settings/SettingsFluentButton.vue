<template>
  <fluent-button
    v-bind="forwardedAttrs()"
    :class="buttonClass()"
    :slot.attr="fluentSlot || null"
    :appearance.attr="appearance || null"
    :shape.attr="shape || null"
    :size.attr="size || null"
    :disabled.prop="disabled"
  >
    <slot />
  </fluent-button>
</template>

<script setup lang="ts">
import { useAttrs } from "vue";
import type { ButtonAppearance, ButtonShape, ButtonSize } from "@fluentui/web-components";

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();

// Vue writes registered custom-element props such as `appearance` before FAST
// reflects them back to attributes. Fluent's button styles are keyed by
// `:host([appearance='...'])`, so the first paint can briefly use bare `:host`
// styles and animate into the intended variant. This wrapper writes the
// style-driving values as attributes directly, so Fluent matches the right
// selector before the button becomes visible.
const props = withDefaults(defineProps<{
  appearance?: ButtonAppearance | null;
  disabled?: boolean;
  fluentSlot?: string | null;
  shape?: ButtonShape | null;
  size?: ButtonSize | null;
  tone?: "danger" | null;
}>(), {
  appearance: null,
  disabled: false,
  fluentSlot: null,
  shape: null,
  size: null,
  tone: null,
});

function buttonClass(): unknown[] {
  return [
    attrs.class,
    props.tone && `settings-fluent-button-${props.tone}`,
  ];
}

function forwardedAttrs(): Record<string, unknown> {
  const { class: _class, ...restAttrs } = attrs;
  return restAttrs;
}
</script>
