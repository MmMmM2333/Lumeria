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

export const SettingsIcon = defineComponent({
  name: "SettingsIcon",
  props: { class: { type: String, default: "" } },
  setup(props) {
    return () =>
      h("svg", { class: props.class, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, [
        h("path", { d: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" }),
        h("path", { d: "M19.4 15a1.8 1.8 0 0 0 .36 2l.05.05a2.1 2.1 0 1 1-2.98 2.98l-.05-.05a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.08 1.65V21a2.1 2.1 0 1 1-4.2 0v-.08a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-2 .36l-.05.05a2.1 2.1 0 1 1-2.98-2.98l.05-.05a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.65-1.08H2a2.1 2.1 0 1 1 0-4.2h.08a1.8 1.8 0 0 0 1.65-1.08 1.8 1.8 0 0 0-.36-2l-.05-.05a2.1 2.1 0 1 1 2.98-2.98l.05.05a1.8 1.8 0 0 0 2 .36h.04A1.8 1.8 0 0 0 9.5 2.08V2a2.1 2.1 0 1 1 4.2 0v.08a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 2-.36l.05-.05a2.1 2.1 0 1 1 2.98 2.98l-.05.05a1.8 1.8 0 0 0-.36 2v.04a1.8 1.8 0 0 0 1.65 1.08H21a2.1 2.1 0 1 1 0 4.2h-.08A1.8 1.8 0 0 0 19.4 15Z" }),
      ]);
  },
});
