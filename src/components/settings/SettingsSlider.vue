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

<script setup>
import { computed, ref, watchEffect } from "vue";

const props = defineProps({
  max: { type: [Number, String], default: 100 },
  min: { type: [Number, String], default: 0 },
  step: { type: [Number, String], default: 1 },
  value: { type: [Number, String], default: 0 },
});

const emit = defineEmits(["change"]);

const sliderRef = ref(null);
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

function handleSliderChange(event) {
  emit("change", valueFromUnit(event?.target?.value));
}

function toSliderUnit(value) {
  const number = toFiniteNumber(value, numericMin.value);
  const unit = Math.round((number - numericMin.value) / numericStep.value);
  return clamp(unit, 0, sliderMaxUnit.value);
}

function valueFromUnit(value) {
  const unit = clamp(Math.round(toFiniteNumber(value, 0)), 0, sliderMaxUnit.value);
  const nextValue = numericMin.value + unit * numericStep.value;
  return formatNumber(nextValue);
}

function formatUnitValue(value) {
  return valueFromUnit(value);
}

function formatNumber(value) {
  const rounded = Number(value.toFixed(decimalPlaces.value));
  return String(rounded);
}

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getDecimalPlaces(value) {
  const text = String(value ?? "");
  if (!text.includes(".")) return 0;
  return text.split(".")[1]?.replace(/0+$/, "").length || 0;
}
</script>
