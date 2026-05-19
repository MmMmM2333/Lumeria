import { defineComponent, h } from "vue";

export const ChevronLeftIcon = defineComponent({
  name: "ChevronLeftIcon",
  props: { class: { type: String, default: "" } },
  setup(props) {
    return () =>
      h("svg", { class: props.class, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, [
        h("path", { d: "M15 18l-6-6 6-6" }),
      ]);
  },
});

export const ChevronRightIcon = defineComponent({
  name: "ChevronRightIcon",
  props: { class: { type: String, default: "" } },
  setup(props) {
    return () =>
      h("svg", { class: props.class, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, [
        h("path", { d: "M9 6l6 6-6 6" }),
      ]);
  },
});

export const SearchIcon = defineComponent({
  name: "SearchIcon",
  props: { class: { type: String, default: "" } },
  setup(props) {
    return () =>
      h("svg", { class: props.class, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, [
        h("circle", { cx: "11", cy: "11", r: "7" }),
        h("path", { d: "m20 20-3.5-3.5" }),
      ]);
  },
});
