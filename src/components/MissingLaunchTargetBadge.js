import { defineComponent, h } from "vue";

export default defineComponent({
  name: "MissingLaunchTargetBadge",
  props: {
    status: { type: String, default: null },
  },
  setup(props) {
    return () => props.status === "missing"
      ? h("span", {
          class: "missing-launch-target-badge",
          title: "启动路径不存在",
          "aria-label": "启动路径不存在",
        }, "!")
      : null;
  },
});
