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

<script setup>
import { useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();

// Vue writes registered custom-element props such as `appearance` before FAST
// reflects them back to attributes. Fluent's button styles are keyed by
// `:host([appearance='...'])`, so the first paint can briefly use bare `:host`
// styles and animate into the intended variant. This wrapper writes the
// style-driving values as attributes directly, so Fluent matches the right
// selector before the button becomes visible.
const props = defineProps({
  appearance: { type: String, default: null },
  disabled: { type: Boolean, default: false },
  fluentSlot: { type: String, default: null },
  shape: { type: String, default: null },
  size: { type: String, default: null },
  tone: { type: String, default: null },
});

function buttonClass() {
  return [
    attrs.class,
    props.tone && `settings-fluent-button-${props.tone}`,
  ];
}

function forwardedAttrs() {
  const { class: _class, ...restAttrs } = attrs;
  return restAttrs;
}
</script>
