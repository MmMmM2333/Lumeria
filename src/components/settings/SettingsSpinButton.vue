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
      autocomplete="off"
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
        :aria-label="effectiveIncreaseLabel"
        :disabled="disabled || isAtMax"
        @pointerdown.prevent="focusInput"
        @click.prevent="stepBy(1)"
      >
        <ChevronUpIcon class="settings-number-icon" />
      </button>
      <button
        type="button"
        tabindex="-1"
        :aria-label="effectiveDecreaseLabel"
        :disabled="disabled || isAtMin"
        @pointerdown.prevent="focusInput"
        @click.prevent="stepBy(-1)"
      >
        <ChevronDownIcon class="settings-number-icon" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ChevronDownIcon from "~icons/fluent/chevron-down-12-regular";
import ChevronUpIcon from "~icons/fluent/chevron-up-12-regular";
import { useLocalization } from "../../i18n/localization.js";

const props = withDefaults(defineProps<{
  ariaLabel: string;
  decreaseLabel?: string;
  disabled?: boolean;
  increaseLabel?: string;
  max?: number;
  min?: number;
  modelValue: number;
  name?: string;
  step?: number;
  unit?: string;
  wide?: boolean;
}>(), {
  decreaseLabel: "",
  disabled: false,
  increaseLabel: "",
  max: Number.POSITIVE_INFINITY,
  min: Number.NEGATIVE_INFINITY,
  name: "",
  step: 1,
  unit: "",
  wide: false,
});

const emit = defineEmits<{ "update:modelValue": [value: number] }>();
const { t } = useLocalization();

const inputRef = ref<HTMLInputElement | null>(null);
const draftValue = ref(formatValue(props.modelValue));

const finiteMin = computed(() => (Number.isFinite(props.min) ? props.min : undefined));
const finiteMax = computed(() => (Number.isFinite(props.max) ? props.max : undefined));
const normalizedModelValue = computed(() => normalizeValue(props.modelValue));
const ariaValueText = computed(() => (props.unit ? `${formatValue(normalizedModelValue.value)} ${props.unit}` : undefined));
const inputMode = computed(() => (getStepPrecision(props.step) > 0 ? "decimal" : "numeric"));
const isAtMin = computed(() => Number.isFinite(props.min) && normalizedModelValue.value <= props.min);
const isAtMax = computed(() => Number.isFinite(props.max) && normalizedModelValue.value >= props.max);
const effectiveDecreaseLabel = computed(() => props.decreaseLabel || t("common.actions.decrease"));
const effectiveIncreaseLabel = computed(() => props.increaseLabel || t("common.actions.increase"));

watch(
  () => props.modelValue,
  (value) => {
    draftValue.value = formatValue(value);
  },
);

function handleInput(event: Event): void {
  draftValue.value = requireSpinButtonInput(event).value;
}

function requireSpinButtonInput(event: Event): HTMLInputElement {
  if (!(event.currentTarget instanceof HTMLInputElement)) {
    throw new TypeError("Settings spin button event currentTarget must be an input element");
  }
  return event.currentTarget;
}

function handleKeydown(event: KeyboardEvent): void {
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
    requireSpinButtonInput(event).select();
    return;
  }
  if (event.key === "Escape") {
    draftValue.value = formatValue(props.modelValue);
    requireSpinButtonInput(event).blur();
  }
}

function commitDraft(): void {
  if (props.disabled) return;
  const parsed = parseNumber(draftValue.value);
  updateValue(Number.isFinite(parsed) ? parsed : props.modelValue);
}

function stepBy(direction: number, multiplier = 1): void {
  if (props.disabled) return;
  const current = Number.isFinite(parseNumber(draftValue.value))
    ? parseNumber(draftValue.value)
    : normalizedModelValue.value;
  updateValue(current + getSafeStep() * direction * multiplier);
}

function focusInput(): void {
  if (props.disabled) return;
  inputRef.value?.focus?.({ preventScroll: true });
}

function updateValue(value: number): void {
  const nextValue = normalizeValue(value);
  draftValue.value = formatValue(nextValue);
  if (nextValue !== props.modelValue) {
    emit("update:modelValue", nextValue);
  }
}

function normalizeValue(value: unknown): number {
  const fallback = Number.isFinite(props.min) ? props.min : 0;
  const number = Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamped = clamp(number, props.min, props.max);
  const step = getSafeStep();
  const base = Number.isFinite(props.min) ? props.min : 0;
  const precision = getStepPrecision(step);
  const stepped = base + Math.round((clamped - base) / step) * step;
  return clamp(Number(stepped.toFixed(precision)), props.min, props.max);
}

function formatValue(value: unknown): string {
  const precision = getStepPrecision(getSafeStep());
  const normalized = normalizeValue(value);
  if (precision <= 0) return String(Math.round(normalized));
  return normalized.toFixed(precision).replace(/\.?0+$/, "");
}

function parseNumber(value: string | number): number {
  if (typeof value !== "string") return Number(value);
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return Number.NaN;
  return Number(normalized);
}

function getSafeStep(): number {
  return Number.isFinite(props.step) && props.step > 0 ? props.step : 1;
}

function getStepPrecision(step: number): number {
  const value = String(step);
  if (value.includes("e-")) {
    return Number(value.split("e-")[1]) || 0;
  }
  return value.includes(".") ? (value.split(".")[1]?.length ?? 0) : 0;
}

function clamp(value: number, min: number, max: number): number {
  const minValue = Number.isFinite(min) ? min : Number.NEGATIVE_INFINITY;
  const maxValue = Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;
  return Math.min(maxValue, Math.max(minValue, value));
}
</script>
