<template>
  <div :class="['settings-number-control', wide && 'settings-number-control-wide', disabled && 'settings-number-control-disabled']">
    <input
      ref="inputRef"
      class="settings-number-input"
      :aria-label="ariaLabel"
      :aria-valuemax="finiteMax"
      :aria-valuemin="finiteMin"
      :aria-valuenow="normalizedModelValue"
      :aria-valuetext="ariaValueText"
      :disabled="disabled"
      :inputmode="inputMode"
      :name="name"
      role="spinbutton"
      type="text"
      :value="draftValue"
      @blur="commitDraft"
      @input="handleInput"
      @keydown="handleKeydown"
    />
    <span v-if="unit" class="settings-number-unit">{{ unit }}</span>
    <div class="settings-number-buttons">
      <button
        type="button"
        tabindex="-1"
        :aria-label="increaseLabel"
        :disabled="disabled || isAtMax"
        @pointerdown.prevent="focusInput"
        @click.prevent="stepBy(1)"
      >
        <ChevronUpIcon class="settings-number-icon" />
      </button>
      <button
        type="button"
        tabindex="-1"
        :aria-label="decreaseLabel"
        :disabled="disabled || isAtMin"
        @pointerdown.prevent="focusInput"
        @click.prevent="stepBy(-1)"
      >
        <ChevronDownIcon class="settings-number-icon" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import ChevronDownIcon from "~icons/fluent/chevron-down-12-regular";
import ChevronUpIcon from "~icons/fluent/chevron-up-12-regular";

const props = defineProps({
  ariaLabel: { type: String, required: true },
  decreaseLabel: { type: String, default: "减少" },
  disabled: { type: Boolean, default: false },
  increaseLabel: { type: String, default: "增加" },
  max: { type: Number, default: Number.POSITIVE_INFINITY },
  min: { type: Number, default: Number.NEGATIVE_INFINITY },
  modelValue: { type: Number, required: true },
  name: { type: String, default: "" },
  step: { type: Number, default: 1 },
  unit: { type: String, default: "" },
  wide: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue"]);

const inputRef = ref(null);
const draftValue = ref(formatValue(props.modelValue));

const finiteMin = computed(() => (Number.isFinite(props.min) ? props.min : undefined));
const finiteMax = computed(() => (Number.isFinite(props.max) ? props.max : undefined));
const normalizedModelValue = computed(() => normalizeValue(props.modelValue));
const ariaValueText = computed(() => (props.unit ? `${formatValue(normalizedModelValue.value)} ${props.unit}` : undefined));
const inputMode = computed(() => (getStepPrecision(props.step) > 0 ? "decimal" : "numeric"));
const isAtMin = computed(() => Number.isFinite(props.min) && normalizedModelValue.value <= props.min);
const isAtMax = computed(() => Number.isFinite(props.max) && normalizedModelValue.value >= props.max);

watch(
  () => props.modelValue,
  (value) => {
    draftValue.value = formatValue(value);
  },
);

function handleInput(event) {
  draftValue.value = event.target.value;
}

function handleKeydown(event) {
  if (props.disabled) return;
  if (event.key === "ArrowUp") {
    event.preventDefault();
    stepBy(1);
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    stepBy(-1);
    return;
  }
  if (event.key === "PageUp") {
    event.preventDefault();
    stepBy(1, 10);
    return;
  }
  if (event.key === "PageDown") {
    event.preventDefault();
    stepBy(-1, 10);
    return;
  }
  if (event.key === "Home" && Number.isFinite(props.min)) {
    event.preventDefault();
    updateValue(props.min);
    return;
  }
  if (event.key === "End" && Number.isFinite(props.max)) {
    event.preventDefault();
    updateValue(props.max);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    commitDraft();
    event.target.select?.();
    return;
  }
  if (event.key === "Escape") {
    draftValue.value = formatValue(props.modelValue);
    event.target.blur?.();
  }
}

function commitDraft() {
  if (props.disabled) return;
  const parsed = parseNumber(draftValue.value);
  updateValue(Number.isFinite(parsed) ? parsed : props.modelValue);
}

function stepBy(direction, multiplier = 1) {
  if (props.disabled) return;
  const current = Number.isFinite(parseNumber(draftValue.value))
    ? parseNumber(draftValue.value)
    : normalizedModelValue.value;
  updateValue(current + getSafeStep() * direction * multiplier);
}

function focusInput() {
  if (props.disabled) return;
  inputRef.value?.focus?.({ preventScroll: true });
}

function updateValue(value) {
  const nextValue = normalizeValue(value);
  draftValue.value = formatValue(nextValue);
  if (nextValue !== props.modelValue) {
    emit("update:modelValue", nextValue);
  }
}

function normalizeValue(value) {
  const fallback = Number.isFinite(props.min) ? props.min : 0;
  const number = Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamped = clamp(number, props.min, props.max);
  const step = getSafeStep();
  const base = Number.isFinite(props.min) ? props.min : 0;
  const precision = getStepPrecision(step);
  const stepped = base + Math.round((clamped - base) / step) * step;
  return clamp(Number(stepped.toFixed(precision)), props.min, props.max);
}

function formatValue(value) {
  const precision = getStepPrecision(getSafeStep());
  const normalized = normalizeValue(value);
  if (precision <= 0) return String(Math.round(normalized));
  return normalized.toFixed(precision).replace(/\.?0+$/, "");
}

function parseNumber(value) {
  if (typeof value !== "string") return Number(value);
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return Number.NaN;
  return Number(normalized);
}

function getSafeStep() {
  return Number.isFinite(props.step) && props.step > 0 ? props.step : 1;
}

function getStepPrecision(step) {
  const value = String(step);
  if (value.includes("e-")) {
    return Number(value.split("e-")[1]) || 0;
  }
  return value.includes(".") ? value.split(".")[1].length : 0;
}

function clamp(value, min, max) {
  const minValue = Number.isFinite(min) ? min : Number.NEGATIVE_INFINITY;
  const maxValue = Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;
  return Math.min(maxValue, Math.max(minValue, value));
}
</script>
