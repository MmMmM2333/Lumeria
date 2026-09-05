import { computed, readonly, shallowRef } from "vue";
import type { StateCell, StateHost } from "../application/stateHost.js";

export const vueStateHost: StateHost = {
  cell: value => shallowRef(value),
  derived: read => computed(read),
  readonly: <T>(cell: StateCell<T>): Readonly<StateCell<T>> => readonly(cell) as Readonly<StateCell<T>>,
};
