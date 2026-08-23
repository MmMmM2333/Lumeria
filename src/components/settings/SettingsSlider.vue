<template>
  <fluent-slider
    ref="sliderRef"
    class="settings-slider"
    :value.prop="sliderValue"
    :min="sliderMin"
    :max="sliderMax"
    @change="handleSliderChange"
  />
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

type NumericValue = number | string;
type FluentSliderElement = HTMLElement & { valueTextFormatter: (value: string) => string };

const props = withDefaults(defineProps<{
  max?: NumericValue;
  min?: NumericValue;
  step?: NumericValue;
  value?: NumericValue;
}>(), {
  max: 100,
  min: 0,
  step: 1,
  value: 0,
});

const emit = defineEmits<{ change: [value: string] }>();

const sliderRef = ref<FluentSliderElement | null>(null);
const numericMin = computed(() => toFiniteNumber(props.min, 0));
const numericMax = computed(() => Math.max(numericMin.value, toFiniteNumber(props.max, 100)));
const numericStep = computed(() => {
  const step = toFiniteNumber(props.step, 1);
  return step > 0 ? step : 1;
});
const decimalPlaces = computed(() => Math.max(
  getDecimalPlaces(props.min),
  getDecimalPlaces(props.max),
  getDecimalPlaces(props.step)
));
const sliderMaxUnit = computed(() => Math.max(0, Math.round(
  (numericMax.value - numericMin.value) / numericStep.value
)));
const sliderMin = "0";
const sliderMax = computed(() => String(sliderMaxUnit.value));
const sliderValue = computed(() => String(toSliderUnit(props.value)));

watchEffect(() => {
  if (!sliderRef.value) return;
  sliderRef.value.valueTextFormatter = formatUnitValue;
});

function handleSliderChange(event: Event): void {
  const target = event.currentTarget;
  if (!target || !("value" in target) || typeof target.value !== "string") {
    throw new TypeError("Settings slider currentTarget must expose a string value");
  }
  emit("change", valueFromUnit(target.value));
}

function toSliderUnit(value: unknown): number {
  const number = toFiniteNumber(value, numericMin.value);
  const unit = Math.round((number - numericMin.value) / numericStep.value);
  return clamp(unit, 0, sliderMaxUnit.value);
}

function valueFromUnit(value: unknown): string {
  const unit = clamp(Math.round(toFiniteNumber(value, 0)), 0, sliderMaxUnit.value);
  const nextValue = numericMin.value + unit * numericStep.value;
  return formatNumber(nextValue);
}

function formatUnitValue(value: string): string {
  return valueFromUnit(value);
}

function formatNumber(value: number): string {
  const rounded = Number(value.toFixed(decimalPlaces.value));
  return String(rounded);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDecimalPlaces(value: NumericValue): number {
  const text = String(value ?? "");
  if (!text.includes(".")) return 0;
  return text.split(".")[1]?.replace(/0+$/, "").length || 0;
}
</script>
